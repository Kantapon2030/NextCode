import Dexie, { Table } from 'dexie';

export interface Project {
  id: string;
  name: string;
  language: 'html' | 'python' | 'c' | 'cpp' | 'blank';
  template: string;
  created_at: number;
  updated_at: number;
  drive_folder_id?: string;
}

export interface ProjectFile {
  project_id: string;
  path: string;
  name: string;
  parent_path: string;
  type: 'file' | 'folder';
  content?: string | ArrayBuffer | null;
  mime_type: string;
  drive_file_id?: string;
  is_dirty: boolean;
  updated_at: number;
}

export interface ProjectAsset {
  project_id: string;
  name: string;
  buffer: ArrayBuffer;
  mime_type: string;
  size: number;
  drive_file_id?: string;
  is_dirty: boolean;
}

export interface Snapshot {
  id?: number;
  project_id: string;
  timestamp: number;
  label?: string;
  type: 'auto' | 'manual' | 'pre-ai';
  files: Record<string, string>;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface TerminalHistoryEntry {
  id?: number;
  project_id: string;
  timestamp: number;
  type: 'log' | 'error' | 'warn' | 'output';
  content: string;
}

export interface CustomSnippet {
  id?: number;
  trigger: string;
  label: string;
  description: string;
  body: string;
  language: string[];
  createdAt: number;
}

export interface DeployHistory {
  id?: number;
  project_id: string;
  url: string;
  deploy_id: string;
  provider: 'netlify' | 'vercel';
  deployed_at: number;
}

export interface TerminalRunHistoryEntry {
  id?: number;
  project_id: string;
  timestamp: number;
  input: string;
}

export class NextcodeDB extends Dexie {
  projects!: Table<Project>;
  files!: Table<ProjectFile>;
  assets!: Table<ProjectAsset>;
  snapshots!: Table<Snapshot>;
  settings!: Table<Setting>;
  terminal_history!: Table<TerminalHistoryEntry>;
  custom_snippets!: Table<CustomSnippet>;
  deploy_history!: Table<DeployHistory>;
  terminal_run_history!: Table<TerminalRunHistoryEntry>;

  constructor() {
    super('NextcodeIDE_v1');
    this.version(1).stores({
      projects: '&id, name, language, template, created_at, updated_at, drive_folder_id',
      files: '&[project_id+filename], project_id, filename, is_dirty, updated_at',
      assets: '&[project_id+name], project_id, name, is_dirty',
      snapshots: '++id, project_id, timestamp, type',
      settings: '&key',
      terminal_history: '++id, project_id, timestamp, type',
    });
    // v2: add custom_snippets table
    this.version(2).stores({
      projects: '&id, name, language, template, created_at, updated_at, drive_folder_id',
      files: '&[project_id+filename], project_id, filename, is_dirty, updated_at',
      assets: '&[project_id+name], project_id, name, is_dirty',
      snapshots: '++id, project_id, timestamp, type',
      settings: '&key',
      terminal_history: '++id, project_id, timestamp, type',
      custom_snippets: '++id, trigger, language, createdAt',
    });
    // v3: Delete old files & assets tables and copy data to filesTemp
    this.version(3).stores({
      projects: '&id, name, language, template, created_at, updated_at, drive_folder_id',
      files: null,
      assets: null,
      filesTemp: '&[project_id+path], project_id, path, name, parent_path, type, drive_file_id, is_dirty, updated_at, [project_id+parent_path]',
      snapshots: '++id, project_id, timestamp, type',
      settings: '&key',
      terminal_history: '++id, project_id, timestamp, type',
      custom_snippets: '++id, trigger, language, createdAt',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).upgrade(async (tx: any) => {
      const oldFiles = await tx.table('files').toArray();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tempRecords: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const f of oldFiles) {
        const path = f.filename || f.path || '';
        const parts = path.split('/').filter(Boolean);
        const name = parts[parts.length - 1] || '';
        const parent_path = parts.slice(0, parts.length - 1).join('/');
        tempRecords.push({
          project_id: f.project_id,
          path,
          name,
          parent_path,
          type: f.type || 'file',
          content: f.content,
          mime_type: f.mime_type || '',
          drive_file_id: f.drive_file_id || '',
          is_dirty: f.is_dirty || false,
          updated_at: f.updated_at || Date.now(),
        });
      }

      const oldAssets = await tx.table('assets').toArray();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const a of oldAssets) {
        const path = a.name || '';
        const parts = path.split('/').filter(Boolean);
        const name = parts[parts.length - 1] || '';
        const parent_path = parts.slice(0, parts.length - 1).join('/');
        tempRecords.push({
          project_id: a.project_id,
          path,
          name,
          parent_path,
          type: 'file',
          content: a.buffer,
          mime_type: a.mime_type || '',
          drive_file_id: a.drive_file_id || '',
          is_dirty: a.is_dirty || false,
          updated_at: Date.now(),
        });
      }

      await tx.table('filesTemp').bulkAdd(tempRecords);
    });

