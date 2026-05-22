import type { GistData } from './gistStorage';

const DRIVE_FILENAME = 'nextcode-data.json';

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function throwDriveError(res: Response, prefix: string): Promise<never> {
  let detail = `Status ${res.status}`;
  try {
    const json = await res.json();
    if (json?.error?.message) {
      detail = json.error.message;
    } else {
      detail = JSON.stringify(json);
    }
  } catch {
    try {
      const text = await res.text();
      if (text) detail = text;
    } catch {}
  }
  throw new Error(`${prefix}: ${detail}`);
}

/**
 * ดึง ID ของไฟล์ nextcode-data.json บน Google Drive หรือสร้างใหม่ถ้าไม่พบ
 */
export async function getOrCreateDriveFile(accessToken: string): Promise<string> {
  const cachedId = localStorage.getItem('google_drive_file_id');
  if (cachedId) return cachedId;

  // 1. ค้นหาไฟล์ใน Google Drive
  const query = encodeURIComponent(`name = '${DRIVE_FILENAME}' and trashed = false`);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  const searchRes = await fetchWithTimeout(searchUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!searchRes.ok) {
    await throwDriveError(searchRes, 'Google Drive Search failed');
  }

  const searchData = await searchRes.json();
  const existingFile = searchData.files?.find((f: any) => f.name === DRIVE_FILENAME);

  if (existingFile) {
    localStorage.setItem('google_drive_file_id', existingFile.id);
    return existingFile.id;
  }

  // 2. ถ้าไม่พบไฟล์ ให้สร้างไฟล์ใหม่ (ขั้นตอนที่ 1: สร้าง Metadata)
  const createMetadataRes = await fetchWithTimeout('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: DRIVE_FILENAME,
      mimeType: 'application/json',
    }),
  });

  if (!createMetadataRes.ok) {
    await throwDriveError(createMetadataRes, 'Failed to create Google Drive file metadata');
  }

  const newFile = await createMetadataRes.json();
  const fileId = newFile.id;

  // 3. อัปโหลดข้อมูลเริ่มต้น (ขั้นตอนที่ 2: อัปโหลด Content เปล่า)
  const initialContent: GistData = {
    version: 1,
    projects: [],
    updatedAt: Date.now(),
  };

  await saveToDrive(accessToken, fileId, initialContent);

  localStorage.setItem('google_drive_file_id', fileId);
  return fileId;
}

/**
 * โหลดข้อมูล GistData จากไฟล์ใน Google Drive
 */
export async function loadFromDrive(accessToken: string, fileId: string): Promise<GistData> {
  const res = await fetchWithTimeout(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    await throwDriveError(res, 'Failed to download file from Google Drive');
  }

  const raw = await res.text();
  if (!raw.trim()) {
    return {
      version: 1,
      projects: [],
      updatedAt: Date.now(),
    };
  }

  return JSON.parse(raw) as GistData;
}

/**
 * บันทึกข้อมูล GistData ลงใน Google Drive
 */
export async function saveToDrive(accessToken: string, fileId: string, data: GistData): Promise<void> {
  const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`;

  const res = await fetchWithTimeout(uploadUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...data,
      updatedAt: Date.now(),
    }),
  });

  if (!res.ok) {
    await throwDriveError(res, 'Failed to upload to Google Drive');
  }
}
