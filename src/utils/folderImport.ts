/**
 * folderImport.ts
 * อ่าน DataTransfer items แบบ recursive รองรับทั้งไฟล์และโฟลเดอร์
 */

export interface ImportedFile {
  /** relative path เช่น "picture/photo.jpg" หรือ "script.js" */
  path: string;
  file: File;
}

// ─── Internal: อ่านเนื้อหา DirectoryEntry แบบ recursive ──────

async function readDirectoryContents(
  dir: FileSystemDirectoryEntry,
  basePath: string,
  results: ImportedFile[]
): Promise<void> {
  const reader = dir.createReader();
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    for (const entry of batch) {
      const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isFile) {
        const file = await new Promise<File>((resolve, reject) =>
          (entry as FileSystemFileEntry).file(resolve, reject)
        );
        results.push({ path: entryPath, file });
      } else if (entry.isDirectory) {
        await readDirectoryContents(entry as FileSystemDirectoryEntry, entryPath, results);
      }
    }
  } while (batch.length > 0);
}

// ─── Public API ───────────────────────────────────────────────

/**
 * อ่านไฟล์ทั้งหมดจาก DataTransfer (drag & drop)
 * - Drop โฟลเดอร์เดียว → ตัด root folder name ออก
 *   เช่น "Kantapon2030.github.io-main/data.js" → "data.js"
 *   และ "Kantapon2030.github.io-main/picture/a.jpg" → "picture/a.jpg"
 * - Drop หลายไฟล์/โฟลเดอร์ → เก็บ path ตามปกติ
 */
export async function readDroppedItems(
  dataTransfer: DataTransfer
): Promise<ImportedFile[]> {
  const results: ImportedFile[] = [];

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

    if (entries.length === 1 && entries[0].isDirectory) {
      // Drop โฟลเดอร์เดียว → อ่านเนื้อหาโดยไม่รวมชื่อ root folder
      await readDirectoryContents(entries[0] as FileSystemDirectoryEntry, '', results);
    } else {
      // Drop หลายไฟล์/โฟลเดอร์
      for (const entry of entries) {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve, reject) =>
            (entry as FileSystemFileEntry).file(resolve, reject)
          );
          results.push({ path: entry.name, file });
        } else if (entry.isDirectory) {
          // หลายโฟลเดอร์ → เก็บชื่อโฟลเดอร์ย่อยไว้ เช่น picture/photo.jpg
          await readDirectoryContents(entry as FileSystemDirectoryEntry, entry.name, results);
        }
      }
    }
    return results;
  }

  // Fallback: files API (ไม่รองรับโฟลเดอร์ใน Firefox)
  if (dataTransfer.files) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i];
      // webkitRelativePath = "folder/sub/file.js" → ตัด root folder ออก
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      const path = rel ? rel.split('/').slice(1).join('/') || file.name : file.name;
      results.push({ path, file });
    }
  }

  return results;
}

// ─── Content-type helpers ─────────────────────────────────────

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','webp','ico','bmp','avif']);
const TEXT_EXTS  = new Set([
  'html','htm','css','js','ts','jsx','tsx','py','c','cpp','h','hpp',
  'txt','md','json','xml','yaml','yml','toml','sh','bash','svg',
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
