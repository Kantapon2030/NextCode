/**
 * contextEngine.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ระบบสร้าง context อัจฉริยะสำหรับส่งให้ Gemini — เน้นประหยัด token สูงสุด
 *
 * หลักการ:
 *  1. ส่งเฉพาะ active file เต็ม
 *  2. ส่ง Project Summary (cache) แทนการส่งทุกไฟล์
 *  3. ถ้า message กล่าวถึงชื่อไฟล์ → ส่งไฟล์นั้นด้วย
 *  4. Hard limit ~40K chars ก่อนส่ง
 */

import type { VFSState } from '../types';
import type { ProjectSnapshot } from '../types/chatTypes';

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_TOTAL_CHARS     = 40_000; // ~10K tokens — guardrail
const MAX_FILE_CHARS      = 8_000;  // ตัดไฟล์ที่ยาวเกิน
const SUMMARY_MAX_CHARS   = 800;    // project summary budget

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** ประมาณ token count (1 token ≈ 4 chars) */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** ตัดข้อความไม่ให้เกิน maxChars พร้อมแสดงว่าตัดแล้ว */
function truncate(content: string, maxChars: number, label: string): string {
  if (content.length <= maxChars) return content;
  const kept = content.slice(0, maxChars);
  return `${kept}\n... [${label}: ตัดออก ${content.length - maxChars} ตัวอักษร เพื่อประหยัด token] ...`;
}

/** ตรวจว่า message ของ user กล่าวถึงไฟล์ไหน */
export function detectReferencedFiles(message: string, fileList: string[]): string[] {
  const lower = message.toLowerCase();
  return fileList.filter((f) => {
    // ตรงทั้งชื่อหรือแค่ basename
    const basename = f.split('/').pop() ?? f;
    return lower.includes(f.toLowerCase()) || lower.includes(basename.toLowerCase());
  });
}

/** สร้าง checksum เบาๆ จาก file keys + sizes */
export function computeFilesChecksum(vfs: VFSState): string {
  const keys = Object.keys(vfs.files).sort();
  return keys.map((k) => `${k}:${vfs.files[k].content.length}`).join('|');
}

// ─── Project Summary ──────────────────────────────────────────────────────────

/**
 * สร้าง Project Summary สั้น (~200 token) เพื่อ cache ไว้ใช้ซ้ำ
 * Re-generate เฉพาะเมื่อ checksum เปลี่ยน
 */
export function buildProjectSummary(
  vfs: VFSState,
  projectName: string
): string {
  const fileList = Object.keys(vfs.files);
  const assetList = Object.keys(vfs.assets);

  // สรุป stack จากนามสกุลไฟล์
  const exts = [...new Set(fileList.map((f) => f.split('.').pop() ?? 'txt'))];
  const stackMap: Record<string, string> = {
    html: 'HTML', css: 'CSS', js: 'JavaScript', ts: 'TypeScript',
    tsx: 'React TSX', jsx: 'React JSX', py: 'Python', c: 'C', cpp: 'C++',
    json: 'JSON', md: 'Markdown',
  };
  const stack = exts.map((e) => stackMap[e] ?? e.toUpperCase()).join(', ');

  // แสดง directory tree แบบสั้น
  const filesSummary = fileList
    .slice(0, 20) // max 20 ไฟล์
    .map((f) => {
      const content = vfs.files[f].content;
      const lines = typeof content === 'string' ? content.split('\n').length : 0;
      return `  📄 ${f} (${lines} lines)`;
    })
    .join('\n');

  const moreFiles = fileList.length > 20
    ? `\n  ... และอีก ${fileList.length - 20} ไฟล์` : '';

  const assetsSummary = assetList.length > 0
    ? `\n📦 Assets: ${assetList.join(', ')}` : '';

  const summary = [
    `📁 Project: ${projectName}`,
    `🔧 Stack: ${stack}`,
    `📂 Files (${fileList.length} ไฟล์):`,
    filesSummary + moreFiles,
    assetsSummary,
  ].filter(Boolean).join('\n');

  return truncate(summary, SUMMARY_MAX_CHARS, 'project summary');
}

// ─── Smart Context Builder ────────────────────────────────────────────────────

