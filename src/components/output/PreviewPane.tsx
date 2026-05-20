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
    { label: '100%', value: '100%', icon: <Maximize2 className="w-4 h-4" /> },
  ];

  const bg = theme === 'dark' ? 'bg-surface-900 border-border' : 'bg-zinc-100 border-zinc-200';
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

      {/* Error banner */}
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

// Build preview HTML from VFS
let previousBlobUrls: string[] = [];

export function buildPreview(
  vfs: {
    files: Record<string, { content: string; mimeType: string }>;
    assets: Record<string, { buffer: ArrayBuffer; mimeType: string }>;
  }
): string {
  let html = vfs.files['index.html']?.content ?? '<html><body><p>ไม่พบ index.html</p></body></html>';
  const css = vfs.files['style.css']?.content ?? '';
  const js = vfs.files['script.js']?.content ?? '';

  const blobUrls: string[] = [];

  // Inject error capture + console override
  const errorScript = `<script>
    window.onerror = function(msg, src, line, col) {
      window.parent.postMessage({type:'PREVIEW_ERROR', msg: String(msg), line: line, col: col}, '*');
    };
    window.addEventListener('unhandledrejection', function(e) {
      window.parent.postMessage({type:'PREVIEW_ERROR', msg: String(e.reason)}, '*');
    });
    var _log = console.log.bind(console);
    console.log = function() {
      var a = Array.from(arguments).map(String);
      window.parent.postMessage({type:'PREVIEW_LOG', args: a}, '*');
      _log.apply(console, arguments);
    };
    var _warn = console.warn.bind(console);
    console.warn = function() {
      var a = Array.from(arguments).map(String);
      window.parent.postMessage({type:'PREVIEW_WARN', args: a}, '*');
      _warn.apply(console, arguments);
    };
  <\/script>`;

  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data: 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com; connect-src 'none';">`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', csp + errorScript + '</head>');
  } else {
    html = csp + errorScript + html;
  }

  if (css) {
    const blob = new Blob([css], { type: 'text/css' });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    html = html.replace(/href=["']style\.css["']/g, `href="${url}"`);
  }

  if (js) {
    const blob = new Blob([js], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    html = html.replace(/src=["']script\.js["']/g, `src="${url}"`);
  }

  for (const [name, asset] of Object.entries(vfs.assets)) {
    const blob = new Blob([asset.buffer], { type: asset.mimeType });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);
    const safe = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(safe, 'g'), url);
  }

  previousBlobUrls.forEach((u) => URL.revokeObjectURL(u));
  previousBlobUrls = blobUrls;

  return html;
}
