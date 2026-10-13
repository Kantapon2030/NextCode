import http from 'http';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { createClient, RedisClientType } from 'redis';
import { ContainerPool } from './containerPool';
import { ExecutionEngine } from './executionEngine';
import { VfsSyncGateway } from './vfsSyncGateway';
import { PreviewProxy } from './previewProxy';
import { AutoGrader } from './autoGrader';
import { HtmlCssGrader } from './htmlCssGrader';

const PORT = parseInt(process.env.PORT || '4000', 10);
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SECCOMP_PATH = process.env.SECCOMP_PATH || path.join(__dirname, 'seccomp-profile.json');
const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'nextcode-sandbox:latest';
const POOL_MIN_WARM = parseInt(process.env.POOL_MIN_WARM || '3', 10);
const POOL_MAX_TOTAL = parseInt(process.env.POOL_MAX_TOTAL || '30', 10);

async function bootstrap() {
  console.log('====================================================');
  console.log('🚀 NextCode IDE — Backend Systems Orchestrator');
  console.log('====================================================');

  // 1. Initialize Primary Redis Client
  const redisClient: RedisClientType = createClient({ url: REDIS_URL });
  redisClient.on('error', (err) => console.error('[Redis] Client error:', err));
  await redisClient.connect();
  console.log('[Redis] Connected successfully to', REDIS_URL);

  // 2. Initialize Container Warm Pool & Orphan Reaper
  const pool = new ContainerPool(
    {
      minWarm: POOL_MIN_WARM,
      maxTotal: POOL_MAX_TOTAL,
      imageName: SANDBOX_IMAGE,
      seccompPath: SECCOMP_PATH,
      reaperIntervalMs: 60000,
      zombieThresholdMs: 300000,
    },
    redisClient
  );
  await pool.initialize();

  // 3. Initialize VFS Storage Gateway
  const vfsGateway = new VfsSyncGateway(redisClient);

  // 4. Initialize Wildcard Preview Proxy & HMR Broker
  const previewProxy = new PreviewProxy(vfsGateway, redisClient);

  // 5. Initialize Auto-Graders
  const autoGrader = new AutoGrader(pool);
  const htmlCssGrader = new HtmlCssGrader();

  // 6. Setup Express App
  const app = express();

  // Security & Body Parsers
  app.use(
    cors({
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
    })
  );
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // System Health Probe
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: Date.now(),
      memory: process.memoryUsage(),
    });
  });

  // Competitive Programming Judge Endpoint (POST /api/grade)
  app.post('/api/grade', autoGrader.handleGradeRequest);

  // HTML/CSS/DOM Rule Grader Endpoints
  app.post('/api/grade/web', htmlCssGrader.handleWebGradeRequest);
  app.get('/api/grade/web/runner-script', htmlCssGrader.handleGetRunnerScript);

  // IDE VFS Sync API Routes
  app.use('/api/vfs', vfsGateway.createRouter());

  // Mount Preview Proxy as Catch-all for Subdomain File Requests
  app.use(previewProxy.getApp());

  // 7. Create HTTP Server & Execution Engine
  const server = http.createServer(app);
  const executionEngine = new ExecutionEngine(server, pool);

  // 8. Route WebSocket Upgrades (/ws/execute vs /__hmr)
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/ws/execute') {
      executionEngine.handleUpgrade(req, socket, head);
    } else if (url.pathname === '/__hmr') {
      previewProxy.handleUpgrade(req, socket, head);
    } else {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    }
  });

  // 9. Start Listening
  server.listen(PORT, () => {
    console.log(`[Server] NextCode Backend running on http://localhost:${PORT}`);
    console.log(`[Server] Competitive Judge endpoint: http://localhost:${PORT}/api/grade`);
    console.log(`[Server] Web DOM Grader endpoint: http://localhost:${PORT}/api/grade/web`);
    console.log(`[Server] Execution Engine WebSocket endpoint: ws://localhost:${PORT}/ws/execute`);
    console.log(`[Server] Live Server HMR WebSocket endpoint: ws://localhost:${PORT}/__hmr`);
  });

  // 10. Unified Graceful Shutdown Routine
  let isShuttingDown = false;
  const gracefulShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\n[Shutdown] Received ${signal}. Commencing graceful shutdown...`);

    // Safety timeout: force exit if cleanup takes over 12 seconds
    const forceExitTimer = setTimeout(() => {
      console.error('[Shutdown] Forcefully terminating process due to shutdown timeout.');
      process.exit(1);
    }, 12000);
    forceExitTimer.unref();

    try {
      // 1. Stop accepting new HTTP and WebSocket requests
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err) console.error('[Shutdown] Error closing HTTP server:', err);
          else console.log('[Shutdown] HTTP and WebSocket listeners closed.');
          resolve();
        });
      });

      // 2. Terminate active WebSockets
      executionEngine.getWebSocketServer().clients.forEach((client) => {
        client.close(1001, 'Server is shutting down');
      });
      previewProxy.getWebSocketServer().clients.forEach((client) => {
        client.close(1001, 'Server is shutting down');
      });

      // 3. Drain and destroy all Docker Sandbox Containers
      await pool.destroyAllContainers();

      // 4. Close Redis Clients
      await previewProxy.close();
      await redisClient.quit().catch(() => {});
      console.log('[Shutdown] Redis connections closed.');

      console.log('[Shutdown] Cleanup complete. Exiting smoothly.');
      process.exit(0);
    } catch (err) {
      console.error('[Shutdown] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Fatal] Bootstrap failed:', err);
  process.exit(1);
});
