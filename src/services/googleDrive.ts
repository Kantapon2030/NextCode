import { retryWithBackoff, canMakeDriveRequest, recordDriveRequest } from '../storage/syncManager';
import { VFSNode } from '../types';
import { saveVFSFile, saveVFSFolder } from '../storage/vfsHelpers';

const FOLDER_NAME = 'Nextcode-IDE';

async function driveRequest(
  url: string,
  options: RequestInit,
  token: string
): Promise<Response> {
  if (!canMakeDriveRequest()) throw new Error('RATE_LIMIT');
  recordDriveRequest();
  const res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error('TOKEN_EXPIRED');
  if (!res.ok) throw new Error(`Drive error: ${res.status}`);
  return res;
}

export async function findOrCreateFolder(
  name: string,
  parentId: string | null,
  token: string
): Promise<string> {
  return retryWithBackoff(async () => {
    const parentQuery = parentId
      ? ` and '${parentId}' in parents`
      : ` and 'root' in parents`;
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false${parentQuery}`;
    const res = await driveRequest(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
      { method: 'GET' },
      token
    );
    const data = await res.json();
    if (data.files?.length > 0) return data.files[0].id;
    const meta = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : ['root'],
    };
    const createRes = await driveRequest(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) },
      token
    );
    const created = await createRes.json();
    return created.id;
  });
}

export async function uploadTextFile(
  name: string,
  content: string | ArrayBuffer,
  mimeType: string,
  parentId: string,
  token: string,
  existingFileId?: string
): Promise<string> {
  return retryWithBackoff(async () => {
    if (existingFileId) {
      const res = await driveRequest(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&fields=id`,
        { method: 'PATCH', headers: { 'Content-Type': mimeType }, body: content },
        token
      );
      return (await res.json()).id;
    }
    const boundary = 'nextcode_boundary_xyz';
    const header = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--`;
    const body = new Blob([header, content, footer], { type: `multipart/related; boundary="${boundary}"` });
    const res = await driveRequest(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body,
      },
      token
    );
    return (await res.json()).id;
  });
}

export async function readFileContent(fileId: string, token: string): Promise<string> {
  return retryWithBackoff(async () => {
    const res = await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { method: 'GET' },
      token
    );
    return res.text();
  });
}

export async function deleteFile(fileId: string, token: string): Promise<void> {
  return retryWithBackoff(async () => {
    await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      { method: 'DELETE' },
      token
    );
  });
}

export async function ensureRootFolder(token: string): Promise<string> {
  return findOrCreateFolder(FOLDER_NAME, null, token);
}

export async function createProjectFolder(
  projectName: string,
  projectId: string,
  token: string
): Promise<string> {
  const root = await ensureRootFolder(token);
  const folderName = `${projectName}-${projectId.slice(0, 6)}`;
  return findOrCreateFolder(folderName, root, token);
}

export async function renameDriveFileOrFolder(
  fileId: string,
  newName: string,
  token: string
): Promise<void> {
  return retryWithBackoff(async () => {
    await driveRequest(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      },
      token
    );
  });
}

export async function ensureDriveFolder(
  path: string,
  parentDriveFolderId: string,
  token: string
): Promise<string> {
  const parts = path.split('/').filter(Boolean);
  let currentFolderId = parentDriveFolderId;
  for (const part of parts) {
    currentFolderId = await findOrCreateFolder(part, currentFolderId, token);
  }
  return currentFolderId;
}

export async function syncTreeToDrive(
  projectId: string,
  token: string,
  projectDriveFolderId: string,
  tree: Record<string, VFSNode>
): Promise<void> {
  async function syncNode(node: VFSNode, parentDriveFolderId: string) {
    if (node.type === 'folder') {
      let folderId = node.driveFolderId;
      if (!folderId) {
        folderId = await findOrCreateFolder(node.name, parentDriveFolderId, token);
        node.driveFolderId = folderId;
        await saveVFSFolder(projectId, node.path, folderId, false);
      } else if (node.isDirty) {
        await renameDriveFileOrFolder(folderId, node.name, token);
        node.isDirty = false;
        await saveVFSFolder(projectId, node.path, folderId, false);
      }

      if (node.children) {
        for (const childName in node.children) {
          await syncNode(node.children[childName], folderId);
        }
      }
    } else {
      let fileId = node.driveFileId;
      const content = node.content ?? '';
      const mimeType = node.mimeType || 'text/plain';

      if (!fileId) {
        fileId = await uploadTextFile(node.name, content, mimeType, parentDriveFolderId, token);
        node.driveFileId = fileId;
        node.isDirty = false;
        await saveVFSFile(projectId, node.path, content, mimeType, fileId, false);
      } else if (node.isDirty) {
        await uploadTextFile(node.name, content, mimeType, parentDriveFolderId, token, fileId);
        await renameDriveFileOrFolder(fileId, node.name, token);
        node.isDirty = false;
        await saveVFSFile(projectId, node.path, content, mimeType, fileId, false);
      }
    }
  }

  for (const name in tree) {
    await syncNode(tree[name], projectDriveFolderId);
  }
}
