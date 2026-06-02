interface QueuedRequest {
  id:       string;
  fn:       () => Promise<string>;
  resolve:  (val: string) => void;
  reject:   (err: Error)  => void;
}

class AIRateLimiter {
  private queue:       QueuedRequest[] = [];
  private processing:  boolean         = false;
  private lastCall:    number          = 0;
  private cooldownMs:  number          = 0;
  private onStatusChange?: (msg: string, ms: number) => void;
  private maxAttempts: number;

  constructor(maxAttempts: number = 4) {
    this.maxAttempts = maxAttempts;
  }

  setStatusCallback(
    cb: (msg: string, ms: number) => void
  ) {
    this.onStatusChange = cb;
  }

  enqueue(fn: () => Promise<string>): Promise<string> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id: Math.random().toString(36).slice(2),
        fn, resolve, reject,
      });
      if (!this.processing) this.processNext();
    });
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }
    this.processing = true;
    const item = this.queue.shift()!;

    // รอถ้ายัง cooldown
    const now  = Date.now();
    const wait = Math.max(0, this.lastCall + this.cooldownMs - now);
    if (wait > 0) {
      this.onStatusChange?.(
        `รอ ${Math.ceil(wait / 1000)} วินาที...`, wait
      );
      await sleep(wait);
    }

    // ลอง call พร้อม exponential backoff
    let attempt = 0;
    const MAX   = this.maxAttempts;

    while (attempt < MAX) {
      try {
        this.lastCall  = Date.now();
        this.cooldownMs = 0;
        const result   = await item.fn();
        item.resolve(result);
        this.onStatusChange?.('', 0);
        break;
      } catch (e: unknown) {
        attempt++;
        const err = e instanceof Error ? e : new Error(String(e));

        if (err.message.includes('429')) {
          // exponential backoff: 5s → 10s → 20s → 40s
          const backoff = Math.pow(2, attempt) * 5000;
          this.cooldownMs = backoff;
          this.onStatusChange?.(
            `ถึง rate limit — รอ ${backoff / 1000} วิ (${attempt}/${MAX})`,
            backoff
          );
          await sleep(backoff);
          continue;
        }

        // error อื่น → ไม่ retry
        item.reject(err);
        break;
      }
    }

    if (attempt >= MAX) {
      item.reject(new Error(
        'ถึง rate limit หลายครั้ง กรุณารอสักครู่แล้วลองใหม่'
      ));
    }

    this.processNext();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export const aiRateLimiter = new AIRateLimiter(4);
export const autocompleteRateLimiter = new AIRateLimiter(1);
