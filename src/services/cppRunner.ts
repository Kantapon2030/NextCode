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

/** Strip ANSI escape codes from string — exported for use in TerminalPane */
export function stripAnsi(str: string): string {
  return (
    str
      // ESC[ sequences (CSI) — standard \x1b
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      // ESC] sequences (OSC)
      .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\\\)/g, '')
      // ESC( character set
      .replace(/\x1b[()][A-Z0-9]/g, '')
      // ESC alone
      .replace(/\x1b[^[\]()]/g, '')
      // \\033[ octal format (Wandbox sends this)
      .replace(/\\033\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\\033[^[]/g, '')
      // \\e[ alternate form
      .replace(/\\e\[[0-9;]*[a-zA-Z]/g, '')
      // null bytes
      .replace(/\x00/g, '')
  );
}

/**
 * Clean raw GCC stderr for display in the terminal:
 * 1. Strip ANSI escape codes
 * 2. Remove "source snippet" lines GCC adds for context (they show header
 *    content instead of user code when #line directives are involved)
 * 3. Adjust line numbers by subtracting the instrumentation header line count
 */
function cleanGccStderr(raw: string, headerLines: number): string {
  const noAnsi = stripAnsi(raw);
  return noAnsi
    .split('\n')
    .filter(line => {
      // Remove "    N | code" lines (source context)
      if (/^\s+\d+\s*\|/.test(line)) return false;
      // Remove "    | ^~~" lines (error pointer)
      if (/^\s+\|\s*[~^]/.test(line)) return false;
      return true;
    })
    .map(line =>
      // Rewrite "file:LINE:COL: …" adjusting for header offset
      line.replace(/^([^:]+):(\d+):(\d+:)/g, (_m, file, lineStr, rest) => {
        const adjusted = Math.max(1, parseInt(lineStr, 10) - headerLines);
        return `${file}:${adjusted}:${rest}`;
      })
    )
    .join('\n')
    .trim();
}

