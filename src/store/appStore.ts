import { create } from 'zustand';
import { VFSState } from '../types';
import { setFileAtPath, setFolderAtPath, deleteAtPath, moveNode, buildFlatIndex, buildCompatibilityMaps } from '../storage/vfsHelpers';

export interface ConsoleEntry {
  id: string;
  timestamp: number;
  type: 'log' | 'warn' | 'error';
  args: string[];
}

export interface TerminalEntry {
  id: string;
  timestamp: number;
  type: 'output' | 'error' | 'system';
  content: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

export interface Project {
  id: string;
  name: string;
  language: 'html' | 'python' | 'c' | 'cpp' | 'blank';
  template: string;
  created_at: number;
  updated_at: number;
  drive_folder_id?: string;
}

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'offline';
export type SyncStatus = 'synced' | 'syncing' | 'local' | 'error';
export type AIMode = 'fix' | 'generate' | 'explain';
export type PreviewWidth = '375' | '768' | '100%';
export type UserMode = 'beginner' | 'expert';

export interface AIResponse {
  explanation: string;
  fixes: Record<string, string>;
  rawText: string;
}

interface AppState {
  user: User | null;
  accessToken: string | null;
  tokenExpiry: number | null;
  userMode: UserMode;
  projects: Project[];
  currentProject: Project | null;
  vfs: VFSState;
  openTabs: string[];
  activeTab: string | null;
  saveStatus: SaveStatus;
  syncStatus: SyncStatus;
  activeLanguage: string;
  previewMode: 'web' | 'terminal';
  aiPanelOpen: boolean;
  aiMode: AIMode;
  aiLoading: boolean;
  aiResponse: AIResponse | null;
  consoleErrors: ConsoleEntry[];
  consoleLogs: ConsoleEntry[];
  terminalOutput: TerminalEntry[];
  previewWidth: PreviewWidth;
  commandPaletteOpen: boolean;
  theme: 'dark' | 'light';
  fontSize: number;
  showMultiTabBanner: boolean;

  setUser: (user: User | null) => void;
  setAccessToken: (token: string | null, expiry: number | null) => void;
  setUserMode: (mode: UserMode) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  removeProject: (id: string) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  setCurrentProject: (project: Project | null) => void;
  setVFS: (vfs: VFSState) => void;
  updateVFSFile: (filename: string, content: string | ArrayBuffer, mimeType: string, isDirty?: boolean) => void;
  deleteVFSPath: (path: string) => void;
  createVFSFolder: (path: string) => void;
  renameVFSPath: (oldPath: string, newPath: string) => void;
  toggleFolderExpanded: (path: string) => void;
  openTab: (filename: string) => void;
  closeTab: (filename: string) => void;
  setActiveTab: (filename: string | null) => void;
  setSaveStatus: (status: SaveStatus) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setActiveLanguage: (lang: string) => void;
  setPreviewMode: (mode: 'web' | 'terminal') => void;
  setAIPanelOpen: (open: boolean) => void;
  setAIMode: (mode: AIMode) => void;
  setAILoading: (loading: boolean) => void;
  setAIResponse: (response: AIResponse | null) => void;
  addConsoleEntry: (entry: ConsoleEntry) => void;
  clearConsole: () => void;
  addTerminalEntry: (entry: TerminalEntry) => void;
  clearTerminal: () => void;
  setPreviewWidth: (w: PreviewWidth) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  setFontSize: (size: number) => void;
  setShowMultiTabBanner: (show: boolean) => void;
  logout: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  accessToken: null,
  tokenExpiry: null,
  userMode: 'beginner',
  projects: [],
  currentProject: null,
  vfs: { tree: {}, flatIndex: {}, files: {}, assets: {} },
  openTabs: [],
  activeTab: null,
  saveStatus: 'saved',
  syncStatus: 'local',
  activeLanguage: 'html',
  previewMode: 'web',
  aiPanelOpen: false,
  aiMode: 'fix',
  aiLoading: false,
  aiResponse: null,
  consoleErrors: [],
  consoleLogs: [],
  terminalOutput: [],
  previewWidth: '100%',
  commandPaletteOpen: false,
  theme: 'dark',
  fontSize: 14,
  showMultiTabBanner: false,

