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

interface RunOutput {
  stdout: string;
  stderr: string;
  isWaiting: boolean;
  exitCode: number;
}

function countExpectedInputs(code: string, language: string): number {
  if (language === 'python') {
    const matches = code.match(/\binput\s*\(/g);
    return matches ? matches.length : 0;
  }
  if (language === 'c' || language === 'cpp') {
    let count = 0;
    // Find all cin statements: cin >> a >> b;
    const cinRegex = /cin\s*(?:>>\s*[a-zA-Z0-9_\[\]\(\)\.\->]+)+/g;
    let match;
    const codeCleaned = code.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''); // remove comments
    while ((match = cinRegex.exec(codeCleaned)) !== null) {
      const rr = match[0].match(/>>/g);
      if (rr) count += rr.length;
    }
    // Find all scanf calls
    const scanfRegex = /scanf\s*\(\s*"(.*?)"/g;
    while ((match = scanfRegex.exec(codeCleaned)) !== null) {
      const formatStr = match[1];
      const placeholders = formatStr.replace(/%%/g, '').match(/%/g);
      if (placeholders) count += placeholders.length;
    }
    return count;
  }
  return 0;
}

function reconstructTerminal(
  outputs: RunOutput[],
  inputs: string[],
  language: string,
  currentFile: string,
  isCurrentlyRunning: boolean
): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  // Start log
  entries.push({
    id: `start-${Date.now()}`,
    timestamp: Date.now(),
    type: 'system',
    content: `▶ ${currentFile}`,
  });

  for (let i = 0; i < outputs.length; i++) {
    const currentRun = outputs[i];
    const prevRun = i > 0 ? outputs[i - 1] : null;

    let newStdout = currentRun.stdout;
    let newStderr = currentRun.stderr;

    if (prevRun) {
      if (newStdout.startsWith(prevRun.stdout)) {
        newStdout = newStdout.slice(prevRun.stdout.length);
      }
      if (newStderr.startsWith(prevRun.stderr)) {
        newStderr = newStderr.slice(prevRun.stderr.length);
      }
    }

    if (newStderr) {
      entries.push({
        id: `stderr-${i}-${Math.random()}`,
        timestamp: Date.now(),
        type: 'error',
        content: newStderr,
      });
    }

    if (newStdout) {
      entries.push({
        id: `stdout-${i}-${Math.random()}`,
        timestamp: Date.now(),
        type: 'output',
        content: newStdout,
      });
    }

    if (i < inputs.length) {
      entries.push({
        id: `input-${i}-${Math.random()}`,
        timestamp: Date.now(),
        type: 'output',
        content: inputs[i] + '\n',
      });
    }
  }

  // End log if not running
  if (!isCurrentlyRunning) {
    if (language === 'python') {
      entries.push({
        id: `end-${Date.now()}`,
        timestamp: Date.now(),
        type: 'system',
        content: '[Python สิ้นสุดการทำงาน]',
      });
    } else if (language === 'c' || language === 'cpp') {
      const lastOutput = outputs[outputs.length - 1];
      const code = lastOutput ? lastOutput.exitCode : 0;
      const exitLabel = code === 0
        ? '[โปรแกรมจบสำเร็จ code: 0 ✓]'
        : `[โปรแกรมจบด้วย code: ${code}]`;
      entries.push({
        id: `end-${Date.now()}`,
        timestamp: Date.now(),
        type: code === 0 ? 'system' : 'error',
        content: exitLabel,
      });
    }
  }

  return entries;
}

