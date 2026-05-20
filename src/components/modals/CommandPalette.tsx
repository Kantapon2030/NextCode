import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import { Search, X, Save, Bot, FileText, Plus, Download, Keyboard, Sun, Moon } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface Props {
  files: string[];
  onClose: () => void;
  onOpenFile: (filename: string) => void;
  onSave: () => void;
  onToggleAI: () => void;
}

export function CommandPalette({ files, onClose, onOpenFile, onSave, onToggleAI }: Props) {
  const navigate = useNavigate();
  const { setTheme, theme, setAIPanelOpen, setFontSize, fontSize } = useAppStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const baseCommands: Command[] = [
    { id: 'save', label: 'บันทึก', description: 'Ctrl+S', icon: <Save className="w-4 h-4" />, action: () => { onSave(); onClose(); } },
    { id: 'ai', label: 'เปิด AI', description: 'Ctrl+B', icon: <Bot className="w-4 h-4" />, action: () => { onToggleAI(); onClose(); } },
    { id: 'theme-dark', label: 'theme มืด', icon: <Moon className="w-4 h-4" />, action: () => { setTheme('dark'); onClose(); } },
    { id: 'theme-light', label: 'theme สว่าง', icon: <Sun className="w-4 h-4" />, action: () => { setTheme('light'); onClose(); } },
    { id: 'font-up', label: 'ขนาดตัวอักษรใหญ่ขึ้น', icon: <Keyboard className="w-4 h-4" />, action: () => { setFontSize(Math.min(fontSize + 1, 20)); onClose(); } },
    { id: 'font-down', label: 'ขนาดตัวอักษรเล็กลง', icon: <Keyboard className="w-4 h-4" />, action: () => { setFontSize(Math.max(fontSize - 1, 10)); onClose(); } },
    { id: 'dashboard', label: 'โปรเจกต์ทั้งหมด', icon: <FileText className="w-4 h-4" />, action: () => { navigate('/dashboard'); onClose(); } },
    ...files.map((f) => ({
      id: `file-${f}`,
      label: f,
      description: 'เปิดไฟล์',
      icon: <FileText className="w-4 h-4" />,
      action: () => { onOpenFile(f); onClose(); },
    })),
  ];

  const fuse = new Fuse(baseCommands, { keys: ['label', 'description'], threshold: 0.4 });
  const results = query ? fuse.search(query).map((r) => r.item) : baseCommands;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[selectedIndex]) { results[selectedIndex].action(); }
  }

  return (
    <div className="fixed inset-0 z-[9998] flex items-start justify-center pt-20 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-800 border border-border rounded-2xl w-full max-w-lg shadow-surface-lg overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ค้นหาคำสั่ง..."
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder-zinc-600"
          />
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-zinc-600 text-sm">ไม่พบคำสั่ง</p>
          ) : (
            results.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={cmd.action}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors ${
                  i === selectedIndex ? 'bg-primary-600/20 text-white' : 'text-zinc-400 hover:bg-surface-700 hover:text-white'
                }`}
              >
                <span className="text-primary-400 shrink-0">{cmd.icon}</span>
                <span className="flex-1">{cmd.label}</span>
                {cmd.description && (
                  <span className="text-xs text-zinc-600 font-mono">{cmd.description}</span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-xs text-zinc-700">
          <span>↑↓ นำทาง</span>
          <span>↵ เลือก</span>
          <span>Esc ปิด</span>
        </div>
      </div>
    </div>
  );
}
