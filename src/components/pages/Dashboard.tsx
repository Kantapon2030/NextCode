import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { db, deleteProjectFromDB } from '../../storage/db';
import { saveVFSFile, saveVFSAsset } from '../../storage/vfsHelpers';
import { getTemplate, TEMPLATES } from '../../templates';
import { toast } from '../shared/Toast';
import { LoadingSpinner, SkeletonCard } from '../shared/LoadingSpinner';
import NewProjectModal from '../modals/NewProjectModal';
import SettingsModal from '../modals/SettingsModal';
import {
  readDroppedItems, detectLanguage, isImage, isTextFile, getMimeType,
} from '../../utils/folderImport';
import {
  getGitHubToken, fetchGitHubUser,
} from '../../services/githubAuth';
import {
  getOrCreateGist, loadFromGist, saveToGist, mergeProjects,
  saveProjectToLocal, loadLocalProjects, serializeProject
} from '../../services/gistStorage';
import {
  getOrCreateDriveFile, loadFromDrive, saveToDrive
} from '../../services/googleDriveStorage';
import { GitHubLoginModal } from '../modals/GitHubLoginModal';
import {
  Code2, Plus, Search, LogOut, Settings, Clock, Cloud, CloudOff, Loader2,
  Copy, Download, Trash2, FolderOpen, User, ChevronDown, X, Upload, FolderInput,
  AlertCircle,
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
  const { user, accessToken, projects, setProjects, addProject, removeProject, logout, theme, supabaseUser, currentProject, resetWorkspace, setCurrentProject, setSyncStatus } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [avatarMenu, setAvatarMenu] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [showGhLogin, setShowGhLogin] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function init() {
      try {
        if (accessToken) {
          setSyncStatus('syncing');
          try {
            const fileId = await getOrCreateDriveFile(accessToken);
            const data = await loadFromDrive(accessToken, fileId);

            const localProjects = await loadLocalProjects();
            const merged = mergeProjects(localProjects, data.projects || []);

            const finalProjs = [];
            for (const sp of merged) {
              const p = await saveProjectToLocal(sp);
              finalProjs.push(p);
            }
            
            setProjects(finalProjs.sort((a, b) => b.updated_at - a.updated_at));
            setSyncStatus('synced');
            setSyncError(null);
          } catch (e) {
            console.error('Google Drive Cloud sync error:', e);
            setSyncStatus('error');
            const errMsg = e instanceof Error ? e.message : String(e);
            setSyncError(errMsg);
            const projs = await db.projects.orderBy('updated_at').reverse().toArray();
            setProjects(projs as any);
          }
        } else {
          const token = getGitHubToken();
          if (token) {
            setSyncStatus('syncing');
            try {
              await fetchGitHubUser(token);
              const gistId = await getOrCreateGist(token);
              const data = await loadFromGist(token, gistId);

              const localProjects = await loadLocalProjects();
              const merged = mergeProjects(localProjects, data.projects || []);

              const finalProjs = [];
              for (const sp of merged) {
                const p = await saveProjectToLocal(sp);
                finalProjs.push(p);
              }
              
              setProjects(finalProjs.sort((a,b) => b.updated_at - a.updated_at));
              setSyncStatus('synced');
            } catch (e) {
              console.error('GitHub Cloud sync error:', e);
              setSyncStatus('error');
              const projs = await db.projects.orderBy('updated_at').reverse().toArray();
              setProjects(projs as any);
            }
          } else {
            const projs = await db.projects.orderBy('updated_at').reverse().toArray();
            setProjects(projs as any);
          }
        }
      } finally {
        setLoading(false);
      }
    }
    init();

    // Check onboarding - auto bypass onboarding to skip api key and experience prompt
    const onboarded = localStorage.getItem('nextcode_onboarded');
    if (!onboarded) {
      localStorage.setItem('nextcode_onboarded', '1');
    }
  }, [accessToken]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (projects.length === 0) return;

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (accessToken) {
        try {
          setSyncStatus('syncing');
          const fileId = localStorage.getItem('google_drive_file_id') || await getOrCreateDriveFile(accessToken);
          
          const serialized = [];
          for (const p of projects) {
            serialized.push(await serializeProject(p));
          }

          await saveToDrive(accessToken, fileId, {
            version: 1,
            projects: serialized,
            updatedAt: Date.now(),
          });
          setSyncStatus('synced');
          setSyncError(null);
        } catch (e) {
          console.error('Google Drive save error:', e);
          setSyncStatus('error');
          const errMsg = e instanceof Error ? e.message : String(e);
          setSyncError(errMsg);
        }
      } else {
        const token = getGitHubToken();
        if (!token) return;
        try {
          const gistId = localStorage.getItem('gh_gist_id');
          if (!gistId) return;
          setSyncStatus('syncing');
          
          const serialized = [];
          for (const p of projects) {
            serialized.push(await serializeProject(p));
          }

          await saveToGist(token, gistId, {
            version: 1,
            projects: serialized,
            updatedAt: Date.now(),
          });
          setSyncStatus('synced');
        } catch (e) {
          console.error('GitHub save error:', e);
          setSyncStatus('error');
        }
      }
    }, 3000);

    return () => clearTimeout(saveTimer.current);
  }, [projects, accessToken]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarMenu(false);
      }
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const filtered = projects.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesTab = activeTab === 'all' || p.language === activeTab;
    return matchesSearch && matchesTab;
  });

  const handleDeleteProject = async (projectId: string, projectName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      `ลบโปรเจกต์ "${projectName}"?\nไฟล์ทั้งหมดจะถูกลบถาวร ไม่สามารถกู้คืนได้`
    );
    if (!confirmed) return;

    try {
      await deleteProjectFromDB(projectId);

      // (Optional) Call your Supabase API if needed here
      // if (navigator.onLine && supabaseUser) { await deleteProjectFromSupabase(projectId); }

      removeProject(projectId);

      if (currentProject?.id === projectId) {
        resetWorkspace();
        setCurrentProject(null);
        navigate('/dashboard');
      }

      toast('success', `ลบ "${projectName}" แล้ว`);
    } catch (err) {
      console.error('Delete project error:', err);
      toast('error', err instanceof Error ? err.message : 'ลบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    }
  };

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
    const zip = new JSZip();
    for (const f of files) {
      if (f.type === 'file' && f.content !== undefined && f.content !== null) {
        zip.file(f.path, f.content);
      }
    }
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

  // ── Folder / File import ──────────────────────────────────────
  const handleImportFiles = useCallback(async (dataTransfer: DataTransfer) => {
    setImporting(true);
    setIsDragOver(false);
    try {
      setImportProgress('กำลังอ่านไฟล์...');
      const imported = await readDroppedItems(dataTransfer);
      if (imported.length === 0) {
        toast('error', 'ไม่พบไฟล์ที่รองรับ');
        return;
      }

      // ตั้งชื่อโปรเจกต์จากชื่อโฟลเดอร์แรก หรือ "โปรเจกต์ที่นำเข้า"
      const firstEntry = dataTransfer.items?.[0];
      const firstEntryName =
        (firstEntry as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
          ?.webkitGetAsEntry?.()?.name ||
        imported[0]?.file.name.replace(/\.[^.]+$/, '') ||
        'โปรเจกต์ที่นำเข้า';

      const lang = detectLanguage(imported);
      const projectId = Math.random().toString(36).slice(2);
      const now = Date.now();

      await db.projects.add({
        id: projectId,
        name: firstEntryName,
        language: lang,
        template: 'import',
        created_at: now,
        updated_at: now,
      });

      let count = 0;
      for (const { path, file } of imported) {
        setImportProgress(`กำลังนำเข้า ${count + 1}/${imported.length}: ${path}`);
        const buf = await file.arrayBuffer();

        if (isTextFile(file.name)) {
          const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
          await saveVFSFile(projectId, path, text, getMimeType(file.name), undefined, false);
        } else {
          // บันทึกเป็น asset (รูปภาพ หรือไฟล์ binary อื่นๆ)
          await saveVFSAsset(projectId, path, buf, file.type || getMimeType(file.name), undefined, false);
        }
        count++;
      }

      addProject({
        id: projectId,
        name: firstEntryName,
        language: lang,
        template: 'import',
        created_at: now,
        updated_at: now,
      });

      toast('success', `นำเข้า ${count} ไฟล์แล้ว → เปิดโปรเจกต์!`);
      navigate(`/project/${projectId}`);
    } catch (err) {
      console.error(err);
      toast('error', 'นำเข้าไฟล์ไม่สำเร็จ');
    } finally {
      setImporting(false);
      setImportProgress('');
    }
  }, [addProject, navigate]);

  async function handleFolderInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    // Simulate DataTransfer-like structure using FileList
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    // For webkitRelativePath: rebuild paths
    const imported = files.map((f) => ({
      path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      file: f,
    }));
    setImporting(true);
    try {
      const lang = detectLanguage(imported);
      const folderName = imported[0]?.path.split('/')[0] || 'โปรเจกต์ที่นำเข้า';
      const projectId = Math.random().toString(36).slice(2);
      const now = Date.now();
      await db.projects.add({
        id: projectId, name: folderName, language: lang,
        template: 'import', created_at: now, updated_at: now,
      });
      let count = 0;
      for (const { path, file } of imported) {
        setImportProgress(`${count + 1}/${imported.length}: ${path}`);
        const buf = await file.arrayBuffer();
        if (isTextFile(file.name)) {
          await saveVFSFile(projectId, path, new TextDecoder('utf-8', { fatal: false }).decode(buf), getMimeType(file.name), undefined, false);
        } else {
          await saveVFSAsset(projectId, path, buf, file.type || getMimeType(file.name), undefined, false);
        }
        count++;
      }
      addProject({ id: projectId, name: folderName, language: lang, template: 'import', created_at: now, updated_at: now });
      toast('success', `นำเข้า ${count} ไฟล์แล้ว`);
      navigate(`/project/${projectId}`);
    } catch { toast('error', 'นำเข้าไม่สำเร็จ'); }
    finally { setImporting(false); setImportProgress(''); e.target.value = ''; }
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

  function handleConnectGitHub() {
    setShowGhLogin(true);
  }

  const bg = theme === 'dark' ? 'bg-surface-900' : 'bg-zinc-50';
  const surface = theme === 'dark' ? 'bg-surface-800 border-border' : 'bg-white border-zinc-200';
  const navBg = theme === 'dark' ? 'bg-surface-950/80 border-border' : 'bg-white/80 border-zinc-200';

  // สกัดลิงก์เปิดใช้งาน API
  let apiEnableUrl = '';
  if (syncError) {
    const match = syncError.match(/https:\/\/console\.developers\.google\.com\/[^\s]*/);
    if (match) {
      apiEnableUrl = match[0];
    }
  }

  return (
    <div className={`${bg} h-full overflow-y-auto flex flex-col`}>
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
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" crossOrigin="anonymous" />
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
              {!getGitHubToken() && (
                <button
                  onClick={() => { handleConnectGitHub(); setAvatarMenu(false); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-surface-700 transition-colors border-b border-border"
                >
                  <Cloud className="w-4 h-4" />
                  เชื่อมต่อ GitHub (Cloud)
                </button>
              )}
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
        {syncError && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-zinc-300 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-slide-down">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-white text-sm">การเชื่อมต่อคลาวด์ขัดข้อง (Google Drive Sync Error)</h4>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  {syncError.includes('Google Drive API has not been used')
                    ? 'สิทธิ์การเข้าใช้งานคลาวด์ล้มเหลว เนื่องจากโครงการ Google Cloud ของคุณยังไม่ได้เปิดใช้บริการ Google Drive API'
                    : syncError}
                </p>
                {apiEnableUrl && (
                  <p className="text-xs text-zinc-500 mt-1">
                    กรุณาคลิกปุ่ม "เปิดใช้งาน API" ด้านล่างเพื่อเปิดสิทธิ์การใช้งานของโครงการ จากนั้นรีเฟรชหน้านี้ครับ
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 self-end md:self-center">
              {apiEnableUrl && (
                <a
                  href={apiEnableUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-colors shadow-glow-sm"
                >
                  เปิดใช้งาน API
                </a>
              )}
              <button
                onClick={() => setSyncError(null)}
                className="p-1.5 hover:bg-surface-800 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">โปรเจกต์ของฉัน</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {projects.length > 0 ? `${projects.length} โปรเจกต์` : 'ยังไม่มีโปรเจกต์'}
            </p>
          </div>
        </div>

        {/* ── Drop Zone (compact) ── */}
        <div
          onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
          }}
          onDrop={async (e) => { e.preventDefault(); await handleImportFiles(e.dataTransfer); }}
          onClick={() => folderInputRef.current?.click()}
          className={`flex items-center gap-3 mb-5 px-4 py-3 rounded-xl border border-dashed cursor-pointer transition-all duration-200 ${
            isDragOver
              ? 'border-primary-400 bg-primary-900/20'
              : 'border-border hover:border-primary-600/50 hover:bg-surface-800/30'
          }`}
        >
          {importing ? (
            <>
              <Loader2 className="w-5 h-5 text-primary-400 animate-spin shrink-0" />
              <span className="text-sm text-primary-300 font-medium flex-1 truncate">
                {importProgress || 'กำลังนำเข้า...'}
              </span>
            </>
          ) : (
            <>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                isDragOver ? 'bg-primary-600' : 'bg-surface-700'
              }`}>
                <FolderInput className={`w-4 h-4 ${isDragOver ? 'text-white' : 'text-primary-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">
                  {isDragOver ? '🎯 วางไฟล์ที่นี่เลย!' : 'ลากโฟลเดอร์หรือไฟล์มาวางเพื่อสร้างโปรเจกต์'}
                </p>
                <p className="text-xs text-zinc-600 truncate">
                  HTML · CSS · JS · Python · C/C++ · รูปภาพ · รองรับทั้งโฟลเดอร์
                </p>
              </div>
              <span className="text-xs text-zinc-600 shrink-0 hidden sm:block">คลิกเพื่อเลือก</span>
            </>
          )}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={handleFolderInputChange}
          />

        </div>

        {/* CSS ซ่อน Scrollbar ของแท็บคัดกรองประเภทโปรเจกต์ */}
        <style dangerouslySetInnerHTML={{__html: `
          .scrollbar-none::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-none {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}} />

        {/* แถบคัดกรองประเภทโปรเจกต์ (Horizontal Scrollable Tabs) */}
        {!loading && projects.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 -mx-2 px-2 scrollbar-none whitespace-nowrap select-none animate-slide-down">
            {[
              { id: 'all', label: 'ทั้งหมด', color: 'from-primary-500 to-purple-600' },
              { id: 'html', label: 'HTML/CSS/JS', color: 'from-orange-500 to-amber-500' },
              { id: 'python', label: 'Python', color: 'from-blue-500 to-cyan-500' },
              { id: 'c', label: 'C', color: 'from-gray-500 to-slate-500' },
              { id: 'cpp', label: 'C++', color: 'from-cyan-500 to-blue-500' },
              { id: 'blank', label: 'Blank', color: 'from-zinc-500 to-stone-500' },
            ].map((tab) => {
              const count = tab.id === 'all'
                ? projects.length
                : projects.filter((p) => p.language === tab.id).length;
              const isActive = activeTab === tab.id;
              
              let btnClass = "";
              if (isActive) {
                btnClass = `bg-gradient-to-r ${tab.color} text-white shadow-glow-sm scale-[1.02] border-transparent`;
              } else {
                btnClass = theme === 'dark' 
                  ? 'bg-surface-800 hover:bg-surface-700 text-zinc-400 hover:text-zinc-200 border-border'
                  : 'bg-white hover:bg-zinc-100 text-zinc-600 hover:text-zinc-900 border-zinc-200';
              }

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-semibold transition-all duration-200 shrink-0 ${btnClass}`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    isActive 
                      ? 'bg-white/20 text-white' 
                      : theme === 'dark' ? 'bg-surface-900 text-zinc-500' : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

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
              {search || activeTab !== 'all' ? 'ไม่พบโปรเจกต์ที่ตรงกับเงื่อนไข' : 'สร้างโปรเจกต์แรกของคุณ'}
            </h3>
            <p className="text-zinc-500 text-sm mb-6">
              {search || activeTab !== 'all' ? 'ลองปรับคำค้นหาหรือตัวเลือกแท็บภาษา' : 'เลือกภาษาและเริ่มเขียนโค้ดได้เลย'}
            </p>
            {!(search || activeTab !== 'all') && (
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
                      onClick={(e) => handleDeleteProject(project.id, project.name, e)}
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

      {/* Footer */}
      <footer className="text-center py-6 text-zinc-600 text-xs border-t border-border/10 mt-auto shrink-0">
        <div className="flex flex-col items-center justify-center gap-1">
          <p>Designed & Developed by <span className="text-zinc-400 font-semibold">Kantapon</span></p>
          <p className="opacity-65 text-[10px]">Powered by Gemini 2.0 Flash</p>
        </div>
      </footer>

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showGhLogin && (
        <GitHubLoginModal
          onSuccess={() => {
            setShowGhLogin(false);
            window.location.reload();
          }}
          onSkip={() => setShowGhLogin(false)}
        />
      )}
    </div>
  );
}
