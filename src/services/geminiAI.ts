// Built-in key — loaded from Vercel env var VITE_GEMINI_API_KEY (fallback สำหรับผู้ใช้ที่ยังไม่มี key ของตัวเอง)
// ไม่ hardcode ใน source เพื่อความปลอดภัย ใส่ใน Vercel → Settings → Environment Variables
const _ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';
export const BUILTIN_KEY = _ENV_KEY;

const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
import { aiRateLimiter, autocompleteRateLimiter } from './aiRateLimiter';

const SYSTEM_PROMPT = `คุณคือ AI ผู้ช่วยเขียนโค้ดที่เชี่ยวชาญของ Nextcode IDE
ตอบเป็นภาษาไทยเสมอ ยกเว้น code และ keyword ทางเทคนิค

รูปแบบการตอบที่ต้องทำตามอย่างเคร่งครัด:

คำอธิบาย:
[อธิบาย 2-3 ประโยคเป็นภาษาไทย]

<html_fix>
[โค้ด HTML แบบสมบูรณ์ — ห้ามตัดทอน]
</html_fix>

<css_fix>
[โค้ด CSS แบบสมบูรณ์]
</css_fix>

<js_fix>
[โค้ด JavaScript แบบสมบูรณ์]
</js_fix>

<py_fix>
[โค้ด Python แบบสมบูรณ์]
</py_fix>

<c_fix>
[โค้ด C แบบสมบูรณ์]
</c_fix>

<cpp_fix>
[โค้ด C++ แบบสมบูรณ์]
</cpp_fix>

กฎ:
- ใส่เฉพาะ tag ของไฟล์ที่ต้องแก้จริง ๆ
- ส่งโค้ดแบบสมบูรณ์เสมอ ห้ามใช้ '...' หรือตัดทอน
- อธิบายเป็นภาษาไทยเสมอ`;

export interface GeminiRequest {
  apiKey: string;
  userInput: string;
  mode: 'fix' | 'generate' | 'explain';
  files: Record<string, string>;
  errors?: string;
  includeWholeFile: boolean;
}

export interface GeminiResponse {
  explanation: string;
  fixes: Record<string, string>;
  rawText: string;
}

function extract(tag: string, text: string): string | null {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1].trim() : null;
}

/** sleep helper */
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * เรียก Gemini API พร้อม auto-retry เมื่อเจอ 429
 * - retry สูงสุด 3 ครั้ง
 * - หน่วงเวลา 5s → 10s → 20s (exponential backoff)
 */
export async function callGemini(
  req: GeminiRequest,
  onRetry?: (attempt: number, waitSec: number) => void
): Promise<GeminiResponse>;

export async function callGemini(
  prompt: string,
  apiKey: string,
  onStatus: (msg: string, ms: number) => void
): Promise<string>;

