import { Router, Request, Response } from 'express';
import type { RedisClientType } from 'redis';
import path from 'path';

export interface VFSFileRecord {
  content: string;
  mimeType: string;
  updatedAt: string;
}

export interface HMREvent {
  type: 'RELOAD' | 'CSS_UPDATE';
  file: string;
  timestamp: number;
}

export function sanitizePath(rawPath: string): string {
  if (rawPath.includes('\0')) {
    throw new Error('SECURITY_VIOLATION: Null byte in path is not permitted');
  }
  const normalized = path.posix.normalize(rawPath.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (normalized.startsWith('..') || path.posix.isAbsolute(rawPath) || normalized.includes('/../')) {
    throw new Error(`SECURITY_VIOLATION: Directory traversal blocked: ${rawPath}`);
  }
  return normalized;
}

export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html':
    case '.htm':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.ico':
      return 'image/x-icon';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

export class VfsSyncGateway {
  private redis: RedisClientType;
  private readonly VFS_TTL_SECONDS = 7200; // 2 hours TTL to protect Redis RAM

  constructor(redisClient: RedisClientType) {
    this.redis = redisClient;
  }

  /**
   * Saves or updates a file in Redis VFS and publishes an HMR event.
   */
  public async saveFile(
    sessionId: string,
    filePath: string,
    content: string,
    customMimeType?: string
  ): Promise<void> {
    const cleanPath = sanitizePath(filePath);
    const mimeType = customMimeType || getMimeType(cleanPath);
    const redisKey = `nextcode:vfs:${sessionId}:${cleanPath}`;
    const filesIndexKey = `nextcode:vfs_files:${sessionId}`;

    const timestamp = Date.now();

    // 1. Store in Redis Hash with TTL
    await this.redis.hSet(redisKey, {
      content: content ?? '',
      mimeType,
      updatedAt: String(timestamp),
    });
    await this.redis.expire(redisKey, this.VFS_TTL_SECONDS);

    // Track in session index
    await this.redis.sAdd(filesIndexKey, cleanPath);
    await this.redis.expire(filesIndexKey, this.VFS_TTL_SECONDS);

    // 2. Publish HMR Notification
    const hmrChannel = `nextcode:hmr:${sessionId}`;
    const isCss = cleanPath.toLowerCase().endsWith('.css');
    const event: HMREvent = {
      type: isCss ? 'CSS_UPDATE' : 'RELOAD',
      file: cleanPath,
      timestamp,
    };

    await this.redis.publish(hmrChannel, JSON.stringify(event));
  }

  /**
   * Deletes a file from Redis VFS and signals browser reload.
   */
  public async deleteFile(sessionId: string, filePath: string): Promise<void> {
    const cleanPath = sanitizePath(filePath);
    const redisKey = `nextcode:vfs:${sessionId}:${cleanPath}`;
    const filesIndexKey = `nextcode:vfs_files:${sessionId}`;

    await this.redis.del(redisKey);
    await this.redis.sRem(filesIndexKey, cleanPath);

    const hmrChannel = `nextcode:hmr:${sessionId}`;
    const event: HMREvent = {
      type: 'RELOAD',
      file: cleanPath,
      timestamp: Date.now(),
    };
    await this.redis.publish(hmrChannel, JSON.stringify(event));
  }

  /**
   * Retrieves file from Redis VFS.
   */
  public async getFile(sessionId: string, filePath: string): Promise<VFSFileRecord | null> {
    const cleanPath = sanitizePath(filePath);
    const redisKey = `nextcode:vfs:${sessionId}:${cleanPath}`;
    const data = await this.redis.hGetAll(redisKey);

    if (!data || !data.content) {
      return null;
    }

    return {
      content: data.content,
      mimeType: data.mimeType || getMimeType(cleanPath),
      updatedAt: data.updatedAt || '0',
    };
  }

  /**
   * Lists all tracked file paths for a session.
   */
  public async listFiles(sessionId: string): Promise<string[]> {
    const filesIndexKey = `nextcode:vfs_files:${sessionId}`;
    return await this.redis.sMembers(filesIndexKey);
  }

  /**
   * Express HTTP Router for IDE frontend file synchronization.
   */
  public createRouter(): Router {
    const router = Router();

    // Single file write/update
    router.post('/:sessionId/file', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { path: filePath, content, mimeType } = req.body;

        if (!filePath || typeof filePath !== 'string') {
          return res.status(400).json({ error: 'Missing or invalid file path' });
        }

        await this.saveFile(sessionId, filePath, content ?? '', mimeType);
        return res.status(200).json({ success: true, path: filePath });
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    });

    // Batch file write (e.g. initial project template load)
    router.post('/:sessionId/batch', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const { files } = req.body as { files: Record<string, string> };

        if (!files || typeof files !== 'object') {
          return res.status(400).json({ error: 'Invalid files payload' });
        }

        const entries = Object.entries(files);
        for (const [fPath, fContent] of entries) {
          await this.saveFile(sessionId, fPath, fContent);
        }

        return res.status(200).json({ success: true, count: entries.length });
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    });

    // File delete
    router.delete('/:sessionId/file', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const filePath = req.query.path as string;

        if (!filePath) {
          return res.status(400).json({ error: 'Missing path query parameter' });
        }

        await this.deleteFile(sessionId, filePath);
        return res.status(200).json({ success: true, path: filePath });
      } catch (err: any) {
        return res.status(400).json({ error: err.message });
      }
    });

    // File listing
    router.get('/:sessionId/files', async (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        const list = await this.listFiles(sessionId);
        return res.status(200).json({ files: list });
      } catch (err: any) {
        return res.status(500).json({ error: err.message });
      }
    });

    return router;
  }
}

