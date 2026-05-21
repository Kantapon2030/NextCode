import React, { useRef, useState, useCallback, useEffect, KeyboardEvent } from 'react';
import { useAppStore, TerminalEntry } from '../../store/appStore';
import { Play, Square, Trash2, Terminal, ChevronRight } from 'lucide-react';
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
  const [inputVal, setInputVal] = useState('');

  // For C/C++ — collect stdin lines before running
  const [stdinLines, setStdinLines] = useState<string[]>([]);
  const [waitingForInput, setWaitingForInput] = useState(false);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Python stdin queue for interactive input()
  const stdinQueueRef = useRef<string[]>([]);
  const stdinResolveRef = useRef<((val: string) => void) | null>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }, 30);
  }, []);

  // Auto-focus input when terminal is ready
  useEffect(() => {
    if (!running) {
      inputRef.current?.focus();
    }
  }, [running]);

  function addEntry(content: string, type: TerminalEntry['type']) {
    if (!content && content !== '') return;
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

  // Handle Enter key in input
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const val = inputVal;

    if (language === 'python' && running) {
      // Python interactive input() — resolve pending promise
      addEntry(`${val}`, 'output');
      setInputVal('');
      if (stdinResolveRef.current) {
        stdinResolveRef.current(val);
        stdinResolveRef.current = null;
      } else {
        stdinQueueRef.current.push(val);
      }
    } else if ((language === 'c' || language === 'cpp') && !running) {
      // C/C++ pre-run: collect stdin lines
      addEntry(`${val}`, 'system');
      setStdinLines((prev) => [...prev, val]);
      setInputVal('');
      setWaitingForInput(false);
    }
  };

  async function handleRun() {
    if (running) return;
    setRunning(true);
    clearTerminal();
    safeSetErrors([]);
    stdinQueueRef.current = [];
    stdinResolveRef.current = null;
    addEntry(`▶ ${currentFile}`, 'system');

    try {
      if (language === 'python') {
        addEntry('กำลังโหลด Python runtime...', 'system');

        // Python async input() hook
        async function pyInputHook(prompt: string): Promise<string> {
          if (prompt) addEntry(prompt, 'output');
          // Check queue first
          if (stdinQueueRef.current.length > 0) {
            return stdinQueueRef.current.shift()!;
          }
          // Wait for user to type
          return new Promise<string>((resolve) => {
            stdinResolveRef.current = resolve;
          });
        }

        await runPython(
          currentContent,
          (text, type) => addEntry(text, type === 'error' ? 'error' : 'output'),
          (msg) => { setStatusMsg(msg); if (msg) addEntry(msg, 'system'); },
          pyInputHook,
        );
        addEntry('\n[Python สิ้นสุดการทำงาน]', 'system');

      } else if (language === 'c' || language === 'cpp') {
        const stdin = stdinLines.join('\n');
        addEntry('กำลังส่งไปยัง Wandbox compiler...', 'system');
        const result = await compileAndRun(currentContent, language as 'c' | 'cpp', stdin);

        if (result.stderr) {
          for (const line of result.stderr.split('\n')) {
            if (line.trim()) addEntry(line, 'error');
          }
        }
        safeSetErrors(result.errors);

        if (result.stdout) {
          // Print stdout preserving newlines
          addEntry(result.stdout, 'output');
        }

        const exitLabel =
          result.exitCode === 0
            ? '[โปรแกรมจบสำเร็จ code: 0 ✓]'
            : `[โปรแกรมจบด้วย code: ${result.exitCode}]`;
        addEntry(exitLabel, result.exitCode === 0 ? 'system' : 'error');

        // Reset stdin after run
        setStdinLines([]);
      } else {
        addEntry(`❌ ยังไม่รองรับภาษา: ${language}`, 'error');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'COMPILER_UNAVAILABLE') {
        addEntry('❌ ไม่สามารถเชื่อมต่อ compiler server ได้\nลองตรวจสอบอินเทอร์เน็ต', 'error');
      } else if (msg.includes('abort') || msg.includes('timeout')) {
        addEntry('⏱ Compiler หมดเวลา (timeout 15s)', 'error');
      } else {
        addEntry(`❌ ${msg}`, 'error');
      }
    } finally {
      setRunning(false);
      setStatusMsg('');
      stdinResolveRef.current = null;
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    // Resolve any pending input with empty string
    if (stdinResolveRef.current) {
      stdinResolveRef.current('');
      stdinResolveRef.current = null;
    }
    setRunning(false);
    addEntry('\n[หยุดการทำงานโดยผู้ใช้]', 'system');
  }

  function handleClear() {
    clearTerminal();
    safeSetErrors([]);
    setStdinLines([]);
    setInputVal('');
  }

  const isCpp = language === 'c' || language === 'cpp';
  const isPython = language === 'python';
  const isInteractive = running && isPython;
  const isPreInput = isCpp && !running;

  // Input placeholder text
  const inputPlaceholder = isInteractive
    ? 'พิมพ์ input สำหรับ input() แล้วกด Enter...'
    : isPreInput
    ? 'พิมพ์ stdin แล้วกด Enter (เพิ่มทีละบรรทัด)...'
    : 'กด ▶ รัน เพื่อเริ่มโปรแกรม...';

  const showInputBar = isInteractive || isPreInput;

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-xs">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <Terminal className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Terminal</span>

        {/* Language badge */}
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
          isCpp ? 'bg-cyan-900/60 text-cyan-300' :
          isPython ? 'bg-green-900/60 text-green-300' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {language.toUpperCase()}
        </span>

        {stdinLines.length > 0 && isCpp && !running && (
          <span className="text-[10px] text-amber-400 ml-1">
            stdin: {stdinLines.length} บรรทัด
          </span>
        )}

        {statusMsg && (
          <span className="text-xs text-primary-400 animate-pulse truncate max-w-32">
            {statusMsg}
          </span>
        )}

        <div className="ml-auto flex gap-1">
          {/* Run button */}
          <button
            id="btn-run"
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
          >
            {running ? (
              <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            รัน
          </button>

          {running && (
            <button
              onClick={handleStop}
              className="p-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 rounded-lg transition-colors"
              title="หยุด"
            >
              <Square className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
            title="ล้าง terminal"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Hint for C/C++ pre-input */}
      {isCpp && !running && (
        <div className="px-3 py-1.5 bg-zinc-900/50 border-b border-zinc-800/60 text-[11px] text-zinc-500 flex items-center gap-2 shrink-0">
          <ChevronRight className="w-3 h-3 text-amber-500/70" />
          {stdinLines.length === 0
            ? 'พิมพ์ข้อมูล stdin ที่ต้องการส่งให้โปรแกรม (แต่ละ Enter = หนึ่งบรรทัด) แล้วกด ▶ รัน'
            : `stdin พร้อม ${stdinLines.length} บรรทัด → กด ▶ รัน`}
        </div>
      )}

      {/* Terminal output area */}
      <div
        ref={outputRef}
        onClick={() => inputRef.current?.focus()}
        className="flex-1 overflow-y-auto p-3 space-y-0.5 cursor-text select-text"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#3f3f46 transparent' }}
      >
        {terminalOutput.length === 0 ? (
          <div className="text-zinc-600 text-xs select-none flex items-center gap-1 mt-2">
            <ChevronRight className="w-3 h-3" />
            <span>
              {isCpp
                ? 'พิมพ์ stdin ด้านล่าง (ถ้ามี) แล้วกด [รัน ▶]'
                : isPython
                ? 'กด [รัน ▶] เพื่อเริ่ม Python'
                : 'กด [รัน ▶] เพื่อรันโปรแกรม'}
            </span>
          </div>
        ) : (
          terminalOutput.map((entry) => (
            <div
              key={entry.id}
              className={`leading-relaxed whitespace-pre-wrap break-all ${
                entry.type === 'error'
                  ? 'text-red-400'
                  : entry.type === 'system'
                  ? 'text-emerald-500/80'
                  : 'text-zinc-200'
              }`}
            >
              {entry.content}
            </div>
          ))
        )}

        {/* Blinking cursor when running & waiting for Python input */}
        {isInteractive && (
          <div className="flex items-center gap-1 text-zinc-300">
            <ChevronRight className="w-3 h-3 text-emerald-400" />
            <span className="inline-block w-1.5 h-3.5 bg-emerald-400 animate-pulse rounded-sm" />
          </div>
        )}
      </div>

      {/* Input bar — shown for C/C++ pre-run and Python interactive */}
      <div className={`shrink-0 border-t ${
        showInputBar ? 'border-emerald-800/60' : 'border-zinc-800'
      } bg-zinc-900`}>
        <div className="flex items-center px-2 py-1.5 gap-2">
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${
            isInteractive ? 'text-emerald-400' :
            isPreInput ? 'text-amber-400' :
            'text-zinc-600'
          }`} />
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={!showInputBar}
            placeholder={inputPlaceholder}
            className={`flex-1 bg-transparent outline-none text-xs font-mono ${
              showInputBar ? 'text-zinc-100 placeholder-zinc-600' : 'text-zinc-600 placeholder-zinc-700 cursor-default'
            }`}
            spellCheck={false}
            autoComplete="off"
          />
          {showInputBar && (
            <span className="text-[10px] text-zinc-600 shrink-0">Enter ↵</span>
          )}
        </div>
      </div>
    </div>
  );
}
