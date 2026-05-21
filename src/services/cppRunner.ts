export interface CompileResult {
  stdout: string;
  stderr: string;
  status: number;
  exitCode: number;
  inputsUsed: string[];
  compileError?: string;
  errors: CompileError[];
}

export interface CompileError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning';
}

/** Parse GCC/Clang error output into structured CompileError[] */
function parseGccErrors(stderr: string): CompileError[] {
  if (!stderr) return [];
  const errors: CompileError[] = [];
  for (const line of stderr.split('\n')) {
    // Format: prog.cc:4:29: error: expected ';' before 'return'
    const m = line.match(/^[^:]+:(\d+):(\d+)?:\s*(error|warning|note):\s*(.+)$/);
    if (m) {
      const severity = m[3] === 'warning' ? 'warning' : 'error';
      errors.push({
        line: parseInt(m[1], 10),
        col: m[2] ? parseInt(m[2], 10) : 1,
        message: m[4]?.trim() ?? '',
        severity,
      });
    }
  }
  return errors;
}

export async function compileAndRun(
  code: string,
  language: 'c' | 'cpp',
  stdin = ''
): Promise<CompileResult> {
  const options = language === 'c' ? '-O2 -Wall -std=c11' : '-O2 -Wall -std=c++17';
  const inputsUsed = stdin.split('\n').map(l => l.trim()).filter(l => l !== '');

  // ─── Primary: Wandbox ───────────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        compiler: 'gcc-head',
        code,
        options,
        stdin,
        'compiler-option-raw': '',
        'runtime-option-raw': '',
        save: false,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Wandbox HTTP ${res.status}`);

    const data = await res.json() as {
      program_output?: string;
      compiler_error?: string;
      program_error?: string;
      status?: string | number;
    };

    const stdout = data.program_output ?? '';
    const compilerError = data.compiler_error ?? '';
    const programError = data.program_error ?? '';
    const stderr = [compilerError, programError].filter(Boolean).join('\n');
    const status = parseInt(String(data.status ?? '0'), 10);
    const errors = parseGccErrors(compilerError);

    return {
      stdout,
      stderr,
      status,
      exitCode: status,
      inputsUsed,
      compileError: compilerError || undefined,
      errors
    };
  } catch (primaryErr) {
    // timeout หรือ network error → fallback to Godbolt
  }

  // ─── Fallback: Godbolt ──────────────────────────────────────────────────
  try {
    const compilerId = language === 'c' ? 'cg122' : 'g122';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`https://godbolt.org/api/compiler/${compilerId}/compile`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        source: code,
        options: {
          userArguments: options,
          executeParameters: { stdin, args: [] },
          compilerOptions: { executorRequest: true },
          filters: { execute: true },
        },
        lang: language === 'c' ? 'c' : 'c++',
        allowStoreCodeDebug: false,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error('Godbolt failed');

    const data = await res.json() as {
      execResult?: { stdout?: { text: string }[]; code?: number };
      stderr?: { text: string }[];
      code?: number;
    };

    const stdout = (data.execResult?.stdout ?? []).map((l) => l.text).join('\n');
    const stderr = (data.stderr ?? []).map((l) => l.text).join('\n');
    const status = data.execResult?.code ?? 1;

    return {
      stdout,
      stderr,
      status,
      exitCode: status,
      inputsUsed,
      compileError: stderr || undefined,
      errors: parseGccErrors(stderr)
    };
  } catch {
    throw new Error('COMPILER_UNAVAILABLE');
  }
}

