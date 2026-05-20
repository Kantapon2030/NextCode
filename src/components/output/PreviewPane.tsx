import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useAppStore, ConsoleEntry } from '../../store/appStore';
import { 
  RefreshCw, Smartphone, Monitor, Maximize2, AlertTriangle, X, Bot,
  ChevronLeft, ChevronRight, Home, Globe 
} from 'lucide-react';

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

  // สร้าง preview ใหม่เมื่อ vfs หรือไฟล์ปัจจุบันเปลี่ยน
  useEffect(() => {
    const fileToBuild = vfs.files[currentFile] ? currentFile : 'index.html';
    if (fileToBuild !== currentFile) {
      setCurrentFile(fileToBuild);
      setHistory([fileToBuild]);
      setHistoryIndex(0);
    }
    setPreviewHtml(buildPreview(vfs, fileToBuild));
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


// ─────────────────────────────────────────────────────────────────────────────
// buildPreview — แปลง VFS เป็น HTML ที่แสดงผลได้ใน srcdoc iframe
// แก้ปัญหา ES modules (Cannot use import statement outside a module) และรูปภาพ
// ─────────────────────────────────────────────────────────────────────────────

type VFS = {
  files:  Record<string, { content: string; mimeType: string }>;
  assets: Record<string, { buffer: ArrayBuffer; mimeType: string }>;
};

// เก็บสะสม Blob URLs ที่ถูกสร้างขึ้น เพื่อจะทำการ revoke เมื่อทำการ rebuild ครั้งถัดไป
let activeBlobUrls: string[] = [];

function clearActiveBlobUrls() {
  activeBlobUrls.forEach((url) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Failed to revoke blob URL:', e);
    }
  });
  activeBlobUrls = [];
}

/** ฟังก์ชันแปลง relative path ให้เป็น path สัมบูรณ์ภายใน VFS */
function resolvePath(basePath: string, relativePath: string): string {
  if (!relativePath || relativePath.startsWith('http') || relativePath.startsWith('//') || relativePath.startsWith('data:') || relativePath.startsWith('blob:')) {
    return relativePath;
  }
  
  const cleanBase = basePath.replace(/\\/g, '/');
  const cleanRel = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');

  const baseParts = cleanBase.split('/');
  baseParts.pop(); // เอาชื่อไฟล์ออก เหลือแต่ชื่อโฟลเดอร์
  
  const relParts = cleanRel.split('/');
  for (const part of relParts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }
  return baseParts.join('/');
}

