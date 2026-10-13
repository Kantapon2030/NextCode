import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import Docker from 'dockerode';
import tar from 'tar-stream';
import path from 'path';
import { ContainerPool } from './containerPool';

export interface RunMessage {
  type: 'RUN';
  language: 'c' | 'cpp' | 'python';
  code: string;
  files?: Record<string, string>;
}

export interface InputMessage {
  type: 'INPUT';
  data: string;
}

export interface ResizeMessage {
  type: 'RESIZE';
  cols: number;
  rows: number;
}

export interface KillMessage {
  type: 'KILL';
}

type ClientMessage = RunMessage | InputMessage | ResizeMessage | KillMessage;

interface ExecutionSession {
  containerId: string;
  execInstance: Docker.Exec | null;
  execStream: NodeJS.ReadWriteStream | null;
  timeoutTimer: NodeJS.Timeout | null;
  rateResetTimer: NodeJS.Timeout | null;
  bytesThisSecond: number;
  cumulativeExcessBytes: number;
  isTerminated: boolean;
}

export class ExecutionEngine {
  private wss: WebSocketServer;
  private pool: ContainerPool;
  private docker: Docker;
  private readonly EXECUTION_TIMEOUT_MS = 15000; // 15s Hard Kill Switch
  private readonly MAX_BYTES_PER_SEC = 64 * 1024; // 64 KB/s normal threshold
  private readonly MAX_CUMULATIVE_EXCESS = 512 * 1024; // 512 KB Abusive Output Cap

  constructor(server: any, pool: ContainerPool) {
    this.wss = new WebSocketServer({ noServer: true });
    this.pool = pool;
    this.docker = new Docker();
    this.setupListeners();
  }

  public getWebSocketServer(): WebSocketServer {
    return this.wss;
  }

