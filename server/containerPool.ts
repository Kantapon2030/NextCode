import Docker from 'dockerode';
import type { RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

export interface PoolConfig {
  minWarm: number;
  maxTotal: number;
  imageName: string;
  seccompPath: string;
  reaperIntervalMs?: number;
  zombieThresholdMs?: number;
}

export class ContainerPool {
  private docker: Docker;
  private redis: RedisClientType;
  private config: PoolConfig;
  private seccompJsonString: string;
  private reaperTimer: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  private readonly WARM_QUEUE = 'nextcode:pool:warm';
  private readonly ACTIVE_SET = 'nextcode:pool:active';
  private readonly REPLENISH_LOCK_KEY = 'nextcode:lock:replenish';

  // Lua script to atomically pop warm container and mark as active
  private readonly LUA_ACQUIRE = `
    local warm_queue = KEYS[1]
    local active_set = KEYS[2]
    local container_id = redis.call('RPOP', warm_queue)
    if container_id then
      redis.call('SADD', active_set, container_id)
      return container_id
    else
      return nil
    end
  `;

  // Lua script to safely release distributed lock only if lock value matches
  private readonly LUA_RELEASE_LOCK = `
    if redis.call('GET', KEYS[1]) == ARGV[1] then
      return redis.call('DEL', KEYS[1])
    else
      return 0
    end
  `;

  // Lua script to atomically calculate how many containers can be spawned
  private readonly LUA_CALC_DEFICIT = `
    local warm_queue = KEYS[1]
    local active_set = KEYS[2]
    local min_warm = tonumber(ARGV[1])
    local max_total = tonumber(ARGV[2])

    local warm_count = redis.call('LLEN', warm_queue)
    local active_count = redis.call('SCARD', active_set)
    local total_count = warm_count + active_count

    if total_count >= max_total then
      return 0
    end

    local needed = min_warm - warm_count
    if needed <= 0 then
      return 0
    end

    if (total_count + needed) > max_total then
      needed = max_total - total_count
    end

    return needed
  `;

  constructor(config: PoolConfig, redisClient: RedisClientType) {
    this.docker = new Docker();
    this.redis = redisClient;
    this.config = {
      reaperIntervalMs: 60000,
      zombieThresholdMs: 300000, // 5 minutes max life
      ...config,
    };

    // Fix Docker Seccomp Injection:
    // Docker Engine API requires the raw JSON string passed into seccomp=<JSON>
    const resolvedPath = path.resolve(this.config.seccompPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`[ContainerPool] Seccomp profile not found at: ${resolvedPath}`);
    }
    const rawSeccomp = fs.readFileSync(resolvedPath, 'utf8');
    // Validate JSON structure and minify into single string
    this.seccompJsonString = JSON.stringify(JSON.parse(rawSeccomp));
  }

  /**
   * Initialize pool: cleans up orphans, starts background reaper, and pre-warms containers.
   */
  public async initialize(): Promise<void> {
    console.log('[ContainerPool] Initializing container pool...');
    await this.cleanupOrphanContainers();
    this.startReaperCron();
    await this.replenishPool();
    console.log('[ContainerPool] Warm pool initialized successfully.');
  }

  /**
   * Acquire a pre-warmed container atomically using a Redis Lua script.
   */
  public async acquireContainer(timeoutMs = 7000): Promise<string> {
    if (this.isShuttingDown) {
      throw new Error('[ContainerPool] System is shutting down, no new containers allowed');
    }

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      // Execute atomic pop & register via Lua
      const containerId = (await this.redis.eval(this.LUA_ACQUIRE, {
        keys: [this.WARM_QUEUE, this.ACTIVE_SET],
        arguments: [],
      })) as string | null;

      if (containerId) {
        // Trigger non-blocking replenishment in background
        this.replenishPool().catch((err) => {
          console.error('[ContainerPool] Background replenish failed:', err);
        });
        return containerId;
      }

      // If pool is momentarily empty, wait 50ms before retrying
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    throw new Error('RESOURCE_EXHAUSTED: Timed out waiting for an available container in warm pool');
  }

  /**
   * Safely destroy a container after single-use (Zero-State-Leakage Principle).
   */
  public async releaseAndDestroy(containerId: string): Promise<void> {
    try {
      await this.redis.sRem(this.ACTIVE_SET, containerId);
      const container = this.docker.getContainer(containerId);
      await container.kill().catch(() => {});
      await container.remove({ force: true, v: true }).catch(() => {});
    } catch (err) {
      console.error(`[ContainerPool] Error destroying container ${containerId}:`, err);
    } finally {
      if (!this.isShuttingDown) {
        this.replenishPool().catch((err) => {
          console.error('[ContainerPool] Post-release replenish failed:', err);
        });
      }
    }
  }

  /**
   * Replenishes the pool using a Redis Distributed Lock to prevent Thundering Herd.
   */
  public async replenishPool(): Promise<void> {
    if (this.isShuttingDown) return;

    const lockToken = uuidv4();
    const lockAcquired = await this.redis.set(this.REPLENISH_LOCK_KEY, lockToken, {
      NX: true,
      PX: 15000, // 15 second lock TTL
    });

    if (!lockAcquired) {
      // Another orchestrator worker is currently replenishing
      return;
    }

    try {
      const deficit = (await this.redis.eval(this.LUA_CALC_DEFICIT, {
        keys: [this.WARM_QUEUE, this.ACTIVE_SET],
        arguments: [String(this.config.minWarm), String(this.config.maxTotal)],
      })) as number;

      if (deficit <= 0) return;

      const spawnPromises: Promise<void>[] = [];
      for (let i = 0; i < deficit; i++) {
        spawnPromises.push(this.spawnWarmContainer());
      }
      await Promise.allSettled(spawnPromises);
    } finally {
      // Safely release distributed lock
      await this.redis.eval(this.LUA_RELEASE_LOCK, {
        keys: [this.REPLENISH_LOCK_KEY],
        arguments: [lockToken],
      }).catch(() => {});
    }
  }

  /**
   * Spawns a hardened, network-less, memory-capped pre-warmed container.
   */
  private async spawnWarmContainer(): Promise<void> {
    const sessionId = uuidv4().slice(0, 12);
    const containerName = `sandbox-${sessionId}`;

    try {
      const container = await this.docker.createContainer({
        Image: this.config.imageName,
        name: containerName,
        Tty: true,
        OpenStdin: true,
        StdinOnce: false,
        NetworkDisabled: true, // Complete Network Isolation
        HostConfig: {
          AutoRemove: false,
          Memory: 128 * 1024 * 1024, // 128 MB RAM limit
          MemorySwap: 128 * 1024 * 1024, // Disable swap completely
          NanoCpus: 500000000, // 0.5 CPU core limit
          PidsLimit: 64, // Fork bomb immunity
          ReadonlyRootfs: true, // Read-only root system
          CapDrop: ['ALL'], // Drop all Linux capabilities
          SecurityOpt: [
            'no-new-privileges:true',
            `seccomp=${this.seccompJsonString}`, // Injected JSON string
          ],
          Tmpfs: {
            '/tmp': 'rw,noexec,nosuid,size=32m',
            '/workspace': 'rw,exec,nosuid,size=32m',
          },
          Ulimits: [
            { Name: 'nofile', Soft: 256, Hard: 256 },
            { Name: 'nproc', Soft: 64, Hard: 64 },
            { Name: 'core', Soft: 0, Hard: 0 },
            { Name: 'fsize', Soft: 10485760, Hard: 10485760 }, // 10MB max file write
          ],
        },
      });

      await container.start();
      await this.redis.lPush(this.WARM_QUEUE, container.id);
    } catch (err) {
      console.error(`[ContainerPool] Failed to spawn container ${containerName}:`, err);
    }
  }

  /**
   * Scans and purges orphan/zombie containers not tracked in Redis or exceeding age threshold.
   */
  public async cleanupOrphanContainers(): Promise<void> {
    try {
      const containers = await this.docker.listContainers({ all: true });
      const sandboxContainers = containers.filter((c) =>
        c.Names.some((n) => n.startsWith('/sandbox-') || n.startsWith('sandbox-'))
      );

      if (sandboxContainers.length === 0) return;

      const warmList = await this.redis.lRange(this.WARM_QUEUE, 0, -1);
      const activeList = await this.redis.sMembers(this.ACTIVE_SET);
      const validSet = new Set([...warmList, ...activeList]);
      const now = Math.floor(Date.now() / 1000);
      const maxAgeSeconds = Math.floor((this.config.zombieThresholdMs ?? 300000) / 1000);

      for (const info of sandboxContainers) {
        const isKnownInRedis = validSet.has(info.Id);
        const ageSeconds = now - info.Created;
        const isZombie = ageSeconds > maxAgeSeconds;

        if (!isKnownInRedis || isZombie) {
          console.warn(`[ContainerPool] Reaping orphan/zombie container: ${info.Names[0]} (ID: ${info.Id.slice(0, 12)}, Age: ${ageSeconds}s)`);
          const target = this.docker.getContainer(info.Id);
          await target.kill().catch(() => {});
          await target.remove({ force: true, v: true }).catch(() => {});
          await this.redis.sRem(this.ACTIVE_SET, info.Id);
        }
      }
    } catch (err) {
      console.error('[ContainerPool] Error during orphan cleanup:', err);
    }
  }

  private startReaperCron(): void {
    if (this.reaperTimer) clearInterval(this.reaperTimer);
    this.reaperTimer = setInterval(() => {
      this.cleanupOrphanContainers().catch((err) => {
        console.error('[ContainerPool] Reaper cron error:', err);
      });
    }, this.config.reaperIntervalMs ?? 60000);
    this.reaperTimer.unref();
  }

  public stopReaper(): void {
    if (this.reaperTimer) {
      clearInterval(this.reaperTimer);
      this.reaperTimer = null;
    }
  }

  /**
   * Destroys all tracked containers and cleans up Redis queues for graceful shutdown.
   */
  public async destroyAllContainers(): Promise<void> {
    this.isShuttingDown = true;
    this.stopReaper();
    console.log('[ContainerPool] Draining and terminating all sandbox containers...');

    try {
      const warmContainers = await this.redis.lRange(this.WARM_QUEUE, 0, -1);
      const activeContainers = await this.redis.sMembers(this.ACTIVE_SET);
      const allIds = Array.from(new Set([...warmContainers, ...activeContainers]));

      const removals = allIds.map(async (id) => {
        try {
          const container = this.docker.getContainer(id);
          await container.kill().catch(() => {});
          await container.remove({ force: true, v: true }).catch(() => {});
        } catch {}
      });

      await Promise.allSettled(removals);
      await this.redis.del(this.WARM_QUEUE);
      await this.redis.del(this.ACTIVE_SET);
      await this.redis.del(this.REPLENISH_LOCK_KEY);
      console.log('[ContainerPool] All containers terminated.');
    } catch (err) {
      console.error('[ContainerPool] Error while destroying containers:', err);
    }
  }
}

