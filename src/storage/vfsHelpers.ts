import { db, ProjectFile } from './db';
import { VFSNode, VFSState } from '../types';

export function buildVFSFromFiles(files: ProjectFile[]): VFSState {
  const tree: Record<string, VFSNode> = {};
  const flatIndex: Record<string, VFSNode> = {};

  // First, index all nodes in flatIndex so we can reference them
  for (const f of files) {
    const node: VFSNode = {
      type: f.type,
      name: f.name,
      path: f.path,
      mimeType: f.mime_type,
      driveFileId: f.drive_file_id,
      isDirty: f.is_dirty,
    };
    if (f.type === 'file') {
      node.content = f.content || '';
    } else {
      node.children = {};
      node.isExpanded = false;
    }
    flatIndex[f.path] = node;
  }

  // Build the hierarchical tree structure
  for (const path in flatIndex) {
    const node = flatIndex[path];
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 1) {
      tree[parts[0]] = node;
    } else {
      let currentChildren = tree;
      let currentPath = '';
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!currentChildren[part]) {
          // Parent doesn't exist, create implicit folder
          const folderNode: VFSNode = {
            type: 'folder',
            name: part,
            path: currentPath,
            children: {},
            isExpanded: false,
          };
          currentChildren[part] = folderNode;
          flatIndex[currentPath] = folderNode;
        }
        
        if (!currentChildren[part].children) {
          currentChildren[part].children = {};
        }
        currentChildren = currentChildren[part].children!;
      }
      
      const lastPart = parts[parts.length - 1];
      currentChildren[lastPart] = node;
    }
  }

  const { files: filesMap, assets: assetsMap } = buildCompatibilityMaps(tree);
  return { tree, flatIndex, files: filesMap, assets: assetsMap };
}

export function buildCompatibilityMaps(tree: Record<string, VFSNode>) {
  const files: Record<string, { content: string; mimeType: string }> = {};
  const assets: Record<string, { buffer: ArrayBuffer; mimeType: string }> = {};

  function traverse(nodes: Record<string, VFSNode>) {
    for (const key in nodes) {
      const node = nodes[key];
      if (node.type === 'file') {
        const isText = isTextFile(node.name);
        if (isText) {
          files[node.path] = { content: (node.content as string) || '', mimeType: node.mimeType || '' };
        } else {
          assets[node.path] = { buffer: (node.content as ArrayBuffer) || new ArrayBuffer(0), mimeType: node.mimeType || '' };
        }
      } else if (node.type === 'folder' && node.children) {
        traverse(node.children);
      }
    }
  }
  traverse(tree);
  return { files, assets };
}

export function buildFlatIndex(tree: Record<string, VFSNode>): Record<string, VFSNode> {
  const flatIndex: Record<string, VFSNode> = {};
  function traverse(nodes: Record<string, VFSNode>) {
    for (const key in nodes) {
      const node = nodes[key];
      flatIndex[node.path] = node;
      if (node.type === 'folder' && node.children) {
        traverse(node.children);
      }
    }
  }
  traverse(tree);
  return flatIndex;
}

export function cloneNode(node: VFSNode): VFSNode {
  const cloned: VFSNode = {
    ...node,
  };
  if (node.children) {
    cloned.children = {};
    for (const key in node.children) {
      cloned.children[key] = cloneNode(node.children[key]);
    }
  }
  return cloned;
}

export function cloneTree(tree: Record<string, VFSNode>): Record<string, VFSNode> {
  const cloned: Record<string, VFSNode> = {};
  for (const key in tree) {
    cloned[key] = cloneNode(tree[key]);
  }
  return cloned;
}

export function setNodeAtPath(
  tree: Record<string, VFSNode>,
  path: string,
  node: VFSNode
): Record<string, VFSNode> {
  const newTree = cloneTree(tree);
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return newTree;

  let currentChildren = newTree;
  let currentPath = '';

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (!currentChildren[part]) {
      currentChildren[part] = {
        type: 'folder',
        name: part,
        path: currentPath,
        children: {},
        isExpanded: false,
      };
    }
    if (!currentChildren[part].children) {
      currentChildren[part].children = {};
    }
    currentChildren = currentChildren[part].children!;
  }

  const lastPart = parts[parts.length - 1];
  currentChildren[lastPart] = node;
  return newTree;
}

export function setFileAtPath(
  tree: Record<string, VFSNode>,
  path: string,
  updates: Partial<VFSNode>
): Record<string, VFSNode> {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1] || '';
  const node: VFSNode = {
    type: 'file',
    name,
    path,
    ...updates,
  };
  return setNodeAtPath(tree, path, node);
}

export function setFolderAtPath(
  tree: Record<string, VFSNode>,
  path: string,
  updates: Partial<VFSNode> = {}
): Record<string, VFSNode> {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1] || '';
  const node: VFSNode = {
    type: 'folder',
    name,
    path,
    children: {},
    isExpanded: false,
    ...updates,
  };
  return setNodeAtPath(tree, path, node);
}

export function deleteAtPath(
  tree: Record<string, VFSNode>,
  path: string
): Record<string, VFSNode> {
  const newTree = cloneTree(tree);
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return newTree;

  let currentChildren = newTree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!currentChildren[part] || !currentChildren[part].children) {
      return newTree;
    }
    currentChildren = currentChildren[part].children!;
  }

  const lastPart = parts[parts.length - 1];
  delete currentChildren[lastPart];
  return newTree;
}

