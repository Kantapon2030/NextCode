import { callGemini } from './geminiAI';
import { getSetting } from '../storage/db';
import { decryptApiKey } from '../storage/cryptoHelpers';
import { BUILTIN_KEY } from './geminiAI';

let debounceTimer: ReturnType<typeof setTimeout>;
let lastSuggestion  = '';
let decorationIds:  string[] = [];
let suspendedUntil   = 0;

async function getGeminiKey(userId: string): Promise<string> {
  try {
    const enc = await getSetting<{ iv: string; ciphertext: string } | null>(
      `gemini_key_${userId}`, null
    );
    if (enc) {
      const plain = await decryptApiKey(enc.iv, enc.ciphertext, userId);
      const trimmed = plain?.trim();
      if (trimmed) return trimmed;
    }
  } catch (err) {
    console.error('Failed to get Gemini Key:', err);
  }
  return BUILTIN_KEY;
}

export function registerInlineComplete(
  editor:  any,
  monaco:  any,
  userId:  string,
  onStatus:(msg: string, ms: number) => void
): void {

  editor.onDidChangeModelContent(() => {
    clearTimeout(debounceTimer);
    clearDecorations(editor);

    debounceTimer = setTimeout(async () => {
      if (Date.now() < suspendedUntil) return;

      const model    = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position) return;

      const lang = model.getLanguageId();
      const line = model.getLineContent(position.lineNumber);
      const textBefore = model.getValue().split('\n')
        .slice(0, position.lineNumber)
        .join('\n');

      // ไม่ทำ autocomplete ถ้าบรรทัดว่าง หรือเพิ่งลบ
      if (line.trim().length < 2) return;

      try {
        const apiKey = await getGeminiKey(userId);
        if (!apiKey) return;

        const prompt = buildCompletionPrompt(
          textBefore, lang, line, position.column
        );

        const suggestion = await callGemini(
          prompt, apiKey, onStatus
        );

        const clean = cleanSuggestion(
          suggestion, line, position.column
        );
        if (!clean) return;

        lastSuggestion = clean;
        showGhostText(editor, monaco, position, clean);

      } catch (err: any) {
        /* silent fail สำหรับ autocomplete */
        const errMsg = err?.message || String(err);
        if (errMsg.includes('429') || errMsg.toLowerCase().includes('rate limit')) {
          // Suspend autocomplete background calls for 60 seconds
          suspendedUntil = Date.now() + 60000;
          onStatus('ถึง rate limit — ระงับแนะนำโค้ดอินไลน์ชั่วคราว 60 วิ', 60000);
        }
      }
    }, 900);
  });

  // Tab รับ suggestion
  editor.addCommand(
    monaco.KeyCode.Tab,
    () => {
      if (lastSuggestion && decorationIds.length > 0) {
        acceptSuggestion(editor, monaco, lastSuggestion);
        clearDecorations(editor);
        lastSuggestion = '';
      } else {
        editor.trigger('keyboard', 'tab', {});
      }
    }
  );

  // Escape ยกเลิก
  editor.addCommand(
    monaco.KeyCode.Escape,
    () => {
      clearDecorations(editor);
      lastSuggestion = '';
    }
  );
}

function buildCompletionPrompt(
  code: string, lang: string,
  currentLine: string, col: number
): string {
  return `You are a code completion engine for ${lang}.
Complete the code after the cursor. Return ONLY the completion text.
No explanation, no markdown, no code fences.
Maximum 1-3 lines. If nothing useful, return empty string.

Code so far:
\`\`\`${lang}
${code.slice(-800)}
\`\`\`

Current line: "${currentLine}"
Cursor at column: ${col}

Completion:`;
}

function cleanSuggestion(
  raw: string, currentLine: string, col: number
): string {
  let s = raw.trim()
    .replace(/^```[\w]*\n?/, '').replace(/```$/, '')
    .trim();
  // ตัดส่วนที่ซ้ำกับที่พิมพ์ไปแล้ว
  const typed = currentLine.slice(0, col - 1).trimStart();
  if (s.startsWith(typed)) s = s.slice(typed.length);
  return s.split('\n').slice(0, 3).join('\n');
}

function showGhostText(
  editor:    any,
  monaco:    any,
  position:  any,
  text:      string
): void {
  const lines = text.split('\n');
  const decorations = lines.map((line, i) => ({
    range: new monaco.Range(
      position.lineNumber + i, 1,
      position.lineNumber + i, 1
    ),
    options: {
      after: {
        content:     i === 0 ? line : '',
        inlineClassName: 'ghost-text-inline',
      },
      className: i > 0 ? 'ghost-text-line' : undefined,
      before: i > 0 ? {
        content: line,
        inlineClassName: 'ghost-text-inline',
      } : undefined,
    },
  }));

  decorationIds = editor.deltaDecorations([], decorations);
}

function clearDecorations(
  editor: any
): void {
  if (decorationIds.length > 0) {
    editor.deltaDecorations(decorationIds, []);
    decorationIds = [];
  }
}

function acceptSuggestion(
  editor:     any,
  monaco:     any,
  suggestion: string
): void {
  const position = editor.getPosition();
  if (!position) return;
  editor.executeEdits('inline-complete', [{
    range: new monaco.Range(
      position.lineNumber, position.column,
      position.lineNumber, position.column
    ),
    text: suggestion,
  }]);
}
