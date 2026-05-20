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
  filename: string;
  content: string;
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

export class NextcodeDB extends Dexie {
  projects!: Table<Project>;
  files!: Table<ProjectFile>;
  assets!: Table<ProjectAsset>;
  snapshots!: Table<Snapshot>;
  settings!: Table<Setting>;
  terminal_history!: Table<TerminalHistoryEntry>;

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
  }
}

export const db = new NextcodeDB();

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

export async function deleteProjectData(projectId: string): Promise<void> {
  await db.files.where('project_id').equals(projectId).delete();
  await db.assets.where('project_id').equals(projectId).delete();
  await db.snapshots.where('project_id').equals(projectId).delete();
  await db.terminal_history.where('project_id').equals(projectId).delete();
  await db.projects.delete(projectId);
}