export function TerminalPane({
  language, currentFile, currentContent, onCompileErrors,
}: Props) {
  const { terminalOutput, setTerminalOutput, clearTerminal } = useAppStore();
  const [running, setRunning] = useState(false);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [stdinLines, setStdinLines] = useState<string[]>([]);
  const [runOutputs, setRunOutputs] = useState<RunOutput[]>([]);

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
    if (running && !networkLoading) {
      inputRef.current?.focus();
    }
  }, [running, networkLoading]);

  // Reset state when switching language
  useEffect(() => {
    setStdinLines([]);
    setInputVal('');
    setRunOutputs([]);
    setRunning(false);
    setNetworkLoading(false);
  }, [language]);

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

  async function executeCode(inputs: string[]) {
    setNetworkLoading(true);
    const isFirstRun = inputs.length === 0;

    if (isFirstRun) {
      // Clear terminal immediately on first run
      clearTerminal();
    }

    setStatusMsg(
      language === 'python'
        ? (isFirstRun ? 'กำลังโหลด Python runtime...' : 'กำลังประมวลผล...')
        : (isFirstRun ? 'กำลังคอมไพล์ด้วย Godbolt...' : 'กำลังส่ง input ไปรัน...')
    );

    try {
      if (isPython) {
        let stdout = '';
        let stderr = '';
        let isWaiting = false;
        let exitCode = 0;

        try {
          await runPython(
            currentContent,
            (text, type) => {
              if (type === 'error') {
                stderr += text;
              } else {
                stdout += text;
              }
            },
            (status) => {
              if (status) setStatusMsg(status);
            },
            inputs
          );
        } catch (e: any) {
          if (e.message === 'WAITING_FOR_INPUT') {
            isWaiting = true;
          } else {
            stderr += `\n${e.message || e}`;
            exitCode = 1;
          }
        }

        const newRunOutput: RunOutput = { stdout, stderr, isWaiting, exitCode };
        const nextOutputs = isFirstRun ? [newRunOutput] : [...runOutputs, newRunOutput];
        setRunOutputs(nextOutputs);

        const entries = reconstructTerminal(nextOutputs, inputs, language, currentFile, isWaiting);
        setTerminalOutput(entries);
        setRunning(isWaiting);

      } else if (isCpp) {
        const stdin = inputs.join('\n');
        const result = await compileAndRun(currentContent, language as 'c' | 'cpp', stdin);

        if (result.compileError) {
          // Compilation failed - stop execution and display errors
          safeSetErrors(result.errors);
          const compileEntries: TerminalEntry[] = [
            {
              id: `start-${Date.now()}`,
              timestamp: Date.now(),
              type: 'system',
              content: `▶ ${currentFile}`,
            }
          ];
          for (const line of result.stderr.split('\n')) {
            if (line.trim()) {
              compileEntries.push({
                id: `compile-err-${Math.random()}`,
                timestamp: Date.now(),
                type: 'error',
                content: line,
              });
            }
          }
          compileEntries.push({
            id: `compile-fail-${Date.now()}`,
            timestamp: Date.now(),
            type: 'error',
            content: `[คอมไพล์ไม่สำเร็จ exit code: ${result.exitCode}]`,
          });
          setTerminalOutput(compileEntries);
          setRunning(false);
          return;
        }

        safeSetErrors(result.errors);

        // Analyze stdin requirements
        const expectedCount = countExpectedInputs(currentContent, language);
        let isWaiting = result.isWaiting || false;

        if (!isWaiting && expectedCount > 0) {
          if (inputs.length < expectedCount) {
            isWaiting = true;
          } else {
            // Check if output changed compared to the previous run.
            // If it did, keep waiting (as it might be in a loop).
            const prevRun = runOutputs[runOutputs.length - 1];
            if (prevRun && result.stdout !== prevRun.stdout && result.exitCode === 0) {
              isWaiting = true;
            }
          }
        }

        const newRunOutput: RunOutput = {
          stdout: result.stdout,
          stderr: result.stderr,
          isWaiting,
          exitCode: result.exitCode,
        };
        const nextOutputs = isFirstRun ? [newRunOutput] : [...runOutputs, newRunOutput];
        setRunOutputs(nextOutputs);

        const entries = reconstructTerminal(nextOutputs, inputs, language, currentFile, isWaiting);
        setTerminalOutput(entries);
        setRunning(isWaiting);

      } else {
        setTerminalOutput([
          {
            id: `err-${Date.now()}`,
            timestamp: Date.now(),
            type: 'error',
            content: `❌ ยังไม่รองรับภาษา: ${language}`,
          }
        ]);
        setRunning(false);
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      const errEntry: TerminalEntry = {
        id: `err-${Date.now()}`,
        timestamp: Date.now(),
        type: 'error',
        content: `❌ เกิดข้อผิดพลาด: ${msg}`,
      };
      setTerminalOutput(isFirstRun ? [errEntry] : [...terminalOutput, errEntry]);
      setRunning(false);
    } finally {
      setNetworkLoading(false);
      setStatusMsg('');
      scrollToBottom();
    }
  }

  async function handleRun() {
    if (running || networkLoading) return;
    setRunning(true);
    setStdinLines([]);
    setRunOutputs([]);
    await executeCode([]);
  }

  function handleStop() {
    abortRef.current?.abort();
    setRunning(false);
    setNetworkLoading(false);
    setTerminalOutput([
      ...terminalOutput,
      {
        id: `stop-${Date.now()}`,
        timestamp: Date.now(),
        type: 'system',
        content: '[หยุดการทำงานโดยผู้ใช้]',
      }
    ]);
  }

  function handleClear() {
    clearTerminal();
    safeSetErrors([]);
    setStdinLines([]);
    setRunOutputs([]);
    setInputVal('');
    setRunning(false);
    setNetworkLoading(false);
  }

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' || networkLoading || !running) return;

    const nextInput = inputVal;
    setInputVal('');

    // Append to inputs list
    const updatedInputs = [...stdinLines, nextInput];
    setStdinLines(updatedInputs);

    // Re-run execution with new inputs
    executeCode(updatedInputs);
  };

  const langColor = isCpp
    ? 'text-cyan-300 bg-cyan-900/40'
    : isPython
    ? 'text-green-300 bg-green-900/40'
    : 'text-zinc-400 bg-zinc-800';

  const inputPlaceholder = networkLoading
    ? 'กำลังประมวลผลคำสั่ง...'
    : running
    ? 'โปรแกรมต้องการข้อมูล: พิมพ์คำตอบแล้วกด Enter ↵'
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

        {statusMsg && (
          <span className="text-[11px] text-emerald-400 animate-pulse truncate max-w-[200px]">
            {statusMsg}
          </span>
        )}

        <div className="ml-auto flex items-center gap-1">
          {/* Run Button */}
          <button
            id="btn-run"
            onClick={handleRun}
            disabled={running || networkLoading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg text-[11px] font-semibold transition-colors"
          >
            {networkLoading ? (
              <div className="w-3 h-3 border border-white/60 border-t-white rounded-full animate-spin" />
            ) : (
              <Play className="w-3 h-3 fill-current" />
            )}
            รัน
          </button>

          {running && (
            <button
              onClick={handleStop}
              className="p-1.5 bg-red-900/40 hover:bg-red-800/60 text-red-400 rounded-lg transition-colors"
              title="หยุด"
            >
              <Square className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={handleClear}
            className="p-1.5 hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300 rounded-lg transition-colors"
            title="ล้าง terminal"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Output area */}
      <div
        ref={outputRef}
        onClick={() => running && !networkLoading && inputRef.current?.focus()}
        className="flex-1 overflow-y-auto p-3 space-y-0.5 cursor-text"
        style={{ scrollbarWidth: 'thin', scrollbarColor: '#27272a transparent' }}
      >
        {terminalOutput.length === 0 ? (
          <div className="text-zinc-700 text-[11px] mt-2 flex items-center gap-1 select-none">
            <ChevronRight className="w-3 h-3" />
            {isCodeLang ? 'พิมพ์ตอบรับใน terminal ได้เมื่อรันโปรแกรม' : 'กด ▶ รัน เพื่อเริ่มโปรแกรม'}
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
        running && !networkLoading ? 'border-amber-900/40 bg-zinc-900' : 'border-zinc-800 bg-zinc-900'
      }`}>
        <div className="flex items-center px-2.5 py-1.5 gap-2">
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-colors ${
            running && !networkLoading ? 'text-amber-500' : 'text-zinc-700'
          }`} />
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleInputKeyDown}
            disabled={!running || networkLoading}
            placeholder={inputPlaceholder}
            className={`flex-1 bg-transparent outline-none text-[11px] font-mono tracking-normal ${
              running && !networkLoading
                ? 'text-zinc-100 placeholder-zinc-700'
                : 'text-zinc-600 placeholder-zinc-800 cursor-default'
            }`}
            spellCheck={false}
            autoComplete="off"
          />
          {running && !networkLoading && (
            <span className="text-[10px] text-zinc-700 shrink-0">Enter ↵</span>
          )}
        </div>
      </div>
    </div>
  );
}
