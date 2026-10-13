/**
 * NextCode IDE — Client SDK (Zero-Dependency)
 * Copy directly into your Frontend React/Vue/Svelte application.
 */

export interface NextCodeClientOptions {
  baseUrl: string; // e.g. "http://localhost:4000" or "https://ide-api.nextcode.run"
  wsUrl?: string; // Optional: auto-derived from baseUrl if omitted
  sessionId: string;
  onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void;
}

export interface RunCallbacks {
  onOutput?: (chunk: string) => void;
  onSystem?: (msg: string) => void;
  onExit?: (code: number) => void;
  onError?: (error: string) => void;
}

export type Verdict = 'AC' | 'WA' | 'TLE' | 'MLE' | 'RE' | 'CE';

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  timeLimitMs?: number;
  memoryLimitKb?: number;
}

export interface TestCaseResult {
  id: string;
  verdict: Verdict;
  executionTimeMs: number;
  memoryUsedKb: number;
  actualOutput?: string;
  expectedOutput?: string;
  stderr?: string;
  errorMessage?: string;
}

export interface GradeReport {
  overallVerdict: Verdict;
  score: number;
  passedTests: number;
  totalTests: number;
  totalExecutionTimeMs: number;
  peakMemoryKb: number;
  compileOutput?: string;
  results: TestCaseResult[];
  timestamp: number;
}

export interface WebRule {
  id: string;
  title: string;
  type: 'tag_exists' | 'attribute_check' | 'text_content' | 'computed_style' | 'css_rule_exists' | 'custom_assertion';
  selector?: string;
  attributeName?: string;
  expectedValue?: string;
  cssProperty?: string;
  customCode?: string;
  points?: number;
}

export interface WebGradeReport {
  overallPassed: boolean;
  score: number;
  passedRules: number;
  totalRules: number;
  results: Array<{
    id: string;
    title: string;
    passed: boolean;
    message?: string;
    actualValue?: string;
    expectedValue?: string;
    pointsAwarded: number;
  }>;
  timestamp: number;
}

export class NextCodeClient {
  private baseUrl: string;
  private wsUrl: string;
  private sessionId: string;
  private socket: WebSocket | null = null;
  private currentCallbacks: RunCallbacks | null = null;
  private debounceTimers: Map<string, any> = new Map();
  private reconnectTimer: any = null;
  private shouldReconnect: boolean = true;
  private onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void;

  constructor(options: NextCodeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.sessionId = options.sessionId;
    this.onStatusChange = options.onStatusChange;

    if (options.wsUrl) {
      this.wsUrl = options.wsUrl;
    } else {
      const isHttps = this.baseUrl.startsWith('https:');
      const wsProto = isHttps ? 'wss:' : 'ws:';
      const host = this.baseUrl.replace(/^https?:\/\//, '');
      this.wsUrl = `${wsProto}//${host}/ws/execute`;
    }
  }

  // ==========================================
  // 1. Interactive PTY Terminal (WebSocket)
  // ==========================================

  /**
   * Establishes WebSocket connection to the execution engine.
   */
  public async connect(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    this.shouldReconnect = true;
    this.onStatusChange?.('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.wsUrl);

        this.socket.onopen = () => {
          this.onStatusChange?.('connected');
          if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
          resolve();
        };

        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'OUTPUT') {
              this.currentCallbacks?.onOutput?.(data.data);
            } else if (data.type === 'SYSTEM') {
              this.currentCallbacks?.onSystem?.(data.data);
            } else if (data.type === 'EXIT') {
              this.currentCallbacks?.onExit?.(data.code);
            } else if (data.type === 'ERROR') {
              this.currentCallbacks?.onError?.(data.message);
            }
          } catch {
            this.currentCallbacks?.onOutput?.(event.data);
          }
        };

        this.socket.onerror = (err) => {
          this.onStatusChange?.('error');
          reject(err);
        };

