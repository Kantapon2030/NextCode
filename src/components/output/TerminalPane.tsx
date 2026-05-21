import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppStore, TerminalEntry } from '../../store/appStore';
import { Play, Square, Trash2, Terminal, Edit2 } from 'lucide-react';
import { runPython } from '../../services/pyodideRunner';
import { compileAndRun, CompileError } from '../../services/cppRunner';

interface Props {
  language: string;
  currentFile: string;
  currentContent: string;
  onCompileErrors: (
    errors: { line: number; col: number; message: string; severity: 'error' | 'warning' }[]
  ) => void;
}

export function TerminalPane({
  language, currentFile, currentContent, onCompileErrors,
}: Props) {
  const { terminalOutput, addTerminalEntry, clearTerminal, theme } = useAppStore();
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [stdin, setStdin] = useState('');
  const [phase, setPhase] = useState<'input' | 'output'>('output');
  const outputRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync phase with language when language changes
  useEffect(() => {
    if (language === 'c' || language === 'cpp') {
      setPhase('input');
    } else {
      setPhase('output');
    }
  }, [language]);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }, 30);
  }, []);

  function addEntry(content: string, type: TerminalEntry['type']) {
    if (!content?.trim()) return;          // ← skip empty entries
    addTerminalEntry({
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      content,
    });
    scrollToBottom();
  }

  /** ส่ง compile errors ไปให้ Monaco อย่างปลอดภัย */
  function safeSetErrors(errors: CompileError[] | undefined) {
    try {
      const safe = (errors ?? []).map((e) => ({
        line: Number.isFinite(e?.line) ? e.line : 1,
        col:  Number.isFinite(e?.col)  ? e.col  : 1,
        message:  String(e?.message  ?? 'error'),
        severity: (e?.severity === 'warning' ? 'warning' : 'error') as 'error' | 'warning',
      }));
      onCompileErrors(safe);
    } catch {
      onCompileErrors([]);
    }
  }

  async function handleRun() {
    if (running) return;
    setRunning(true);
    setPhase('output'); // Switch to output on run
    clearTerminal();
    safeSetErrors([]);   // ล้าง markers เก่า
    addEntry(`▶ กำลังรัน ${currentFile}...`, 'system');

    try {
      if (language === 'python') {
        addEntry('กำลังโหลด Python runtime (Pyodide)...', 'system');
        await runPython(
          currentContent,
          (text, type) => addEntry(text, type === 'error' ? 'error' : 'output'),
          (msg) => { setStatusMsg(msg); if (msg) addEntry(msg, 'system'); }
        );
        addEntry('\n[Python สิ้นสุดการทำงาน]', 'system');

      } else if (language === 'c' || language === 'cpp') {
        addEntry('$ ./program', 'system');
        const inputs = stdin.split('\n').map(l => l.trim()).filter(l => l !== '');
        inputs.forEach((input, index) => {
          addEntry(`> stdin[${index}]: ${input}`, 'system');
        });

        addEntry('กำลังส่งไปยัง Wandbox compiler...', 'system');
        const result = await compileAndRun(currentContent, language as 'c' | 'cpp', stdin);

        // แสดง compile errors ใน terminal
        if (result.stderr) {
          for (const line of result.stderr.split('\n')) {
            if (line.trim()) addEntry(line, 'error');
          }
        }

        // ส่ง markers ไปยัง Monaco (safe)
        safeSetErrors(result.errors);

        // แสดง stdout
        if (result.stdout) {
          addEntry(result.stdout, 'output');
        }

        // Exit code
        const exitLabel =
          result.exitCode === 0
            ? '[โปรแกรมจบสำเร็จ code: 0 ✓]'
            : `[โปรแกรมจบด้วย code: ${result.exitCode}]`;
        addEntry(exitLabel, result.exitCode === 0 ? 'system' : 'error');

      } else {
        addEntry(`❌ ยังไม่รองรับภาษา: ${language}`, 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'COMPILER_UNAVAILABLE') {
        addEntry('❌ ไม่สามารถเชื่อมต่อ compiler server ได้\nลองตรวจสอบอินเทอร์เน็ตหรือรอแป๊บนึงแล้วลองใหม่', 'error');
      } else if (msg.includes('abort') || msg.includes('timeout')) {
        addEntry('⏱ Compiler หมดเวลา (timeout 15s) — ลองใหม่อีกครั้ง', 'error');
      } else {
        addEntry(`❌ ${msg}`, 'error');
      }
    } finally {
      setRunning(false);
      setStatusMsg('');
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunning(false);
    addEntry('\n[หยุดการทำงานโดยผู้ใช้]', 'system');
  }

  const bg      = theme === 'dark' ? 'bg-surface-950 border-border' : 'bg-zinc-900 border-zinc-700';
  const toolbar = theme === 'dark' ? 'bg-surface-800 border-border' : 'bg-zinc-800 border-zinc-700';

  return (
    <div className={`flex flex-col h-full border-l ${bg}`}>
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b shrink-0 ${toolbar}`}>
        <Terminal className="w-4 h-4 text-primary-400" />
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
          Terminal
        </span>
        {statusMsg && (
          <span className="text-xs text-primary-400 animate-pulse truncate max-w-32">
            {statusMsg}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {/* Edit input and run again button (C/C++) */}
          {(language === 'c' || language === 'cpp') && phase === 'output' && !running && (
            <button
              onClick={() => setPhase('input')}
              className="flex items-center gap-1 px-2.5 py-1 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
              title="แก้ไข Input และรันใหม่"
            >
              <Edit2 className="w-3 h-3 text-zinc-400" />
              <span>แก้ input</span>
            </button>
          )}

          {/* Run button */}
          <button
            id="btn-run"
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {running ? (
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3" />
            )}
            รัน
          </button>

          {/* Stop button */}
          {running && (
            <button
              onClick={handleStop}
              className="p-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-lg transition-colors"
              title="หยุด"
            >
              <Square className="w-3 h-3" />
            </button>
          )}

          {/* Clear button */}
          <button
            onClick={() => { clearTerminal(); safeSetErrors([]); if (language === 'c' || language === 'cpp') setPhase('input'); }}
            className="p-1.5 hover:bg-surface-700 text-zinc-500 rounded-lg transition-colors"
            title="ล้าง terminal"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Input or Output */}
      {phase === 'input' && (language === 'c' || language === 'cpp') ? (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto justify-center">
          <div className="max-w-md mx-auto w-full bg-surface-900/30 border border-surface-800/80 rounded-xl p-5 flex flex-col gap-4 shadow-xl">
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-primary-400" />
                C/C++ Terminal Input
              </h3>
              <p className="text-xs text-zinc-400 mt-1">
                ป้อนข้อมูล Standard Input (stdin) ที่โปรแกรมของคุณต้องการอ่าน
              </p>
            </div>
            
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="กรอกข้อมูล Input ที่นี่... (กด Enter เพื่อขึ้นบรรทัดใหม่)"
              className="w-full bg-surface-950 border border-surface-850 hover:border-surface-700 focus:border-primary-500 rounded-lg p-3 text-xs text-zinc-100 font-mono outline-none transition-all resize-none h-44 placeholder-zinc-700 shadow-inner"
            />
            
            <div className="text-zinc-500 text-[11px] leading-relaxed">
              * โปรแกรมจะถูกส่งไปประมวลผลพร้อมข้อมูลชุดนี้ และแสดงการรับข้อมูลแต่ละบรรทัดในผลลัพธ์
            </div>

            <button
              onClick={handleRun}
              disabled={running}
              className="flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-500 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-all active:scale-[0.98]"
            >
              {running ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              รันโปรแกรมพร้อม Input
            </button>
          </div>
        </div>
      ) : (
        /* Output area */
        <div
          ref={outputRef}
          className="flex-1 overflow-y-auto p-3 terminal-output font-mono text-xs select-text selection:bg-zinc-800 selection:text-white"
        >
          {terminalOutput.length === 0 ? (
            <p className="text-zinc-600 text-xs select-none">
              กด [รัน ▶] เพื่อรันโปรแกรม...
            </p>
          ) : (
            terminalOutput.map((entry) => (
              <div
                key={entry.id}
                className={`leading-relaxed whitespace-pre-wrap ${
                  entry.type === 'error'
                    ? 'text-red-400 font-semibold'
                    : entry.type === 'system'
                    ? 'text-emerald-500 font-medium'
                    : 'text-zinc-200'
                }`}
              >
                {entry.content}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