export interface SmartContext {
  systemInstruction: string;
  /** content ของ active file สำหรับส่งเป็น user message part */
  activeFileBlock: string;
  /** content ของไฟล์อื่นที่เกี่ยวข้อง */
  referencedFilesBlock: string;
  /** ประมาณ token ทั้งหมด */
  estimatedTokens: number;
  /** ไฟล์ที่รวมอยู่ใน context (สำหรับแสดงเป็น pills) */
  includedFiles: string[];
  /** เตือนว่าตัด context ออก */
  wasTruncated: boolean;
}

/**
 * สร้าง context อัจฉริยะ — ประหยัด token สูงสุด
 */
export function buildSmartContext(params: {
  vfs: VFSState;
  activeTab: string | null;
  userMessage: string;
  projectSnapshot: ProjectSnapshot | null;
  projectName: string;
  includeWholeProject?: boolean;
}): SmartContext {
  const { vfs, activeTab, userMessage, projectSnapshot, projectName, includeWholeProject } = params;

  const fileList = Object.keys(vfs.files);
  let wasTruncated = false;
  let totalChars = 0;
  const includedFiles: string[] = [];

  // ─── 1. System Instruction (กระชับ ~80 tokens) ────────────────────────────
  const systemInstruction = [
    `You are a senior coding assistant for NextCode IDE.`,
    `Reply in Thai. Keep code/keywords in English.`,
    `When suggesting code changes, wrap each file like this:`,
    `<<<FILE:filename>>>`,
    `...complete file content...`,
    `<<<END>>>`,
    `Only include files that need changes. Always send the FULL file content, no truncation.`,
    ``,
    `${projectSnapshot?.summary ?? buildProjectSummary(vfs, projectName)}`,
  ].join('\n');

  totalChars += systemInstruction.length;

  // ─── 2. Active File (เสมอ — full content) ─────────────────────────────────
  let activeFileBlock = '';
  if (activeTab && vfs.files[activeTab]) {
    const content = vfs.files[activeTab].content;
    const truncated = truncate(content as string, MAX_FILE_CHARS, activeTab);
    if (truncated.length < (content as string).length) wasTruncated = true;
    activeFileBlock = `\n--- ไฟล์ที่เปิดอยู่: ${activeTab} ---\n${truncated}`;
    totalChars += activeFileBlock.length;
    includedFiles.push(activeTab);
  }

  // ─── 3. Referenced Files (จากชื่อที่กล่าวถึงใน message) ──────────────────
  let referencedFilesBlock = '';

  // ถ้า user พูดถึง "ทุกไฟล์" หรือ "ทั้งโปรเจกต์" → ส่งหัวไฟล์เท่านั้น
  const wantsAllFiles = /ทั้งโปรเจกต์|ทุกไฟล์|all files|project structure/i.test(userMessage);

  const referencedFilenames = includeWholeProject || wantsAllFiles
    ? []  // ใช้ summary แทน
    : detectReferencedFiles(userMessage, fileList).filter((f) => f !== activeTab);

  for (const filename of referencedFilenames) {
    const remaining = MAX_TOTAL_CHARS - totalChars;
    if (remaining < 500) { wasTruncated = true; break; }

    const content = vfs.files[filename]?.content;
    if (typeof content !== 'string') continue;

    const maxForFile = Math.min(MAX_FILE_CHARS, remaining - 200);
    const truncated = truncate(content, maxForFile, filename);
    if (truncated.length < content.length) wasTruncated = true;

    referencedFilesBlock += `\n--- ไฟล์: ${filename} ---\n${truncated}\n`;
    totalChars += referencedFilesBlock.length;
    includedFiles.push(filename);
  }

  return {
    systemInstruction,
    activeFileBlock,
    referencedFilesBlock,
    estimatedTokens: estimateTokens(systemInstruction + activeFileBlock + referencedFilesBlock + userMessage),
    includedFiles,
    wasTruncated,
  };
}

// ─── Chat History Builder ─────────────────────────────────────────────────────

export interface GeminiTurn {
  role: 'user' | 'model';
  parts: { text: string }[];
}

/**
 * แปลง ChatMessage[] → Gemini contents[]
 * ส่งแค่ N messages ล่าสุดเพื่อประหยัด token
 */
export function buildGeminiHistory(
  messages: import('../types/chatTypes').ChatMessage[],
  maxMessages = 6  // 3 คู่ user/assistant
): GeminiTurn[] {
  const recent = messages.slice(-maxMessages);
  return recent.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content }],
  }));
}
