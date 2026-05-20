/**
 * folderImport.ts
 * อ่าน DataTransfer items แบบ recursive รองรับทั้งไฟล์และโฟลเดอร์
 */

export interface ImportedFile {
  /** relative path เช่น "picture/photo.jpg" หรือ "script.js" */
  path: string;
  file: File;
}

/** อ่าน FileSystemEntry แบบ recursive */
async function readEntry(
  entry: FileSystemEntry,
  basePath = ''
): Promise<ImportedFile[]> {
  const results: ImportedFile[] = [];

  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject)
    );
    const path = basePath ? `${basePath}/${entry.name}` : entry.name;
    results.push({ path, file });
  } else if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntry;
    const reader = dir.createReader();
    const dirPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    // readEntries คืนสูงสุด 100 entries ต่อครั้ง — ต้อง loop จนหมด
    let batch: FileSystemEntry[] = [];
    do {
      batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject)
      );
      for (const child of batch) {
        const sub = await readEntry(child, dirPath);
        results.push(...sub);
      }
    } while (batch.length > 0);
  }

  return results;
}

/** อ่านไฟล์ทั้งหมดจาก DataTransfer (drag & drop) */
export async function readDroppedItems(
  dataTransfer: DataTransfer
): Promise<ImportedFile[]> {
  const results: ImportedFile[] = [];

  // ใช้ items API (รองรับโฟลเดอร์)
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const entries: FileSystemEntry[] = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = dataTransfer.items[i] as any;
      const entry: FileSystemEntry | null =
        typeof item.getAsEntry === 'function'
          ? item.getAsEntry()
          : typeof item.webkitGetAsEntry === 'function'
          ? item.webkitGetAsEntry()
          : null;
      if (entry) entries.push(entry);
    }
    for (const entry of entries) {
      const sub = await readEntry(entry, '');
      results.push(...sub);
    }
    return results;
  }

  // Fallback: files API (รองรับแค่ไฟล์เดี่ยว)
  if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      results.push({ path: file.name, file });
    }
  }

  return results;
}

// ─── Content type helpers ─────────────────────────────────────

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','webp','svg','ico','bmp','avif']);
const TEXT_EXTS  = new Set([
  'html','htm','css','js','ts','jsx','tsx','py','c','cpp','h','hpp',
  'txt','md','json','xml','yaml','yml','toml','sh','bash',
]);

export function isImage(filename: string): boolean {
  return IMAGE_EXTS.has(filename.split('.').pop()?.toLowerCase() ?? '');
}

export function isTextFile(filename: string): boolean {
  return TEXT_EXTS.has(filename.split('.').pop()?.toLowerCase() ?? '');
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html', htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript', jsx: 'application/javascript',
    ts: 'application/typescript', tsx: 'application/typescript',
    py: 'text/x-python',
    c: 'text/x-csrc', h: 'text/x-csrc',
    cpp: 'text/x-c++src', hpp: 'text/x-c++src',
    json: 'application/json',
    md: 'text/markdown',
    txt: 'text/plain',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** ตรวจสอบประเภทโปรเจกต์จากชื่อไฟล์ */
export function detectLanguage(
  files: ImportedFile[]
): 'html' | 'python' | 'c' | 'cpp' | 'blank' {
  const names = files.map((f) => f.file.name.toLowerCase());
  if (names.some((n) => n.endsWith('.html') || n.endsWith('.htm'))) return 'html';
  if (names.some((n) => n.endsWith('.py'))) return 'python';
  if (names.some((n) => n.endsWith('.cpp') || n.endsWith('.cc'))) return 'cpp';
  if (names.some((n) => n.endsWith('.c'))) return 'c';
  return 'blank';
}