export function buildPreview(vfs: VFS, entryPoint: string = 'index.html'): string {
  // 1. ล้าง Blob URL เดิมออกให้หมดเพื่อป้องกัน memory leak
  clearActiveBlobUrls();

  const resolvedUrls: Record<string, string> = {};

  // ฟังก์ชันย่อยสำหรับดึง/สร้าง Blob URL ของไฟล์ใน VFS แบบ recursive และแก้ references ภายใน
  function getBlobUrl(path: string): string {
    const cleanPath = path.replace(/^\.\//, '').replace(/^\//, '').replace(/\\/g, '/');

    if (resolvedUrls[cleanPath]) {
      return resolvedUrls[cleanPath];
    }

    // 1. หาใน Assets (เช่น ไฟล์รูปภาพที่ผู้ใช้ drop เข้ามา)
    const asset = vfs.assets[cleanPath] ?? vfs.assets[path];
    if (asset) {
      const blob = new Blob([asset.buffer], { type: asset.mimeType });
      const url = URL.createObjectURL(blob);
      resolvedUrls[cleanPath] = url;
      activeBlobUrls.push(url);
      return url;
    }

    // 2. หาใน Files (เช่น script, style, svg)
    const file = vfs.files[cleanPath] ?? vfs.files[path];
    if (file) {
      // ตั้งเป็น TEMPORARY_HINT เพื่อหลีกเลี่ยง infinite loop กรณีเกิด circular imports
      resolvedUrls[cleanPath] = 'TEMPORARY_HINT';

      let content = file.content;
      const lowerPath = cleanPath.toLowerCase();
      const isJs = lowerPath.endsWith('.js') || lowerPath.endsWith('.jsx') || lowerPath.endsWith('.ts') || lowerPath.endsWith('.tsx');
      const isCss = lowerPath.endsWith('.css');

      if (isJs) {
        // แก้ไข static import/export statements: `import { X } from './Y.js'`
        content = content.replace(/(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g, (match, type, exports, importPath) => {
          const target = resolvePath(cleanPath, importPath);
          const targetUrl = getBlobUrl(target);
          if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
            return `${type} ${exports} from '${targetUrl}'`;
          }
          return match;
        });

        // แก้ไข side-effect imports: `import './style.css'`
        content = content.replace(/import\s+['"]([^'"]+)['"]/g, (match, importPath) => {
          const target = resolvePath(cleanPath, importPath);
          const targetUrl = getBlobUrl(target);
          if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
            return `import '${targetUrl}'`;
          }
          return match;
        });

        // แก้ไข dynamic imports: `import('./lazy.js')`
        content = content.replace(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, importPath) => {
          const target = resolvePath(cleanPath, importPath);
          const targetUrl = getBlobUrl(target);
          if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
            return `import('${targetUrl}')`;
          }
          return match;
        });
      } else if (isCss) {
        // แก้ไข CSS @import: `@import "./theme.css";`
        content = content.replace(/@import\s+(url\(['"]?)?([^'")\s;)]+)(['"]?\))?\s*;/g, (match, urlPrefix, importPath) => {
          if (importPath.startsWith('http') || importPath.startsWith('//') || importPath.startsWith('data:') || importPath.startsWith('blob:')) {
            return match;
          }
          const target = resolvePath(cleanPath, importPath);
          const targetUrl = getBlobUrl(target);
          if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
            return urlPrefix ? `@import url("${targetUrl}");` : `@import "${targetUrl}";`;
          }
          return match;
        });

        // แก้ไข background images หรือ fonts ใน CSS: `url(...)`
        content = content.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, urlPath) => {
          if (urlPath.startsWith('http') || urlPath.startsWith('//') || urlPath.startsWith('data:') || urlPath.startsWith('blob:')) {
            return match;
          }
          const target = resolvePath(cleanPath, urlPath);
          const targetUrl = getBlobUrl(target);
          if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
            return `url("${targetUrl}")`;
          }
          return match;
        });
      }

      const blob = new Blob([content], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      resolvedUrls[cleanPath] = url;
      activeBlobUrls.push(url);
      return url;
    }

    return '';
  }

  // 2. ดึง HTML ไฟล์หลักที่ต้องการรันออกมา parsing
  const rawHtml = vfs.files[entryPoint]?.content
    ?? `<html><body><p style="font-family:sans-serif;padding:2rem;color:#888">ไม่พบ ${entryPoint}</p></body></html>`;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rawHtml, 'text/html');
  } catch {
    return rawHtml;
  }

  // 3. แก้ CSS <link rel="stylesheet"> → ชี้ไปที่ Blob URL
  doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (href.startsWith('http') || href.startsWith('//')) return;
    const blobUrl = getBlobUrl(href);
    if (blobUrl && blobUrl !== 'TEMPORARY_HINT') {
      link.setAttribute('href', blobUrl);
    }
  });

  // 4. แก้ inline <style> tags (rewrite background url หรือ @import ภายใน)
  doc.querySelectorAll<HTMLStyleElement>('style').forEach((styleTag) => {
    let content = styleTag.textContent ?? '';
    
    content = content.replace(/@import\s+(url\(['"]?)?([^'")\s;)]+)(['"]?\))?\s*;/g, (match, urlPrefix, importPath) => {
      if (importPath.startsWith('http') || importPath.startsWith('//') || importPath.startsWith('data:') || importPath.startsWith('blob:')) {
        return match;
      }
      const target = resolvePath(entryPoint, importPath);
      const targetUrl = getBlobUrl(target);
      if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
        return urlPrefix ? `@import url("${targetUrl}");` : `@import "${targetUrl}";`;
      }
      return match;
    });

    content = content.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (match, urlPath) => {
      if (urlPath.startsWith('http') || urlPath.startsWith('//') || urlPath.startsWith('data:') || urlPath.startsWith('blob:')) {
        return match;
      }
      const target = resolvePath(entryPoint, urlPath);
      const targetUrl = getBlobUrl(target);
      if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
        return `url("${targetUrl}")`;
      }
      return match;
    });
    
    styleTag.textContent = content;
  });

  // 5. แก้ <script src="..."> หรือ inline module scripts
  doc.querySelectorAll<HTMLScriptElement>('script').forEach((script) => {
    const src = script.getAttribute('src');
    if (src) {
      if (src.startsWith('http') || src.startsWith('//')) return;
      const blobUrl = getBlobUrl(src);
      if (blobUrl && blobUrl !== 'TEMPORARY_HINT') {
        script.setAttribute('src', blobUrl);
      }
    } else {
      // Inline Script: แก้ไข import statements ข้างใน ให้ชี้หา Blob URLs
      let content = script.textContent ?? '';
      
      content = content.replace(/(import|export)\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g, (match, type, exports, importPath) => {
        const target = resolvePath(entryPoint, importPath);
        const targetUrl = getBlobUrl(target);
        if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
          return `${type} ${exports} from '${targetUrl}'`;
        }
        return match;
      });

      content = content.replace(/import\s+['"]([^'"]+)['"]/g, (match, importPath) => {
        const target = resolvePath(entryPoint, importPath);
        const targetUrl = getBlobUrl(target);
        if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
          return `import '${targetUrl}'`;
        }
        return match;
      });

      content = content.replace(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, (match, importPath) => {
        const target = resolvePath(entryPoint, importPath);
        const targetUrl = getBlobUrl(target);
        if (targetUrl && targetUrl !== 'TEMPORARY_HINT') {
          return `import('${targetUrl}')`;
        }
        return match;
      });

      script.textContent = content;
    }
  });

  // 6. แก้ไข tag <img> และ background-image ใน inline style
  doc.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:') || src.startsWith('blob:')) return;
    const blobUrl = getBlobUrl(src);
    if (blobUrl && blobUrl !== 'TEMPORARY_HINT') {
      img.setAttribute('src', blobUrl);
    }
  });

  doc.querySelectorAll<HTMLElement>('[style*="url("]').forEach((el) => {
    const style = el.getAttribute('style') ?? '';
    const replaced = style.replace(/url\(['"]?([^'")\s]+)['"]?\)/g, (_match, src) => {
      if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:') || src.startsWith('blob:')) {
        return _match;
      }
      const blobUrl = getBlobUrl(src);
      return blobUrl && blobUrl !== 'TEMPORARY_HINT' ? `url("${blobUrl}")` : _match;
    });
    if (replaced !== style) el.setAttribute('style', replaced);
  });

  // 7. แก้ href ลิงก์ภายในโปรเจกต์
  doc.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#')) {
      const target = resolvePath(entryPoint, href);
      if (vfs.files[target]) {
        a.setAttribute('title', `หน้า ${href}`);
      }
    }
  });

  // 8. แทรกตัวดักจับ error + console bridge + ดักจับลิงก์ภายใน
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

  // ดักจับการคลิกเพื่อเปลี่ยนหน้าจำลอง (SPA-like)
  document.addEventListener('click', function(e) {
    var target = e.target;
    while (target && target.tagName !== 'A') {
      target = target.parentNode;
    }
    if (target && target.tagName === 'A') {
      var href = target.getAttribute('href');
      if (href && !href.startsWith('http') && !href.startsWith('//') && !href.startsWith('#') && !href.startsWith('javascript:')) {
        e.preventDefault();
        window.parent.postMessage({type: 'PREVIEW_NAVIGATE', href: href}, '*');
      }
    }
  });
})();`;

  if (doc.head) {
    doc.head.insertBefore(errorScript, doc.head.firstChild);
  } else {
    doc.documentElement.prepend(errorScript);
  }

  // 9. CSP Meta tag เพื่อความปลอดภัยแต่ยังใช้งาน blob: และ data: ได้
  const cspMeta = doc.createElement('meta');
  cspMeta.setAttribute('http-equiv', 'Content-Security-Policy');
  cspMeta.setAttribute(
    'content',
    "default-src 'self' blob: data: 'unsafe-inline' 'unsafe-eval' https:; connect-src 'self' https:;"
  );
  doc.head?.insertBefore(cspMeta, doc.head.firstChild);

  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}

