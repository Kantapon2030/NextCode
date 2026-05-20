import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { db } from '../../storage/db';
import { isImageFile, getMimeType } from '../../storage/vfsHelpers';
import {
  File, Image, FilePlus, Upload, Trash2, Download,
  Edit3, Keyboard
} from 'lucide-react';
import { toast } from '../shared/Toast';
import { SnippetCheatSheet } from '../editor/SnippetCheatSheet';

interface Props {
  projectId: string;
  files: string[];
  assets: string[];
  activeFile: string | null;
  onFileClick: (filename: string) => void;
  onFileAdd: (filename: string, content: string) => void;
  onFileDelete: (filename: string) => void;
  onFileRename: (oldName: string, newName: string) => void;
  onAssetAdd: (name: string, buffer: ArrayBuffer, mimeType: string) => void;
  onAssetDelete: (name: string) => void;
  onInsertSnippet: (code: string) => void;
}

const FILE_ICONS: Record<string, React.ReactNode> = {
  html: <span className="text-orange-400 text-xs font-mono">HTML</span>,
  css: <span className="text-blue-400 text-xs font-mono">CSS</span>,
  js: <span className="text-yellow-400 text-xs font-mono">JS</span>,
  ts: <span className="text-blue-500 text-xs font-mono">TS</span>,
  py: <span className="text-green-400 text-xs font-mono">PY</span>,
  c: <span className="text-zinc-400 text-xs font-mono">C</span>,
  cpp: <span className="text-cyan-400 text-xs font-mono">C++</span>,
  json: <span className="text-amber-400 text-xs font-mono">JSON</span>,
  md: <span className="text-violet-400 text-xs font-mono">MD</span>,
};

function getFileIconEl(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? <File className="w-3 h-3 text-zinc-500" />;
}

interface ContextMenu {
  x: number;
  y: number;
  filename: string;
  isAsset: boolean;
}

