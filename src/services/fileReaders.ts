/**
 * fileReaders.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Utility สำหรับแปลงไฟล์หลากหลายประเภทให้ส่งให้ Gemini ได้
 * รูปภาพ/PDF จะถูกส่งเฉพาะเมื่อ user แนบเอง (opt-in) ไม่ส่งอัตโนมัติ
 */

import type { FileAttachment } from '../types/chatTypes';

/** แปลง ArrayBuffer เป็น base64 string */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/** ตรวจว่า AI สามารถอ่านไฟล์ประเภทนี้ได้ไหม */
export function canAIRead(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const readableExts = [
    // text
    'html', 'css', 'js', 'ts', 'jsx', 'tsx', 'py', 'c', 'cpp',
    'json', 'md', 'txt', 'xml', 'yaml', 'yml', 'sh', 'sql',
    // image (vision)
    'png', 'jpg', 'jpeg', 'gif', 'webp',
    // pdf
    'pdf',
  ];
  return readableExts.includes(ext);
}

/** แปลง image ArrayBuffer เป็น FileAttachment พร้อมส่ง Gemini */
export async function readImageAttachment(
  file: File
): Promise<FileAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      const base64 = bufferToBase64(buffer);
      resolve({
        filename: file.name,
        type: 'image',
        content: base64,
        mimeType: file.type || 'image/png',
      });
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** แปลง PDF เป็น text (จำกัด 5 หน้าแรก เพื่อประหยัด token) */
export async function readPdfAsText(file: File): Promise<FileAttachment> {
  // ใช้ pdf.js จาก CDN — ไม่ต้อง install dependency
  const pdfjsLib = (window as any).pdfjsLib;

  if (!pdfjsLib) {
    // Fallback: ถ้าไม่มี pdf.js → แจ้งว่าอ่านไม่ได้
    return {
      filename: file.name,
      type: 'pdf',
      content: `[ไม่สามารถอ่าน PDF ได้ — กรุณา copy ข้อความมาวางเอง]`,
      mimeType: 'text/plain',
    };
  }

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const maxPages = Math.min(pdf.numPages, 5); // จำกัด 5 หน้า
  const texts: string[] = [];

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    texts.push(`--- หน้า ${i} ---\n${pageText}`);
  }

  const fullText = texts.join('\n\n');
  const truncated = fullText.length > 6000
    ? fullText.slice(0, 6000) + '\n\n[... ตัดออกเพื่อประหยัด token ...]'
    : fullText;

  return {
    filename: file.name,
    type: 'pdf',
    content: truncated,
    mimeType: 'text/plain',
  };
}

/** แปลง text file เป็น FileAttachment */
export async function readTextAttachment(file: File): Promise<FileAttachment> {
  const content = await file.text();
  const truncated = content.length > 8000
    ? content.slice(0, 8000) + '\n\n[... ตัดออกเพื่อประหยัด token ...]'
    : content;

  return {
    filename: file.name,
    type: 'text',
    content: truncated,
    mimeType: file.type || 'text/plain',
  };
}

/** สร้าง text block จาก FileAttachment สำหรับใส่ใน user message */
export function attachmentToTextBlock(att: FileAttachment): string {
  if (att.type === 'image') {
    // image จะถูกส่งเป็น inlineData part แยก — แค่บอกชื่อไฟล์ใน text
    return `[รูปภาพที่แนบ: ${att.filename}]`;
  }
  return `--- แนบไฟล์: ${att.filename} ---\n${att.content}\n--- สิ้นสุดไฟล์ ---`;
}

/** สร้าง Gemini inlineData part จาก image attachment */
export function attachmentToInlinePart(att: FileAttachment): {
  inlineData: { data: string; mimeType: string };
} | null {
  if (att.type !== 'image') return null;
  return {
    inlineData: {
      data: att.content,
      mimeType: att.mimeType,
    },
  };
}

/** เลือกฟังก์ชัน read ที่ถูกต้องตามประเภทไฟล์ */
export async function readFileAttachment(file: File): Promise<FileAttachment | null> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return readImageAttachment(file);
  }
  if (ext === 'pdf') {
    return readPdfAsText(file);
  }
  if (canAIRead(file.name)) {
    return readTextAttachment(file);
  }
  return null; // ประเภทไฟล์ที่ AI ไม่รองรับ
}
