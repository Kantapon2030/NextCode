import type { Project } from '../store/appStore';
import { db } from '../storage/db';

const GIST_FILENAME = 'nextcode-data.json';
const GIST_DESC     = 'Nextcode IDE — Project Storage';

export interface GistData {
  version:  number;
  projects: SerializedProject[];
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
    content:  string;
    mime_type: string;
  }>;
}

// หา Gist ของ Nextcode หรือสร้างใหม่
export async function getOrCreateGist(
  token: string
): Promise<string> {

  // ตรวจ cache
  const cached = localStorage.getItem('gh_gist_id');
  if (cached) return cached;

  // ค้นหา Gist ที่มีอยู่แล้ว
  const res = await fetch(
    'https://api.github.com/gists?per_page=100',
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  );
  const gists = await res.json();
  const existing = gists.find(
    (g: any) =>
      g.description === GIST_DESC &&
      g.files[GIST_FILENAME]
  );

  if (existing) {
    localStorage.setItem('gh_gist_id', existing.id);
    return existing.id;
  }

  // สร้าง Gist ใหม่
  const create = await fetch(
    'https://api.github.com/gists',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: GIST_DESC,
        public:      false,       // private gist
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify({
              version:   1,
              projects:  [],
              updatedAt: Date.now(),
            } as GistData, null, 2),
          },
        },
      }),
    }
  );
  const newGist = await create.json();
  localStorage.setItem('gh_gist_id', newGist.id);
  return newGist.id;
}

// โหลดข้อมูลทั้งหมดจาก Gist
export async function loadFromGist(
  token: string,
  gistId: string
): Promise<GistData> {
  const res = await fetch(
    `https://api.github.com/gists/${gistId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Cache-Control': 'no-cache',
      },
    }
  );
  const gist = await res.json();
  const raw  = gist.files[GIST_FILENAME]?.content ?? '{}';
  return JSON.parse(raw) as GistData;
}

// บันทึกข้อมูลทั้งหมดลง Gist
export async function saveToGist(
  token:  string,
  gistId: string,
  data:   GistData
): Promise<void> {
  await fetch(
    `https://api.github.com/gists/${gistId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          [GIST_FILENAME]: {
            content: JSON.stringify(
              { ...data, updatedAt: Date.now() },
              null, 2
            ),
          },
        },
      }),
    }
  );
}

// helper: merge local + cloud (cloud wins ถ้า newer)
export function mergeProjects(
  local: SerializedProject[],
  cloud: SerializedProject[]
): SerializedProject[] {
  const map = new Map<string, SerializedProject>();

  // ใส่ local ก่อน
  local.forEach(p => map.set(p.id, p));

  // cloud overwrite ถ้า updatedAt ใหม่กว่า
  cloud.forEach(p => {
    const existing = map.get(p.id);
    if (!existing || p.updatedAt > existing.updatedAt) {
      map.set(p.id, p);
    }
  });

  return Array.from(map.values())
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function loadLocalProjects(): Promise<SerializedProject[]> {
  const projs = await db.projects.toArray();
  const allFiles = await db.files.toArray();
  
  return projs.map(p => {
    const projFiles = allFiles.filter(f => f.project_id === p.id && f.type === 'file' && f.content !== undefined);
    const filesRecord: Record<string, { content: string, mime_type: string }> = {};
    for (const f of projFiles) {
      filesRecord[f.path] = { content: f.content as string, mime_type: f.mime_type ?? 'text/plain' };
    }
    return {
      id: p.id,
      name: p.name,
      language: p.language,
      template: p.template,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      files: filesRecord
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
    updated_at: sp.updatedAt
  };
  await db.projects.put(p);
  
  // ลบไฟล์ใน Local ที่ไม่มีในคลาวด์ (ป้องกันไฟล์ผีที่ลบไปแล้วเด้งกลับมาหลัง Sync)
  const localFiles = await db.files.where({ project_id: sp.id }).toArray();
  const localPaths = localFiles.filter(f => f.type === 'file').map(f => f.path);
  const cloudPaths = new Set(Object.keys(sp.files));

  for (const path of localPaths) {
    if (!cloudPaths.has(path)) {
      await db.files.delete([sp.id, path]);
    }
  }
  
  for (const [path, fileData] of Object.entries(sp.files)) {
    const existingCollection = db.files.where({ project_id: sp.id, path });
    const existing = await existingCollection.first();
    if (existing) {
       await db.files.where({ project_id: sp.id, path }).modify({ content: fileData.content, mime_type: fileData.mime_type, updated_at: sp.updatedAt });
    } else {
       await db.files.add({
         project_id: sp.id,
         path,
         name: path.split('/').pop() || '',
         parent_path: path.split('/').slice(0, -1).join('/'),
         type: 'file',
         content: fileData.content,
         mime_type: fileData.mime_type,
         is_dirty: false,
         updated_at: sp.updatedAt
       });
    }
  }
  return p;
}

export async function serializeProject(p: Project): Promise<SerializedProject> {
  const allFiles = await db.files.where({ project_id: p.id }).toArray();
  const projFiles = allFiles.filter(f => f.type === 'file' && f.content !== undefined);
  const filesRecord: Record<string, { content: string, mime_type: string }> = {};
  for (const f of projFiles) {
    filesRecord[f.path] = { content: f.content as string, mime_type: f.mime_type ?? 'text/plain' };
  }
  return {
    id: p.id,
    name: p.name,
    language: p.language,
    template: p.template,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    files: filesRecord
  };
}