  public handleUpgrade(req: IncomingMessage, socket: any, head: Buffer): void {
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      this.wss.emit('connection', ws, req);
    });
  }

  private setupListeners(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      let currentSession: ExecutionSession | null = null;

      const terminateCurrentSession = async (reason?: string): Promise<void> => {
        if (!currentSession || currentSession.isTerminated) return;
        currentSession.isTerminated = true;

        if (currentSession.timeoutTimer) {
          clearTimeout(currentSession.timeoutTimer);
          currentSession.timeoutTimer = null;
        }

        if (currentSession.rateResetTimer) {
          clearInterval(currentSession.rateResetTimer);
          currentSession.rateResetTimer = null;
        }

        if (currentSession.execStream) {
          try {
            currentSession.execStream.end();
            (currentSession.execStream as any).destroy?.();
          } catch {}
          currentSession.execStream = null;
        }

        const cid = currentSession.containerId;
        currentSession = null;

        if (cid) {
          await this.pool.releaseAndDestroy(cid).catch(() => {});
        }
      };

      // Unified Message Handler
      ws.on('message', async (raw: Buffer | string) => {
        try {
          const msg = JSON.parse(raw.toString('utf8')) as ClientMessage;

          // 1. RUN COMMAND
          if (msg.type === 'RUN') {
            // Prevent Double Run Leak: Abort previous run immediately
            if (currentSession && !currentSession.isTerminated) {
              ws.send(JSON.stringify({
                type: 'SYSTEM',
                data: '\r\n⚠️ [System]: Terminating previous active session...\r\n',
              }));
              await terminateCurrentSession('NEW_RUN_SUPERSEDED');
            }

            // Acquire pre-warmed container from pool
            let containerId: string;
            try {
              containerId = await this.pool.acquireContainer();
            } catch (err: any) {
              ws.send(JSON.stringify({ type: 'ERROR', message: err.message }));
              return;
            }

            const session: ExecutionSession = {
              containerId,
              execInstance: null,
              execStream: null,
              timeoutTimer: null,
              rateResetTimer: null,
              bytesThisSecond: 0,
              cumulativeExcessBytes: 0,
              isTerminated: false,
            };
            currentSession = session;

            const container = this.docker.getContainer(containerId);

            // Pack multi-file tar archive with Path Traversal Protection
            let tarStream: NodeJS.ReadableStream;
            try {
              tarStream = this.createTarArchive(msg.language, msg.code, msg.files);
            } catch (err: any) {
              ws.send(JSON.stringify({ type: 'ERROR', message: `Archive Error: ${err.message}` }));
              await terminateCurrentSession('INVALID_FILES');
              return;
            }

            // Upload files into /workspace
            await container.putArchive(tarStream, { path: '/workspace' });

            // Construct compilation and execution command
            const cmd = this.buildExecutionCommand(msg.language);

            // Create PTY Terminal instance
            const exec = await container.exec({
              Cmd: cmd,
              AttachStdin: true,
              AttachStdout: true,
              AttachStderr: true,
              Tty: true,
            });

            session.execInstance = exec;

            // Start interactive stream
            const stream = (await exec.start({ stdin: true, hijack: true })) as NodeJS.ReadWriteStream;
            session.execStream = stream;

            // Setup Hard Execution Timeout (15s limit)
            session.timeoutTimer = setTimeout(async () => {
              if (session.isTerminated) return;
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'SYSTEM',
                  data: `\r\n⚠️ [System Alert]: Execution timed out (${this.EXECUTION_TIMEOUT_MS / 1000}s limit). Process terminated.\r\n`,
                }));
                ws.send(JSON.stringify({ type: 'EXIT', code: 124 }));
              }
              await terminateCurrentSession('HARD_TIMEOUT');
            }, this.EXECUTION_TIMEOUT_MS);

            // Output rate limiter reset interval
            session.rateResetTimer = setInterval(() => {
              if (session.isTerminated) return;
              session.bytesThisSecond = 0;
              // Resume if paused and under cap
              if (session.execStream && (session.execStream as any).isPaused?.()) {
                (session.execStream as any).resume();
              }
            }, 1000);

            // Stream Output & Apply Abusive Flooding Kill Switch
            stream.on('data', async (chunk: Buffer) => {
              if (session.isTerminated) return;

              session.bytesThisSecond += chunk.length;

              if (session.bytesThisSecond > this.MAX_BYTES_PER_SEC) {
                session.cumulativeExcessBytes += chunk.length;

                // Pause stream backpressure
                if ((stream as any).pause) {
                  (stream as any).pause();
                }

                // If flood exceeds 512 KB, invoke Abusive Kill Switch
                if (session.cumulativeExcessBytes > this.MAX_CUMULATIVE_EXCESS) {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'SYSTEM',
                      data: '\r\n🛑 [Security Alert]: Output flooding cap exceeded (512 KB). Process killed.\r\n',
                    }));
                    ws.send(JSON.stringify({ type: 'EXIT', code: 137 }));
                  }
                  await terminateCurrentSession('OUTPUT_FLOOD_KILLED');
                  return;
                }
                return;
              }

              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'OUTPUT',
                  data: chunk.toString('utf8'),
                }));
              }
            });

            stream.on('end', async () => {
              if (!session.isTerminated && ws.readyState === WebSocket.OPEN) {
                // Inspect exit code if possible
                try {
                  const inspectData = await exec.inspect();
                  ws.send(JSON.stringify({ type: 'EXIT', code: inspectData.ExitCode ?? 0 }));
                } catch {
                  ws.send(JSON.stringify({ type: 'EXIT', code: 0 }));
                }
              }
              await terminateCurrentSession('PROCESS_EXIT');
            });

            stream.on('error', async (streamErr) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'ERROR', message: streamErr.message }));
              }
              await terminateCurrentSession('STREAM_ERROR');
            });
          }

          // 2. INPUT COMMAND (stdin)
          else if (msg.type === 'INPUT') {
            if (currentSession?.execStream && !currentSession.isTerminated) {
              currentSession.execStream.write(msg.data);
            }
          }

          // 3. RESIZE COMMAND (PTY Terminal Window Change)
          else if (msg.type === 'RESIZE') {
            if (currentSession?.execInstance && !currentSession.isTerminated) {
              try {
                await currentSession.execInstance.resize({
                  h: msg.rows || 24,
                  w: msg.cols || 80,
                });
              } catch {}
            }
          }

          // 4. MANUAL KILL SWITCH
          else if (msg.type === 'KILL') {
            if (currentSession && !currentSession.isTerminated) {
              ws.send(JSON.stringify({
                type: 'SYSTEM',
                data: '\r\n⏹ [User Action]: Execution stopped by user.\r\n',
              }));
              ws.send(JSON.stringify({ type: 'EXIT', code: 130 }));
              await terminateCurrentSession('USER_KILL');
            }
          }
        } catch (err: any) {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ERROR', message: `Malformed request: ${err.message}` }));
          }
        }
      });

      ws.on('close', async () => {
        await terminateCurrentSession('CLIENT_DISCONNECT');
      });

      ws.on('error', async () => {
        await terminateCurrentSession('SOCKET_ERROR');
      });
    });
  }

  /**
   * Builds execution command string supporting multi-file compiles.
   */
  private buildExecutionCommand(language: 'c' | 'cpp' | 'python'): string[] {
    switch (language) {
      case 'python':
        return ['python3', '-u', '/workspace/main.py'];
      case 'c':
        return [
          'sh',
          '-c',
          'gcc -O2 -Wall $(find /workspace -maxdepth 2 -name "*.c") -o /workspace/app && /workspace/app',
        ];
      case 'cpp':
        return [
          'sh',
          '-c',
          'g++ -O2 -Wall -std=c++20 $(find /workspace -maxdepth 2 -name "*.cpp") -o /workspace/app && /workspace/app',
        ];
    }
  }

  /**
   * Creates a Tar Archive with strict Path Traversal sanitization.
   */
  private createTarArchive(
    language: 'c' | 'cpp' | 'python',
    mainCode: string,
    additionalFiles?: Record<string, string>
  ): any {
    const pack = tar.pack();

    const sanitizePath = (targetPath: string): string => {
      if (targetPath.includes('\0')) {
        throw new Error('Null byte detected in path');
      }
      const normalized = path.posix.normalize(targetPath.replace(/\\/g, '/')).replace(/^\/+/, '');
      if (normalized.startsWith('..') || path.posix.isAbsolute(targetPath) || normalized.includes('/../')) {
        throw new Error(`Path traversal attempt blocked: ${targetPath}`);
      }
      return normalized;
    };

    // 1. Pack main file
    const mainFileName = language === 'python' ? 'main.py' : (language === 'c' ? 'main.c' : 'main.cpp');
    pack.entry({ name: mainFileName, mode: 0o644 }, mainCode || '');

    // 2. Pack additional project files
    if (additionalFiles && typeof additionalFiles === 'object') {
      for (const [rawRelPath, content] of Object.entries(additionalFiles)) {
        const cleanPath = sanitizePath(rawRelPath);
        if (cleanPath === mainFileName) continue; // Don't overwrite main file with stale entry
        pack.entry({ name: cleanPath, mode: 0o644 }, content || '');
      }
    }

    pack.finalize();
    return pack;
  }
}

