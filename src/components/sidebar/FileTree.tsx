import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { VFSNode } from '../../types';
import { TreeNode } from './TreeNode';
import {
  saveVFSFolder,
  deleteVFSFolder,
  renameNodeInDB,
  getMimeType,
  isTextFile,
  isImageFile
} from '../../storage/vfsHelpers';
import {
  File, Image, FilePlus, FolderPlus, Upload, Trash2, Download,
  Edit3, Keyboard, FolderOpen, ChevronDown, ChevronRight, X
} from 'lucide-react';
import { toast } from '../shared/Toast';
import { SnippetCheatSheet } from '../editor/SnippetCheatSheet';
import {
  readDroppedItems, isImage, isTextFile as isImportTextFile,
  getMimeType as getImportMime,
} from '../../utils/folderImport';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

interface Props {
  projectId: string;
  files: string[]; // (kept for prop compatibility)
  assets: string[]; // (kept for prop compatibility)
  activeFile: string | null;
  onFileClick: (filename: string) => void;
  onFileAdd: (filename: string, content: string) => void;
  onFileDelete: (filename: string) => void;
  onFileRename: (oldName: string, newName: string) => void;
  onAssetAdd: (name: string, buffer: ArrayBuffer, mimeType: string) => void;
  onAssetDelete: (name: string) => void;
  onInsertSnippet: (code: string) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: VFSNode;
}

