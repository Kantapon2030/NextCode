// Built-in key — loaded from Vercel env var VITE_GEMINI_API_KEY (fallback สำหรับผู้ใช้ที่ยังไม่มี key ของตัวเอง)
// ไม่ hardcode ใน source เพื่อความปลอดภัย ใส่ใน Vercel → Settings → Environment Variables
const _ENV_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';
export const BUILTIN_KEY = _ENV_KEY;

const GEMINI_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
): Promise<GeminiResponse> {
  const MAX_RETRIES = 3;
  let delay = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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

    // 429 → retry with backoff
    if (res.status === 429) {
      // ลองอ่าน Retry-After header ถ้ามี
      const retryAfter = res.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : delay;

      if (attempt < MAX_RETRIES) {
        onRetry?.(attempt, Math.ceil(waitMs / 1000));
        await sleep(waitMs);
        delay = Math.min(delay * 2, 30_000); // max 30s
        continue;
      }
      throw new Error('Gemini API: Rate limit exceeded (429). Too many requests.');
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

    return parseResponse(text);
  }

  throw new Error('Gemini API: Rate limit exceeded (429). Too many requests.');
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