        this.socket.onclose = () => {
          this.onStatusChange?.('disconnected');
          if (this.shouldReconnect) {
            this.reconnectTimer = setTimeout(() => this.connect(), 2000);
          }
        };
      } catch (err) {
        this.onStatusChange?.('error');
        reject(err);
      }
    });
  }

  /**
   * Disconnects WebSocket connection cleanly.
   */
  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /**
   * Executes code in a pre-warmed container with streaming output.
   */
  public async runCode(
    language: 'c' | 'cpp' | 'python',
    code: string,
    files?: Record<string, string>,
    callbacks?: RunCallbacks
  ): Promise<void> {
    await this.connect();
    this.currentCallbacks = callbacks || null;

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket connection is not open');
    }

    this.socket.send(
      JSON.stringify({
        type: 'RUN',
        language,
        code,
        files: files || {},
      })
    );
  }

  /**
   * Sends user keystrokes / input to program stdin.
   */
  public sendInput(text: string): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'INPUT', data: text }));
    }
  }

  /**
   * Notifies server of Terminal dimension change (cols/rows).
   */
  public resizeTerminal(cols: number, rows: number): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'RESIZE', cols, rows }));
    }
  }

  /**
   * Sends kill signal to terminate running execution immediately.
   */
  public killExecution(): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ type: 'KILL' }));
    }
  }

  // ==========================================
  // 2. VFS File Synchronization (Debounced)
  // ==========================================

  /**
   * Debounced file sync for code editor input (prevents flooding backend on every key stroke).
   */
  public saveFileDebounced(filePath: string, content: string, delayMs = 500): void {
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath));
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      this.saveFileImmediate(filePath, content).catch((err) => {
        console.error(`[NextCodeClient] Auto-save failed for ${filePath}:`, err);
      });
    }, delayMs);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Saves a single file to Redis VFS immediately.
   */
  public async saveFileImmediate(
    filePath: string,
    content: string,
    mimeType?: string
  ): Promise<{ success: boolean; path: string }> {
    const res = await fetch(`${this.baseUrl}/api/vfs/${encodeURIComponent(this.sessionId)}/file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, content, mimeType }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(err.error || `Failed to save file: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Batch saves multiple project files at once.
   */
  public async batchSaveFiles(files: Record<string, string>): Promise<{ success: boolean; count: number }> {
    const res = await fetch(`${this.baseUrl}/api/vfs/${encodeURIComponent(this.sessionId)}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Batch upload failed' }));
      throw new Error(err.error || `Failed to batch upload files: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Deletes a file from Redis VFS.
   */
  public async deleteFile(filePath: string): Promise<boolean> {
    const url = `${this.baseUrl}/api/vfs/${encodeURIComponent(this.sessionId)}/file?path=${encodeURIComponent(filePath)}`;
    const res = await fetch(url, { method: 'DELETE' });
    return res.ok;
  }

  /**
   * Lists all files currently stored in Redis VFS for this session.
   */
  public async listFiles(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/api/vfs/${encodeURIComponent(this.sessionId)}/files`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  }

  // ==========================================
  // 3. Competitive Programming Auto-Grader
  // ==========================================

  /**
   * Submits code to the competitive programming judge engine.
   */
  public async submitAssignment(submission: {
    language: 'c' | 'cpp' | 'python';
    code: string;
    testCases: TestCase[];
    files?: Record<string, string>;
  }): Promise<GradeReport> {
    const res = await fetch(`${this.baseUrl}/api/grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submission),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Grading failed' }));
      throw new Error(err.error || `Grading failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  /**
   * Submits web assignment files for HTML/CSS/DOM rule validation.
   */
  public async submitWebAssignment(
    rules: WebRule[],
    files?: Record<string, string>
  ): Promise<WebGradeReport> {
    // If files not provided, fetch current files from VFS
    let projectFiles = files;
    if (!projectFiles) {
      projectFiles = {};
      const fileList = await this.listFiles();
      for (const f of fileList) {
        try {
          const fileRes = await fetch(`${this.getPreviewUrl(false, f)}`);
          if (fileRes.ok) {
            projectFiles[f] = await fileRes.text();
          }
        } catch {}
      }
    }

    const res = await fetch(`${this.baseUrl}/api/grade/web`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: projectFiles, rules }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Web grading failed' }));
      throw new Error(err.error || `Web grading failed: HTTP ${res.status}`);
    }

    return await res.json();
  }

  // ==========================================
  // 4. Live Server Preview & Iframe Helpers
  // ==========================================

  /**
   * Returns preview URL for the sandboxed iframe.
   */
  public getPreviewUrl(useSubdomain = true, filePath = 'index.html'): string {
    const cleanPath = filePath.replace(/^\/+/, '');
    if (useSubdomain && !this.baseUrl.includes('localhost') && !this.baseUrl.includes('127.0.0.1')) {
      const parsed = new URL(this.baseUrl);
      return `${parsed.protocol}//${this.sessionId}.preview.${parsed.host}/${cleanPath}`;
    }
    // Local development fallback
    return `${this.baseUrl}/${cleanPath}?session=${encodeURIComponent(this.sessionId)}`;
  }

  /**
   * Attaches window message listener to capture grade results posted from preview iframe.
   */
  public listenToIframeGradeResults(callback: (report: WebGradeReport) => void): () => void {
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.type === 'NEXTCODE_WEB_GRADE_RESULT') {
        callback(event.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }
}