export async function callGemini(
  first: GeminiRequest | string,
  second?: any,
  third?: (msg: string, ms: number) => void
): Promise<GeminiResponse | string> {
  if (typeof first === 'string') {
    const prompt = first;
    const apiKey = second as string;
    const onStatus = third as (msg: string, ms: number) => void;

    autocompleteRateLimiter.setStatusCallback(onStatus);

    return autocompleteRateLimiter.enqueue(async () => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature:     0.2,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (res.status === 429) {
        throw new Error('429: Too Many Requests');
      }
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 400) throw new Error(
          'API Key ไม่ถูกต้อง — ตรวจสอบใน Settings ⚙'
        );
        throw new Error(`Gemini error ${res.status}: ${body}`);
      }

      const data = await res.json() as any;
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    });
  } else {
    const req = first as GeminiRequest;
    const onRetry = second as ((attempt: number, waitSec: number) => void) | undefined;

    const onStatus = (msg: string, ms: number) => {
      if (msg && onRetry) {
        const match = msg.match(/\((\d+)\/\d+\)/);
        const attempt = match ? parseInt(match[1]) : 1;
        onRetry(attempt, Math.ceil(ms / 1000));
      }
    };

    aiRateLimiter.setStatusCallback(onStatus);

    const responseText = await aiRateLimiter.enqueue(async () => {
      const res = await fetch(`${GEMINI_BASE}?key=${req.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: buildPrompt(req) }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192,
            topP: 0.8,
          },
        }),
      });

      if (res.status === 429) {
        throw new Error('429: Too Many Requests');
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as {
          error?: { message?: string };
        };
        const errMsg = errBody?.error?.message ?? '';
        if (res.status === 403 || (res.status === 400 && errMsg.toLowerCase().includes('api key'))) {
          throw new Error(`API_KEY_INVALID: ${errMsg || 'Invalid API Key'}`);
        }
        throw new Error(`Gemini ${res.status}: ${errMsg || 'Unknown API Error'}`);
      }

      const data = await res.json() as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        error?: { message?: string };
      };

      if (data.error) throw new Error(`Gemini: ${data.error.message}`);

      const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      if (!text) throw new Error('EMPTY_RESPONSE');

      return text;
    });

    return parseResponse(responseText);
  }
}

function buildPrompt(req: GeminiRequest): string {
  const modeLabel =
    req.mode === 'fix' ? 'แก้บัค' : req.mode === 'generate' ? 'สร้างโค้ด' : 'อธิบายโค้ด';

  const filesText = req.includeWholeFile
    ? Object.entries(req.files)
        .map(([name, content]) => `--- ${name} ---\n${content}`)
        .join('\n\n')
    : '';

  return [
    SYSTEM_PROMPT,
    '',
    `Mode: ${modeLabel}`,
    `คำขอ: ${req.userInput}`,
    req.errors ? `Console errors:\n${req.errors}` : '',
    filesText ? `--- ไฟล์ปัจจุบัน ---\n${filesText}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function parseResponse(text: string): GeminiResponse {
  const expMatch = text.match(/คำอธิบาย:\n?([\s\S]*?)(?=<[a-z]|$)/);
  const explanation = expMatch ? expMatch[1].trim() : text.slice(0, 400);

  const fixes: Record<string, string> = {};
  const htmlFix = extract('html_fix', text);
  const cssFix  = extract('css_fix',  text);
  const jsFix   = extract('js_fix',   text);
  const pyFix   = extract('py_fix',   text);
  const cFix    = extract('c_fix',    text);
  const cppFix  = extract('cpp_fix',  text);
  if (htmlFix) fixes['index.html'] = htmlFix;
  if (cssFix)  fixes['style.css']  = cssFix;
  if (jsFix)   fixes['script.js']  = jsFix;
  if (pyFix)   fixes['main.py']    = pyFix;
  if (cFix)    fixes['main.c']     = cFix;
  if (cppFix)  fixes['main.cpp']   = cppFix;

  return { explanation, fixes, rawText: text };
}

export interface TestKeyResult {
  status: 'valid' | 'rate_limited' | 'invalid';
  errorDetails?: string;
}

/** ทดสอบ key — 429 ถือว่า key ถูกต้องแต่ถึง quota */
export async function testApiKey(apiKey: string): Promise<TestKeyResult> {
  try {
    const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'OK' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
    });
    if (res.ok) return { status: 'valid' };
    if (res.status === 429) return { status: 'rate_limited', errorDetails: 'Rate limit exceeded (429). Key is valid but quota is exhausted.' };
    
    const errBody = await res.json().catch(() => ({})) as {
      error?: { message?: string };
    };
    const errMsg = errBody?.error?.message ?? `HTTP Status ${res.status}`;
    return { status: 'invalid', errorDetails: errMsg };
  } catch (e: any) {
    return { status: 'invalid', errorDetails: e.message || String(e) };
  }
}

// ─── Multi-turn Chat API (ใหม่ — ประหยัด token) ───────────────────────────────

import type { CodeChange } from '../types/chatTypes';
import type { GeminiTurn } from './contextEngine';

export interface ChatAPIResponse {
  text: string;
  codeChanges: CodeChange[];
}

/**
 * เรียก Gemini สำหรับ Chat แบบ multi-turn
 * ส่ง system instruction แยกจาก chat history
 */
export async function callGeminiChat(params: {
  apiKey: string;
  systemInstruction: string;
  /** history ย้อนหลัง (ไม่รวม message ล่าสุด) */
  history: GeminiTurn[];
  /** user message ล่าสุด พร้อม context ไฟล์แนบ */
  userMessage: string;
  onRetry?: (attempt: number, waitSec: number) => void;
}): Promise<ChatAPIResponse> {
  const { apiKey, systemInstruction, history, userMessage, onRetry } = params;

  const onStatus = (msg: string, ms: number) => {
    if (msg && onRetry) {
      const match = msg.match(/\((\d+)\/\d+\)/);
      const attempt = match ? parseInt(match[1]) : 1;
      onRetry(attempt, Math.ceil(ms / 1000));
    }
  };
  aiRateLimiter.setStatusCallback(onStatus);

  const responseText = await aiRateLimiter.enqueue(async () => {
    const body = {
      system_instruction: {
        parts: [{ text: systemInstruction }],
      },
      contents: [
        ...history,
        { role: 'user', parts: [{ text: userMessage }] },
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
        topP: 0.85,
      },
    };

    const res = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.status === 429) throw new Error('429: Too Many Requests');

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({})) as {
        error?: { message?: string };
      };
      const errMsg = errBody?.error?.message ?? '';
      if (res.status === 403 || (res.status === 400 && errMsg.toLowerCase().includes('api key'))) {
        throw new Error(`API_KEY_INVALID: ${errMsg || 'Invalid API Key'}`);
      }
      throw new Error(`Gemini ${res.status}: ${errMsg || 'Unknown API Error'}`);
    }

    const data = await res.json() as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    };

    if (data.error) throw new Error(`Gemini: ${data.error.message}`);

    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    if (!text) throw new Error('EMPTY_RESPONSE');
    return text;
  });

  return parseChatResponse(responseText);
}

/**
 * Parse <<<FILE:filename>>> ... <<<END>>> blocks จาก response ของ AI
 */
export function parseChatResponse(rawText: string): ChatAPIResponse {
  const codeChanges: CodeChange[] = [];
  const fileBlockRegex = /<<<FILE:([^>]+)>>>([\s\S]*?)<<<END>>>/g;
  let match: RegExpExecArray | null;

  while ((match = fileBlockRegex.exec(rawText)) !== null) {
    const filename = match[1].trim();
    const content = match[2].trim();
    codeChanges.push({ filename, newContent: content, applied: false });
  }

  // ลบ code blocks ออกจาก text เพื่อแสดงแค่ explanation
  let cleanText = rawText;
  if (codeChanges.length > 0) {
    cleanText = rawText.replace(fileBlockRegex, '').trim();
    cleanText = cleanText.replace(/\n{3,}/g, '\n\n');
  }

  return { text: cleanText || rawText, codeChanges };
}
