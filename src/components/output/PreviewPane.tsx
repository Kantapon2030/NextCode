import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useAppStore, ConsoleEntry } from '../../store/appStore';
import { RefreshCw, Smartphone, Monitor, Maximize2, AlertTriangle, X, Bot } from 'lucide-react';

interface Props {
  html: string;
  onConsoleEntry: (entry: ConsoleEntry) => void;
  onAskAI: (error: string) => void;
}

interface PreviewError {
  msg: string;
  line?: number;
}

export function PreviewPane({ html, onConsoleEntry, onAskAI }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { previewWidth, setPreviewWidth, theme } = useAppStore();
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [key, setKey] = useState(0);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.type) return;
      if (msg.type === 'PREVIEW_ERROR') {
        setErrors((prev) => [...prev.slice(-4), { msg: msg.msg, line: msg.line }]);
      } else if (msg.type === 'PREVIEW_LOG' || msg.type === 'PREVIEW_WARN') {
        const type = msg.type === 'PREVIEW_WARN' ? 'warn' : 'log';
        onConsoleEntry({
          id: Math.random().toString(36).slice(2),
          timestamp: Date.now(),
          type,
          args: msg.args ?? [],
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onConsoleEntry]);

  function reload() {
    setKey((k) => k + 1);
    setErrors([]);
  }

  const widths: { label: string; value: typeof previewWidth; icon: React.ReactNode }[] = [
    { label: '375px', value: '375', icon: <Smartphone className="w-4 h-4" /> },
    { label: '768px', value: '768', icon: <Monitor className="w-4 h-4" /> },
    { label: '100%',  value: '100%', icon: <Maximize2 className="w-4 h-4" /> },
  ];

  const bg      = theme === 'dark' ? 'bg-surface-900 border-border' : 'bg-zinc-100 border-zinc-200';
  const toolbar = theme === 'dark' ? 'bg-surface-800 border-border' : 'bg-white border-zinc-200';

  const previewStyle: React.CSSProperties =
    previewWidth === '100%'
      ? { width: '100%', height: '100%' }
      : { width: `${previewWidth}px`, height: '100%', margin: '0 auto' };

  return (
    <div className={`flex flex-col h-full border-l ${bg}`}>
      {/* Toolbar */}
      <div className={`flex items-center gap-2 px-3 py-2 border-b shrink-0 ${toolbar}`}>
        <button
          onClick={reload}
          className="p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="รีโหลด"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
        <div className="flex gap-1 ml-1">
          {widths.map((w) => (
            <button
              key={w.value}
              onClick={() => setPreviewWidth(w.value)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors ${
                previewWidth === w.value
                  ? 'bg-primary-600 text-white'
                  : 'text-zinc-500 hover:bg-surface-700 hover:text-zinc-300'
              }`}
              title={w.label}
            >
              {w.icon}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          }}
          className="ml-auto p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="เปิดแท็บใหม่"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Error banners */}
      {errors.map((err, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-2 bg-red-900/80 text-red-300 text-xs border-b border-red-800 shrink-0"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 truncate">
            ⚠ JS Error: {err.msg}
            {err.line ? ` (บรรทัด ${err.line})` : ''}
          </span>
          <button
            onClick={() => onAskAI(err.msg)}
            className="flex items-center gap-1 px-2 py-0.5 bg-red-700 hover:bg-red-600 rounded text-xs transition-colors"
          >
            <Bot className="w-3 h-3" /> ถาม AI
          </button>
          <button onClick={() => setErrors((e) => e.filter((_, j) => j !== i))}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* iframe */}
      <div className="flex-1 overflow-hidden">
        <div style={previewStyle} className="h-full">
          <iframe
            key={key}
            ref={iframeRef}
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups allow-pointer-lock"
            title="ตัวอย่างเว็บ"
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// buildPreview — แปลง VFS เป็น HTML ที่แสดงผลได้ใน srcdoc iframe
// inline ทุกไฟล์ JS/CSS/รูปภาพ ไม่พึ่ง external request
// ─────────────────────────────────────────────────────────────────────────────

type VFS = {
  files:  Record<string, { content: string; mimeType: string }>;
  assets: Record<string, { buffer: ArrayBuffer; mimeType: string }>;
};

/** หาไฟล์ใน VFS จาก path (ลอง exact → ตัด ./ → แค่ basename) */
function lookupFile(vfs: VFS, path: string): string | null {
  if (!path || path.startsWith('http') || path.startsWith('//')) return null;
  const clean = path.replace(/^\.\//, '').replace(/^\//, '');

  if (vfs.files[clean])   return vfs.files[clean].content;
  if (vfs.files[path])    return vfs.files[path].content;

  // basename fallback: "js/utils.js" → "utils.js"
  const base = clean.split('/').pop() ?? '';
  if (base && vfs.files[base]) return vfs.files[base].content;

  return null;
}

/** แปลง ArrayBuffer → base64 data URL */
function bufferToDataURL(buffer: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  // Process in chunks to avoid call stack overflow
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mimeType};base64,${btoa(bin)}`;
}

/** หา asset (รูปภาพ) ใน VFS แล้วคืน data URL */
function lookupAssetDataURL(vfs: VFS, path: string): string | null {
  if (!path || path.startsWith('data:') || path.startsWith('http') || path.startsWith('//')) {
    return null;
  }
  const clean = path.replace(/^\.\//, '').replace(/^\//, '');

  // ลอง asset ก่อน (รูปที่อัพโหลด)
  const asset = vfs.assets[clean] ?? vfs.assets[path] ?? vfs.assets[clean.split('/').pop() ?? ''];
  if (asset) return bufferToDataURL(asset.buffer, asset.mimeType);

  // SVG / รูปที่เป็น text file ใน vfs.files
  const svgContent = lookupFile(vfs, path);
  if (svgContent && (path.endsWith('.svg') || svgContent.trim().startsWith('<svg'))) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
  }

  return null;
}

export function buildPreview(vfs: VFS): string {
  const rawHtml = vfs.files['index.html']?.content
    ?? '<html><body><p style="font-family:sans-serif;padding:2rem;color:#888">ไม่พบ index.html</p></body></html>';

  // ── Parse ด้วย DOMParser เพื่อความแม่นยำ ──────────────────
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  } catch {
    return rawHtml;
  }

  // ── 1. Inline CSS (<link rel="stylesheet" href="...">) ──────
  doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    const content = lookupFile(vfs, href);
    if (content !== null) {
      const style = doc.createElement('style');
      style.setAttribute('data-src', href);
      style.textContent = content;
      link.parentNode?.replaceChild(style, link);
    }
  });

  // ── 2. Inline JS (<script src="...">) ──────────────────────
  // NOTE: ลบ type="module" เพราะ import ใน srcdoc ทำงานไม่ได้
  doc.querySelectorAll<HTMLScriptElement>('script[src]').forEach((script) => {
    const src = script.getAttribute('src') ?? '';
    if (src.startsWith('http') || src.startsWith('//')) return; // CDN → ปล่อยไว้

    const content = lookupFile(vfs, src);
    if (content !== null) {
      const newScript = doc.createElement('script');
      newScript.setAttribute('data-src', src);
      // ไม่คัดลอก type="module" — ใช้ classic script แทน
      // copy defer/async ถ้ามี
      if (script.hasAttribute('defer'))  newScript.setAttribute('defer', '');
      if (script.hasAttribute('async'))  newScript.setAttribute('async', '');
      newScript.textContent = content;
      script.parentNode?.replaceChild(newScript, script);
    }
  });

  // ── 3. แปลงรูปภาพ → data URL ────────────────────────────────
  // <img src="picture/photo.jpg">
  doc.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    const dataUrl = lookupAssetDataURL(vfs, src);
    if (dataUrl) img.setAttribute('src', dataUrl);
  });

  // background-image ใน inline style
  doc.querySelectorAll<HTMLElement>('[style*="url("]').forEach((el) => {
    const style = el.getAttribute('style') ?? '';
    const replaced = style.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (_match, src) => {
      const dataUrl = lookupAssetDataURL(vfs, src);
      return dataUrl ? `url("${dataUrl}")` : _match;
    });
    if (replaced !== style) el.setAttribute('style', replaced);
  });

  // ── 4. แก้ href ลิงก์ภายในโปรเจกต์ (more.html → inline เปิดไม่ได้ แต่ไม่ crash) ──
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    // ถ้าเป็นไฟล์ .html ใน VFS และไม่ใช่ URL ภายนอก
    if (!href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#')) {
      const target = lookupFile(vfs, href);
      if (target !== null) {
        // แสดง tooltip แต่ไม่เปิดได้ใน preview
        a.setAttribute('title', `หน้า ${href} (เปิดได้เฉพาะ localhost)`);
      }
    }
  });

  // ── 5. Inject error capture + console bridge ────────────────
  const errorScript = doc.createElement('script');
  errorScript.textContent = `
(function(){
  var _onerror = window.onerror;
  window.onerror = function(msg, src, line, col, err) {
    window.parent.postMessage({type:'PREVIEW_ERROR', msg:String(msg), line:line, col:col}, '*');
    if(_onerror) _onerror.apply(this, arguments);
  };
  window.addEventListener('unhandledrejection', function(e){
    window.parent.postMessage({type:'PREVIEW_ERROR', msg:String(e.reason||e.message||'Promise rejected')}, '*');
  });
  var _log  = console.log.bind(console);
  var _warn = console.warn.bind(console);
  var _err  = console.error.bind(console);
  console.log = function(){
    window.parent.postMessage({type:'PREVIEW_LOG',  args:Array.from(arguments).map(String)}, '*');
    _log.apply(console, arguments);
  };
  console.warn = function(){
    window.parent.postMessage({type:'PREVIEW_WARN', args:Array.from(arguments).map(String)}, '*');
    _warn.apply(console, arguments);
  };
  console.error = function(){
    window.parent.postMessage({type:'PREVIEW_ERROR', msg:Array.from(arguments).map(String).join(' ')}, '*');
    _err.apply(console, arguments);
  };
})();`;

  // แทรกต้น <head>
  if (doc.head) {
    doc.head.insertBefore(errorScript, doc.head.firstChild);
  } else {
    doc.documentElement.prepend(errorScript);
  }

  // ── 6. CSP ──────────────────────────────────────────────────
  const cspMeta = doc.createElement('meta');
  cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
  cspMeta.setAttribute(
    'content',
    "default-src 'self' blob: data: 'unsafe-inline' 'unsafe-eval' https:; connect-src 'self' https:;"
  );
  doc.head?.insertBefore(cspMeta, doc.head.firstChild);

  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}
