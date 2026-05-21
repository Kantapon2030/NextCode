export interface CompileResult {
  stdout: string;
  stderr: string;
  status: number;
  exitCode: number;
  inputsUsed: string[];
  compileError?: string;
  errors: CompileError[];
  isWaiting?: boolean;
}

export interface CompileError {
  line: number;
  col: number;
  message: string;
  severity: 'error' | 'warning';
}

/** Strip ANSI escape codes from string */
function stripAnsi(str: string): string {
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

/** Parse GCC/Clang error output into structured CompileError[] */
function parseGccErrors(stderr: string): CompileError[] {
  if (!stderr) return [];
  const errors: CompileError[] = [];
  for (const line of stderr.split('\n')) {
    // Format: prog.cc:4:29: error: expected ';' before 'return'
    // Or: <source>:4:28: error: expected ';' before 'return'
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

  // Instrument the code to exit cleanly/specifically on EOF
  const header = `
#ifdef __cplusplus
#include <iostream>
#include <exception>
struct StdinInitializer {
    StdinInitializer() {
        std::cin.exceptions(std::ios::failbit | std::ios::badbit);
        std::cout << std::unitbuf;
    }
} _stdin_init;
#else
#include <stdio.h>
#include <stdlib.h>
#define scanf(fmt, ...) ({ int _r = scanf(fmt, ##__VA_ARGS__); if (_r == EOF) exit(99); _r; })
#define getchar() ({ int _c = getchar(); if (_c == EOF) exit(99); _c; })
#define fgets(str, n, stream) ({ char* _r = fgets(str, n, stream); if (_r == NULL) exit(99); _r; })
#define gets(str) ({ char* _r = gets(str); if (_r == NULL) exit(99); _r; })
#endif
#line 1
`;
  const instrumentedCode = header + code;

  // ─── Primary: Godbolt API ────────────────────────────────────────────────
  try {
    const compilerId = language === 'c' ? 'cg122' : 'g122';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(`https://godbolt.org/api/compiler/${compilerId}/compile`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        source: instrumentedCode,
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

    if (!res.ok) throw new Error(`Godbolt HTTP ${res.status}`);

    const data = await res.json() as {
      code: number;
      didExecute: boolean;
      stdout?: { text: string }[];
      stderr?: { text: string }[];
      buildResult?: {
        code: number;
        stderr?: { text: string }[];
      };
    };

    const didExecute = !!data.didExecute;
    const stdout = (data.stdout ?? []).map((l) => l.text).join('\n');
    let stderr = '';
    let compileError: string | undefined;
    let errors: CompileError[] = [];

    if (!didExecute) {
      // Compilation failed, get errors from buildResult
      const buildStderr = (data.buildResult?.stderr ?? []).map((l) => l.text).join('\n');
      stderr = buildStderr;
      compileError = buildStderr || 'Compilation failed';
      const cleanStderr = stripAnsi(buildStderr);
      errors = parseGccErrors(cleanStderr);
    } else {
      // Compilation succeeded, get runtime stderr if any
      stderr = (data.stderr ?? []).map((l) => l.text).join('\n');
      const cleanStderr = stripAnsi(stderr);
      errors = parseGccErrors(cleanStderr);
    }

    let status = didExecute ? data.code : -1;
    let isWaiting = false;

    // Detect EOF failure in C++ (139/SIGSEGV caused by std::ios_base::failure crash)
    // or C (exited with exit code 99)
    if (
      status === 99 ||
      status === 139 ||
      stderr.includes('std::__ios_failure') ||
      stderr.includes('basic_ios::clear') ||
      stderr.includes('iostream error')
    ) {
      isWaiting = true;
      status = 0; // treat as clean EOF wait
      // Strip crash traces from stderr
      stderr = stderr.split('\n').filter(line => 
        !line.includes('std::__ios_failure') && 
        !line.includes('basic_ios::clear') && 
        !line.includes('iostream error') &&
        !line.includes('Program terminated with signal')
      ).join('\n').trim();
    }

    return {
      stdout,
      stderr,
      status,
      exitCode: status,
      inputsUsed,
      compileError,
      errors,
      isWaiting
    };
  } catch (primaryErr) {
    console.warn('[cppRunner] Godbolt failed, trying Piston as fallback:', primaryErr);
  }

  // ─── Fallback 1: Piston API ────────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const pistonLang = language === 'c' ? 'c' : 'cpp';
    const filename = language === 'c' ? 'main.c' : 'main.cpp';

    const res = await fetch('https://emkc.org/api/v2/piston/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        language: pistonLang,
        version: '*',
        files: [
          {
            name: filename,
            content: code,
          }
        ],
        stdin,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Piston HTTP ${res.status}`);

    const data = await res.json() as {
      run?: {
        stdout?: string;
        stderr?: string;
        code?: number;
        output?: string;
      };
    };

    if (data.run) {
      const stdout = data.run.stdout ?? '';
      const stderr = data.run.stderr ?? '';
      const status = data.run.code ?? 0;
      const errors = parseGccErrors(stderr);

      return {
        stdout,
        stderr,
        status,
        exitCode: status,
        inputsUsed,
        compileError: stderr || undefined,
        errors
      };
    }
    throw new Error('Piston invalid response format');
  } catch (pistonErr) {
    console.warn('[cppRunner] Piston failed, trying Wandbox as fallback:', pistonErr);
  }

  // ─── Fallback 2: Wandbox ─────────────────────────────────────────────────
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const res = await fetch('https://wandbox.org/api/compile.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        compiler: language === 'c' ? 'gcc-head' : 'gcc-head',
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
  } catch (wandboxErr) {
    console.warn('[cppRunner] Wandbox failed:', wandboxErr);
    throw new Error('COMPILER_UNAVAILABLE');
  }
}
