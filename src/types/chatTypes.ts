// ─── Chat Types สำหรับ AI Chatbot ─────────────────────────────────────────

export interface CodeChange {
  filename: string;
  newContent: string;
  applied: boolean;
}

export interface FileAttachment {
  filename: string;
  /** 'text' | 'image' | 'pdf' */
  type: 'text' | 'image' | 'pdf';
  /** ข้อความ content หรือ base64 string สำหรับรูปภาพ */
  content: string;
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;           // markdown text
  timestamp: number;
  codeChanges?: CodeChange[]; // <<<FILE:...>>> blocks ที่ parse ออกมา
  attachments?: FileAttachment[];
  status: 'sending' | 'done' | 'error';
  /** token ที่ใช้ในรอบนี้ (ประมาณ) */
  estimatedTokens?: number;
}

/** สรุปโปรเจกต์ที่ cache ไว้ — ไม่ต้องสร้างใหม่ทุก request */
export interface ProjectSnapshot {
  summary: string;
  generatedAt: number;
  /** list ของชื่อไฟล์ทั้งหมด */
  fileList: string[];
  /** checksum เพื่อตรวจว่าต้อง invalidate ไหม */
  filesChecksum: string;
}
