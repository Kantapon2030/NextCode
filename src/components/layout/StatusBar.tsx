import React from 'react';
import { useAppStore } from '../../store/appStore';
import { Cloud, CloudOff, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
  filename: string;
  language: string;
  line: number;
  col: number;
}

export function StatusBar({ filename: _filename, language, line, col }: Props) {
  const { saveStatus, syncStatus, theme } = useAppStore();

  const saveBadge = {
    saved: { icon: <CheckCircle className="w-3 h-3" />, text: 'บันทึกแล้ว', cls: 'text-green-400' },
    saving: { icon: <Loader2 className="w-3 h-3 animate-spin" />, text: 'กำลังบันทึก...', cls: 'text-blue-400' },
    unsaved: { icon: <AlertCircle className="w-3 h-3" />, text: '● แก้ไข', cls: 'text-yellow-400' },
    offline: { icon: <CloudOff className="w-3 h-3" />, text: 'ออฟไลน์', cls: 'text-zinc-400' },
  }[saveStatus];

  const syncBadge = {
    synced: { icon: <Cloud className="w-3 h-3" />, text: 'ซิงค์แล้ว', cls: 'text-green-400' },
    syncing: { icon: <Loader2 className="w-3 h-3 animate-spin" />, text: 'กำลัง sync', cls: 'text-blue-400' },
    local: { icon: <AlertCircle className="w-3 h-3" />, text: 'Local เท่านั้น', cls: 'text-yellow-400' },
    error: { icon: <AlertCircle className="w-3 h-3" />, text: 'Sync ผิดพลาด', cls: 'text-red-400' },
  }[syncStatus];

  const bg = theme === 'dark' ? 'bg-surface-950 border-border text-zinc-400' : 'bg-zinc-100 border-zinc-200 text-zinc-600';

  return (
    <div className={`flex items-center gap-4 px-4 h-6 text-xs border-t select-none shrink-0 ${bg}`}>
      <span className="font-mono uppercase text-primary-400">{language}</span>
      <span className="font-mono">บรรทัด {line}:{col}</span>
      <span>UTF-8</span>
      <div className={`flex items-center gap-1 ml-auto ${saveBadge.cls}`}>
        {saveBadge.icon}
        <span>{saveBadge.text}</span>
      </div>
      <div className={`flex items-center gap-1 ${syncBadge.cls}`}>
        {syncBadge.icon}
        <span>{syncBadge.text}</span>
      </div>
    </div>
  );
}
