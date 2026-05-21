/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<any>;
  }
}

let pyodide: any = null;
let loading = false;
let loadError: string | null = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/';

/**
 * Run an async function with window.define temporarily disabled.
 * This prevents Monaco Editor's global AMD loader from interfering
 * with dynamic module loaders inside Pyodide (e.g. error-stack-parser).
 */
async function runWithNoDefine<T>(fn: () => Promise<T>): Promise<T> {
  const originalDefine = (window as any).define;
  if (originalDefine) {
    (window as any).define = undefined;
  }
  try {
    return await fn();
  } finally {
    if (originalDefine) {
      (window as any).define = originalDefine;
    }
  }
}

export async function initPyodide(onStatus: (msg: string) => void): Promise<any> {
  return runWithNoDefine(async () => {
    if (pyodide) return pyodide;
    if (loading) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!loading) { clearInterval(check); resolve(); }
        }, 200);
      });
      if (pyodide) return pyodide;
      throw new Error(loadError ?? 'Pyodide failed to load');
    }

    loading = true;
    try {
      onStatus('กำลังโหลด Python runtime (อาจใช้เวลาสักครู่)...');
      if (!window.loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement('script');
          script.src = `${PYODIDE_CDN}pyodide.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Pyodide script'));
          document.head.appendChild(script);
        });
      }
      onStatus('กำลังเตรียม Python environment...');
      pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN });
      onStatus('Python runtime พร้อมแล้ว!');
      return pyodide;
    } catch (e) {
      loadError = String(e);
      throw e;
    } finally {
      loading = false;
    }
  });
}


/**
 * Run Python code with pre-supplied stdin lines (synchronous queue).
 * Each call to input() pops the next line from stdinLines.
 * onInputNeeded is called when more input is needed than provided.
 */
export async function runPython(
  code: string,
  onOutput: (text: string, type: 'output' | 'error') => void,
  onStatus: (msg: string) => void,
  stdinLines: string[] = [],
): Promise<void> {
  return runWithNoDefine(async () => {
    const py = await initPyodide(onStatus);

    // Clone the stdin array so we can pop from it
    const stdinQueue = [...stdinLines];

    py.setStdout({ batched: (msg: string) => onOutput(msg, 'output') });
    py.setStderr({ batched: (msg: string) => onOutput(msg, 'error') });

    // Set fallback stdin callback
    py.setStdin({
      stdin: (): string => {
        if (stdinQueue.length > 0) {
          const line = stdinQueue.shift()!;
          onOutput(line, 'output');
          return line + '\n';
        }
        return '';
      },
    });

    try {
      (window as any)._onPyOutput = (text: string, type: 'output' | 'error') => {
        onOutput(text, type);
      };

      // Inject custom input function and configure buffer
      await py.runPythonAsync(`
import builtins
import sys
import js

if 'WaitingForInputException' not in globals():
    class WaitingForInputException(BaseException):
        pass

if 'StdinBuffer' not in globals():
    class StdinBuffer:
        lines = []
        index = 0

StdinBuffer.lines = ${JSON.stringify(stdinLines)}
StdinBuffer.index = 0

if 'CustomStdout' not in globals():
    class CustomStdout:
        def write(self, text):
            js._onPyOutput(text, 'output')
            return len(text)
        def flush(self):
            pass

if 'CustomStderr' not in globals():
    class CustomStderr:
        def write(self, text):
            js._onPyOutput(text, 'error')
            return len(text)
        def flush(self):
            pass

sys.stdout = CustomStdout()
sys.stderr = CustomStderr()

def custom_input(prompt=""):
    if prompt:
        print(prompt, end="", flush=True)
    if StdinBuffer.index < len(StdinBuffer.lines):
        val = StdinBuffer.lines[StdinBuffer.index]
        StdinBuffer.index += 1
        return val
    else:
        raise WaitingForInputException("WAITING_FOR_INPUT")

def custom_readline(*args, **kwargs):
    if StdinBuffer.index < len(StdinBuffer.lines):
        val = StdinBuffer.lines[StdinBuffer.index]
        StdinBuffer.index += 1
        return val + '\\n'
    else:
        raise WaitingForInputException("WAITING_FOR_INPUT")

builtins.input = custom_input
try:
    if isinstance(__builtins__, dict):
        __builtins__['input'] = custom_input
    else:
        __builtins__.input = custom_input
except NameError:
    pass

sys.stdin.readline = custom_readline
      `);

      onStatus('กำลังโหลด packages...');
      await py.loadPackagesFromImports(code);
      onStatus('');
      await py.runPythonAsync(code);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes('WaitingForInputException: WAITING_FOR_INPUT') ||
        msg.includes('EOFError: EOF when reading a line')
      ) {
        throw new Error('WAITING_FOR_INPUT');
      }
      onOutput(msg, 'error');
    } finally {
      delete (window as any)._onPyOutput;
      // Reset stdin/input to default
      try {
        py.setStdin(null);
      } catch {/* ignore */}
      try {
        await py.runPythonAsync(`
import builtins
import sys
if hasattr(builtins, '_original_input'):
    builtins.input = builtins._original_input
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
        `);
      } catch {/* ignore */}
    }
  });
}
