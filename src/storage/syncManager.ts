import { db } from './db';

const channel = new BroadcastChannel('nextcode-sync');
let lastSyncTime = Date.now();

export function initBroadcastChannel(
  currentProjectId: string | null,
  onConflict: () => void
): () => void {
  const handler = (event: MessageEvent) => {
    const msg = event.data;
    if (
      msg.type === 'VFS_UPDATED' &&
      msg.projectId === currentProjectId &&
      msg.timestamp > lastSyncTime
    ) {
      onConflict();
    }
  };
  channel.addEventListener('message', handler);
  return () => channel.removeEventListener('message', handler);
}

export function broadcastVFSUpdate(projectId: string): void {
  lastSyncTime = Date.now();
  channel.postMessage({ type: 'VFS_UPDATED', projectId, timestamp: lastSyncTime });
}

let driveRequestCount = 0;
let windowStart = Date.now();
const WINDOW_MS = 100_000;
const MAX_REQUESTS = 8000;

export function canMakeDriveRequest(): boolean {
  const now = Date.now();
  if (now - windowStart > WINDOW_MS) {
    driveRequestCount = 0;
    windowStart = now;
  }
  return driveRequestCount < MAX_REQUESTS;
}

export function recordDriveRequest(): void {
  driveRequestCount++;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5
): Promise<T> {
  let delay = 1000;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === maxRetries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 16000);
    }
  }
  throw new Error('Max retries exceeded');
}

export async function clearUserSession(): Promise<void> {
  localStorage.removeItem('nextcode_access_token');
  localStorage.removeItem('nextcode_expiry_time');
  localStorage.removeItem('nextcode_user_id');
  localStorage.removeItem('nextcode_user_name');
  localStorage.removeItem('nextcode_user_email');
  localStorage.removeItem('nextcode_user_avatar');
  await db.settings.where('key').startsWith('gemini_key_').delete();
  await db.settings.delete('user_mode');
  await db.settings.delete('theme');
  await db.settings.delete('font_size');
  await db.settings.delete('panel_widths');
}