export function FileTree({
  projectId, activeFile, onFileClick, onFileAdd, onFileDelete,
  onFileRename, onAssetAdd, onAssetDelete, onInsertSnippet,
}: Props) {
  const { vfs, createVFSFolder, deleteVFSPath, renameVFSPath, toggleFolderExpanded, theme } = useAppStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  
  // Modals state
  const [modalType, setModalType] = useState<'new_file' | 'new_folder' | 'rename' | null>(null);
  const [modalTargetNode, setModalTargetNode] = useState<VFSNode | null>(null);
  const [modalInputVal, setModalInputVal] = useState('');

  // Drag & drop state
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  const [showCheatSheet, setShowCheatSheet] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Close context menu on click
  useEffect(() => {
    function close() { setContextMenu(null); }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const handleNodeContextMenu = (e: React.MouseEvent, node: VFSNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  // ZIP Downloader for folder
  const downloadFolderAsZip = async (folderNode: VFSNode) => {
    const zip = new JSZip();
    
    function addToZip(zipObj: JSZip, node: VFSNode) {
      if (node.type === 'file') {
        const content = node.content;
        if (typeof content === 'string') {
          zipObj.file(node.name, content);
        } else if (content instanceof ArrayBuffer) {
          zipObj.file(node.name, content);
        }
      } else if (node.type === 'folder' && node.children) {
        const subFolder = zipObj.folder(node.name);
        if (subFolder) {
          for (const key in node.children) {
            addToZip(subFolder, node.children[key]);
          }
        }
      }
    }

    if (folderNode.children) {
      for (const key in folderNode.children) {
        addToZip(zip, folderNode.children[key]);
      }
    }

    try {
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `${folderNode.name}.zip`);
      toast('success', `ดาวน์โหลดโฟลเดอร์ ${folderNode.name} เป็น ZIP สำเร็จ`);
    } catch (err) {
      console.error(err);
      toast('error', 'ไม่สามารถดาวน์โหลดโฟลเดอร์เป็น ZIP ได้');
    }
  };

  // General single file download
  const handleDownloadFile = (fileNode: VFSNode) => {
    const content = fileNode.content ?? '';
    const blob = typeof content === 'string'
      ? new Blob([content], { type: fileNode.mimeType || getMimeType(fileNode.name) })
      : new Blob([content], { type: fileNode.mimeType || getMimeType(fileNode.name) });
    saveAs(blob, fileNode.name);
    toast('success', `ดาวน์โหลด ${fileNode.name} สำเร็จ`);
  };

  // Handle Dialog Modal Submit
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = modalInputVal.trim();
    if (!val) return;

    const parentPath = modalTargetNode ? modalTargetNode.path : '';
    const fullPath = parentPath ? `${parentPath}/${val}` : val;

    if (modalType === 'new_file') {
      const nameWithExt = val.includes('.') ? val : `${val}.txt`;
      const fileFullPath = parentPath ? `${parentPath}/${nameWithExt}` : nameWithExt;
      onFileAdd(fileFullPath, '');
    } 
    else if (modalType === 'new_folder') {
      await saveVFSFolder(projectId, fullPath);
      createVFSFolder(fullPath);
      toast('success', `สร้างโฟลเดอร์ ${val} สำเร็จ`);
    } 
    else if (modalType === 'rename' && modalTargetNode) {
      const oldPath = modalTargetNode.path;
      const parts = oldPath.split('/');
      parts[parts.length - 1] = val;
      const newPath = parts.join('/');
      
      if (modalTargetNode.type === 'folder') {
        await renameNodeInDB(projectId, oldPath, newPath);
        renameVFSPath(oldPath, newPath);
      } else {
        onFileRename(oldPath, newPath);
      }
      toast('success', `เปลี่ยนชื่อสำเร็จ`);
    }

    setModalType(null);
    setModalTargetNode(null);
    setModalInputVal('');
  };

  // Upload multiple files via input
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setImportProgress({ current: 0, total: files.length });
    setImporting(true);

    let count = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) {
        toast('error', `${file.name} เกินขนาดสูงสุด (10MB)`);
        continue;
      }
      const buf = await file.arrayBuffer();
      const mime = file.type || getMimeType(file.name);
      
      if (isImage(file.name)) {
        await onAssetAdd(file.name, buf, mime);
      } else if (isImportTextFile(file.name)) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        await onFileAdd(file.name, text);
      } else {
        await onAssetAdd(file.name, buf, mime);
      }
      count++;
      setImportProgress({ current: i + 1, total: files.length });
    }

    setImporting(false);
    if (count > 0) toast('success', `อัปโหลด ${count} ไฟล์เรียบร้อย`);
    e.target.value = '';
  }

  // Upload folder via directory input
  async function handleFolderUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    setImportProgress({ current: 0, total: files.length });
    setImporting(true);

    let count = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = file.webkitRelativePath; // e.g. "my-folder/sub/index.js"
      if (!path) continue;

      if (file.size > 10 * 1024 * 1024) {
        toast('error', `${file.name} เกินขนาดสูงสุด (10MB)`);
        continue;
      }
      const buf = await file.arrayBuffer();
      const mime = file.type || getMimeType(file.name);
      
      if (isImage(file.name)) {
        await onAssetAdd(path, buf, mime);
      } else if (isImportTextFile(file.name)) {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
        await onFileAdd(path, text);
      } else {
        await onAssetAdd(path, buf, mime);
      }
      count++;
      setImportProgress({ current: i + 1, total: files.length });
    }

    setImporting(false);
    if (count > 0) toast('success', `นำเข้าโฟลเดอร์เรียบร้อย (${count} ไฟล์)`);
    e.target.value = '';
  }

  // Handle Drag & Drop Drop
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    try {
      const imported = await readDroppedItems(e.dataTransfer);
      if (imported.length === 0) return;

      setImportProgress({ current: 0, total: imported.length });
      setImporting(true);

      let count = 0;
      for (let i = 0; i < imported.length; i++) {
        const { path, file } = imported[i];
        if (file.size > 10 * 1024 * 1024) {
          toast('error', `${path} เกินขนาดสูงสุด (10MB)`);
          continue;
        }
        const buf = await file.arrayBuffer();
        const mime = file.type || getImportMime(file.name);

        if (isImage(file.name)) {
          await onAssetAdd(path, buf, mime);
        } else if (isImportTextFile(file.name)) {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
          await onFileAdd(path, text);
        } else {
          await onAssetAdd(path, buf, mime);
        }
        count++;
        setImportProgress({ current: i + 1, total: imported.length });
      }

      setImporting(false);
      if (count > 0) toast('success', `นำเข้า ${count} ไฟล์สำเร็จ`);
    } catch (err) {
      console.error('[FileTree] Drop error:', err);
      setImporting(false);
      toast('error', 'นำเข้าล้มเหลว');
    }
  }

  const bg       = theme === 'dark' ? 'bg-surface-900 border-border' : 'bg-zinc-50 border-zinc-200';
  const itemHover = theme === 'dark' ? 'hover:bg-surface-800' : 'hover:bg-zinc-100';

  // Sort VFS tree root level keys (folders first, then files)
  const sortedRootKeys = Object.keys(vfs.tree).sort((a, b) => {
    const nodeA = vfs.tree[a];
    const nodeB = vfs.tree[b];
    if (nodeA.type !== nodeB.type) {
      return nodeA.type === 'folder' ? -1 : 1;
    }
    return nodeA.name.localeCompare(nodeB.name);
  });

  if (showCheatSheet) {
    return <SnippetCheatSheet onClose={() => setShowCheatSheet(false)} />;
  }

  return (
    <div
      className={`relative flex flex-col h-full border-r ${bg} text-sm overflow-hidden transition-all ${
        dragOver ? 'bg-primary-950/20 border-primary-500/50' : ''
      }`}
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
      }}
    >
      {/* Drag and Drop blue panel overlay */}
      {dragOver && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-primary-900/40 border-2 border-dashed border-primary-400 rounded-lg m-2 pointer-events-none backdrop-blur-xs">
          <FolderOpen className="w-10 h-10 text-primary-300 animate-bounce" />
          <p className="text-sm font-semibold text-primary-100">วางไฟล์/โฟลเดอร์เพื่อนำเข้า</p>
          <p className="text-xs text-primary-300">รองรับโครงสร้างแบบซ้อนกันและรูปภาพ</p>
        </div>
      )}

      {/* Title */}
      <div className="px-3 pt-3 pb-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider select-none">
        โครงสร้างโฟลเดอร์ (VFS)
      </div>

      {/* Recursive VFS Tree View */}
      <div className="flex-1 overflow-y-auto py-1">
        {sortedRootKeys.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-600 select-none">
            ไม่มีไฟล์ในโปรเจกต์<br />ลากวางไฟล์เพื่ออัปโหลด
          </div>
        ) : (
          sortedRootKeys.map((key) => (
            <TreeNode
              key={key}
              node={vfs.tree[key]}
              activeFile={activeFile}
              onFileClick={onFileClick}
              onNodeContextMenu={handleNodeContextMenu}
              depth={0}
            />
          ))
        )}
      </div>

      {/* Bottom action toolbar buttons */}
      <div className={`flex items-center gap-1 px-2 py-2 border-t border-border ${theme === 'dark' ? 'bg-surface-950' : 'bg-zinc-100'}`}>
        <button
          onClick={() => { setModalType('new_file'); setModalTargetNode(null); setModalInputVal(''); }}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          title="สร้างไฟล์ใหม่ที่ Root"
        >
          <FilePlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ไฟล์ใหม่</span>
        </button>

        <button
          onClick={() => { setModalType('new_folder'); setModalTargetNode(null); setModalInputVal(''); }}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          title="สร้างโฟลเดอร์ใหม่ที่ Root"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">โฟลเดอร์ใหม่</span>
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          title="อัปโหลดไฟล์"
        >
          <Upload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">อัปโหลด</span>
        </button>

        <button
          onClick={() => folderInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          title="นำเข้าทั้งโฟลเดอร์"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">โฟลเดอร์</span>
        </button>

        <button
          onClick={() => setShowCheatSheet(true)}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-primary-700/30 rounded-lg transition-colors text-zinc-400 hover:text-primary-300 text-xs ml-auto"
          title="Snippet Shortcuts"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Shortcuts</span>
        </button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".html,.css,.js,.ts,.jsx,.tsx,.py,.c,.cpp,.txt,.md,.json,.png,.jpg,.jpeg,.svg,.gif,.webp"
        onChange={handleFileUpload}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFolderUpload}
        {...{ webkitdirectory: '', directory: '' }}
      />

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          className="context-menu bg-surface-900/95 border border-surface-800/80 backdrop-blur-md rounded-lg shadow-xl py-1 z-50 fixed w-48 text-zinc-300 font-medium text-xs select-none animate-fade-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.node.type === 'folder' ? (
            <>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { toggleFolderExpanded(contextMenu.node.path); setContextMenu(null); }}
              >
                {contextMenu.node.isExpanded ? (
                  <>
                    <ChevronRight className="w-3.5 h-3.5" /> หุบโฟลเดอร์
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" /> ขยายโฟลเดอร์
                  </>
                )}
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { setModalType('new_file'); setModalTargetNode(contextMenu.node); setModalInputVal(''); setContextMenu(null); }}
              >
                <FilePlus className="w-3.5 h-3.5" /> ไฟล์ใหม่ที่นี่
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { setModalType('new_folder'); setModalTargetNode(contextMenu.node); setModalInputVal(''); setContextMenu(null); }}
              >
                <FolderPlus className="w-3.5 h-3.5" /> โฟลเดอร์ใหม่ที่นี่
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { setModalType('rename'); setModalTargetNode(contextMenu.node); setModalInputVal(contextMenu.node.name); setContextMenu(null); }}
              >
                <Edit3 className="w-3.5 h-3.5" /> เปลี่ยนชื่อโฟลเดอร์
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { downloadFolderAsZip(contextMenu.node); setContextMenu(null); }}
              >
                <Download className="w-3.5 h-3.5" /> ดาวน์โหลดเป็น ZIP
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-950/40 hover:text-red-400 text-red-500 cursor-pointer transition-colors"
                onClick={async () => {
                  if (confirm(`คุณแน่ใจว่าต้องการลบโฟลเดอร์ "${contextMenu.node.name}" และข้อมูลภายในทั้งหมด?`)) {
                    await deleteVFSFolder(projectId, contextMenu.node.path);
                    deleteVFSPath(contextMenu.node.path);
                    toast('info', `ลบโฟลเดอร์ ${contextMenu.node.name} เรียบร้อยแล้ว`);
                  }
                  setContextMenu(null);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบโฟลเดอร์
              </div>
            </>
          ) : (
            <>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { onFileClick(contextMenu.node.path); setContextMenu(null); }}
              >
                <File className="w-3.5 h-3.5" /> เปิดไฟล์
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { setModalType('rename'); setModalTargetNode(contextMenu.node); setModalInputVal(contextMenu.node.name); setContextMenu(null); }}
              >
                <Edit3 className="w-3.5 h-3.5" /> เปลี่ยนชื่อไฟล์
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-800 hover:text-white cursor-pointer transition-colors"
                onClick={() => { handleDownloadFile(contextMenu.node); setContextMenu(null); }}
              >
                <Download className="w-3.5 h-3.5" /> ดาวน์โหลดไฟล์
              </div>
              <div
                className="flex items-center gap-2 px-3 py-1.5 hover:bg-red-950/40 hover:text-red-400 text-red-500 cursor-pointer transition-colors"
                onClick={async () => {
                  if (confirm(`คุณต้องการลบไฟล์ "${contextMenu.node.name}"?`)) {
                    const isAsset = isImageFile(contextMenu.node.name);
                    if (isAsset) {
                      await onAssetDelete(contextMenu.node.path);
                    } else {
                      await onFileDelete(contextMenu.node.path);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบไฟล์
              </div>
            </>
          )}
        </div>
      )}

      {/* Progress modal for imports */}
      {importing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900 border border-surface-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-4 text-center">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <div>
              <h4 className="text-sm font-semibold text-zinc-100">กำลังนำเข้า...</h4>
              <p className="text-xs text-zinc-400 mt-1">
                กำลังอ่านและคัดลอกไฟล์ลงในฐานข้อมูลจำลอง (VFS)
              </p>
            </div>
            <div className="w-full bg-surface-950 rounded-full h-2 overflow-hidden border border-surface-800">
              <div
                className="bg-primary-500 h-full transition-all duration-150"
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-primary-400">
              {importProgress.current} / {importProgress.total} ไฟล์ ({Math.round((importProgress.current / importProgress.total) * 100)}%)
            </span>
          </div>
        </div>
      )}

      {/* Creation and Rename Dialog Modal */}
      {modalType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleModalSubmit}
            className="bg-surface-900 border border-surface-800 rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl flex flex-col gap-4 animate-scale-in"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-zinc-100">
                {modalType === 'new_file' && 'สร้างไฟล์ใหม่'}
                {modalType === 'new_folder' && 'สร้างโฟลเดอร์ใหม่'}
                {modalType === 'rename' && `เปลี่ยนชื่อ "${modalTargetNode?.name}"`}
              </h4>
              <button
                type="button"
                onClick={() => { setModalType(null); setModalTargetNode(null); }}
                className="p-1 text-zinc-500 hover:text-zinc-300 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalTargetNode && modalType !== 'rename' && (
              <div className="text-[11px] text-zinc-500 bg-surface-950 p-2 rounded border border-surface-850 truncate">
                สร้างอยู่ใต้: <span className="font-mono">{modalTargetNode.path}/</span>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-zinc-400 font-medium">ชื่อ</label>
              <input
                autoFocus
                value={modalInputVal}
                onChange={(e) => setModalInputVal(e.target.value)}
                placeholder={
                  modalType === 'new_file' ? 'index.html, styles.css, app.js' :
                  modalType === 'new_folder' ? 'components, utils, images' : 'ชื่อใหม่'
                }
                className="w-full bg-surface-950 border border-surface-850 hover:border-surface-700 focus:border-primary-500 rounded-lg px-3 py-2 text-xs text-zinc-100 outline-none transition-all"
              />
            </div>

            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => { setModalType(null); setModalTargetNode(null); }}
                className="px-3 py-1.5 bg-surface-800 hover:bg-surface-700 text-zinc-300 rounded-lg text-xs font-medium transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                ตกลง
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