/** Parse GCC/Clang error output into structured CompileError[] (already line-adjusted) */
function parseGccErrors(cleanStderr: string): CompileError[] {
  if (!cleanStderr) return [];
  const errors: CompileError[] = [];
  for (const line of cleanStderr.split('\n')) {
    // Format: <source>:4:29: error: expected ';' before 'return'
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

function processRunResult(
  stdout: string,
  stderr: string,
  status: number,
  inputsUsed: string[],
  errors: CompileError[],
  compileError?: string
): CompileResult {
  let cleanStderr = stderr;
  let exitCode = status;
  let isWaiting = false;

  if (
    status === 99 ||
    status === 139 ||
    stderr.includes('std::__ios_failure') ||
    stderr.includes('basic_ios::clear') ||
    stderr.includes('iostream error')
  ) {
    isWaiting = true;
    exitCode = 0;
    cleanStderr = stderr
      .split('\n')
      .filter(
        (line) =>
          !line.includes('std::__ios_failure') &&
          !line.includes('basic_ios::clear') &&
          !line.includes('iostream error') &&
          !line.includes('Program terminated with signal')
      )
      .join('\n')
      .trim();
  }

  return {
    stdout,
    stderr: cleanStderr,
    status: exitCode,
    exitCode,
    inputsUsed,
    compileError,
    errors,
    isWaiting,
  };
}

/**
 * Build a language-specific instrumentation header.
 * Returns the header code and how many lines it occupies,
 * so that GCC error line numbers can be adjusted back to user-code lines.
 */
function buildHeader(language: 'c' | 'cpp'): { code: string; lines: number } {
  if (language === 'c') {
    // Pure C header – no C++ at all, avoiding any #ifdef __cplusplus ambiguity
    const lines = [
      '#include <stdio.h>',
      '#include <stdlib.h>',
      '#define scanf(fmt, ...) ({ int _r = scanf(fmt, ##__VA_ARGS__); if (_r == EOF) exit(99); _r; })',
      '#define getchar() ({ int _c = getchar(); if (_c == EOF) exit(99); _c; })',
      '#define fgets(str, n, stream) ({ char* _r = fgets(str, n, stream); if (_r == NULL) exit(99); _r; })',
      '#define gets(str) ({ char* _r = gets(str); if (_r == NULL) exit(99); _r; })',
    ];
    return { code: lines.join('\n') + '\n', lines: lines.length };
  } else {
    // Pure C++ header
    const lines = [
      '#include <iostream>',
      '#include <exception>',
      'namespace { struct _StdinInit { _StdinInit() {',
      '  std::cin.exceptions(std::ios::failbit | std::ios::badbit);',
      '  std::cout << std::unitbuf;',
      '} } _stdin_init_obj; }',
    ];
    return { code: lines.join('\n') + '\n', lines: lines.length };
  }
}

export async function compileAndRun(
  code: string,
  language: 'c' | 'cpp',
  stdin = ''
): Promise<CompileResult> {
  const options = language === 'c' ? '-O2 -Wall -std=c11' : '-O2 -Wall -std=c++17';
  const inputsUsed = stdin.split('\n').map(l => l.trim()).filter(l => l !== '');

  // Language-specific instrumentation header (no #ifdef __cplusplus)
  const { code: headerCode, lines: headerLines } = buildHeader(language);
  const instrumentedCode = headerCode + code;

  // ─── Primary: Godbolt API ────────────────────────────────────────────────
  try {
    // Use the most recent stable GCC version available on Godbolt
    const compilerId = language === 'c' ? 'cg132' : 'g132';
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
    const stdout = stripAnsi((data.stdout ?? []).map((l) => l.text).join('\n'));
    let stderr = '';
    let compileError: string | undefined;
    let errors: CompileError[] = [];

    if (!didExecute) {
      // Compilation failed – clean and adjust line numbers
      const rawBuildStderr = (data.buildResult?.stderr ?? []).map((l) => l.text).join('\n');
      const cleaned = cleanGccStderr(rawBuildStderr, headerLines);
      stderr = cleaned;
      compileError = cleaned || 'Compilation failed';
      errors = parseGccErrors(cleaned);
    } else {
      // Compilation succeeded – clean runtime stderr if any
      const rawRuntimeStderr = (data.stderr ?? []).map((l) => l.text).join('\n');
      stderr = cleanGccStderr(rawRuntimeStderr, headerLines);
      errors = parseGccErrors(stderr);
    }

    const status = didExecute ? data.code : -1;
    return processRunResult(stdout, stderr, status, inputsUsed, errors, compileError);
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
        files: [{ name: filename, content: instrumentedCode }],
        stdin,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Piston HTTP ${res.status}`);

    const data = await res.json() as {
      run?: { stdout?: string; stderr?: string; code?: number };
    };

    if (data.run) {
      const stdout = stripAnsi(data.run.stdout ?? '');
      const rawStderr = data.run.stderr ?? '';
      const cleaned = cleanGccStderr(rawStderr, headerLines);
      const status = data.run.code ?? 0;
      const errors = parseGccErrors(cleaned);
      return processRunResult(stdout, cleaned, status, inputsUsed, errors);
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
        code: instrumentedCode,
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

    const stdout = stripAnsi(data.program_output ?? '');
    const rawCompilerError = data.compiler_error ?? '';
    const rawProgramError = data.program_error ?? '';
    const cleanedCompilerError = cleanGccStderr(rawCompilerError, headerLines);
    const cleanedProgramError = stripAnsi(rawProgramError);
    const stderr = [cleanedCompilerError, cleanedProgramError].filter(Boolean).join('\n');
    const status = parseInt(String(data.status ?? '0'), 10);
    const errors = parseGccErrors(cleanedCompilerError);

    return processRunResult(stdout, stderr, status, inputsUsed, errors, cleanedCompilerError || undefined);
  } catch (wandboxErr) {
    console.warn('[cppRunner] Wandbox failed:', wandboxErr);
    throw new Error('COMPILER_UNAVAILABLE');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PART 3: C/C++ Interactive Simulation
// ──────────────────────────────────────────────────────────────────────────────

import { OutputHandler, InputRequestHandler } from './terminalManager';

export async function runCppInteractive(opts: {
  code:     string;
  language: 'c' | 'cpp';
  onOutput: OutputHandler;
  onInput:  InputRequestHandler;
}): Promise<CompileResult> {
  const { code, language, onOutput, onInput } = opts;

  // 1. นับ input calls
  const inputCount = countInputCalls(code, language);
  onOutput(`▶ ${language === 'c' ? 'C' : 'C++'} · คอมไพล์กำลังเริ่ม...`, 'info');

  // 2. เก็บ inputs ก่อนรัน (แสดง UX เหมือน interactive)
  const collectedInputs: string[] = [];

  if (inputCount > 0) {
    onOutput(
      `⌨️ โปรแกรมต้องการ ${inputCount} input — กรอกด้านล่าง`,
      'info'
    );

    for (let i = 0; i < inputCount; i++) {
      const val = await onInput('');
      collectedInputs.push(val);
    }
  }

  // 3. รัน Wandbox (หรือ Godbolt/Piston) พร้อม stdin
  const stdin = collectedInputs.join('\n');
  const result = await compileAndRun(code, language, stdin);

  // 4. แสดงผลแบบ interleaved
  if (result.compileError && result.compileError.trim()) {
    onOutput('❌ Compile Error:', 'error');
    stripAnsi(result.compileError)
      .split('\n')
      .filter(Boolean)
      .forEach((line: string) => onOutput(line, 'error'));
    return result;
  }

  // interleave stdout กับ inputs
  displayInterleavedOutput(
    stripAnsi(result.stdout),
    collectedInputs,
    onOutput
  );

  if (result.stderr.trim()) {
    stripAnsi(result.stderr)
      .split('\n')
      .filter(Boolean)
      .forEach((line: string) => onOutput(line, 'error'));
  }

  return result;
}

// แสดง output สลับกับ input ที่ผู้ใช้กรอก
function displayInterleavedOutput(
  stdout:  string,
  inputs:  string[],
  onOutput: OutputHandler
): void {
  const lines = stdout.split('\n');
  let inputIdx = 0;

  for (const line of lines) {
    if (!line && inputIdx >= inputs.length) continue;
    onOutput(line, 'output');

    // ถ้าบรรทัดดูเหมือน prompt → inject input echo
    const isPromptLine =
      /[:?]\s*$/.test(line.trim()) ||
      /กรอก|กรุณา|ใส่|enter|input/i.test(line);

    if (isPromptLine && inputIdx < inputs.length) {
      onOutput(inputs[inputIdx++], 'input-echo');
    }
  }
}

export function countInputCalls(
  code: string, lang: 'c' | 'cpp'
): number {
  if (lang === 'c') {
    return (code.match(
      /\bscanf\s*\(|getchar\s*\(|fgets\s*\(|gets\s*\(/g
    ) ?? []).length;
  }
  // นับ cin >> หลายตัวในบรรทัดเดียวด้วย
  const cinMatches = code.match(/cin\s*>>/g) ?? [];
  return cinMatches.length;
}