    // v4: Recreate original files table with the new schema and restore data from filesTemp
    this.version(4).stores({
      projects: '&id, name, language, template, created_at, updated_at, drive_folder_id',
      files: '&[project_id+path], project_id, path, name, parent_path, type, drive_file_id, is_dirty, updated_at, [project_id+parent_path]',
      filesTemp: null,
      snapshots: '++id, project_id, timestamp, type',
      settings: '&key',
      terminal_history: '++id, project_id, timestamp, type',
      custom_snippets: '++id, trigger, language, createdAt',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).upgrade(async (tx: any) => {
      const tempFiles = await tx.table('filesTemp').toArray();
      await tx.table('files').bulkAdd(tempFiles);
    });

    // v5: Add deploy_history table
    this.version(5).stores({
      projects: '&id, name, language, template, created_at, updated_at, drive_folder_id',
      files: '&[project_id+path], project_id, path, name, parent_path, type, drive_file_id, is_dirty, updated_at, [project_id+parent_path]',
      snapshots: '++id, project_id, timestamp, type',
      settings: '&key',
      terminal_history: '++id, project_id, timestamp, type',
      custom_snippets: '++id, trigger, language, createdAt',
      deploy_history: '++id, project_id, provider, deployed_at',
    });

    // v6: Add terminal_run_history table
    this.version(6).stores({
      projects: '&id, name, language, template, created_at, updated_at, drive_folder_id',
      files: '&[project_id+path], project_id, path, name, parent_path, type, drive_file_id, is_dirty, updated_at, [project_id+parent_path]',
      snapshots: '++id, project_id, timestamp, type',
      settings: '&key',
      terminal_history: '++id, project_id, timestamp, type',
      custom_snippets: '++id, trigger, language, createdAt',
      deploy_history: '++id, project_id, provider, deployed_at',
      terminal_run_history: '++id, project_id, timestamp',
    });
  }
}

export const db = new NextcodeDB();

// Handle schema/version/upgrade errors by deleting database and reloading
db.open().catch(async (err) => {
  console.error('Failed to open IndexedDB:', err);
  if (
    err.name === 'VersionError' ||
    err.name === 'UpgradeError' ||
    err.name === 'SchemaError' ||
    err.message?.includes('Version') ||
    err.message?.includes('upgrade')
  ) {
    console.warn('Schema mismatch or version error. Deleting database to recover...');
    try {
      await Dexie.delete('NextcodeIDE_v1');
      window.location.reload();
    } catch (deleteErr) {
      console.error('Failed to delete database:', deleteErr);
    }
  }
});

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const s = await db.settings.get(key);
  return s !== undefined ? (s.value as T) : defaultValue;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  return db.files.where('project_id').equals(projectId).toArray();
}

export async function getProjectAssets(projectId: string): Promise<ProjectAsset[]> {
  return db.assets.where('project_id').equals(projectId).toArray();
}

export async function saveFile(file: ProjectFile): Promise<void> {
  await db.files.put(file);
}

// ──────────────────────────────────────────────────────────────────────────────
// BUG 3 FIX: deleteProjectData ใช้ compound key [project_id+path] ถูกต้อง
// ข้อสำคัญ: primary key ของ files คือ [project_id+path]
// ต้องใช้ where('project_id').equals() ซึ่ง Dexie รองรับ secondary index
// ──────────────────────────────────────────────────────────────────────────────

export async function deleteProjectFiles(projectId: string): Promise<void> {
  const allFiles = await db.files
    .where('[project_id+path]')
    .between(
      [projectId, Dexie.minKey],
      [projectId, Dexie.maxKey]
    )
    .toArray();

  await Promise.all(
    allFiles.map(f =>
      db.files
        .where('[project_id+path]')
        .equals([f.project_id, f.path])
        .delete()
    )
  );
}

export async function deleteProjectSnapshots(projectId: string): Promise<void> {
  await db.snapshots
    .where('project_id')
    .equals(projectId)
    .delete();
}

export async function deleteProjectFromDB(projectId: string): Promise<void> {
  await deleteProjectFiles(projectId);
  await deleteProjectSnapshots(projectId);
  if (db.terminal_history) {
    await db.terminal_history.where('project_id').equals(projectId).delete();
  }
  await db.projects.delete(projectId);
}



export async function getTerminalHistory(projectId: string): Promise<TerminalRunHistoryEntry[]> {
  if (!db.terminal_run_history) return [];
  return db.terminal_run_history
    .where('project_id')
    .equals(projectId)
    .reverse()
    .sortBy('timestamp');
}

export async function saveTerminalHistory(projectId: string, input: string): Promise<void> {
  if (!db.terminal_run_history) return;
  
  // avoid duplicate recent inputs
  const existing = await db.terminal_run_history
    .where('project_id')
    .equals(projectId)
    .toArray();
  
  const isDuplicate = existing.some(h => h.input.trim() === input.trim());
  if (isDuplicate) return;

  await db.terminal_run_history.add({
    project_id: projectId,
    timestamp: Date.now(),
    input
  });
}
