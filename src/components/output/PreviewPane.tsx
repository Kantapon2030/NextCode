import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useAppStore, ConsoleEntry } from '../../store/appStore';
import { 
  RefreshCw, Smartphone, Monitor, Maximize2, AlertTriangle, X, Bot,
  ChevronLeft, ChevronRight, Home, Globe 
} from 'lucide-react';
import { buildPreview, resolvePath } from '../../utils/blobHelpers';

interface Props {
  html?: string;
  onConsoleEntry: (entry: ConsoleEntry) => void;
  onAskAI: (error: string) => void;
}

interface PreviewError {
  msg: string;
  line?: number;
}

export function PreviewPane({ onConsoleEntry, onAskAI }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { previewWidth, setPreviewWidth, theme, vfs, currentProject } = useAppStore();
  const [currentFile, setCurrentFile] = useState('index.html');
  const [history, setHistory] = useState<string[]>(['index.html']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [previewHtml, setPreviewHtml] = useState('');
  const [errors, setErrors] = useState<PreviewError[]>([]);
  const [key, setKey] = useState(0);

  // รีเซ็ตไฟล์และประวัติการท่องเว็บเมื่อสลับโปรเจกต์
  const projectId = currentProject?.id;
  useEffect(() => {
    setCurrentFile('index.html');
    setHistory(['index.html']);
    setHistoryIndex(0);
    setErrors([]);
  }, [projectId]);

  const lastFileRef = useRef(currentFile);

  // สร้าง preview ใหม่เมื่อ vfs หรือไฟล์ปัจจุบันเปลี่ยน
  useEffect(() => {
    const fileToBuild = vfs.files[currentFile] ? currentFile : 'index.html';
    if (fileToBuild !== currentFile) {
      setCurrentFile(fileToBuild);
      setHistory([fileToBuild]);
      setHistoryIndex(0);
    }

    // ล้างข้อผิดพลาดทันทีเมื่อมีการพิมพ์แก้ไขไฟล์หรือสลับไฟล์
    setErrors([]);

    const fileSwitched = lastFileRef.current !== fileToBuild;
    lastFileRef.current = fileToBuild;

    if (fileSwitched) {
      // โหลดทันทีเมื่อสลับไฟล์
      setPreviewHtml(buildPreview(vfs, fileToBuild));
    } else {
      // ดีเด้นซ์เฉพาะเมื่อมีการพิมพ์แก้ไขเนื้อหาในไฟล์เดิม (รอ 600ms)
      const timer = setTimeout(() => {
        setPreviewHtml(buildPreview(vfs, fileToBuild));
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [vfs, currentFile]);

  // จัดการประวัติการเปลี่ยนหน้า (Navigation)
  const navigateTo = useCallback((file: string) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(file);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    setCurrentFile(file);
  }, [history, historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setCurrentFile(history[prevIndex]);
    }
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setCurrentFile(history[nextIndex]);
    }
  }, [history, historyIndex]);

  const goHome = useCallback(() => {
    navigateTo('index.html');
  }, [navigateTo]);

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
      } else if (msg.type === 'PREVIEW_NAVIGATE') {
        const target = resolvePath(currentFile, msg.href);
        if (vfs.files[target] || vfs.assets[target]) {
          navigateTo(target);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onConsoleEntry, currentFile, vfs, navigateTo]);

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
      <div className={`flex items-center gap-1.5 px-3 py-2 border-b shrink-0 ${toolbar}`}>
        <button
          onClick={goBack}
          disabled={historyIndex === 0}
          className={`p-1.5 rounded-lg transition-colors ${
            historyIndex === 0
              ? 'text-zinc-600 cursor-not-allowed'
              : 'text-zinc-400 hover:bg-surface-700 hover:text-white'
          }`}
          title="ย้อนกลับ"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex === history.length - 1}
          className={`p-1.5 rounded-lg transition-colors ${
            historyIndex === history.length - 1
              ? 'text-zinc-600 cursor-not-allowed'
              : 'text-zinc-400 hover:bg-surface-700 hover:text-white'
          }`}
          title="ไปข้างหน้า"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={goHome}
          className="p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="หน้าแรก (index.html)"
        >
          <Home className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={reload}
          className="p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="รีโหลด"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* Address Bar */}
        <div className="flex-1 max-w-[120px] sm:max-w-[200px] flex items-center gap-1 px-2.5 py-1 bg-surface-900 border border-border rounded-lg text-xs text-zinc-400 font-mono truncate">
          <Globe className="w-3 h-3 text-zinc-500 shrink-0" />
          <span className="truncate">{currentFile}</span>
        </div>

        <div className="flex gap-0.5 ml-auto">
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
            const blob = new Blob([previewHtml], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          }}
          className="p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
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
            srcDoc={previewHtml}
            sandbox="allow-scripts allow-same-origin allow-modals allow-forms allow-popups allow-pointer-lock"
            title="ตัวอย่างเว็บ"
            className="w-full h-full border-0 bg-white"
          />
        </div>
      </div>
    </div>
  );
}