  setUser: (user) => set({ user }),
  setAccessToken: (accessToken, tokenExpiry) => set({ accessToken, tokenExpiry }),
  setUserMode: (userMode) => set({ userMode }),
  setProjects: (projects) => set({ projects }),
  addProject: (project) => set((s) => ({ projects: [project, ...s.projects] })),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),
  updateProject: (id, updates) =>
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? { ...p, ...updates } : p)),
      currentProject:
        s.currentProject?.id === id ? { ...s.currentProject, ...updates } : s.currentProject,
    })),
  setCurrentProject: (currentProject) => set({ currentProject }),
  setVFS: (vfs) => set({ vfs }),
  updateVFSFile: (path, content, mimeType, isDirty) =>
    set((s) => {
      const newTree = setFileAtPath(s.vfs.tree, path, { content, mimeType, isDirty: isDirty ?? true });
      const newFlatIndex = buildFlatIndex(newTree);
      const { files, assets } = buildCompatibilityMaps(newTree);
      return { vfs: { tree: newTree, flatIndex: newFlatIndex, files, assets } };
    }),
  deleteVFSPath: (path) =>
    set((s) => {
      const newTree = deleteAtPath(s.vfs.tree, path);
      const newFlatIndex = buildFlatIndex(newTree);
      const { files, assets } = buildCompatibilityMaps(newTree);
      const prefix = path.endsWith('/') ? path : `${path}/`;
      const openTabs = s.openTabs.filter(t => t !== path && !t.startsWith(prefix));
      const activeTab = openTabs.includes(s.activeTab || '') ? s.activeTab : (openTabs[openTabs.length - 1] ?? null);
      return { vfs: { tree: newTree, flatIndex: newFlatIndex, files, assets }, openTabs, activeTab };
    }),
  createVFSFolder: (path) =>
    set((s) => {
      const newTree = setFolderAtPath(s.vfs.tree, path, { isExpanded: false, isDirty: true });
      const newFlatIndex = buildFlatIndex(newTree);
      const { files, assets } = buildCompatibilityMaps(newTree);
      return { vfs: { tree: newTree, flatIndex: newFlatIndex, files, assets } };
    }),
  renameVFSPath: (oldPath, newPath) =>
    set((s) => {
      const newTree = moveNode(s.vfs.tree, oldPath, newPath);
      const newFlatIndex = buildFlatIndex(newTree);
      const { files, assets } = buildCompatibilityMaps(newTree);
      const openTabs = s.openTabs.map(t => {
        if (t === oldPath) return newPath;
        if (t.startsWith(oldPath + '/')) {
          return newPath + t.substring(oldPath.length);
        }
        return t;
      });
      const activeTab = s.activeTab === oldPath ? newPath : (s.activeTab?.startsWith(oldPath + '/') ? newPath + s.activeTab.substring(oldPath.length) : s.activeTab);
      return { vfs: { tree: newTree, flatIndex: newFlatIndex, files, assets }, openTabs, activeTab };
    }),
  toggleFolderExpanded: (path) =>
    set((s) => {
      const node = s.vfs.flatIndex[path];
      if (!node || node.type !== 'folder') return {};
      const isExpanded = !node.isExpanded;
      const newTree = setFolderAtPath(s.vfs.tree, path, { isExpanded });
      const newFlatIndex = buildFlatIndex(newTree);
      const { files, assets } = buildCompatibilityMaps(newTree);
      return { vfs: { tree: newTree, flatIndex: newFlatIndex, files, assets } };
    }),
  openTab: (filename) =>
    set((s) => {
      if (s.openTabs.includes(filename)) return { activeTab: filename };
      const tabs = [...s.openTabs, filename].slice(-10);
      return { openTabs: tabs, activeTab: filename };
    }),
  closeTab: (filename) =>
    set((s) => {
      const tabs = s.openTabs.filter((t) => t !== filename);
      const active =
        s.activeTab === filename ? (tabs[tabs.length - 1] ?? null) : s.activeTab;
      return { openTabs: tabs, activeTab: active };
    }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setActiveLanguage: (activeLanguage) => set({ activeLanguage }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  setAIPanelOpen: (aiPanelOpen) => set({ aiPanelOpen }),
  setAIMode: (aiMode) => set({ aiMode }),
  setAILoading: (aiLoading) => set({ aiLoading }),
  setAIResponse: (aiResponse) => set({ aiResponse }),
  addConsoleEntry: (entry) =>
    set((s) => ({
      consoleLogs: [...s.consoleLogs.slice(-200), entry],
      consoleErrors:
        entry.type === 'error'
          ? [...s.consoleErrors.slice(-50), entry]
          : s.consoleErrors,
    })),
  clearConsole: () => set({ consoleLogs: [], consoleErrors: [] }),
  addTerminalEntry: (entry) =>
    set((s) => ({ terminalOutput: [...s.terminalOutput.slice(-500), entry] })),
  clearTerminal: () => set({ terminalOutput: [] }),
  setPreviewWidth: (previewWidth) => set({ previewWidth }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setTheme: (theme) => set({ theme }),
  setFontSize: (fontSize) => set({ fontSize }),
  setShowMultiTabBanner: (showMultiTabBanner) => set({ showMultiTabBanner }),
  logout: () =>
    set({
      user: null,
      accessToken: null,
      tokenExpiry: null,
      currentProject: null,
      openTabs: [],
      activeTab: null,
      vfs: { tree: {}, flatIndex: {}, files: {}, assets: {} },
      aiResponse: null,
      consoleLogs: [],
      consoleErrors: [],
      terminalOutput: [],
    }),
}));
