export type OutputHandler = (
  text: string,
  type: 'output'|'error'|'info'|'input-echo'|'warning'|'stdin-echo'
) => void;

export type WaitingInputHandler = (prompt: string) => void;

interface PyodideWorkerSession {
  worker:       Worker;
  sharedBuffer: SharedArrayBuffer | null;
  statusArray:  Int32Array | null;
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

  // terminate worker เก่า
  if (session) {
    session.worker.terminate();
    session = null;
    workerReady = false;
  }

  const hasSharedBuffer = typeof SharedArrayBuffer !== 'undefined';
  let sharedBuffer: SharedArrayBuffer | null = null;
  let statusArray: Int32Array | null = null;

  if (hasSharedBuffer) {
    // SharedArrayBuffer: 4 bytes status + 1024 bytes input
    sharedBuffer = new SharedArrayBuffer(4 + 1024);
    statusArray  = new Int32Array(sharedBuffer, 0, 1);
    Atomics.store(statusArray, 0, 0);
  } else {
    // แจ้งเตือนสั้นๆ เป็น Info
    onOutput(
      'ℹ️ คำเตือน: เบราว์เซอร์นี้ไม่รองรับ SharedArrayBuffer (ไม่ได้เปิดผ่าน HTTPS/localhost หรือขาด COOP/COEP headers)\n' +
      '👉 คุณยังคงรันโค้ด Python ทั่วไปได้ปกติ แต่จะไม่สามารถใช้คำสั่ง input() เพื่อรับค่าจากคีย์บอร์ดได้\n\n',
      'info'
    );
  }

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
    payload: { sharedBuffer, hasSharedBuffer },
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
