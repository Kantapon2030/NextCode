const LS_PREFIX = 'nextcode_';

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  avatar: string;
  access_token: string;
  expiry_time: number;
}

export function saveAuthToLocalStorage(info: UserInfo): void {
  localStorage.setItem(LS_PREFIX + 'access_token', info.access_token);
  localStorage.setItem(LS_PREFIX + 'expiry_time', String(info.expiry_time));
  localStorage.setItem(LS_PREFIX + 'user_id', info.id);
  localStorage.setItem(LS_PREFIX + 'user_name', info.name);
  localStorage.setItem(LS_PREFIX + 'user_email', info.email);
  localStorage.setItem(LS_PREFIX + 'user_avatar', info.avatar);
}

export function loadAuthFromLocalStorage(): UserInfo | null {
  const token = localStorage.getItem(LS_PREFIX + 'access_token');
  const expiry = localStorage.getItem(LS_PREFIX + 'expiry_time');
  const id = localStorage.getItem(LS_PREFIX + 'user_id');
  const name = localStorage.getItem(LS_PREFIX + 'user_name');
  const email = localStorage.getItem(LS_PREFIX + 'user_email');
  const avatar = localStorage.getItem(LS_PREFIX + 'user_avatar');
  if (!token || !expiry || !id || !name || !email) return null;
  return {
    access_token: token,
    expiry_time: parseInt(expiry, 10),
    id,
    name,
    email,
    avatar: avatar ?? '',
  };
}

export function isTokenExpired(expiryTime: number): boolean {
  return Date.now() >= expiryTime;
}

export function isTokenExpiringSoon(expiryTime: number): boolean {
  return expiryTime - Date.now() < 3 * 60 * 1000;
}

export async function fetchUserInfo(accessToken: string): Promise<{
  id: string;
  name: string;
  email: string;
  picture: string;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Failed to fetch user info');
  return res.json();
}

export function clearAuthFromLocalStorage(): void {
  const keys = ['access_token', 'expiry_time', 'user_id', 'user_name', 'user_email', 'user_avatar'];
  keys.forEach((k) => localStorage.removeItem(LS_PREFIX + k));
}
