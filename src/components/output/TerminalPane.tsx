import React, { useRef, useState, useCallback, useEffect, KeyboardEvent } from 'react';
import { useAppStore, TerminalEntry } from '../../store/appStore';
import { Play, Square, Trash2, Terminal, ChevronRight, RotateCcw } from 'lucide-react';
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
  const { terminalOutput, addTerminalEntry, clearTerminal } = useAppStore();
  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [stdinLines, setStdinLines] = useState<string[]>([]);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isCpp = language === 'c' || language === 'cpp';
  const isPython = language === 'python';
  const isCodeLang = isCpp || isPython;

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
    }, 30);
  }, []);

  useEffect(() => {
    if (!running) inputRef.current?.focus();
  }, [running]);

  // Reset stdin when switching language
  useEffect(() => {
    setStdinLines([]);
    setInputVal('');
  }, [language]);

  function addEntry(content: string, type: TerminalEntry['type']) {
    if (content === undefined) return;
    addTerminalEntry({
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      type,
      content,
    });
    scrollToBottom();
  }

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

  // Handle Enter key in input (collect stdin line)
  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || running) return;
    const val = inputVal.trim();
    // Allow empty lines too (user may need to enter blank)
    addEntry(`  > ${inputVal}`, 'system');
    setStdinLines((prev) => [...prev, inputVal]);
    setInputVal('');
  };

  async function handleRun() {
    if (running) return;
    setRunning(true);
    clearTerminal();
    safeSetErrors([]);

    const currentStdin = [...stdinLines];

    // Show what stdin will be used
    addEntry(`▶ ${currentFile}`, 'system');
    if (currentStdin.length > 0 && isCodeLang) {
      addEntry(`stdin: ${currentStdin.length} บรรทัด → [${currentStdin.join(', ')}]`, 'system');
    }

    try {
      if (isPython) {
        addEntry('กำลังโหลด Python runtime...', 'system');
        await runPython(
          currentContent,
          (text, type) => {
            if (text !== undefined && text !== null) {
              addEntry(text, type === 'error' ? 'error' : 'output');
            }
          },
          (msg) => { setStatusMsg(msg); if (msg) addEntry(msg, 'system'); },
          currentStdin,
        );
        addEntry('[Python สิ้นสุดการทำงาน]', 'system');

      } else if (isCpp) {
        const stdin = currentStdin.join('\n');
        addEntry('กำลังส่งไปยัง Wandbox compiler...', 'system');

        const result = await compileAndRun(currentContent, language as 'c' | 'cpp', stdin);

        if (result.stderr) {
          for (const line of result.stderr.split('\n')) {
            if (line.trim()) addEntry(line, 'error');
          }
        }
        safeSetErrors(result.errors);

        if (result.stdout) {
          addEntry(result.stdout, 'output');
        }

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
        addEntry('❌ ไม่สามารถเชื่อมต่อ compiler server\nลองตรวจสอบอินเทอร์เน็ตและรันใหม่', 'error');
      } else if (msg.includes('abort') || msg.includes('timeout') || msg.includes('500')) {
        addEntry('⏱ Compiler server error — รอสักครู่แล้วลองใหม่', 'error');
      } else {
        addEntry(`❌ ${msg}`, 'error');
      }
    } finally {
      setRunning(false);
      setStatusMsg('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunning(false);
    addEntry('[หยุดการทำงานโดยผู้ใช้]', 'system');
  }

  function handleClear() {
    clearTerminal();
    safeSetErrors([]);
    setStdinLines([]);
    setInputVal('');
  }

  const langColor = isCpp
    ? 'text-cyan-300 bg-cyan-900/40'
    : isPython
    ? 'text-green-300 bg-green-900/40'
    : 'text-zinc-400 bg-zinc-800';

  const inputPlaceholder = running
    ? 'กำลังรันโปรแกรม...'
    : isCodeLang
    ? 'พิมพ์ stdin แล้วกด Enter เพื่อเพิ่มบรรทัด → กด ▶ รัน'
    : 'กด ▶ รัน เพื่อเริ่มโปรแกรม';

  return (
    <div className="flex flex-col h-full bg-zinc-950 font-mono text-xs select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900 shrink-0">
        <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-widest">Terminal</span>

        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${langColor}`}>
          {language.toUpperCase()}
        </span>

        {stdinLines.length > 0 && isCodeLang && !running && (
          <span className="text-[10px] text-amber-400 flex items-center gap-1">
            stdin: {stdinLines.length} บรรทัด
            <button
              onClick={() => setStdinLines([])}
              className="ml-0.5 text-zinc-600 hover:text-red-400 transition-colors"
              title="ล้าง stdin"
            >
              ×
            </button>
          </span>
        )}

        {statusMsg && (
          <span className="text-[11px] text-primary-400 animate-pulse truncate max-w-[120px]">
            {statusMsg}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Run */}
          <button
            id="btn-run"
            onClick={handleRun}
            disabled={running}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-[11px] font-semibold transition-colors"
          >
            {running ? (
              <div className="w-3 h-3 border border-white/60 border-t-white rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            รัน
          </button>

          {running && (
            <button onClick={handleStop} className="p-1.5 bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded-lg transition-colors" title="หยุด">
              <Square className="w-3 h-3" />
            </button>
          )}

          {/* Reset stdin + clear */}
          {!running && stdinLines.length > 0 && (
            <button onClick={() => setStdinLines([])} className="p-1.5 hover:bg-zinc-800 text-amber-600 hover:text-amber-400 rounded-lg transition-colors" title="ล้าง stdin">
              <RotateCcw className="w-3 h-3" />
            </button>
          )}

          <button onClick={handleClear} className="p-1.5 hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 rounded-lg transition-colors" title="ล้าง terminal">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* stdin hint strip */}
      {isCodeLang && !running && (
        <div className="px-3 py-1 bg-zinc-900/60 border-b border-zinc-800/50 text-[10px] text-zinc-600 flex items-center gap-1.5 shrink-0">
          <ChevronRight className="w-2.5 h-2.5 text-amber-600 shrink-0" />
          {stdinLines.length === 0
            ? `พิมพ์ค่า stdin ด้านล่าง กด Enter เพื่อเพิ่มทีละบรรทัด แล้วกด ▶ รัน`
            : stdinLines.map((l, i) => (
              <span key={i} className="px-1 py-0.5 bg-zinc-800 rounded text-amber-400/80 font-mono">{l || '(blank)'}</span>
            ))
          }
        </div>
      )}

      {/* Output area */}
      <div
        ref={outputRef}
        onClick={() => !running && inputRef.current?.focus()}
        className="flex-1 overflow-y-auto p-3 space-y-0.5 cursor-text"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a transparent' }}
      >
        {terminalOutput.length === 0 ? (
          <div className="text-zinc-700 text-[11px] mt-2 flex items-center gap-1 select-none">
            <ChevronRight className="w-3 h-3" />
            {isCodeLang
              ? 'เพิ่ม stdin ด้านล่าง (ถ้ามี) แล้วกด ▶ รัน'
              : 'กด ▶ รัน เพื่อเริ่มโปรแกรม'}
          </div>
        ) : (
          terminalOutput.map((entry) => (
            <div
              key={entry.id}
              className={`leading-relaxed whitespace-pre-wrap break-words select-text ${
                entry.type === 'error'
                  ? 'text-red-400'
                  : entry.type === 'system'
                  ? 'text-emerald-600/80'
                  : 'text-zinc-200'
              }`}
            >
              {entry.content}
            </div>
          ))
        )}
      </div>

      {/* Input bar */}
      <div className={`shrink-0 border-t ${
        isCodeLang && !running ? 'border-amber-900/40 bg-zinc-900' : 'border-zinc-800 bg-zinc-900'
      }`}>
        <div className="flex items-center px-2.5 py-1.5 gap-2">
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-colors ${
            isCodeLang && !running ? 'text-amber-500' : 'text-zinc-700'
          }`} />
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={running || !isCodeLang}
            placeholder={inputPlaceholder}
            className={`flex-1 bg-transparent outline-none text-[11px] font-mono tracking-normal ${
              isCodeLang && !running
                ? 'text-zinc-100 placeholder-zinc-700'
                : 'text-zinc-600 placeholder-zinc-800 cursor-default'
            }`}
            spellCheck={false}
            autoComplete="off"
          />
          {isCodeLang && !running && (
            <span className="text-[10px] text-zinc-700 shrink-0">Enter ↵</span>
          )}
        </div>
      </div>
    </div>
  );
}
