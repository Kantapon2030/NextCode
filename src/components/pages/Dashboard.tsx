import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { db, deleteProjectData } from '../../storage/db';
import { saveVFSFile } from '../../storage/vfsHelpers';
import { getTemplate, TEMPLATES } from '../../templates';
import { toast } from '../shared/Toast';
import { LoadingSpinner, SkeletonCard } from '../shared/LoadingSpinner';
import WelcomeModal from '../modals/WelcomeModal';
import NewProjectModal from '../modals/NewProjectModal';
import SettingsModal from '../modals/SettingsModal';
import {
  Code2, Plus, Search, LogOut, Settings, Clock, Cloud, CloudOff, Loader2,
  Copy, Download, Trash2, FolderOpen, User, ChevronDown, X,
} from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

const LANG_BADGE: Record<string, { label: string; color: string }> = {
  html: { label: 'HTML', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  python: { label: 'Python', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  c: { label: 'C', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
  cpp: { label: 'C++', color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' },
  blank: { label: 'Blank', color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `เมื่อ ${mins} นาทีที่แล้ว`;
  if (hrs < 24) return `เมื่อ ${hrs} ชั่วโมงที่แล้ว`;
  return `เมื่อ ${days} วันที่แล้ว`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, projects, setProjects, addProject, removeProject, logout, theme } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const projs = await db.projects.orderBy('updated_at').reverse().toArray();
        setProjects(projs as any);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Check onboarding
    const onboarded = localStorage.getItem('nextcode_onboarded');
    if (!onboarded) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarMenu(false);
      }
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = projects.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id: string) {
    if (!confirm('ลบโปรเจกต์นี้หรือไม่? การกระทำนี้ไม่สามารถเลิกทำได้')) return;
    await deleteProjectData(id);
    removeProject(id);
    toast('success', 'ลบโปรเจกต์แล้ว');
  }

  async function handleDuplicate(id: string) {
    const source = projects.find((p) => p.id === id);
    if (!source) return;
    const newId = Math.random().toString(36).slice(2);
    const newProject = {
      ...source,
      id: newId,
      name: source.name + ' (สำเนา)',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await db.projects.add(newProject);
    const files = await db.files.where('project_id').equals(id).toArray();
    for (const f of files) {
      await db.files.put({ ...f, project_id: newId });
    }
    addProject(newProject as any);
    toast('success', 'ทำสำเนาโปรเจกต์แล้ว');
  }

  async function handleDownloadZip(id: string) {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    const files = await db.files.where('project_id').equals(id).toArray();
    const assets = await db.assets.where('project_id').equals(id).toArray();
    const zip = new JSZip();
    for (const f of files) zip.file(f.filename, f.content);
    const assetFolder = zip.folder('assets')!;
    for (const a of assets) assetFolder.file(a.name, a.buffer);
    zip.file(
      'README.md',
      `# ${proj.name}\n\nสร้างด้วย Nextcode IDE\nวันที่: ${new Date().toLocaleDateString('th-TH')}\nภาษา: ${proj.language.toUpperCase()}\n`
    );
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${proj.name}.zip`);
    toast('success', 'ส่งออก ZIP แล้ว');
  }

  async function handleRename(id: string) {
    if (!renameVal.trim()) { setRenamingId(null); return; }
    await db.projects.update(id, { name: renameVal.trim() });
    const { updateProject } = useAppStore.getState();
    updateProject(id, { name: renameVal.trim() });
    setRenamingId(null);
  }

  function handleLogout() {
    localStorage.removeItem('nextcode_access_token');
    localStorage.removeItem('nextcode_expiry_time');
    localStorage.removeItem('nextcode_user_id');
    localStorage.removeItem('nextcode_user_name');
    localStorage.removeItem('nextcode_user_email');
    localStorage.removeItem('nextcode_user_avatar');
    logout();
    navigate('/');
  }

  const bg = theme === 'dark' ? 'bg-surface-900' : 'bg-zinc-50';
  const surface = theme === 'dark' ? 'bg-surface-800 border-border' : 'bg-white border-zinc-200';
  const navBg = theme === 'dark' ? 'bg-surface-950/80 border-border' : 'bg-white/80 border-zinc-200';

  return (
    <div className={`${bg} min-h-screen flex flex-col`}>
      {/* Navbar */}
      <nav className={`sticky top-0 z-40 flex items-center gap-3 px-6 py-3 border-b backdrop-blur-sm ${navBg}`}>
        <div className="flex items-center gap-2 mr-4">
          <div className="w-7 h-7 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Code2 className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white">Nextcode IDE</span>
        </div>

        <div className="flex-1 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            id="search-projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาโปรเจกต์..."
            className="w-full pl-9 pr-4 py-2 bg-surface-800 border border-border rounded-xl text-sm text-zinc-300 placeholder-zinc-600 outline-none focus:border-primary-500 transition-colors"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-3 h-3 text-zinc-500" />
            </button>
          )}
        </div>

        <button
          id="btn-new-project"
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors shadow-glow-sm"
        >
          <Plus className="w-4 h-4" />
          โปรเจกต์ใหม่
        </button>

        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-surface-700 rounded-lg transition-colors text-zinc-400"
          data-tooltip="ตั้งค่า"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Avatar */}
        <div className="relative" ref={avatarRef}>
          <button
            id="btn-avatar"
            onClick={() => setAvatarMenu((x) => !x)}
            className="flex items-center gap-2 p-1 hover:bg-surface-700 rounded-xl transition-colors"
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
            )}
            <ChevronDown className="w-3 h-3 text-zinc-500" />
          </button>
          {avatarMenu && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-surface-800 border border-border rounded-xl shadow-surface-lg z-50 overflow-hidden animate-slide-down">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                <p className="text-xs text-zinc-500 truncate">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                ออกจากระบบ
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">โปรเจกต์ของฉัน</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {projects.length > 0 ? `${projects.length} โปรเจกต์` : 'ยังไม่มีโปรเจกต์'}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 bg-surface-800 rounded-3xl flex items-center justify-center mb-6 border border-border">
              <Code2 className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">
              {search ? 'ไม่พบโปรเจกต์ที่ค้นหา' : 'สร้างโปรเจกต์แรกของคุณ'}
            </h3>
            <p className="text-zinc-500 text-sm mb-6">
              {search ? `ลองค้นหาด้วยคำอื่น` : 'เลือกภาษาและเริ่มเขียนโค้ดได้เลย'}
            </p>
            {!search && (
              <button
                onClick={() => setShowNew(true)}
                className="flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-medium transition-colors shadow-glow-sm"
              >
                <Plus className="w-4 h-4" />
                เริ่มเขียนโค้ด
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project) => {
              const badge = LANG_BADGE[project.language] ?? LANG_BADGE.blank;
              return (
                <div
                  key={project.id}
                  className={`group relative ${surface} border rounded-2xl p-5 hover:border-primary-500/30 hover:shadow-glow-sm transition-all duration-200 cursor-pointer`}
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    {renamingId === project.id ? (
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        onBlur={() => handleRename(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(project.id);
                          if (e.key === 'Escape') setRenamingId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 bg-surface-700 border border-primary-500 rounded-lg px-2 py-1 text-sm text-white outline-none"
                      />
                    ) : (
                      <h3
                        className="font-semibold text-white text-base truncate flex-1 pr-2"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(project.id);
                          setRenameVal(project.name);
                        }}
                      >
                        {project.name}
                      </h3>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-mono shrink-0 ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-4">
                    <Clock className="w-3 h-3" />
                    <span>{relativeTime(project.updated_at)}</span>
                    <span className="ml-auto flex items-center gap-1">
                      <Cloud className="w-3 h-3 text-green-400" />
                      local
                    </span>
                  </div>

                  {/* Hover actions */}
                  <div
                    className="absolute inset-x-4 bottom-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => navigate(`/project/${project.id}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-xs rounded-lg transition-colors"
                    >
                      <FolderOpen className="w-3 h-3" /> เปิด
                    </button>
                    <button
                      onClick={() => handleDuplicate(project.id)}
                      className="p-1.5 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-lg transition-colors"
                      title="ทำสำเนา"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDownloadZip(project.id)}
                      className="p-1.5 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-lg transition-colors"
                      title="ดาวน์โหลด ZIP"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-lg transition-colors"
                      title="ลบ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Spacer for hover actions */}
                  <div className="h-6 group-hover:h-8 transition-all" />
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showOnboarding && (
        <WelcomeModal
          onClose={() => {
            setShowOnboarding(false);
            localStorage.setItem('nextcode_onboarded', '1');
          }}
        />
      )}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
