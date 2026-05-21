export interface VFSNode {
  type: 'file' | 'folder';
  name: string;
  path: string;          // full path เช่น "src/js/app.js"
  
  // ถ้าเป็น file
  content?: string | ArrayBuffer; // รองรับ string สำหรับ text หรือ ArrayBuffer สำหรับ asset/image
  mimeType?: string;
  driveFileId?: string;
  isDirty?: boolean;
  
  // ถ้าเป็น folder
  children?: Record<string, VFSNode>;
  isExpanded?: boolean;  // UI state
  driveFolderId?: string;
}

export interface VFSState {
  tree: Record<string, VFSNode>;   // root level nodes
  flatIndex: Record<string, VFSNode>; // Helper index สำหรับ lookup ไว (path → node)
  files: Record<string, { content: string; mimeType: string }>;
  assets: Record<string, { buffer: ArrayBuffer; mimeType: string }>;
}

