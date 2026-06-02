import React, {
  useState, useRef, useEffect, useCallback
} from 'react';
import { Play, Square, Trash2, Terminal, History } from 'lucide-react';
import { getTerminalHistory, saveTerminalHistory } from '../../storage/db';
import type { TerminalEntry } from '../../store/appStore';
import { useAppStore } from '../../store/appStore';
import {
  initPyodideWorker, runPythonCode,
  sendInputToWorker, stopPythonWorker,
  terminatePyodideWorker,
} from '../../services/pyodideRunner';
import {
  compileAndRun, stripAnsi
} from '../../services/cppRunner';
import { nanoid } from 'nanoid';

type Phase = 'idle' | 'initializing' | 'running' | 'waiting' | 'done';

interface Props {
  language: string;
  currentFile: string;
  currentContent: string;
  onCompileErrors?: (errors: { line: number; col: number; message: string; severity: 'error' | 'warning' }[]) => void;
}

export const TerminalPane: React.FC<Props> = ({
  language,
  currentFile,
  currentContent,
  onCompileErrors
}) => {
  const {
    vfs, activeLanguage, 
    terminalOutput, addTerminalEntry, setTerminalOutput, clearTerminal,
    currentProject,
  } = useAppStore();
  const projectId = currentProject?.id;

  const [phase,        setPhase]        = useState<Phase>('idle');
  const [inputValue,   setInputValue]   = useState('');
  const [isWaiting,    setIsWaiting]    = useState(false);
  const [history,      setHistory]      = useState<any[]>([]);
  const [showHistory,  setShowHistory]  = useState(false);

  const loadHistory = useCallback(async () => {
    if (projectId) {
      const list = await getTerminalHistory(projectId);
      setHistory(list);
    }
  }, [projectId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const workerInitialized = useRef(false);

  // ── auto scroll ──────────────────────────────────────
  useEffect(() => {
    outputRef.current?.scrollTo({
      top: outputRef.current.scrollHeight,
    });
  }, [terminalOutput, isWaiting]);

  // ── focus input เมื่อรอ ──────────────────────────────
  useEffect(() => {
    if (isWaiting) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isWaiting]);

  // ── smart append helper ──────────────────────────────
  const smartAppend = useCallback((
    text: string,
    type: TerminalEntry['type'] = 'output'
  ) => {
    if (!text && type === 'output') return;

    const currentOutputs = useAppStore.getState().terminalOutput;
    if (currentOutputs.length > 0) {
      const lastEntry = currentOutputs[currentOutputs.length - 1];
      const mergeableTypes: TerminalEntry['type'][] = ['output', 'error', 'input-echo', 'stdin-echo'];
      
      // Merge if the last entry's type is mergeable, the new type is mergeable,
      // and the last entry doesn't end with a newline
      if (
        mergeableTypes.includes(lastEntry.type) &&
        mergeableTypes.includes(type) &&
        !lastEntry.content.endsWith('\n')
      ) {
        const updated = [...currentOutputs];
        updated[updated.length - 1] = {
          ...lastEntry,
          content: lastEntry.content + text,
        };
        setTerminalOutput(updated);
        return;
      }
    }

    addTerminalEntry({
      id: nanoid(),
      type,
      content: text,
      timestamp: Date.now()
    });
  }, [addTerminalEntry, setTerminalOutput]);

  // Ref to bypass stale closure in worker callbacks
  const smartAppendRef = useRef(smartAppend);
  useEffect(() => {
    smartAppendRef.current = smartAppend;
  }, [smartAppend]);

  // ── RUN ──────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (phase === 'running' || phase === 'waiting'
        || phase === 'initializing') return;

    clearTerminal();
    setIsWaiting(false);
    setInputValue('');
    if (onCompileErrors) onCompileErrors([]);

    // ── Python ────────────────────────────────────────
    if (language === 'python') {
      const code = currentContent ?? '';
      if (!code.trim()) {
        smartAppend('ไม่มีโค้ดในไฟล์นี้', 'error');
        return;
      }

      setPhase('initializing');
      smartAppend('▶ กำลังเตรียม Python runtime...', 'info');

      // init worker ถ้ายังไม่มี
      if (!workerInitialized.current) {
        await initPyodideWorker(
          // onOutput
          (text, type) => {
            smartAppendRef.current(text, type as TerminalEntry['type']);
          },
          // onWaitingInput — โปรแกรมรอรับค่า
          () => {
            setIsWaiting(true);
            setPhase('waiting');
          },
          // onReady
          () => {
            workerInitialized.current = true;
            smartAppendRef.current('Python พร้อมแล้ว', 'info');
          },
          // onDone
          (exitCode) => {
            setIsWaiting(false);
            setPhase('done');
            smartAppendRef.current(
              exitCode === 0
                ? '✓ เสร็จสิ้น'
                : `✗ exit: ${exitCode}`,
              exitCode === 0 ? 'info' : 'error'
            );
          }
        );
        workerInitialized.current = true;
      }

      setPhase('running');
      runPythonCode(code);
    }

    // ── C / C++ ───────────────────────────────────────
    else if (
      language === 'c' || language === 'cpp'
    ) {
      const code = currentContent ?? '';
      if (!code.trim()) {
        smartAppend(`ไม่มีโค้ดในไฟล์นี้`, 'error');
        return;
      }

      setPhase('running');
      smartAppend(`▶ กำลังคอมไพล์ ${currentFile}...`, 'info');

      const collectedInputs: string[] = [];
      let prevStdout = '';
      let isFirstRun = true;

      try {
        while (true) {
          const result = await compileAndRun(
            code,
            language as 'c' | 'cpp',
            collectedInputs.join('\n')
          );

          if (result.compileError && result.compileError.trim()) {
            smartAppend('❌ Compile Error:', 'error');
            stripAnsi(result.compileError)
              .split('\n').filter(Boolean)
              .forEach(l => smartAppend(l, 'error'));
            
            if (onCompileErrors) {
              onCompileErrors(result.errors.map(e => ({
                ...e,
                message: String(e.message || 'error'),
                severity: e.severity === 'warning' ? 'warning' : 'error'
              })));
            }
            break;
          }

          if (isFirstRun && onCompileErrors) {
            onCompileErrors(result.errors.map(e => ({
              ...e,
              message: String(e.message || 'error'),
              severity: e.severity === 'warning' ? 'warning' : 'error'
            })));
          }
          isFirstRun = false;

          const newStdout = stripAnsi(result.stdout);
          let diff = '';
          if (newStdout.startsWith(prevStdout)) {
            diff = newStdout.substring(prevStdout.length);
          } else {
            diff = newStdout;
          }

          if (diff) {
            smartAppend(diff, 'output');
          }
          prevStdout = newStdout;

          if (result.isWaiting) {
            setPhase('waiting');
            setIsWaiting(true);

            const val = await new Promise<string | null>(resolve => {
              (inputRef as any)._resolve = resolve;
            });

            if (val === null) {
              break;
            }

            collectedInputs.push(val);
            setIsWaiting(false);
            setPhase('running');
          } else {
            if (result.stderr.trim()) {
              stripAnsi(result.stderr)
                .split('\n').filter(Boolean)
                .forEach(l => smartAppend(l, 'error'));
            }
            smartAppend(
              `✓ เสร็จสิ้น (exit: ${result.exitCode})`,
              result.exitCode === 0 ? 'info' : 'error'
            );
            break;
          }
        }
      } catch (e) {
        smartAppend(
          `เกิดข้อผิดพลาด: ${
            e instanceof Error ? e.message : String(e)
          }`,
          'error'
        );
      }

      setPhase('done');
    }
  }, [
    phase, language, currentFile, currentContent,
    smartAppend, clearTerminal, onCompileErrors
  ]);

  // ── Submit Input ─────────────────────────────────────
  const handleInputSubmit = useCallback(() => {
    if (!isWaiting) return;
    const val = inputValue; // allow empty strings

    if (projectId && val.trim()) {
      saveTerminalHistory(projectId, val).then(() => {
        loadHistory();
      });
    }

    // echo
    smartAppend(val + '\n', 'input-echo');
    setInputValue('');
    setIsWaiting(false);

    // Python: ส่งผ่าน Worker
    if (language === 'python') {
      sendInputToWorker(val + '\n');
      setPhase('running');
    }
    // C/C++: resolve Promise
    else {
      const resolve = (inputRef as any)._resolve;
      if (resolve) {
        resolve(val);
        (inputRef as any)._resolve = null;
      }
    }
  }, [isWaiting, inputValue, language, smartAppend, projectId, loadHistory]);

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleInputSubmit();
    }
  };

  // ── Stop ─────────────────────────────────────────────
  const handleStop = useCallback(() => {
    if (language === 'python') {
      stopPythonWorker();
    } else {
      const resolve = (inputRef as any)._resolve;
      if (resolve) { resolve(null); (inputRef as any)._resolve = null; }
    }
    setIsWaiting(false);
    setPhase('idle');
    smartAppend('⏹ หยุดการทำงาน', 'info');
  }, [language, smartAppend]);

  const handleClear = useCallback(() => {
    if (phase === 'running' || phase === 'waiting') return;
    clearTerminal();
    setPhase('idle');
  }, [phase, clearTerminal]);

  // ── Cleanup เมื่อเปลี่ยนภาษา ─────────────────────────
  useEffect(() => {
    workerInitialized.current = false;
    terminatePyodideWorker();
  }, [language]);

  const isActive = phase === 'running' || phase === 'waiting'
    || phase === 'initializing';

  return (
    <div className="terminal-pane">

      {/* Toolbar */}
      <div className="terminal-toolbar">
        <Terminal size={13} aria-hidden="true" />
        <span className="terminal-title">Terminal</span>
        {phase === 'waiting' && (
          <span className="terminal-waiting-badge">
            ⌨️ รอรับค่า
          </span>
        )}
        {phase === 'initializing' && (
          <span className="terminal-init-badge">
            ⚙ กำลังโหลด...
          </span>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative' }}>
          <button
            className={`btn-term-ghost flex items-center gap-1 text-[11px] py-1 px-1.5 mr-1 ${showHistory ? 'bg-surface-700 text-primary-400' : ''}`}
            onClick={() => setShowHistory(!showHistory)}
            title="ประวัติการป้อนคำสั่ง"
          >
            <History size={12} />
            <span>ประวัติ</span>
          </button>
          
          {showHistory && (
            <div className="absolute right-0 top-7 w-48 max-h-40 overflow-y-auto bg-surface-900 border border-border rounded-lg shadow-xl z-50 py-1 text-xs">
              {history.length === 0 ? (
                <div className="px-3 py-2 text-zinc-500 italic">ไม่มีประวัติ</div>
              ) : (
                history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInputValue(h.input);
                      setShowHistory(false);
                      if (inputRef.current) inputRef.current.focus();
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-surface-700 hover:text-zinc-100 text-zinc-300 truncate transition-colors"
                    title={h.input}
                  >
                    {h.input}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <button
          className="btn-term-ghost"
          onClick={handleClear}
          disabled={isActive}
          title="ล้าง"
        >
          <Trash2 size={12} />
        </button>
        {isActive ? (
          <button className="btn-term-stop" onClick={handleStop}>
            <Square size={12} /> หยุด
          </button>
        ) : (
          <button className="btn-term-run" onClick={handleRun}>
            <Play size={12} /> รัน
          </button>
        )}
      </div>

      {/* Output area */}
      <div
        className="terminal-output"
        ref={outputRef}
        onClick={() => isWaiting && inputRef.current?.focus()}
      >
        {terminalOutput.length === 0 && phase === 'idle' && (
          <div className="terminal-placeholder">
            กด ▶ รัน เพื่อเริ่มต้น
          </div>
        )}

        {terminalOutput.map((e, index) => {
          const isLast = index === terminalOutput.length - 1;
          const endsWithNewline = e.content.endsWith('\n');

          if (isLast && isWaiting && !endsWithNewline) {
            return (
              <TerminalLine key={e.id} entry={e} isLastAndWaiting={true}>
                <input
                  ref={inputRef}
                  className="terminal-inline-input"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder=""
                  spellCheck={false}
                  autoComplete="off"
                  autoFocus
                />
              </TerminalLine>
            );
          }

          return <TerminalLine key={e.id} entry={e} />;
        })}

        {/* Input row — แสดงเมื่อรอ และบรรทัดก่อนหน้าลงท้ายด้วย newline หรือยังไม่มี output เลย */}
        {isWaiting && (terminalOutput.length === 0 || terminalOutput[terminalOutput.length - 1].content.endsWith('\n')) && (
          <div className="terminal-input-row">
            <input
              ref={inputRef}
              className="terminal-inline-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder=""
              spellCheck={false}
              autoComplete="off"
              autoFocus
            />
          </div>
        )}

        {phase === 'running' && !isWaiting && (
          <div className="terminal-spinner">
            <span>·</span><span>·</span><span>·</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ── TerminalLine ──────────────────────────────────────
const TerminalLine: React.FC<{
  entry: TerminalEntry;
  isLastAndWaiting?: boolean;
  children?: React.ReactNode;
}> = ({ entry, isLastAndWaiting, children }) => {
  const cls: Record<string, string> = {
    output:        'term-output',
    error:         'term-error',
    info:          'term-info',
    warning:       'term-warning',
    'system':      'term-info',
    'stdin-echo':  'term-stdin',
    'input-echo':  'term-input-echo',
  };

  if (isLastAndWaiting) {
    return (
      <div className={`term-line terminal-input-row ${cls[entry.type] ?? 'term-output'}`} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
        {entry.type === 'input-echo' && (
          <span className="term-input-prefix">❯ </span>
        )}
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{entry.content}</pre>
        {children}
      </div>
    );
  }

  return (
    <div className={`term-line ${cls[entry.type] ?? 'term-output'}`}>
      {entry.type === 'input-echo' && (
        <span className="term-input-prefix">❯ </span>
      )}
      <pre>{entry.content}</pre>
    </div>
  );
};
