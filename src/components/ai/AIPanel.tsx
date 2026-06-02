import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { callGemini, BUILTIN_KEY } from '../../services/geminiAI';
import { getSetting } from '../../storage/db';
import { decryptApiKey } from '../../storage/cryptoHelpers';
import { toast } from '../shared/Toast';
import { db } from '../../storage/db';
import {
  Bot, ChevronDown, X, Copy,
  CheckCircle, Wrench, Lightbulb, BookOpen, AlertCircle,
  Key, RefreshCw, Clock,
} from 'lucide-react';
import { diffLines } from 'diff';

interface Props {
  onApplyFix: (fixes: Record<string, string>) => void;
}

const MODE_CONFIG = {
  fix:      { label: 'แก้บัค',     icon: <Wrench    className="w-3.5 h-3.5" /> },
  generate: { label: 'สร้างโค้ด',  icon: <Lightbulb className="w-3.5 h-3.5" /> },
  explain:  { label: 'อธิบายโค้ด', icon: <BookOpen   className="w-3.5 h-3.5" /> },
};

function DiffBlock({
  oldCode, newCode, filename,
}: { oldCode: string; newCode: string; filename: string }) {
  const changes = diffLines(oldCode, newCode);
  return (
    <div className="rounded-lg overflow-hidden border border-border text-xs font-mono">
      <div className="bg-surface-700 px-3 py-1.5 text-zinc-400 border-b border-border">
        📄 {filename}
      </div>
      <div className="max-h-48 overflow-y-auto p-2 bg-surface-900">
        {changes.map((part, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap ${
              part.added ? 'diff-add' : part.removed ? 'diff-del' : 'diff-unchanged'
            }`}
          >
            {part.value}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AIPanel({ onApplyFix }: Props) {
  const {
    aiPanelOpen, setAIPanelOpen,
    aiMode, setAIMode,
    aiLoading, setAILoading,
    aiResponse, setAIResponse,
    vfs, currentProject,
    user, consoleErrors, theme,
  } = useAppStore();

  const [input, setInput]                   = useState('');
  const [includeErrors, setIncludeErrors]   = useState(true);
  const [includeWholeFile, setIncludeWholeFile] = useState(true);
  const [usingBuiltinKey, setUsingBuiltinKey]   = useState(false);
  const [statusMsg, setStatusMsg]           = useState('');   // เช่น "กำลัง retry ครั้งที่ 2..."
  const [rateLimitMsg,      setRateLimitMsg]      = useState('');
  const [rateLimitMs,       setRateLimitMs]        = useState(0);
  const [rateLimitCountdown,setRateLimitCountdown] = useState(0);

  // countdown timer:
  useEffect(() => {
    if (rateLimitMs <= 0) { setRateLimitCountdown(0); return; }
    const start = Date.now();
    const timer = setInterval(() => {
      const left = rateLimitMs - (Date.now() - start);
      if (left <= 0) {
        setRateLimitCountdown(0);
        clearInterval(timer);
      } else {
        setRateLimitCountdown(Math.ceil(left / 1000));
      }
    }, 500);
    return () => clearInterval(timer);
  }, [rateLimitMs]);

  // Listen for hover explain symbol requests
  useEffect(() => {
    const handleExplainSymbol = (e: Event) => {
      const symbol = (e as CustomEvent<{ symbol: string }>).detail?.symbol;
      if (symbol) {
        setAIMode('explain');
        setInput(`ช่วยอธิบายคำสั่ง \`${symbol}\` ในการเขียนโปรแกรมอย่างละเอียด พร้อมยกตัวอย่างวิธีใช้ที่ถูกต้องให้หน่อย`);
        setAIPanelOpen(true);
      }
    };
    window.addEventListener('nextcode:explainSymbol', handleExplainSymbol);
    return () => window.removeEventListener('nextcode:explainSymbol', handleExplainSymbol);
  }, [setAIMode, setAIPanelOpen]);

  const [errorType, setErrorType]           = useState<
    'rate_limit' | 'invalid_key' | 'network' | null
  >(null);
  const [rawErrorDetails, setRawErrorDetails] = useState<string | null>(null);

  // เก็บ pending request ไว้ retry
  const pendingRef = useRef<{
    apiKey: string;
    files: Record<string, string>;
    errors: string;
  } | null>(null);

  /** โหลด key ของผู้ใช้ → fallback built-in */
  async function resolveApiKey(): Promise<string> {
    try {
      const userId = user?.id || 'guest';
      const enc = await getSetting<{ iv: string; ciphertext: string } | null>(
        `gemini_key_${userId}`, null
      );
      if (enc) {
        const plain = await decryptApiKey(enc.iv, enc.ciphertext, userId);
        const trimmed = plain?.trim();
        if (trimmed) {
          setUsingBuiltinKey(false);
          return trimmed;
        }
      }
    } catch (err) {
      console.error('Failed to resolve custom API key:', err);
    }
    setUsingBuiltinKey(true);
    return BUILTIN_KEY;
  }

  /** เรียก AI + handle retry */
  async function runGemini(
    apiKey: string,
    files: Record<string, string>,
    errors: string
  ) {
    setAILoading(true);
    setAIResponse(null);
    setErrorType(null);
    setStatusMsg('');

    try {
      setRawErrorDetails(null);
      setRateLimitMsg('');
      setRateLimitMs(0);
      const result = await callGemini(
        { apiKey, userInput: input, mode: aiMode, files, errors, includeWholeFile },
        (attempt, waitSec) => {
          // callback เมื่อ rate limit → กำลัง retry
          setStatusMsg(`⏳ Rate limit — กำลัง retry ครั้งที่ ${attempt} (รอ ${waitSec}s)...`);
          setRateLimitMsg(`ถึง rate limit — รอ ${waitSec} วิ (${attempt}/4)`);
          setRateLimitMs(waitSec * 1000);
        }
      );
      setAIResponse(result);
      setStatusMsg('');
      setRateLimitMsg('');
      setRateLimitMs(0);
      setErrorType(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatusMsg('');
      setRawErrorDetails(msg);
      if (msg.includes('Rate limit') || msg.includes('429')) {
        setErrorType('rate_limit');
        toast('warning', '⏳ Rate limit เต็ม — ใช้ API key ของตัวเองเพื่อ quota มากขึ้น');
      } else if (msg.startsWith('API_KEY_INVALID')) {
        setErrorType('invalid_key');
        toast('error', '❌ API Key ไม่ถูกต้อง');
      } else if (msg === 'EMPTY_RESPONSE') {
        setErrorType('network');
        toast('warning', '⚠ AI ไม่มีผลลัพธ์ กรุณาลองใหม่');
      } else {
        setErrorType('network');
        toast('error', '❌ เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini');
      }
    } finally {
      setAILoading(false);
    }
  }

  async function handleSend() {
    if (!input.trim() || aiLoading) return;

    const apiKey = await resolveApiKey();
    const files: Record<string, string> = {};
    for (const [name, file] of Object.entries(vfs.files)) {
      files[name] = file.content;
    }
    const errors =
      includeErrors && consoleErrors.length > 0
        ? consoleErrors.map((e) => e.args.join(' ')).join('\n')
        : '';

    // Save pending for retry button
    pendingRef.current = { apiKey, files, errors };

    // Save pre-AI snapshot
    if (currentProject) {
      const snapshot: Record<string, string> = {};
      for (const [n, f] of Object.entries(vfs.files)) snapshot[n] = f.content;
      db.snapshots
        .add({ project_id: currentProject.id, timestamp: Date.now(), type: 'pre-ai', files: snapshot })
        .catch(() => {});
    }

    await runGemini(apiKey, files, errors);
  }

  async function handleRetry() {
    if (!pendingRef.current) return;
    const { apiKey, files, errors } = pendingRef.current;
    await runGemini(apiKey, files, errors);
  }

  function handleApply() {
    if (!aiResponse?.fixes) return;
    onApplyFix(aiResponse.fixes);
    toast('success', '✓ ใช้โค้ดใหม่จาก AI แล้ว');
    setAIResponse(null);
    setInput('');
  }

  if (!aiPanelOpen) return null;

  const bg       = theme === 'dark' ? 'bg-surface-900 border-border' : 'bg-zinc-100 border-zinc-200';
  const headerBg = theme === 'dark' ? 'bg-surface-800 border-border' : 'bg-white border-zinc-200';
  const inputBg  = theme === 'dark' ? 'bg-surface-800 border-border' : 'bg-white border-zinc-300';

  return (
    <div
      id="ide-ai-panel"
      className={`flex flex-col border-t shrink-0 ${bg}`}
      style={{ maxHeight: '48vh', minHeight: 220 }}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-2.5 border-b shrink-0 ${headerBg}`}>
        <Bot className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-semibold text-white">AI ช่วยเขียนโค้ด</span>
        <span className="text-xs px-2 py-0.5 bg-primary-600/20 text-primary-400 rounded-full border border-primary-600/30">
          Gemini 2.5
        </span>
        {usingBuiltinKey && (
          <span className="flex items-center gap-1 text-xs text-zinc-600">
            <Key className="w-3 h-3" /> shared key
          </span>
        )}
        <button
          onClick={() => setAIPanelOpen(false)}
          className="ml-auto p-1 hover:bg-surface-700 rounded transition-colors text-zinc-500"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Mode toggle */}
        <div className="flex gap-1 p-1 bg-surface-800 rounded-xl">
          {(Object.entries(MODE_CONFIG) as [typeof aiMode, (typeof MODE_CONFIG)[typeof aiMode]][]).map(
            ([mode, cfg]) => (
              <button
                key={mode}
                onClick={() => setAIMode(mode)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  aiMode === mode ? 'bg-primary-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {cfg.icon} {cfg.label}
              </button>
            )
          )}
        </div>

        {/* Status / retry message */}
        {statusMsg && (
          <div className="flex items-center gap-2 p-2.5 bg-yellow-900/20 border border-yellow-700/30 rounded-xl text-xs text-yellow-300">
            <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse" />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* Error banners */}
        {errorType === 'rate_limit' && !aiLoading && (
          <div className="p-3 bg-orange-900/20 border border-orange-700/30 rounded-xl space-y-2">
            <div className="flex items-start gap-2 text-xs text-orange-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Rate Limit เต็ม (429)</p>
                <p className="text-orange-500 mt-0.5">
                  API key ถึงขีดจำกัดคำขอต่อนาที ระบบได้ retry อัตโนมัติ 3 ครั้งแล้ว
                </p>
                {rawErrorDetails && (
                  <p className="text-[10px] text-orange-400/80 font-mono bg-orange-950/40 p-2 rounded border border-orange-900/40 mt-1.5 whitespace-pre-wrap">
                    รายละเอียด: {rawErrorDetails}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRetry}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <RefreshCw className="w-3 h-3" /> ลองอีกครั้ง
              </button>
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noreferrer"
                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-lg text-xs transition-colors"
              >
                <Key className="w-3 h-3" /> รับ Key ของตัวเอง
              </a>
            </div>
          </div>
        )}

        {errorType === 'invalid_key' && !aiLoading && (
          <div className="flex flex-col gap-2 p-3 bg-red-900/20 border border-red-700/30 rounded-xl text-xs text-red-300">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>API Key ไม่ถูกต้อง — ตรวจสอบใน Settings ⚙</span>
            </div>
            {rawErrorDetails && (
              <p className="text-[10px] text-red-400/80 font-mono bg-red-950/40 p-2 rounded border border-red-900/40 whitespace-pre-wrap">
                รายละเอียด: {rawErrorDetails.replace('API_KEY_INVALID: ', '')}
              </p>
            )}
          </div>
        )}

        {errorType === 'network' && !aiLoading && (
          <div className="p-3 bg-red-900/20 border border-red-700/30 rounded-xl space-y-2">
            <div className="flex items-start gap-2 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-1 flex-1">
                <p className="font-medium">เชื่อมต่อกับ Gemini ไม่สำเร็จ</p>
                {rawErrorDetails && (
                  <p className="text-[10px] text-red-400/80 font-mono bg-red-950/40 p-2 rounded border border-red-900/40 whitespace-pre-wrap">
                    รายละเอียด: {rawErrorDetails}
                  </p>
                )}
              </div>
              <button
                onClick={handleRetry}
                className="flex items-center gap-1 px-2 py-1 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-lg transition-colors text-xs shrink-0 self-start animate-pulse"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          </div>
        )}

        {/* Input */}
        <div className="space-y-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSend(); }}
            placeholder="บอก AI ว่าต้องการอะไร... (Ctrl+Enter เพื่อส่ง)"
            rows={3}
            disabled={aiLoading}
            className={`w-full px-3 py-2.5 border rounded-xl text-sm text-white placeholder-zinc-600 outline-none focus:border-primary-500 transition-colors resize-none disabled:opacity-50 ${inputBg}`}
          />

          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={includeErrors} onChange={(e) => setIncludeErrors(e.target.checked)} className="accent-primary-500" />
              console errors
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={includeWholeFile} onChange={(e) => setIncludeWholeFile(e.target.checked)} className="accent-primary-500" />
              ส่งโค้ดทั้งไฟล์
            </label>
          </div>

          <button
            onClick={handleSend}
            disabled={aiLoading || !input.trim()}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-sm font-medium transition-colors"
          >
            {aiLoading ? (
              <>
                <span className="flex gap-1">
                  <span className="ai-dot" />
                  <span className="ai-dot" />
                  <span className="ai-dot" />
                </span>
                {statusMsg ? 'กำลัง retry...' : 'AI กำลังคิด...'}
              </>
            ) : (
              <><Bot className="w-4 h-4" /> ส่งให้ AI</>
            )}
          </button>

          {(rateLimitMsg || rateLimitCountdown > 0) && (
            <div className="rate-limit-banner">
              <div className="rate-limit-bar">
                <div
                  className="rate-limit-fill"
                  style={{
                    width: rateLimitMs > 0
                      ? `${(rateLimitCountdown / (rateLimitMs/1000)) * 100}%`
                      : '0%',
                    transition: 'width 0.5s linear',
                  }}
                />
              </div>
              <span className="rate-limit-text">
                ⏳ {rateLimitMsg}
                {rateLimitCountdown > 0 && ` (${rateLimitCountdown}s)`}
              </span>
            </div>
          )}
        </div>

        {/* Response */}
        {aiResponse && (
          <div className="space-y-3">
            {aiResponse.explanation && (
              <div className="p-3 bg-primary-900/20 border border-primary-700/30 rounded-xl text-sm text-zinc-300 leading-relaxed">
                {aiResponse.explanation}
              </div>
            )}

            {/* Raw fallback when no structured fixes */}
            {Object.keys(aiResponse.fixes).length === 0 && aiResponse.rawText && (
              <div className="p-3 bg-surface-800 border border-border rounded-xl text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto font-mono">
                {aiResponse.rawText}
              </div>
            )}

            {Object.entries(aiResponse.fixes).map(([filename, newCode]) => (
              <DiffBlock
                key={filename}
                filename={filename}
                oldCode={vfs.files[filename]?.content ?? ''}
                newCode={newCode}
              />
            ))}

            {Object.keys(aiResponse.fixes).length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={handleApply}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                  <CheckCircle className="w-4 h-4" /> ใช้โค้ดนี้
                </button>
                <button
                  onClick={() => {
                    const code = Object.entries(aiResponse.fixes)
                      .map(([f, c]) => `// ${f}\n${c}`)
                      .join('\n\n');
                    navigator.clipboard.writeText(code);
                    toast('success', 'คัดลอกแล้ว');
                  }}
                  className="p-2 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-xl transition-colors"
                  title="คัดลอก"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setAIResponse(null)}
                  className="p-2 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-xl transition-colors"
                  title="ปิด"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
