import Docker from 'dockerode';
import tar from 'tar-stream';
import path from 'path';
import { performance } from 'perf_hooks';
import { Request, Response } from 'express';
import { ContainerPool } from './containerPool';

export type Verdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE';

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  timeLimitMs?: number; // Default: 2000 ms
  memoryLimitKb?: number; // Default: 65536 KB (64 MB)
}

export interface TestCaseResult {
  id: string;
  verdict: Verdict;
  executionTimeMs: number;
  memoryUsedKb: number;
  actualOutput?: string;
  expectedOutput?: string;
  stderr?: string;
  errorMessage?: string;
}

export interface GradeRequest {
  language: 'c' | 'cpp' | 'python';
  code: string;
  files?: Record<string, string>;
  testCases: TestCase[];
  overallTimeLimitMs?: number;
}

export interface GradeReport {
  overallVerdict: Verdict;
  score: number; // 0 - 100
  passedTests: number;
  totalTests: number;
  totalExecutionTimeMs: number;
  peakMemoryKb: number;
  compileOutput?: string;
  results: TestCaseResult[];
  timestamp: number;
}

export class AutoGrader {
  private pool: ContainerPool;
  private docker: Docker;

  constructor(pool: ContainerPool) {
    this.pool = pool;
    this.docker = new Docker();
  }

  /**
   * Evaluates code submission across batch test cases in an isolated container.
   */
  public async gradeSubmission(request: GradeRequest): Promise<GradeReport> {
    const startTime = performance.now();
    let containerId: string | null = null;

    try {
      // 1. Acquire Pre-warmed Sandbox Container
      containerId = await this.pool.acquireContainer(10000);
      const container = this.docker.getContainer(containerId);

      // 2. Pack and Upload Source Code
      const tarStream = this.createTarArchive(request.language, request.code, request.files);
      await container.putArchive(tarStream, { path: '/workspace' });

      // 3. Compile Step (C and C++) — Compile Once
      if (request.language === 'c' || request.language === 'cpp') {
        const compileResult = await this.compileCode(container, request.language);
        if (!compileResult.success) {
          return {
            overallVerdict: 'CE',
            score: 0,
            passedTests: 0,
            totalTests: request.testCases.length,
            totalExecutionTimeMs: Math.round(performance.now() - startTime),
            peakMemoryKb: 0,
            compileOutput: compileResult.output,
            results: request.testCases.map((tc) => ({
              id: tc.id,
              verdict: 'CE',
              executionTimeMs: 0,
              memoryUsedKb: 0,
              errorMessage: 'Compilation failed',
            })),
            timestamp: Date.now(),
          };
        }
      }

      // 4. Run Batch Test Cases Sequentially
      const results: TestCaseResult[] = [];
      let totalExecutionTime = 0;
      let peakMemory = 0;
      let passedCount = 0;

      for (const testCase of request.testCases) {
        const timeLimit = testCase.timeLimitMs || 2000;
        const memoryLimit = testCase.memoryLimitKb || 65536;

        const testResult = await this.executeTestCase(
          container,
          request.language,
          testCase,
          timeLimit,
          memoryLimit
        );

        results.push(testResult);
        totalExecutionTime += testResult.executionTimeMs;
        if (testResult.memoryUsedKb > peakMemory) {
          peakMemory = testResult.memoryUsedKb;
        }
        if (testResult.verdict === 'AC') {
          passedCount++;
        }
      }

      // 5. Determine Overall Verdict & Final Score
      const totalTests = request.testCases.length;
      const score = totalTests > 0 ? Math.round((passedCount / totalTests) * 100) : 0;

      let overallVerdict: Verdict = 'AC';
      for (const r of results) {
        if (r.verdict !== 'AC') {
          overallVerdict = r.verdict;
          break;
        }
      }

      return {
        overallVerdict,
        score,
        passedTests: passedCount,
        totalTests,
        totalExecutionTimeMs: Math.round(totalExecutionTime),
        peakMemoryKb: Math.round(peakMemory),
        results,
        timestamp: Date.now(),
      };
    } finally {
      // 6. Release and Destroy Sandbox Container (Zero-State-Leakage)
      if (containerId) {
        await this.pool.releaseAndDestroy(containerId).catch((err) => {
          console.error(`[AutoGrader] Failed to destroy container ${containerId}:`, err);
        });
      }
    }
  }

