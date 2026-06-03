import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { db } from '../../storage/db';
import {
  loadVFS, saveVFSFile, deleteVFSFile, saveVFSAsset,
  getMimeType, getMonacoLanguage, isImageFile
} from '../../storage/vfsHelpers';
import { broadcastVFSUpdate, initBroadcastChannel } from '../../storage/syncManager';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { toast } from '../shared/Toast';
import { Navbar } from '../layout/Navbar';
import { StatusBar } from '../layout/StatusBar';
import { TabBar } from '../editor/TabBar';
import { MonacoWrapper } from '../editor/MonacoWrapper';
import { FileTree } from '../sidebar/FileTree';
import { PreviewPane } from '../output/PreviewPane';
import { buildPreview } from '../../utils/blobHelpers';
import { TerminalPane } from '../output/TerminalPane';
import { AIPanel } from '../ai/AIPanel';
import { CommandPalette } from '../modals/CommandPalette';
import { SearchInFilesModal } from '../modals/SearchInFilesModal';
import { OnboardingTour } from '../shared/OnboardingTour';
import ShortcutCheatsheet from '../modals/ShortcutCheatsheet';
import { Code2, Edit3, FileText, Bot } from 'lucide-react';
import { ImagePreview } from '../editor/ImagePreview';

// Debounce helper
function useDebouncedCallback<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number
): (...args: T) => void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  return useCallback((...args: T) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fnRef.current(...args), delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);
}

