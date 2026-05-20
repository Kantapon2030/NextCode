import React, { useRef, useState, useCallback, useEffect } from 'react';
import { X, Plus, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { getMonacoLanguage } from '../../storage/vfsHelpers';

interface Props {
  tabs: string[];
  activeTab: string | null;
  dirtyTabs: Set<string>;
  onTabClick: (tab: string) => void;
  onTabClose: (tab: string) => void;
  onNewFile: () => void;
}

const FILE_ICONS: Record<string, string> = {
  html: '🌐',
  css: '🎨',
  js: '⚡',
  ts: '🔷',
  py: '🐍',
  c: '⚙️',
  cpp: '⚙️',
  json: '📋',
  md: '📝',
  txt: '📄',
};

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? '📄';
}

export function TabBar({ tabs, activeTab, dirtyTabs, onTabClick, onTabClose, onNewFile }: Props) {
  const { theme } = useAppStore();
  const barBg = theme === 'dark' ? 'bg-surface-950 border-border' : 'bg-zinc-100 border-zinc-200';
  const tabActive = theme === 'dark'
    ? 'bg-surface-800 text-white border-b-2 border-primary-500'
    : 'bg-white text-zinc-900 border-b-2 border-primary-500';
  const tabInactive = theme === 'dark'
    ? 'text-zinc-500 hover:bg-surface-800 hover:text-zinc-300'
    : 'text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700';

  return (
    <div className={`flex items-center border-b shrink-0 overflow-x-auto ${barBg}`} style={{ scrollbarWidth: 'none' }}>
      {tabs.map((tab) => (
        <div
          key={tab}
          onClick={() => onTabClick(tab)}
          className={`group flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer select-none shrink-0 border-r border-border/50 transition-colors ${
            tab === activeTab ? tabActive : tabInactive
          }`}
        >
          <span>{getFileIcon(tab)}</span>
          <span className="max-w-[120px] truncate">{tab}</span>
          {dirtyTabs.has(tab) && (
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onTabClose(tab); }}
            className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all ml-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        onClick={onNewFile}
        className="flex items-center gap-1 px-3 py-2 text-zinc-600 hover:text-zinc-400 hover:bg-surface-800 transition-colors shrink-0"
        title="เพิ่มไฟล์ใหม่"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