  /**
   * Compiles C/C++ source code inside the container.
   */
  private async compileCode(
    container: Docker.Container,
    language: 'c' | 'cpp'
  ): Promise<{ success: boolean; output: string }> {
    const compileCmd =
      language === 'c'
        ? ['sh', '-c', 'gcc -O2 -Wall $(find /workspace -maxdepth 2 -name "*.c") -o /workspace/app']
        : ['sh', '-c', 'g++ -O2 -Wall -std=c++20 $(find /workspace -maxdepth 2 -name "*.cpp") -o /workspace/app'];

    const exec = await container.exec({
      Cmd: compileCmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const outputBuffer: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      container.modem.demuxStream(
        stream,
        {
          write: (chunk: Buffer) => outputBuffer.push(chunk),
        },
        {
          write: (chunk: Buffer) => outputBuffer.push(chunk),
        }
      );
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const inspectData = await exec.inspect();
    const fullOutput = Buffer.concat(outputBuffer).toString('utf8');

    return {
      success: inspectData.ExitCode === 0,
      output: fullOutput,
    };
  }

  /**
   * Executes a single test case with precise Telemetry (Time & Memory monitoring).
   */
  private async executeTestCase(
    container: Docker.Container,
    language: 'c' | 'cpp' | 'python',
    testCase: TestCase,
    timeLimitMs: number,
    memoryLimitKb: number
  ): Promise<TestCaseResult> {
    const runCmd =
      language === 'python'
        ? ['python3', '-u', '/workspace/main.py']
        : ['/workspace/app'];

    const exec = await container.exec({
      Cmd: runCmd,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = (await exec.start({ hijack: true, stdin: true })) as NodeJS.ReadWriteStream;

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    // Demux standard output and error streams
    container.modem.demuxStream(
      stream,
      { write: (chunk: Buffer) => stdoutChunks.push(chunk) },
      { write: (chunk: Buffer) => stderrChunks.push(chunk) }
    );

    const execStart = performance.now();
    let isTimeout = false;
    let timeoutTimer: NodeJS.Timeout | null = null;

    // Hard Time Limit enforcement
    const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => {
      timeoutTimer = setTimeout(() => {
        isTimeout = true;
        try {
          (stream as any).destroy?.();
        } catch {}
        resolve('TIMEOUT');
      }, timeLimitMs);
    });

    // Write input into stdin
    if (testCase.input) {
      stream.write(testCase.input);
    }
    stream.end();

    const streamEndPromise = new Promise<'FINISHED'>((resolve, reject) => {
      stream.on('end', () => resolve('FINISHED'));
      stream.on('error', (err) => reject(err));
    });

    // Race between execution completion and timeout
    const raceResult = await Promise.race([streamEndPromise, timeoutPromise]);
    if (timeoutTimer) clearTimeout(timeoutTimer);

    const executionDuration = Math.round(performance.now() - execStart);

    if (raceResult === 'TIMEOUT' || isTimeout) {
      return {
        id: testCase.id,
        verdict: 'TLE',
        executionTimeMs: timeLimitMs,
        memoryUsedKb: 0,
        expectedOutput: testCase.expectedOutput,
        errorMessage: `Time Limit Exceeded (${timeLimitMs}ms)`,
      };
    }

    // Inspect exit status
    const inspectInfo = await exec.inspect();
    const exitCode = inspectInfo.ExitCode ?? 0;

    // Retrieve memory consumption from container cgroups
    const memoryUsedKb = await this.readContainerMemoryKb(container);

    const rawStdout = Buffer.concat(stdoutChunks).toString('utf8');
    const rawStderr = Buffer.concat(stderrChunks).toString('utf8');

    // Check Memory Limit Exceeded
    if (exitCode === 137 || (memoryLimitKb > 0 && memoryUsedKb > memoryLimitKb)) {
      return {
        id: testCase.id,
        verdict: 'MLE',
        executionTimeMs: executionDuration,
        memoryUsedKb: Math.max(memoryUsedKb, memoryLimitKb),
        expectedOutput: testCase.expectedOutput,
        errorMessage: `Memory Limit Exceeded (${memoryLimitKb} KB limit)`,
      };
    }

    // Check Runtime Error (Non-zero exit code)
    if (exitCode !== 0) {
      let errorDesc = `Runtime Error (Exit Code: ${exitCode})`;
      if (exitCode === 139) errorDesc = 'Segmentation Fault (SIGSEGV)';
      if (exitCode === 136) errorDesc = 'Floating Point Exception (SIGFPE)';

      return {
        id: testCase.id,
        verdict: 'RE',
        executionTimeMs: executionDuration,
        memoryUsedKb,
        stderr: rawStderr,
        actualOutput: rawStdout,
        expectedOutput: testCase.expectedOutput,
        errorMessage: errorDesc,
      };
    }

    // Output Matching (Compare Normalized Outputs)
    const normalizedActual = this.normalizeOutput(rawStdout);
    const normalizedExpected = this.normalizeOutput(testCase.expectedOutput);

    if (normalizedActual === normalizedExpected) {
      return {
        id: testCase.id,
        verdict: 'AC',
        executionTimeMs: executionDuration,
        memoryUsedKb,
        actualOutput: rawStdout,
        expectedOutput: testCase.expectedOutput,
      };
    } else {
      return {
        id: testCase.id,
        verdict: 'WA',
        executionTimeMs: executionDuration,
        memoryUsedKb,
        actualOutput: rawStdout,
        expectedOutput: testCase.expectedOutput,
        errorMessage: 'Output mismatch with expected answer',
      };
    }
  }

  /**
   * Reads actual memory consumption in KB from Docker container stats or cgroups.
   */
  private async readContainerMemoryKb(container: Docker.Container): Promise<number> {
    try {
      const stats = (await container.stats({ stream: false })) as any;
      if (stats?.memory_stats?.usage) {
        return Math.round(stats.memory_stats.usage / 1024);
      }
    } catch {}
    return 1024; // Fallback estimate
  }

  /**
   * Normalizes program output by trimming trailing whitespace per line and overall trailing newlines.
   */
  private normalizeOutput(output: string): string {
    if (!output) return '';
    return output
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim();
  }

  /**
   * Builds Tar stream containing project code with path traversal protection.
   */
  private createTarArchive(
    language: 'c' | 'cpp' | 'python',
    mainCode: string,
    additionalFiles?: Record<string, string>
  ): any {
    const pack = tar.pack();

    const sanitize = (p: string): string => {
      if (p.includes('\0')) throw new Error('Null byte detected');
      const norm = path.posix.normalize(p.replace(/\\/g, '/')).replace(/^\/+/, '');
      if (norm.startsWith('..') || norm.includes('/../')) {
        throw new Error(`Path traversal blocked: ${p}`);
      }
      return norm;
    };

    const mainFile = language === 'python' ? 'main.py' : language === 'c' ? 'main.c' : 'main.cpp';
    pack.entry({ name: mainFile, mode: 0o644 }, mainCode || '');

    if (additionalFiles) {
      for (const [fName, content] of Object.entries(additionalFiles)) {
        const clean = sanitize(fName);
        if (clean === mainFile) continue;
        pack.entry({ name: clean, mode: 0o644 }, content || '');
      }
    }

    pack.finalize();
    return pack;
  }

  /**
   * Express HTTP Route Controller for POST /api/grade
   */
  public handleGradeRequest = async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as GradeRequest;

      if (!body.language || !['c', 'cpp', 'python'].includes(body.language)) {
        res.status(400).json({ error: 'Invalid or unsupported language' });
        return;
      }

      if (!body.code && typeof body.code !== 'string') {
        res.status(400).json({ error: 'Source code is required' });
        return;
      }

      if (!Array.isArray(body.testCases) || body.testCases.length === 0) {
        res.status(400).json({ error: 'testCases array cannot be empty' });
        return;
      }

      const report = await this.gradeSubmission(body);
      res.status(200).json(report);
    } catch (err: any) {
      console.error('[AutoGrader] Grading error:', err);
      res.status(500).json({ error: `Internal grading error: ${err.message}` });
    }
  };
}
