import type { Project } from '../store/appStore';
import { db } from '../storage/db';

export interface GistData {
  version:   number;
  projects:  SerializedProject[];
  updatedAt: number;
}

export interface SerializedProject {
  id:        string;
  name:      string;
  language:  string;
  template:  string;
  createdAt: number;
  updatedAt: number;
  files:     Record<string, {
    content:   string;
    mime_type: string;
    encoding?: 'base64';
  }>;
}

export function areProjectListsEqual(a: SerializedProject[], b: SerializedProject[]): boolean {
  if (a.length !== b.length) return false;
  const sortA = [...a].sort((x, y) => x.id.localeCompare(y.id));
  const sortB = [...b].sort((x, y) => x.id.localeCompare(y.id));
  
  for (let i = 0; i < sortA.length; i++) {
    const projA = sortA[i];
    const projB = sortB[i];
    if (projA.id !== projB.id) return false;
    if (projA.updatedAt !== projB.updatedAt) return false;
    if (projA.name !== projB.name) return false;
    if (projA.language !== projB.language) return false;
    if (projA.template !== projB.template) return false;
  }
  return true;
}

// helper: merge local + cloud (cloud wins ถ้า newer, จัดการการลบและการสร้างโดยเทียบจาก timestamp ซิงก์ล่าสุด)
export function mergeProjects(
  local: SerializedProject[],
  cloud: SerializedProject[],
  localLastSyncTime: number,
  cloudStorageUpdatedAt: number
): SerializedProject[] {
  const map = new Map<string, SerializedProject>();

  // 1. ใส่ local เข้า map ก่อน
  local.forEach((p) => map.set(p.id, p));

  // 2. พิจารณาโปรเจกต์จาก cloud
  cloud.forEach((p) => {
    const existing = map.get(p.id);
    if (existing) {
      // ถ้ามีทั้งคู่ ให้เลือกตัวที่ updatedAt ใหม่กว่า
      if (p.updatedAt > existing.updatedAt) {
        map.set(p.id, p);
      }
    } else {
      // มีอยู่บน cloud แต่ไม่มีอยู่ใน local
      // ตรวจสอบว่าโดนลบออกไปใน local หรือเพิ่งถูกสร้างขึ้นบน cloud จากเครื่องอื่น
      if (p.updatedAt > localLastSyncTime) {
        map.set(p.id, p);
      }
    }
  });

  // 3. พิจารณาโปรเจกต์ local ที่ไม่มีอยู่บน cloud
  const cloudIds = new Set(cloud.map((p) => p.id));
  local.forEach((p) => {
    if (!cloudIds.has(p.id)) {
      if (p.updatedAt < cloudStorageUpdatedAt) {
        // แก้ไขก่อนเวลาอัปเดตคลาวด์ล่าสุดแต่ไม่มีในคลาวด์ -> แสดงว่าถูกลบในคลาวด์จากเครื่องอื่น
        map.delete(p.id);
      }
    }
  });

  return Array.from(map.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function loadLocalProjects(): Promise<SerializedProject[]> {
  const projs = await db.projects.toArray();
  const allFiles = await db.files.toArray();
  
  return projs.map((p) => {
    const projFiles = allFiles.filter((f) => f.project_id === p.id && f.type === 'file' && f.content !== undefined);
    const filesRecord: Record<string, { content: string; mime_type: string; encoding?: 'base64' }> = {};
    for (const f of projFiles) {
      if (f.content instanceof ArrayBuffer) {
        filesRecord[f.path] = {
          content: arrayBufferToBase64(f.content),
          mime_type: f.mime_type ?? 'application/octet-stream',
          encoding: 'base64',
        };
      } else {
        filesRecord[f.path] = {
          content: (f.content as string) || '',
          mime_type: f.mime_type ?? 'text/plain',
        };
      }
    }
    return {
      id: p.id,
      name: p.name,
      language: p.language,
      template: p.template,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      files: filesRecord,
    };
  });
}

export async function saveProjectToLocal(sp: SerializedProject): Promise<Project> {
  const p: Project = {
    id: sp.id,
    name: sp.name,
    language: sp.language as any,
    template: sp.template,
    created_at: sp.createdAt,
    updated_at: sp.updatedAt,
  };
  await db.projects.put(p);
  
  // ลบไฟล์ใน Local ที่ไม่มีในคลาวด์
  const localFiles = await db.files.where({ project_id: sp.id }).toArray();
  const localPaths = localFiles.filter((f) => f.type === 'file').map((f) => f.path);
  const cloudPaths = new Set(Object.keys(sp.files));

  for (const path of localPaths) {
    if (!cloudPaths.has(path)) {
      await db.files.delete([sp.id, path]);
    }
  }
  
  for (const [path, fileData] of Object.entries(sp.files)) {
    const existingCollection = db.files.where({ project_id: sp.id, path });
    const existing = await existingCollection.first();
    
    let contentToSave: string | ArrayBuffer = '';
    if (typeof fileData.content === 'object' && fileData.content !== null) {
      contentToSave = new ArrayBuffer(0);
    } else if (fileData.encoding === 'base64') {
      try {
        contentToSave = base64ToArrayBuffer(fileData.content);
      } catch (err) {
        console.error('Failed to decode base64 file:', path, err);
        contentToSave = new ArrayBuffer(0);
      }
    } else {
      contentToSave = fileData.content || '';
    }

    if (existing) {
       await db.files.where({ project_id: sp.id, path }).modify({
         content: contentToSave,
         mime_type: fileData.mime_type,
         updated_at: sp.updatedAt,
       });
    } else {
       await db.files.add({
         project_id: sp.id,
         path,
         name: path.split('/').pop() || '',
         parent_path: path.split('/').slice(0, -1).join('/'),
         type: 'file',
         content: contentToSave,
         mime_type: fileData.mime_type,
         is_dirty: false,
         updated_at: sp.updatedAt,
       });
    }
  }
  return p;
}

export async function serializeProject(p: Project): Promise<SerializedProject> {
  const allFiles = await db.files.where({ project_id: p.id }).toArray();
  const projFiles = allFiles.filter((f) => f.type === 'file' && f.content !== undefined);
  const filesRecord: Record<string, { content: string; mime_type: string; encoding?: 'base64' }> = {};
  for (const f of projFiles) {
    if (f.content instanceof ArrayBuffer) {
      filesRecord[f.path] = {
        content: arrayBufferToBase64(f.content),
        mime_type: f.mime_type ?? 'application/octet-stream',
        encoding: 'base64',
      };
    } else {
      filesRecord[f.path] = {
        content: (f.content as string) || '',
        mime_type: f.mime_type ?? 'text/plain',
      };
    }
  }
  return {
    id: p.id,
    name: p.name,
    language: p.language,
    template: p.template,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    files: filesRecord,
  };
}
