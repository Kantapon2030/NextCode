const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;
// scope: gist เท่านั้น — ไม่ขอสิทธิ์อื่นเลย

export interface DeviceFlowState {
  deviceCode:      string;
  userCode:        string;      // XXXX-XXXX
  verificationUri: string;      // github.com/login/device
  expiresIn:       number;
  interval:        number;
}

export interface GitHubUser {
  id:        number;
  login:     string;
  name:      string;
  avatarUrl: string;
  token:     string;
}

// Step 1: ขอ device code
export async function requestDeviceCode(): Promise<DeviceFlowState> {
  const res = await fetch(
    'https://github.com/login/device/code',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        scope:     'gist',
      }),
    }
  );
  const data = await res.json();
  return {
    deviceCode:      data.device_code,
    userCode:        data.user_code,
    verificationUri: data.verification_uri,
    expiresIn:       data.expires_in,
    interval:        data.interval ?? 5,
  };
}

// Step 2: poll จนกว่าผู้ใช้จะ authorize
export async function pollForToken(
  deviceCode: string,
  interval:   number,
  onTick?: (secondsLeft: number) => void
): Promise<string> {

  const MAX_WAIT = 300; // 5 นาที
  let elapsed = 0;

  return new Promise((resolve, reject) => {
    const timer = setInterval(async () => {
      elapsed += interval;
      onTick?.(MAX_WAIT - elapsed);

      if (elapsed >= MAX_WAIT) {
        clearInterval(timer);
        reject(new Error('หมดเวลา กรุณาลองใหม่'));
        return;
      }

      try {
        const res = await fetch(
          'https://github.com/login/oauth/access_token',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept':       'application/json',
            },
            body: JSON.stringify({
              client_id:   CLIENT_ID,
              device_code: deviceCode,
              grant_type:
                'urn:ietf:params:oauth:grant-type:device_code',
            }),
          }
        );
        const data = await res.json();

        if (data.access_token) {
          clearInterval(timer);
          resolve(data.access_token);
        }
        // data.error === 'authorization_pending' → รอต่อ
      } catch { /* retry */ }
    }, interval * 1000);
  });
}

// Step 3: ดึงข้อมูล user
export async function fetchGitHubUser(
  token: string
): Promise<GitHubUser> {
  const res = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  const data = await res.json();
  return {
    id:        data.id,
    login:     data.login,
    name:      data.name ?? data.login,
    avatarUrl: data.avatar_url,
    token,
  };
}

// เก็บ token ลง localStorage
export function saveGitHubToken(token: string): void {
  localStorage.setItem('gh_token', token);
}

export function getGitHubToken(): string | null {
  return localStorage.getItem('gh_token');
}

export function clearGitHubToken(): void {
  localStorage.removeItem('gh_token');
  localStorage.removeItem('gh_gist_id');
}
