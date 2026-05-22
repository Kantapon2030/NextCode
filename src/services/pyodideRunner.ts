export type OutputHandler = (
  text: string,
  type: 'output'|'error'|'info'|'input-echo'|'warning'|'stdin-echo'
) => void;

export type WaitingInputHandler = (prompt: string) => void;

interface PyodideWorkerSession {
  worker:       Worker;
  sharedBuffer: SharedArrayBuffer;
  statusArray:  Int32Array;
}

let session: PyodideWorkerSession | null = null;
let workerReady = false;

// สร้าง Worker + SharedArrayBuffer ครั้งเดียว
export async function initPyodideWorker(
  onOutput: OutputHandler,
  onWaitingInput: WaitingInputHandler,
  onReady: () => void,
  onDone: (exitCode: number) => void
): Promise<void> {

  // ตรวจว่า SharedArrayBuffer ใช้ได้
  if (typeof SharedArrayBuffer === 'undefined') {
    onOutput(
      '❌ browser ไม่รองรับ SharedArrayBuffer\\n' +
      'ต้องเปิดด้วย HTTPS และมี COOP/COEP headers',
      'error'
    );
    return;
  }

  // terminate worker เก่า
  if (session) {
    session.worker.terminate();
    session = null;
    workerReady = false;
  }

  // SharedArrayBuffer: 4 bytes status + 1024 bytes input
  const sharedBuffer = new SharedArrayBuffer(4 + 1024);
  const statusArray  = new Int32Array(sharedBuffer, 0, 1);
  Atomics.store(statusArray, 0, 0);

  const worker = new Worker('/pythonWorker.js');

  worker.onmessage = (e) => {
    const { type, text, outputType, prompt, exitCode } = e.data;

    if (type === 'READY') {
      workerReady = true;
      onReady();
    }
    else if (type === 'OUTPUT') {
      onOutput(text ?? '', outputType ?? 'output');
    }
    else if (type === 'WAITING_INPUT') {
      onWaitingInput(prompt ?? '');
    }
    else if (type === 'DONE') {
      onDone(exitCode ?? 0);
    }
  };

  worker.onerror = (err) => {
    onOutput(`Worker error: ${err.message}`, 'error');
  };

  session = { worker, sharedBuffer, statusArray };

  // init worker
  worker.postMessage({
    type: 'INIT',
    payload: { sharedBuffer },
  });
}

export function runPythonCode(code: string): void {
  if (!session || !workerReady) return;
  session.worker.postMessage({ type: 'RUN', payload: { code } });
}

export function sendInputToWorker(value: string): void {
  if (!session) return;
  session.worker.postMessage({
    type: 'SEND_INPUT', payload: { value }
  });
}

export function stopPythonWorker(): void {
  if (!session) return;
  session.worker.postMessage({ type: 'STOP' });
}

export function terminatePyodideWorker(): void {
  session?.worker.terminate();
  session      = null;
  workerReady  = false;
}
