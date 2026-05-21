import React from 'react';
import { VFSNode } from '../../types';
import { useAppStore } from '../../store/appStore';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, File, Image,
  Settings, HelpCircle, Code, Eye
} from 'lucide-react';

interface TreeNodeProps {
  node: VFSNode;
  activeFile: string | null;
  onFileClick: (path: string) => void;
  onNodeContextMenu: (e: React.MouseEvent, node: VFSNode) => void;
  depth: number;
}

const EXT_ICONS: Record<string, { color: string; icon: React.ReactNode }> = {
  html: { color: 'text-orange-500', icon: <Code className="w-3.5 h-3.5" /> },
  css: { color: 'text-blue-400', icon: <Eye className="w-3.5 h-3.5" /> },
  js: { color: 'text-yellow-400', icon: <span className="text-[10px] font-bold font-mono">JS</span> },
  ts: { color: 'text-blue-500', icon: <span className="text-[10px] font-bold font-mono">TS</span> },
  jsx: { color: 'text-sky-400', icon: <Code className="w-3.5 h-3.5" /> },
  tsx: { color: 'text-sky-500', icon: <Code className="w-3.5 h-3.5" /> },
  py: { color: 'text-green-400', icon: <span className="text-[10px] font-bold font-mono">PY</span> },
  c: { color: 'text-zinc-400', icon: <span className="text-[10px] font-bold font-mono">C</span> },
  cpp: { color: 'text-cyan-400', icon: <span className="text-[10px] font-bold font-mono">C++</span> },
  json: { color: 'text-amber-400', icon: <span className="text-[10px] font-bold font-mono">{}</span> },
  md: { color: 'text-violet-400', icon: <span className="text-[10px] font-bold font-mono">MD</span> },
  png: { color: 'text-pink-400', icon: <Image className="w-3.5 h-3.5" /> },
  jpg: { color: 'text-pink-400', icon: <Image className="w-3.5 h-3.5" /> },
  jpeg: { color: 'text-pink-400', icon: <Image className="w-3.5 h-3.5" /> },
  gif: { color: 'text-pink-400', icon: <Image className="w-3.5 h-3.5" /> },
  webp: { color: 'text-pink-400', icon: <Image className="w-3.5 h-3.5" /> },
  svg: { color: 'text-pink-400', icon: <Image className="w-3.5 h-3.5" /> },
};

function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const item = EXT_ICONS[ext];
  if (item) {
    return (
      <span className={`w-4 h-4 shrink-0 flex items-center justify-center ${item.color}`}>
        {item.icon}
      </span>
    );
  }
  return <File className="w-3.5 h-3.5 text-zinc-500 shrink-0" />;
}

export function TreeNode({
  node, activeFile, onFileClick, onNodeContextMenu, depth,
}: TreeNodeProps) {
  const { toggleFolderExpanded, theme } = useAppStore();

  const isFolder = node.type === 'folder';
  const isExpanded = node.isExpanded ?? false;
  const isSelected = activeFile === node.path;

  const itemHover = theme === 'dark' ? 'hover:bg-surface-800' : 'hover:bg-zinc-100';
  const itemActive = theme === 'dark'
    ? 'bg-primary-900/25 text-primary-300 border-l-2 border-primary-500 font-medium'
    : 'bg-primary-50 text-primary-700 border-l-2 border-primary-500 font-medium';

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      toggleFolderExpanded(node.path);
    } else {
      onFileClick(node.path);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    onNodeContextMenu(e, node);
  };

  // Sort: folders first, then files, both alphabetically
  const sortedChildren = React.useMemo(() => {
    if (!isFolder || !node.children) return [];
    return Object.values(node.children).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [isFolder, node.children]);

  return (
    <div className="select-none">
      {/* Node Row */}
      <div
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        style={{ paddingLeft: `${depth * 12 + 10}px` }}
        className={`flex items-center gap-2 py-1.5 pr-3 cursor-pointer border-l-2 border-transparent transition-all group ${
          isSelected ? itemActive : `text-zinc-300 ${itemHover}`
        }`}
      >
        {/* Chevron for folder */}
        {isFolder ? (
          <span className="text-zinc-500 hover:text-zinc-300 transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
            )}
          </span>
        ) : (
          <span className="w-3.5" /> // spacer
        )}

        {/* Folder/File Icon */}
        {isFolder ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 text-primary-400 shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-primary-400 shrink-0" />
          )
        ) : (
          getFileIcon(node.name)
        )}

        {/* Node Name */}
        <span className="flex-1 truncate text-xs select-none">
          {node.name}
        </span>

        {/* Dirty Dot Indicator */}
        {!isFolder && node.isDirty && (
          <span
            className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse shrink-0"
            title="มีไฟล์ที่ไม่ได้บันทึก"
          />
        )}
      </div>

      {/* Render children recursively if expanded */}
      {isFolder && isExpanded && sortedChildren.length > 0 && (
        <div className="flex flex-col">
          {sortedChildren.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              activeFile={activeFile}
              onFileClick={onFileClick}
              onNodeContextMenu={onNodeContextMenu}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