export function moveNode(
  tree: Record<string, VFSNode>,
  oldPath: string,
  newPath: string
): Record<string, VFSNode> {
  const parts = oldPath.split('/').filter(Boolean);
  if (parts.length === 0) return tree;

  let currentChildren = tree;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!currentChildren[part] || !currentChildren[part].children) return tree;
    currentChildren = currentChildren[part].children;
  }
  const lastPart = parts[parts.length - 1];
  const originalNode = currentChildren[lastPart];
  if (!originalNode) return tree;

  const newParts = newPath.split('/').filter(Boolean);
  const newName = newParts[newParts.length - 1];

  function updatePathsRecursively(node: VFSNode, newParentPath: string): VFSNode {
    const nodePath = newParentPath ? `${newParentPath}/${node.name}` : node.name;
    const updated: VFSNode = {
      ...node,
      path: nodePath,
    };
    if (node.children) {
      updated.children = {};
      for (const key in node.children) {
        updated.children[key] = updatePathsRecursively(node.children[key], nodePath);
      }
    }
    return updated;
  }

  const copiedNode = cloneNode(originalNode);
  copiedNode.name = newName;
  const parentOfNewPath = newParts.slice(0, newParts.length - 1).join('/');
  const nodeWithUpdatedPaths = updatePathsRecursively(copiedNode, parentOfNewPath);

  let tempTree = deleteAtPath(tree, oldPath);
  tempTree = setNodeAtPath(tempTree, newPath, nodeWithUpdatedPaths);
  return tempTree;
}

export async function loadVFS(projectId: string): Promise<VFSState> {
  const files = await db.files.where('project_id').equals(projectId).toArray();
  return buildVFSFromFiles(files);
}

export async function saveVFSFile(
  projectId: string,
  path: string,
  content: string | ArrayBuffer,
  mimeType: string,
  driveFileId?: string,
  isDirty: boolean = true
): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1] || '';
  const parent_path = parts.slice(0, parts.length - 1).join('/');

  const record: ProjectFile = {
    project_id: projectId,
    path,
    name,
    parent_path,
    type: 'file',
    content,
    mime_type: mimeType,
    drive_file_id: driveFileId || '',
    is_dirty: isDirty,
    updated_at: Date.now(),
  };
  await db.files.put(record);
  await db.projects.update(projectId, { updated_at: Date.now() });
}

export async function saveVFSFolder(
  projectId: string,
  path: string,
  driveFolderId?: string,
  isDirty: boolean = true
): Promise<void> {
  const parts = path.split('/').filter(Boolean);
  const name = parts[parts.length - 1] || '';
  const parent_path = parts.slice(0, parts.length - 1).join('/');

  const record: ProjectFile = {
    project_id: projectId,
    path,
    name,
    parent_path,
    type: 'folder',
    mime_type: '',
    drive_file_id: driveFolderId || '',
    is_dirty: isDirty,
    updated_at: Date.now(),
  };
  await db.files.put(record);
  await db.projects.update(projectId, { updated_at: Date.now() });
}

export async function saveVFSAsset(
  projectId: string,
  path: string,
  buffer: ArrayBuffer,
  mimeType: string,
  driveFileId?: string,
  isDirty: boolean = true
): Promise<void> {
  await saveVFSFile(projectId, path, buffer, mimeType, driveFileId, isDirty);
}

export async function deleteVFSFile(
  projectId: string,
  path: string
): Promise<void> {
  await db.files.delete([projectId, path]);
  await db.projects.update(projectId, { updated_at: Date.now() });
}

export async function deleteVFSFolder(
  projectId: string,
  folderPath: string
): Promise<void> {
  await db.files.delete([projectId, folderPath]);
  const allFiles = await db.files.where('project_id').equals(projectId).toArray();
  const prefix = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  const toDelete = allFiles.filter(f => f.path === folderPath || f.path.startsWith(prefix));
  for (const f of toDelete) {
    await db.files.delete([projectId, f.path]);
  }
  await db.projects.update(projectId, { updated_at: Date.now() });
}

export async function renameNodeInDB(
  projectId: string,
  oldPath: string,
  newPath: string
): Promise<void> {
  const allFiles = await db.files.where('project_id').equals(projectId).toArray();
  const prefix = oldPath.endsWith('/') ? oldPath : `${oldPath}/`;
  
  for (const f of allFiles) {
    if (f.path === oldPath) {
      await db.files.delete([projectId, oldPath]);
      const parts = newPath.split('/').filter(Boolean);
      const name = parts[parts.length - 1] || '';
      const parent_path = parts.slice(0, parts.length - 1).join('/');
      await db.files.put({
        ...f,
        path: newPath,
        name,
        parent_path,
        is_dirty: true,
        updated_at: Date.now(),
      });
    } else if (f.path.startsWith(prefix)) {
      await db.files.delete([projectId, f.path]);
      const subPath = f.path.substring(oldPath.length);
      const updatedPath = newPath + subPath;
      const parts = updatedPath.split('/').filter(Boolean);
      const name = parts[parts.length - 1] || '';
      const parent_path = parts.slice(0, parts.length - 1).join('/');
      await db.files.put({
        ...f,
        path: updatedPath,
        name,
        parent_path,
        is_dirty: true,
        updated_at: Date.now(),
      });
    }
  }
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
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };
  return map[ext] ?? 'application/octet-stream';
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
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif'].includes(ext);
}
