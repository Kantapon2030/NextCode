import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { clearAuthFromLocalStorage } from '../../services/googleAuth';
import { clearUserSession } from '../../storage/syncManager';
import { toast } from '../shared/Toast';
import SettingsModal from '../modals/SettingsModal';
import {
  Code2, Save, Bot, Keyboard, Settings, User, ChevronDown,
  LogOut, LayoutDashboard, Download, Package, Loader2, CheckCircle
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { db } from '../../storage/db';

interface Props {
  onSave: () => void;
  onToggleCommandPalette: () => void;
}

export function Navbar({ onSave, onToggleCommandPalette }: Props) {
  const navigate = useNavigate();
  const {
    user, currentProject, saveStatus, theme,
    aiPanelOpen, setAIPanelOpen, logout, vfs
  } = useAppStore();
  const [showSettings, setShowSettings] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) setShowProjectMenu(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false);
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setShowAvatarMenu(false);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  async function handleDownloadZip() {
    if (!currentProject) return;
    const files = await db.files.where('project_id').equals(currentProject.id).toArray();
    const zip = new JSZip();
    for (const f of files) {
      if (f.type === 'file' && f.content !== undefined && f.content !== null) {
        zip.file(f.path, f.content);
      }
    }
    zip.file(
      'README.md',
      `# ${currentProject.name}\n\nสร้างด้วย Nextcode IDE\nวันที่: ${new Date().toLocaleDateString('th-TH')}\nภาษา: ${currentProject.language.toUpperCase()}\n`
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${currentProject.name}.zip`);
    toast('success', 'ส่งออก ZIP แล้ว');
    setShowExportMenu(false);
  }

  function handleDownloadCurrentFile() {
    const { activeTab } = useAppStore.getState();
    if (!activeTab) return;
    const node = vfs.flatIndex[activeTab];
    if (!node || node.type !== 'file') return;
    const content = node.content ?? '';
    const mime = node.mimeType || 'text/plain';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filename = activeTab.split('/').pop() || activeTab;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  async function handleLogout() {
    clearAuthFromLocalStorage();
    await clearUserSession();
    logout();
    navigate('/');
  }



  const navBg = theme === 'dark'
    ? 'bg-surface-950/95 border-border backdrop-blur-sm'
    : 'bg-white/95 border-zinc-200 backdrop-blur-sm';

  const saveIcon = {
    saved: <CheckCircle className="w-4 h-4 text-green-400" />,
    saving: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
    unsaved: <Save className="w-4 h-4" />,
    offline: <Save className="w-4 h-4 text-zinc-500" />,
  }[saveStatus];

  return (
    <>
      <nav className={`flex items-center gap-2 px-4 h-12 border-b shrink-0 z-30 ${navBg}`}>
        {/* Logo */}
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity mr-1"
        >
          <div className="w-6 h-6 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Code2 className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-white hidden sm:block">Nextcode</span>
        </button>

        {/* Project name dropdown */}
        {currentProject && (
          <div className="relative" ref={projectRef}>
            <button
              onClick={() => setShowProjectMenu((x) => !x)}
              className="flex items-center gap-1 px-2 py-1 hover:bg-surface-800 rounded-lg transition-colors text-zinc-300 text-sm"
            >
              <span className="max-w-[140px] truncate">{currentProject.name}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" />
            </button>
            {showProjectMenu && (
              <div className="absolute top-full left-0 mt-1 w-44 bg-surface-800 border border-border rounded-xl shadow-surface-lg z-50 py-1 animate-slide-down">
                <button
                  onClick={() => { navigate('/dashboard'); setShowProjectMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-surface-700 hover:text-white transition-colors"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" /> โปรเจกต์ทั้งหมด
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* Save button */}
        <button
          id="btn-save"
          onClick={onSave}
          className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-surface-800 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          title="บันทึก (Ctrl+S)"
        >
          {saveIcon}
          <span className="hidden sm:inline">บันทึก</span>
        </button>

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setShowExportMenu((x) => !x)}
            className="flex items-center gap-1 px-2 py-1.5 hover:bg-surface-800 rounded-lg transition-colors text-zinc-400 hover:text-white text-xs"
          >
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">โหลด</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showExportMenu && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-surface-800 border border-border rounded-xl shadow-surface-lg z-50 py-1 animate-slide-down">
              <button
                onClick={handleDownloadCurrentFile}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-surface-700 hover:text-white transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> ดาวน์โหลดไฟล์นี้
              </button>
              <button
                onClick={handleDownloadZip}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-400 hover:bg-surface-700 hover:text-white transition-colors"
              >
                <Package className="w-3.5 h-3.5" /> ดาวน์โหลดทั้งโปรเจกต์
              </button>
            </div>
          )}
        </div>



        {/* AI toggle */}
        <button
          id="btn-ai"
          onClick={() => setAIPanelOpen(!aiPanelOpen)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs ${
            aiPanelOpen
              ? 'bg-primary-600 text-white shadow-glow-sm'
              : 'hover:bg-surface-800 text-zinc-400 hover:text-white'
          }`}
          title="AI Assistant (Ctrl+B)"
        >
          <Bot className="w-4 h-4" />
          <span className="hidden sm:inline">AI</span>
        </button>

        {/* Command palette (expert) */}
        <button
          id="btn-cmd-palette"
          onClick={onToggleCommandPalette}
          className="p-1.5 hover:bg-surface-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="Command Palette (Ctrl+K)"
        >
          <Keyboard className="w-4 h-4" />
        </button>

        {/* Settings */}
        <button
          id="btn-settings"
          onClick={() => setShowSettings(true)}
          className="p-1.5 hover:bg-surface-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="ตั้งค่า"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Avatar */}
        <div className="relative" ref={avatarRef}>
          <button
            id="btn-avatar-nav"
            onClick={() => setShowAvatarMenu((x) => !x)}
            className="flex items-center gap-1 p-1 hover:bg-surface-800 rounded-lg transition-colors"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-white" />
              </div>
            )}
          </button>
          {showAvatarMenu && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-surface-800 border border-border rounded-xl shadow-surface-lg z-50 overflow-hidden animate-slide-down">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={() => { navigate('/dashboard'); setShowAvatarMenu(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-400 hover:bg-surface-700 hover:text-white transition-colors"
              >
                <LayoutDashboard className="w-4 h-4" /> โปรเจกต์ทั้งหมด
              </button>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" /> ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </nav>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}
