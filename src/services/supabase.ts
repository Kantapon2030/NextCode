// ─────────────────────────────────────────────────────────────────────────────
// Supabase Cloud Service — Nextcode IDE
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export type { User as SupabaseUser } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL  as string | undefined;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** true เมื่อ env vars ถูก set — ถ้าไม่มีจะ gracefully fallback เป็น local-only */
export const isSupabaseConfigured =
  !!supabaseUrl && supabaseUrl !== 'https://xxxx.supabase.co' &&
  !!supabaseKey && supabaseKey !== 'your-anon-key';

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Google OAuth redirect flow (ใช้ใน Landing / Dashboard) */
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'email profile openid',
      redirectTo: window.location.origin + '/dashboard',
    },
  });
  if (error) throw error;
}

/** Sign in ด้วย Google ID token (สำหรับ GSI One-Tap credential) */
export async function signInWithGoogleIdToken(idToken: string): Promise<SupabaseUser | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) {
    console.warn('[Supabase] signInWithIdToken error:', error.message);
    return null;
  }
  return data.user ?? null;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function getCurrentUser(): Promise<SupabaseUser | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Subscribe to auth state changes */
export function onAuthStateChange(
  callback: (user: SupabaseUser | null) => void
) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
}

// ── Projects CRUD ─────────────────────────────────────────────────────────────

export interface CloudProject {
  id: string;
  user_id: string;
  name: string;
  language: string;
  template: string;
  created_at: string;
  updated_at: string;
}

export async function fetchProjects(userId: string): Promise<CloudProject[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) { console.warn('[Supabase] fetchProjects:', error.message); return []; }
  return data ?? [];
}

export async function createCloudProject(project: {
  id: string;
  userId: string;
  name: string;
  language: string;
  template: string;
}): Promise<CloudProject | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('projects')
    .insert({
      id:       project.id,
      user_id:  project.userId,
      name:     project.name,
      language: project.language,
      template: project.template,
    })
    .select()
    .single();
  if (error) { console.warn('[Supabase] createProject:', error.message); return null; }
  return data;
}

export async function deleteCloudProject(projectId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) console.warn('[Supabase] deleteProject:', error.message);
}

export async function updateCloudProjectName(projectId: string, name: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('projects')
    .update({ name, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) console.warn('[Supabase] updateProjectName:', error.message);
}

// ── Files CRUD ────────────────────────────────────────────────────────────────

export interface CloudFile {
  id?: string;
  project_id: string;
  user_id: string;
  path: string;
  name: string;
  parent_path: string;
  type: 'file' | 'folder';
  content?: string | null;
  mime_type?: string;
  is_dirty?: boolean;
  updated_at?: string;
}

export async function fetchProjectFiles(projectId: string): Promise<CloudFile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId);
  if (error) { console.warn('[Supabase] fetchProjectFiles:', error.message); return []; }
  return data ?? [];
}

export async function upsertCloudFile(file: {
  projectId: string;
  userId: string;
  path: string;
  name: string;
  parentPath: string;
  type: string;
  content?: string;
  mimeType?: string;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('project_files')
    .upsert({
      project_id:  file.projectId,
      user_id:     file.userId,
      path:        file.path,
      name:        file.name,
      parent_path: file.parentPath,
      type:        file.type,
      content:     file.content ?? '',
      mime_type:   file.mimeType ?? 'text/plain',
      is_dirty:    false,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'project_id,path' });
  if (error) console.warn('[Supabase] upsertFile:', error.message);
}

export async function deleteCloudFile(projectId: string, path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('project_id', projectId)
    .eq('path', path);
  if (error) console.warn('[Supabase] deleteFile:', error.message);
}

// ── Snapshots ─────────────────────────────────────────────────────────────────

export async function saveCloudSnapshot(snap: {
  projectId: string;
  userId: string;
  label: string;
  type: string;
  files: Record<string, string>;
}): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from('snapshots')
    .insert({
      project_id: snap.projectId,
      user_id:    snap.userId,
      label:      snap.label,
      type:       snap.type,
      files:      snap.files,
    });
  if (error) console.warn('[Supabase] saveSnapshot:', error.message);
}

export async function fetchCloudSnapshots(projectId: string) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('snapshots')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) { console.warn('[Supabase] fetchSnapshots:', error.message); return []; }
  return data ?? [];
}
