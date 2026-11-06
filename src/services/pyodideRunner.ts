export type OutputHandler = (
  text: string,
  type: 'output'|'error'|'info'|'input-echo'|'warning'|'stdin-echo'
) => void;

export type WaitingInputHandler = (prompt: string) => void;

interface PyodideWorkerSession {
  worker:       Worker;
  sharedBuffer: SharedArrayBuffer | null;
  statusArray:  Int32Array | null;
  inputArray:   Uint16Array | null;
}

let session: PyodideWorkerSession | null = null;
let workerReady = false;

export function isPyodideReady(): boolean {
  return session !== null && workerReady;
}

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
  let inputArray: Uint16Array | null = null;

  if (hasSharedBuffer) {
    // SharedArrayBuffer 4096 bytes:
    // [0..3] = status (Int32Array at byte offset 0, length 1)
    // [16..2063] = input characters (Uint16Array at byte offset 16, length 1024)
    sharedBuffer = new SharedArrayBuffer(4096);
    statusArray  = new Int32Array(sharedBuffer, 0, 1);
    inputArray   = new Uint16Array(sharedBuffer, 16, 1024);
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

  session = { worker, sharedBuffer, statusArray, inputArray };

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
  if (session.statusArray && session.inputArray) {
    // ป้อนค่าลง SharedArrayBuffer โดยตรงจาก Main Thread
    session.inputArray.fill(0);
    const chars = value.split('').map((c) => c.charCodeAt(0));
    chars.forEach((c, i) => {
      if (i < session!.inputArray!.length - 1) {
        session!.inputArray![i] = c;
      }
    });

    // เซ็ต status = 2 (input_ready) และปลุก Worker ที่รออยู่ใน Atomics.wait ทันที
    Atomics.store(session.statusArray, 0, 2);
    Atomics.notify(session.statusArray, 0, 1);
  } else {
    session.worker.postMessage({
      type: 'SEND_INPUT',
      payload: { value },
    });
  }
}

export function stopPythonWorker(): void {
  if (!session) return;
  if (session.statusArray && session.inputArray) {
    session.inputArray.fill(0);
    Atomics.store(session.statusArray, 0, 2);
    Atomics.notify(session.statusArray, 0, 1);
  }
  session.worker.terminate();
  session = null;
  workerReady = false;
}

export function terminatePyodideWorker(): void {
  session?.worker.terminate();
  session      = null;
  workerReady  = false;
}
