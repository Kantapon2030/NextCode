let pyodide = null;

// SharedArrayBuffer layout:
// [0] = status: 0=idle, 1=waiting_input, 2=input_ready
// [1..256] = input string (UTF-16, max 255 chars)
let sharedBuffer = null;
let statusArray  = null;   // Int32Array view
let inputArray   = null;   // Uint16Array view สำหรับข้อความ

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    // รับ SharedArrayBuffer จาก main thread
    sharedBuffer = payload.sharedBuffer;
    statusArray  = new Int32Array(sharedBuffer, 0, 4);
    inputArray   = new Uint16Array(sharedBuffer, 16, 512);

    // โหลด Pyodide
    self.postMessage({ type: 'OUTPUT', text: 'กำลังโหลด Python...', outputType: 'info' });

    importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js');
    
    // @ts-ignore
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
    });

    // capture stdout/stderr
    pyodide.setStdout({
      batched: (text) => {
        self.postMessage({ type: 'OUTPUT', text, outputType: 'output' });
      }
    });
    pyodide.setStderr({
      batched: (text) => {
        self.postMessage({ type: 'OUTPUT', text, outputType: 'error' });
      }
    });

    // inject mock input ที่ใช้ Atomics.wait
    await pyodide.runPythonAsync(`
import builtins
import js

def _blocking_input(prompt=''):
    """
    บล็อก Worker thread รอ input จาก main thread
    ผ่าน SharedArrayBuffer + Atomics
    """
    if prompt:
        import sys
        sys.stdout.write(str(prompt))
        sys.stdout.flush()

    # บอก main thread ว่ากำลังรอ input
    js._notify_waiting_input(str(prompt) if prompt else '')

    # Atomics.wait — บล็อก thread จนกว่า status = 2
    # (js side จะ set 2 เมื่อผู้ใช้กด Enter)
    js._atomics_wait()

    # อ่านค่าจาก shared buffer
    val = js._read_input_value()

    # reset status กลับเป็น 0
    js._reset_status()

    return val

builtins.input = _blocking_input
`);

    // วาง JS helpers ใน Python namespace
    pyodide.globals.set('_notify_waiting_input', (prompt) => {
      // set status = 1 (waiting)
      Atomics.store(statusArray, 0, 1);
      self.postMessage({ type: 'WAITING_INPUT', prompt: prompt || '' });
    });

    pyodide.globals.set('_atomics_wait', () => {
      // block จนกว่า status เปลี่ยนจาก 1 → 2
      while (Atomics.load(statusArray, 0) !== 2) {
        Atomics.wait(statusArray, 0, 1, 50); // timeout 50ms
      }
    });

    pyodide.globals.set('_read_input_value', () => {
      // อ่าน string จาก inputArray
      let end = 0;
      while (end < inputArray.length && inputArray[end] !== 0) {
        end++;
      }
      return String.fromCharCode(...inputArray.slice(0, end));
    });

    pyodide.globals.set('_reset_status', () => {
      // ล้าง input buffer
      inputArray.fill(0);
      // reset status → 0 (idle)
      Atomics.store(statusArray, 0, 0);
    });

    self.postMessage({ type: 'READY' });
  }

  else if (type === 'RUN') {
    const { code } = payload;

    // โหลด packages
    try {
      await pyodide.loadPackagesFromImports(code);
    } catch {}

    // รัน
    try {
      await pyodide.runPythonAsync(code);
      self.postMessage({ type: 'DONE', exitCode: 0 });
    } catch (err) {
      // clean up traceback
      const msg = String(err)
        .split('\\n')
        .filter(l =>
          !l.includes('_pyodide') &&
          !l.includes('CodeRunner') &&
          !l.includes('run_async')
        )
        .join('\\n')
        .trim();
      self.postMessage({ type: 'OUTPUT', text: msg, outputType: 'error' });
      self.postMessage({ type: 'DONE', exitCode: 1 });
    }
  }

  else if (type === 'SEND_INPUT') {
    // ผู้ใช้กด Enter → เขียนค่าลง SharedArrayBuffer
    const { value } = payload;
    const chars = value.split('').map(c => c.charCodeAt(0));

    // เขียน string
    inputArray.fill(0);
    chars.forEach((c, i) => {
      if (i < inputArray.length - 1) inputArray[i] = c;
    });

    // set status = 2 (input ready) → Worker จะ unblock
    Atomics.store(statusArray, 0, 2);
    // notify Worker
    Atomics.notify(statusArray, 0);
  }

  else if (type === 'STOP') {
    // force unblock ด้วย empty input
    inputArray.fill(0);
    Atomics.store(statusArray, 0, 2);
    Atomics.notify(statusArray, 0);
  }
};
