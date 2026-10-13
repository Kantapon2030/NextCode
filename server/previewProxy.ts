import express, { Request, Response, NextFunction } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { IncomingMessage } from 'http';
import type { RedisClientType } from 'redis';
import { VfsSyncGateway, sanitizePath, getMimeType } from './vfsSyncGateway';

export class PreviewProxy {
  private app: express.Application;
  private wss: WebSocketServer;
  private vfsGateway: VfsSyncGateway;
  private redisSub: RedisClientType;
  private sessionClients: Map<string, Set<WebSocket>> = new Map();

  constructor(vfsGateway: VfsSyncGateway, redisClient: RedisClientType) {
    this.vfsGateway = vfsGateway;
    this.app = express();
    this.wss = new WebSocketServer({ noServer: true });

    // Duplicate client dedicated for Redis Pub/Sub subscriptions
    this.redisSub = redisClient.duplicate() as RedisClientType;
    this.redisSub.connect().catch((err) => {
      console.error('[PreviewProxy] Failed to connect Redis subscriber:', err);
    });

    this.setupHttpMiddleware();
    this.setupWebSocketHandler();
  }

  public getApp(): express.Application {
    return this.app;
  }

  public getWebSocketServer(): WebSocketServer {
    return this.wss;
  }

  public handleUpgrade(req: IncomingMessage, socket: any, head: Buffer): void {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/__hmr') {
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    } else {
      socket.destroy();
    }
  }

  /**
   * Resolves sessionId from Wildcard Subdomain, Custom Header, or Dev Query Param.
   */
  public extractSessionId(req: Request | IncomingMessage): string | null {
    const host = req.headers.host || '';
    const parts = host.split('.');

    // Production Wildcard Subdomain: <sessionId>.preview.nextcode.run
    if (parts.length >= 3 && parts[1] === 'preview') {
      return parts[0];
    }

    // Direct header or query parameter support (vital for local development and proxying)
    if ('headers' in req && req.headers['x-session-id']) {
      return String(req.headers['x-session-id']);
    }

    if ('url' in req && req.url) {
      try {
        const parsedUrl = new URL(req.url, `http://${host || 'localhost'}`);
        const qSession = parsedUrl.searchParams.get('session');
        if (qSession) return qSession;
      } catch {}
    }

    // Default first label if host contains a subdomain other than localhost/www
    if (parts.length >= 2 && !['localhost', 'www', 'ide', '127'].includes(parts[0])) {
      return parts[0];
    }

    return null;
  }

  private setupHttpMiddleware(): void {
    this.app.use(async (req: Request, res: Response, next: NextFunction) => {
      // Ignore API or internal routes
      if (req.path.startsWith('/api/') || req.path === '/__hmr') {
        return next();
      }

      const sessionId = this.extractSessionId(req);
      if (!sessionId) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head><title>NextCode Preview — No Session</title></head>
            <body style="font-family:sans-serif;background:#1e1e2e;color:#cdd6f4;padding:40px;text-align:center;">
              <h2>No Preview Session Found</h2>
              <p>Please provide a valid session subdomain or ?session=ID query parameter.</p>
            </body>
          </html>
        `);
      }

      // Apply Strict Zero-Trust HTTP Security Headers
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src 'self' ws: wss:; frame-ancestors https://ide.nextcode.run http://localhost:* http://127.0.0.1:*;"
      );
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');

      try {
        // Resolve target file path with Path Traversal Protection
        const rawPath = req.path === '/' ? 'index.html' : req.path;
        const cleanPath = sanitizePath(rawPath);

        const fileRecord = await this.vfsGateway.getFile(sessionId, cleanPath);
        if (!fileRecord) {
          return res.status(404).send(`
            <!DOCTYPE html>
            <html>
              <head><title>404 Not Found</title></head>
              <body style="font-family:sans-serif;background:#1e1e2e;color:#f38ba8;padding:40px;">
                <h2>File Not Found: ${cleanPath}</h2>
                <p>Ensure the file exists in your project workspace.</p>
              </body>
            </html>
          `);
        }

        const mimeType = fileRecord.mimeType || getMimeType(cleanPath);
        res.setHeader('Content-Type', mimeType);

        // Auto-inject Hot Reload script for HTML documents
        if (mimeType.includes('text/html') || cleanPath.endsWith('.html')) {
          let html = fileRecord.content;
          const hmrScript = this.buildHmrScript(sessionId);

          if (html.includes('</body>')) {
            html = html.replace('</body>', `${hmrScript}\n</body>`);
          } else {
            html += hmrScript;
          }

          return res.send(html);
        }

        return res.send(fileRecord.content);
      } catch (err: any) {
        return res.status(400).send(`Invalid Request: ${err.message}`);
      }
    });
  }

  private buildHmrScript(sessionId: string): string {
    return `
<!-- NextCode Live Server Auto-Injected HMR Client -->
<script id="__nextcode_hmr">
(function() {
  const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = wsProto + '//' + location.host + '/__hmr?session=' + encodeURIComponent('${sessionId}');
  let socket = null;
  let retryTimer = null;

  function connect() {
    socket = new WebSocket(wsUrl);

    socket.onopen = function() {
      if (retryTimer) clearTimeout(retryTimer);
    };

    socket.onmessage = function(event) {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'RELOAD') {
          location.reload();
        } else if (payload.type === 'CSS_UPDATE') {
          const links = document.querySelectorAll('link[rel="stylesheet"]');
          let found = false;
          links.forEach(function(link) {
            const href = link.getAttribute('href');
            if (href && (href.includes(payload.file) || payload.file.includes(href))) {
              link.href = href.split('?')[0] + '?t=' + Date.now();
              found = true;
            }
          });
          if (!found) location.reload();
        }
      } catch (e) {}
    };

    socket.onclose = function() {
      retryTimer = setTimeout(connect, 1500);
    };

    socket.onerror = function() {
      socket.close();
    };
  }

  connect();
})();
</script>
`;
  }

  private setupWebSocketHandler(): void {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      const sessionId = this.extractSessionId(req);
      if (!sessionId) {
        ws.close(1008, 'Session ID required');
        return;
      }

      // Register client under session
      let clients = this.sessionClients.get(sessionId);
      if (!clients) {
        clients = new Set();
        this.sessionClients.set(sessionId, clients);

        // Subscribe to Redis Pub/Sub for this session
        const channel = `nextcode:hmr:${sessionId}`;
        await this.redisSub.subscribe(channel, (message: string) => {
          this.broadcastToSession(sessionId, message);
        });
      }
      clients.add(ws);

      ws.on('close', async () => {
        const currentClients = this.sessionClients.get(sessionId);
        if (currentClients) {
          currentClients.delete(ws);
          if (currentClients.size === 0) {
            this.sessionClients.delete(sessionId);
            // Unsubscribe to free up Redis resources
            await this.redisSub.unsubscribe(`nextcode:hmr:${sessionId}`).catch(() => {});
          }
        }
      });
    });
  }

  private broadcastToSession(sessionId: string, message: string): void {
    const clients = this.sessionClients.get(sessionId);
    if (!clients) return;

    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  public async close(): Promise<void> {
    try {
      await this.redisSub.quit();
    } catch {}
  }
}