export default function IDEPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const store = useAppStore();
  const {
    currentProject, setCurrentProject,
    vfs, setVFS, updateVFSFile,
    openTabs, activeTab, openTab, closeTab, setActiveTab,
    setSaveStatus,
    activeLanguage, setActiveLanguage,
    previewMode, setPreviewMode,
    aiPanelOpen, setAIPanelOpen,
    commandPaletteOpen, setCommandPaletteOpen,
    showMultiTabBanner, setShowMultiTabBanner,
    addConsoleEntry, clearConsole,
    resetProjectState,
    theme,
  } = store;

  const [loading, setLoading] = useState(true);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set());
  const [compileErrors, setCompileErrors] = useState<
    { line: number; col: number; message: string; severity: 'error' | 'warning' }[]
  >([]);
  const [previewHtml, setPreviewHtml] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const [outputPanelWidth, setOutputPanelWidth] = useState(420);
  const isDraggingSidebar = useRef(false);
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFileInput, setNewFileInput] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Ctrl+Shift+F สำหรับเปิดการค้นหาในไฟล์
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key?.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  // ? สำหรับเปิด Shortcut Cheatsheet
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable ||
        target.classList.contains('inputarea')
      ) {
        return;
      }
      if (e.key === '?') {
        e.preventDefault();
        setCheatsheetOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Mobile tabs
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview' | 'files' | 'ai'>('editor');

  // Load project
  useEffect(() => {
    if (!projectId) { navigate('/dashboard'); return; }
    async function load() {
      // Reset previous project state (clears tabs, terminal, vfs)
      resetProjectState();
      setLoading(true);
      setCompileErrors([]);

      const project = await db.projects.get(projectId!);
      if (!project) { navigate('/dashboard'); return; }
      setCurrentProject(project as unknown as typeof currentProject);
      const loadedVFS = await loadVFS(projectId!);
      setVFS(loadedVFS);

      // Open default files based on project language
      const allPaths = Object.keys(loadedVFS.flatIndex).filter(
        (p) => loadedVFS.flatIndex[p].type === 'file'
      );
      const defaultFile =
        allPaths.find((f) => f === 'index.html') ??
        allPaths.find((f) => f === 'main.py') ??
        allPaths.find((f) => f.endsWith('.c')) ??
        allPaths.find((f) => f.endsWith('.cpp')) ??
        allPaths.find((f) => f.endsWith('.py')) ??
        allPaths[0];
      if (defaultFile) openTab(defaultFile);

      // Determine preview mode
      const hasHtml = allPaths.some((f) => f.endsWith('.html'));
      setPreviewMode(hasHtml ? 'web' : 'terminal');
      setLoading(false);
    }
    load();
  }, [projectId]);

  // BroadcastChannel for multi-tab sync
  useEffect(() => {
    const cleanup = initBroadcastChannel(projectId ?? null, () => {
      setShowMultiTabBanner(true);
    });
    return cleanup;
  }, [projectId]);

  // Build preview on VFS change
  const rebuildPreview = useCallback(() => {
    if (previewMode === 'web') {
      setPreviewHtml(buildPreview(vfs));
    }
  }, [vfs, previewMode]);

  const debouncedRebuildPreview = useDebouncedCallback(rebuildPreview, 500);

  useEffect(() => {
    debouncedRebuildPreview();
  }, [vfs]);

  // File change handler
  function handleFileChange(filename: string, content: string) {
    updateVFSFile(filename, content, getMimeType(filename));
    setDirtyTabs((prev) => new Set([...prev, filename]));
    setSaveStatus('unsaved');
    debouncedSaveToDB(filename, content);
  }

  const debouncedSaveToDB = useDebouncedCallback(async (filename: string, content: string) => {
    if (!projectId) return;
    await saveVFSFile(projectId, filename, content, getMimeType(filename));
    broadcastVFSUpdate(projectId);
    setDirtyTabs((prev) => { const next = new Set(prev); next.delete(filename); return next; });
    setSaveStatus('saved');
  }, 4000);

  async function handleManualSave() {
    if (!projectId || !activeTab) return;
    setSaveStatus('saving');
    const content = vfs.files[activeTab]?.content ?? '';
    await saveVFSFile(projectId, activeTab, content, getMimeType(activeTab));
    broadcastVFSUpdate(projectId);
    setDirtyTabs((prev) => { const next = new Set(prev); next.delete(activeTab); return next; });
    setSaveStatus('saved');
    toast('success', '✓ บันทึกแล้ว');
  }

  // File tree ops
  async function handleAddFile(filename: string, content: string) {
    if (!projectId) return;
    await saveVFSFile(projectId, filename, content, getMimeType(filename));
    const now = Date.now();
    store.updateProject(projectId, { updated_at: now });
    broadcastVFSUpdate(projectId);
    const newVFS = await loadVFS(projectId);
    setVFS(newVFS);
    openTab(filename);
    toast('success', `เพิ่มไฟล์ ${filename} แล้ว`);
  }

  async function handleDeleteFile(filename: string) {
    if (!projectId) return;
    closeTab(filename);
    await deleteVFSFile(projectId, filename);
    const now = Date.now();
    store.updateProject(projectId, { updated_at: now });
    broadcastVFSUpdate(projectId);
    const newVFS = await loadVFS(projectId);
    setVFS(newVFS);
    toast('info', `ลบ ${filename} แล้ว`);
  }

  async function handleRenameFile(oldName: string, newName: string) {
    if (!projectId) return;
    const content = vfs.files[oldName]?.content ?? '';
    await saveVFSFile(projectId, newName, content, getMimeType(newName));
    await deleteVFSFile(projectId, oldName);
    closeTab(oldName);
    const now = Date.now();
    store.updateProject(projectId, { updated_at: now });
    broadcastVFSUpdate(projectId);
    const newVFS = await loadVFS(projectId);
    setVFS(newVFS);
    openTab(newName);
  }

  async function handleAddAsset(name: string, buffer: ArrayBuffer, mimeType: string) {
    if (!projectId) return;
    await saveVFSAsset(projectId, name, buffer, mimeType);
    const now = Date.now();
    store.updateProject(projectId, { updated_at: now });
    broadcastVFSUpdate(projectId);
    const newVFS = await loadVFS(projectId);
    setVFS(newVFS);
  }

  async function handleDeleteAsset(name: string) {
    if (!projectId) return;
    await deleteVFSFile(projectId, name);
    const now = Date.now();
    store.updateProject(projectId, { updated_at: now });
    broadcastVFSUpdate(projectId);
    const newVFS = await loadVFS(projectId);
    setVFS(newVFS);
  }

  // AI fix apply
  function handleApplyFix(fixes: Record<string, string>) {
    for (const [filename, content] of Object.entries(fixes)) {
      handleFileChange(filename, content);
    }
  }

  // Insert snippet at current cursor (simplified: append to active file)
  function handleInsertSnippet(code: string) {
    if (!activeTab) return;
    const current = vfs.files[activeTab]?.content ?? '';
    handleFileChange(activeTab, current + '\n' + code);
  }

  // Sidebar resize
  function handleSidebarMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDraggingSidebar.current = true;
    function onMove(me: MouseEvent) {
      if (!isDraggingSidebar.current) return;
      setSidebarWidth(Math.max(150, Math.min(400, me.clientX)));
    }
    function onUp() {
      isDraggingSidebar.current = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Active language tracking
  useEffect(() => {
    if (activeTab) {
      setActiveLanguage(getMonacoLanguage(activeTab));
      const hasHtml = Object.keys(vfs.files).some((f) => f.endsWith('.html'));
      const isWebFile = ['html', 'css', 'js'].includes(activeTab.split('.').pop() ?? '');
      setPreviewMode(hasHtml && isWebFile ? 'web' : 'terminal');
    }
  }, [activeTab]);

  if (loading) {
    return <LoadingSpinner fullscreen message="กำลังโหลดโปรเจกต์..." />;
  }

  const fileList = Object.keys(vfs.files);
  const assetList = Object.keys(vfs.assets);

  // Build console log handler
  function handleConsoleEntry(entry: Parameters<typeof addConsoleEntry>[0]) {
    addConsoleEntry(entry);
  }

  // Ask AI from error banner
  function handleAskAI(errorMsg: string) {
    setAIPanelOpen(true);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Navbar */}
      <ErrorBoundary>
        <Navbar onSave={handleManualSave} onToggleCommandPalette={() => setCommandPaletteOpen(true)} />
      </ErrorBoundary>

      {/* Multi-tab banner */}
      {showMultiTabBanner && (
        <div className="flex items-center justify-between px-4 py-2 bg-yellow-900/60 border-b border-yellow-700 text-yellow-300 text-xs shrink-0">
          <span>⚠ มีการแก้ไขจาก tab อื่น</span>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                const newVFS = await loadVFS(projectId!);
                setVFS(newVFS);
                setShowMultiTabBanner(false);
              }}
              className="px-2 py-0.5 bg-yellow-700 hover:bg-yellow-600 rounded transition-colors"
            >
              โหลดใหม่
            </button>
            <button onClick={() => setShowMultiTabBanner(false)} className="opacity-60 hover:opacity-100">
              เพิกเฉย
            </button>
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop */}
        <div id="ide-sidebar" className="hidden md:flex flex-col shrink-0 overflow-hidden" style={{ width: sidebarWidth }}>
          <ErrorBoundary>
            <FileTree
              projectId={projectId!}
              files={fileList}
              assets={assetList}
              activeFile={activeTab}
              onFileClick={openTab}
              onFileAdd={handleAddFile}
              onFileDelete={handleDeleteFile}
              onFileRename={handleRenameFile}
              onAssetAdd={handleAddAsset}
              onAssetDelete={handleDeleteAsset}
              onInsertSnippet={handleInsertSnippet}
            />
          </ErrorBoundary>
        </div>

        {/* Sidebar resize handle */}
        <div
          className="resizer resizer-v hidden md:block"
          onMouseDown={handleSidebarMouseDown}
          onDoubleClick={() => setSidebarWidth(220)}
        />

        {/* Editor + Output */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <ErrorBoundary>
            <TabBar
              tabs={openTabs}
              activeTab={activeTab}
              dirtyTabs={dirtyTabs}
              onTabClick={openTab}
              onTabClose={closeTab}
              onNewFile={() => setShowNewFileModal(true)}
            />
          </ErrorBoundary>

          {/* Editor + Preview row */}
          <div className="flex-1 flex overflow-hidden">
            {/* Editor */}
            <div id="ide-editor" className="flex-1 relative overflow-hidden" ref={editorContainerRef}>
              {openTabs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-zinc-600">
                  <Code2 className="w-12 h-12 mb-4" />
                  <p className="text-sm">เปิดไฟล์จาก sidebar เพื่อเริ่มเขียนโค้ด</p>
                </div>
              ) : (
                openTabs.map((tab) => (
                  <ErrorBoundary key={tab}>
                    <div className="h-full" style={{ display: tab === activeTab ? 'block' : 'none' }}>
                      {isImageFile(tab) && !tab.toLowerCase().endsWith('.svg') ? (
                        <ImagePreview filename={tab} vfs={vfs} />
                      ) : (
                        <MonacoWrapper
                          filename={tab}
                          content={vfs.files[tab]?.content ?? ''}
                          isActive={tab === activeTab}
                          onChange={(val) => handleFileChange(tab, val)}
                          onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
                          onSave={handleManualSave}
                          onRun={() => {}}
                          onToggleAI={() => setAIPanelOpen(!aiPanelOpen)}
                          markers={tab === activeTab ? compileErrors : []}
                        />
                      )}
                    </div>
                  </ErrorBoundary>
                ))
              )}
            </div>

            {/* Output panel — desktop */}
            <div id="ide-output-panel" className="hidden md:flex flex-col shrink-0" style={{ width: outputPanelWidth }}>
              <ErrorBoundary>
                {previewMode === 'web' ? (
                  <PreviewPane
                    html={previewHtml}
                    onConsoleEntry={handleConsoleEntry}
                    onAskAI={handleAskAI}
                  />
                ) : (
                  <TerminalPane
                    language={activeLanguage}
                    currentFile={activeTab ?? ''}
                    currentContent={activeTab ? (vfs.files[activeTab]?.content ?? '') : ''}
                    onCompileErrors={setCompileErrors}
                  />
                )}
              </ErrorBoundary>
            </div>
          </div>

          {/* AI Panel */}
          <ErrorBoundary>
            <AIPanel onApplyFix={handleApplyFix} />
          </ErrorBoundary>
        </div>
      </div>

      {/* Status bar */}
      <ErrorBoundary>
        <StatusBar
          filename={activeTab ?? ''}
          language={activeLanguage}
          line={cursorLine}
          col={cursorCol}
        />
      </ErrorBoundary>

      {/* Mobile bottom tab bar */}
      <div className="md:hidden flex border-t border-border bg-surface-950 shrink-0">
        {[
          { key: 'editor', label: 'แก้โค้ด', icon: <Edit3 className="w-4 h-4" /> },
          { key: 'preview', label: 'ผลลัพธ์', icon: <FileText className="w-4 h-4" /> },
          { key: 'files', label: 'ไฟล์', icon: <Code2 className="w-4 h-4" /> },
          { key: 'ai', label: 'AI', icon: <Bot className="w-4 h-4" /> },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setMobileTab(t.key as typeof mobileTab)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
              mobileTab === t.key ? 'text-primary-400' : 'text-zinc-600'
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* New file modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-800 border border-border rounded-2xl p-5 w-72 shadow-surface-lg animate-slide-up">
            <h3 className="text-sm font-semibold text-white mb-3">ไฟล์ใหม่</h3>
            <input
              autoFocus
              value={newFileInput}
              onChange={(e) => setNewFileInput(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await handleAddFile(newFileInput, '');
                  setShowNewFileModal(false);
                  setNewFileInput('');
                }
                if (e.key === 'Escape') { setShowNewFileModal(false); setNewFileInput(''); }
              }}
              placeholder="ชื่อไฟล์.html"
              className="w-full px-3 py-2 bg-surface-700 border border-border rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors"
            />
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setShowNewFileModal(false); setNewFileInput(''); }} className="flex-1 py-2 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-xl text-xs transition-colors">ยกเลิก</button>
              <button
                onClick={async () => {
                  await handleAddFile(newFileInput, '');
                  setShowNewFileModal(false);
                  setNewFileInput('');
                }}
                className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs transition-colors"
              >
                สร้าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Palette */}
      {commandPaletteOpen && (
        <CommandPalette
          files={fileList}
          onClose={() => setCommandPaletteOpen(false)}
          onOpenFile={openTab}
          onSave={handleManualSave}
          onToggleAI={() => setAIPanelOpen(!aiPanelOpen)}
        />
      )}

      {/* Search In Files Modal */}
      {searchOpen && (
        <SearchInFilesModal onClose={() => setSearchOpen(false)} />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour />

      {/* Shortcut Cheatsheet */}
      {cheatsheetOpen && (
        <ShortcutCheatsheet onClose={() => setCheatsheetOpen(false)} />
      )}
    </div>
  );
}
