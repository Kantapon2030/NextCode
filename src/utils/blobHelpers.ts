import { VFSState } from '../types';

let activeBlobUrls: string[] = [];

export function clearActiveBlobUrls() {
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
export function resolvePath(basePath: string, relativePath: string): string {
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

export function buildPreview(vfs: VFSState, entryPoint: string = 'index.html'): string {
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

    // 3. หากไม่พบไฟล์ใน VFS และเป็น relative/local path (ไม่ได้ขึ้นด้วย http, //, data, blob)
    // ให้จำลองไฟล์เปล่าขึ้นมาเพื่อกันเบราว์เซอร์ส่ง request ไปหลังบ้านแล้วได้ HTML หน้าแรกกลับมาจนพัง
    if (path && !path.startsWith('http') && !path.startsWith('//') && !path.startsWith('data:') && !path.startsWith('blob:')) {
      const lower = cleanPath.toLowerCase();
      let mimeType = 'text/plain';
      let content = '';

      const lastSegment = cleanPath.split('/').pop() || '';
      const hasExtension = lastSegment.includes('.');

      if (!hasExtension) {
        // หากไม่มีนามสกุลไฟล์ ให้ถือว่าเป็น JS ไว้ก่อน (สำหรับ ES Modules import)
        mimeType = 'application/javascript';
        content = `/* Placeholder for missing module: ${cleanPath} */`;
      } else if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mjs')) {
        mimeType = 'application/javascript';
        content = `/* Placeholder for missing file: ${cleanPath} */`;
      } else if (lower.endsWith('.css')) {
        mimeType = 'text/css';
        content = `/* Placeholder for missing stylesheet: ${cleanPath} */`;
      } else if (lower.endsWith('.svg')) {
        mimeType = 'image/svg+xml';
        content = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';
      } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp')) {
        mimeType = 'image/gif';
        // คืนค่าเป็น blob url ของ binary 1x1 transparent GIF เพื่อป้องกัน broken image link หรือการโหลด HTML
        const binary = atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
        const array = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
        const blob = new Blob([array], { type: mimeType });
        const url = URL.createObjectURL(blob);
        resolvedUrls[cleanPath] = url;
        activeBlobUrls.push(url);
        return url;
      }

      const blob = new Blob([content], { type: mimeType });
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
