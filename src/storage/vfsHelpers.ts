import { db, ProjectFile, ProjectAsset } from './db';

export interface VFS {
  files: Record<string, { content: string; mimeType: string }>;
  assets: Record<string, { buffer: ArrayBuffer; mimeType: string }>;
}

export async function loadVFS(projectId: string): Promise<VFS> {
  const files = await db.files.where('project_id').equals(projectId).toArray();
  const assets = await db.assets.where('project_id').equals(projectId).toArray();
  const vfs: VFS = { files: {}, assets: {} };
  for (const f of files) {
    vfs.files[f.filename] = { content: f.content, mimeType: f.mime_type };
  }
  for (const a of assets) {
    vfs.assets[a.name] = { buffer: a.buffer, mimeType: a.mime_type };
  }
  return vfs;
}

export async function saveVFSFile(
  projectId: string,
  filename: string,
  content: string,
  mimeType: string
): Promise<void> {
  const record: ProjectFile = {
    project_id: projectId,
    filename,
    content,
    mime_type: mimeType,
    is_dirty: true,
    updated_at: Date.now(),
  };
  await db.files.put(record);
  await db.projects.update(projectId, { updated_at: Date.now() });
}

export async function saveVFSAsset(
  projectId: string,
  name: string,
  buffer: ArrayBuffer,
  mimeType: string
): Promise<void> {
  const record: ProjectAsset = {
    project_id: projectId,
    name,
    buffer,
    mime_type: mimeType,
    size: buffer.byteLength,
    is_dirty: true,
  };
  await db.assets.put(record);
}

export async function deleteVFSFile(
  projectId: string,
  filename: string
): Promise<void> {
  await db.files.delete([projectId, filename]);
}

export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'application/typescript',
    jsx: 'application/javascript',
    tsx: 'application/typescript',
    py: 'text/x-python',
    c: 'text/x-csrc',
    cpp: 'text/x-c++src',
    txt: 'text/plain',
    md: 'text/markdown',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return map[ext] ?? 'text/plain';
}

export function getMonacoLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'html',
    css: 'css',
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    c: 'c',
    cpp: 'cpp',
    json: 'json',
    md: 'markdown',
    txt: 'plaintext',
  };
  return map[ext] ?? 'plaintext';
}

export function isTextFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'c', 'cpp', 'txt', 'md', 'json', 'svg'].includes(ext);
}

export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
}
