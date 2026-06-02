import { db } from '../storage/db';
import { useAppStore } from '../store/appStore';
import { getGitHubToken } from './githubAuth';
import {
  saveToGist, serializeProject, loadFromGist, loadLocalProjects,
  mergeProjects, saveProjectToLocal, getOrCreateGist
} from './gistStorage';
import { getOrCreateDriveFile, saveToDrive, loadFromDrive } from './googleDriveStorage';

export interface SyncConflict {
  projectId: string;
  projectName: string;
  localProject: any;
  cloudProject: any;
}

// ซิงก์แบบบังคับ (Force Sync): ดึงจากคลาวด์มาผสาน แล้วเซฟขึ้นคลาวด์ทันที
export async function forceCloudSync(
  onConflictDetected?: (conflicts: SyncConflict[]) => Promise<Record<string, 'local' | 'cloud'>>
): Promise<void> {
  const store = useAppStore.getState();
  const { accessToken, setSyncStatus } = store;

  const localProjects = await loadLocalProjects();
  const localLastSyncTime = parseInt(localStorage.getItem('nextcode_last_sync_time') || '0', 10);

  let cloudProjects: any[] = [];
  let cloudStorageUpdatedAt = 0;

  // 1. ดึงข้อมูลจากคลาวด์
  if (accessToken) {
    setSyncStatus('syncing');
    const fileId = await getOrCreateDriveFile(accessToken);
    if (fileId) {
      const data = await loadFromDrive(accessToken, fileId);
      cloudProjects = data.projects || [];
      cloudStorageUpdatedAt = data.updatedAt || 0;
    }
  } else {
    const token = getGitHubToken();
    if (!token) {
      setSyncStatus('local');
      return;
    }
    setSyncStatus('syncing');
    const gistId = await getOrCreateGist(token);
    if (gistId) {
      const data = await loadFromGist(token, gistId);
      cloudProjects = data.projects || [];
      cloudStorageUpdatedAt = data.updatedAt || 0;
    }
  }

  // 2. ตรวจสอบความขัดแย้ง (Conflict Detection)
  const conflicts: SyncConflict[] = [];
  const localMap = new Map<string, any>();
  localProjects.forEach(p => localMap.set(p.id, p));

  cloudProjects.forEach(p => {
    const existing = localMap.get(p.id);
    if (existing) {
      const localChanged = existing.updatedAt > localLastSyncTime;
      const cloudChanged = p.updatedAt > localLastSyncTime;
      if (localChanged && cloudChanged && existing.updatedAt !== p.updatedAt) {
        conflicts.push({
          projectId: p.id,
          projectName: p.name,
          localProject: existing,
          cloudProject: p
        });
      }
    }
  });

  let resolutions: Record<string, 'local' | 'cloud'> = {};
  if (conflicts.length > 0 && onConflictDetected) {
    resolutions = await onConflictDetected(conflicts);
  }

  // 3. ผสานข้อมูล (Merge)
  // ปรับแต่งค่าความขัดแย้งตามตัวเลือกของผู้ใช้ใน resolution
  const resolvedLocal = localProjects.map(lp => {
    const res = resolutions[lp.id];
    if (res === 'cloud') {
      // ทำลายความเป็น local เพื่อให้ cloud ชนะ
      return { ...lp, updatedAt: 0 };
    }
    if (res === 'local') {
      // ทำลายความเป็น cloud เพื่อให้ local ชนะ
      return { ...lp, updatedAt: Date.now() };
    }
    return lp;
  });

  const resolvedCloud = cloudProjects.map(cp => {
    const res = resolutions[cp.id];
    if (res === 'local') {
      return { ...cp, updatedAt: 0 };
    }
    if (res === 'cloud') {
      return { ...cp, updatedAt: Date.now() };
    }
    return cp;
  });

  const merged = mergeProjects(resolvedLocal, resolvedCloud, localLastSyncTime, cloudStorageUpdatedAt);

  // 4. บันทึกลงเครื่อง (Save to Local DB)
  const finalProjs = [];
  for (const sp of merged) {
    const p = await saveProjectToLocal(sp);
    finalProjs.push(p);
  }

  // 5. บันทึกขึ้นคลาวด์ (Save to Cloud)
  const serialized = [];
  for (const p of finalProjs) {
    serialized.push(await serializeProject(p));
  }

  const now = Date.now();
  if (accessToken) {
    const fileId = await getOrCreateDriveFile(accessToken);
    await saveToDrive(accessToken, fileId, {
      version: 1,
      projects: serialized,
      updatedAt: now,
    });
  } else {
    const token = getGitHubToken();
    if (token) {
      const gistId = await getOrCreateGist(token);
      await saveToGist(token, gistId, {
        version: 1,
        projects: serialized,
        updatedAt: now,
      });
    }
  }

  setSyncStatus('synced');
  localStorage.setItem('nextcode_last_sync_time', now.toString());
}