export function FileTree({
  projectId, files, assets, activeFile,
  onFileClick, onFileAdd, onFileDelete, onFileRename,
  onAssetAdd, onAssetDelete, onInsertSnippet,
}: Props) {
  const { theme } = useAppStore();
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [showCheatSheet, setShowCheatSheet] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function close() { setContextMenu(null); }
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  function handleContextMenu(e: React.MouseEvent, filename: string, isAsset = false) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, filename, isAsset });
  }

  function handleDownload(filename: string, isAsset: boolean) {
    if (isAsset) return; // handled differently
    const content = useAppStore.getState().vfs.files[filename]?.content ?? '';
    const blob = new Blob([content], { type: getMimeType(filename) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAddFile() {
    if (!newFileName.trim()) return;
    const name = newFileName.includes('.') ? newFileName : newFileName + '.txt';
    onFileAdd(name, '');
    setShowNewFile(false);
    setNewFileName('');
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        toast('error', `${file.name} เกินขนาดสูงสุด (5MB)`);
        continue;
      }
      const buf = await file.arrayBuffer();
      if (isImageFile(file.name)) {
        onAssetAdd(file.name, buf, file.type);
        toast('success', `อัปโหลด ${file.name} แล้ว`);
      } else {
        const text = new TextDecoder().decode(buf);
        onFileAdd(file.name, text);
        toast('success', `เพิ่มไฟล์ ${file.name} แล้ว`);
      }
    }
    e.target.value = '';
  }

  // Drag and drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const fakeEvent = { target: { files: droppedFiles } } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleFileUpload(fakeEvent);
  }

  const bg = theme === 'dark' ? 'bg-surface-900 border-border' : 'bg-zinc-50 border-zinc-200';
  const itemHover = theme === 'dark' ? 'hover:bg-surface-800' : 'hover:bg-zinc-100';
  const itemActive = theme === 'dark' ? 'bg-primary-900/30 text-primary-300 border-l-2 border-primary-500' : 'bg-primary-50 text-primary-700 border-l-2 border-primary-500';

  if (showCheatSheet) {
    return (
      <SnippetCheatSheet onClose={() => setShowCheatSheet(false)} />
    );
  }

  return (
    <div
      className={`flex flex-col h-full border-r ${bg} text-sm overflow-hidden`}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Files section */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-1 text-xs font-medium text-zinc-600 uppercase tracking-wider">
          ไฟล์
        </div>
        {files.map((filename) => (
          <div
            key={filename}
            onContextMenu={(e) => handleContextMenu(e, filename)}
            onClick={() => onFileClick(filename)}
            className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
              activeFile === filename ? itemActive : `text-zinc-300 ${itemHover}`
            }`}
          >
            {renamingFile === filename ? (
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onBlur={() => {
                  if (renameVal.trim() && renameVal !== filename) {
                    onFileRename(filename, renameVal.trim());
                  }
                  setRenamingFile(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (renameVal.trim() && renameVal !== filename) {
                      onFileRename(filename, renameVal.trim());
                    }
                    setRenamingFile(null);
                  }
                  if (e.key === 'Escape') setRenamingFile(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-surface-700 border border-primary-500 rounded px-1 text-xs text-white outline-none"
              />
            ) : (
              <>
                <span className="w-8 shrink-0 text-right">{getFileIconEl(filename)}</span>
                <span className="flex-1 truncate text-xs">{filename}</span>
              </>
            )}
          </div>
        ))}

        {/* Assets section */}
        {assets.length > 0 && (
          <>
            <div className="px-3 pt-4 pb-1 text-xs font-medium text-zinc-600 uppercase tracking-wider">
              รูปภาพ
            </div>
            {assets.map((name) => (
              <div
                key={name}
                onContextMenu={(e) => handleContextMenu(e, name, true)}
                className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-zinc-400 ${itemHover} transition-colors`}
              >
                <Image className="w-3 h-3 text-pink-400 shrink-0" />
                <span className="flex-1 truncate text-xs">{name}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Add file input */}
      {showNewFile && (
        <div className="px-3 py-2 border-t border-border">
          <input
            autoFocus
            value={newFileName}
            onChange={(e) => setNewFileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddFile(); if (e.key === 'Escape') setShowNewFile(false); }}
            placeholder="ชื่อไฟล์.html"
            className="w-full px-2 py-1 bg-surface-700 border border-primary-500 rounded text-xs text-white outline-none"
          />
        </div>
      )}

      {/* Bottom action buttons */}
      <div className={`flex items-center gap-1 px-2 py-2 border-t border-border ${theme === 'dark' ? 'bg-surface-950' : 'bg-zinc-100'}`}>
        <button
          onClick={() => setShowNewFile((x) => !x)}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          title="ไฟล์ใหม่"
        >
          <FilePlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">ใหม่</span>
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
          onClick={() => setShowCheatSheet(true)}
          className="flex items-center gap-1 px-2 py-1.5 hover:bg-primary-700/30 rounded-lg transition-colors text-zinc-400 hover:text-primary-300 text-xs ml-auto"
          title="Snippet Shortcuts (พิมพ์ ! แล้วกด Tab)"
        >
          <Keyboard className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Shortcuts</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".html,.css,.js,.ts,.py,.c,.cpp,.txt,.md,.json,.png,.jpg,.jpeg,.svg,.gif,.webp"
        onChange={handleFileUpload}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.isAsset && (
            <div
              className="context-menu-item"
              onClick={() => { onFileClick(contextMenu.filename); setContextMenu(null); }}
            >
              <File className="w-3.5 h-3.5" /> เปิด
            </div>
          )}
          {!contextMenu.isAsset && (
            <div
              className="context-menu-item"
              onClick={() => { setRenamingFile(contextMenu.filename); setRenameVal(contextMenu.filename); setContextMenu(null); }}
            >
              <Edit3 className="w-3.5 h-3.5" /> เปลี่ยนชื่อ
            </div>
          )}
          <div
            className="context-menu-item"
            onClick={() => { handleDownload(contextMenu.filename, contextMenu.isAsset); setContextMenu(null); }}
          >
            <Download className="w-3.5 h-3.5" /> ดาวน์โหลด
          </div>
          <div
            className="context-menu-item danger"
            onClick={() => {
              if (contextMenu.isAsset) onAssetDelete(contextMenu.filename);
              else onFileDelete(contextMenu.filename);
              setContextMenu(null);
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> ลบ
          </div>
        </div>
      )}
    </div>
  );
}
