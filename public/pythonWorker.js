let pyodide = null;

// SharedArrayBuffer layout (4096 bytes):
// [0] = status: 0=idle, 1=waiting_input, 2=input_ready (Int32Array at offset 0, len 1)
// [16..2063] = input string UTF-16 (Uint16Array at offset 16, max 1024 chars)
let sharedBuffer = null;
let statusArray  = null;   // Int32Array view
let inputArray   = null;   // Uint16Array view สำหรับข้อความ

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  if (type === 'INIT') {
    // รับ SharedArrayBuffer จาก main thread
    const { hasSharedBuffer } = payload;
    if (hasSharedBuffer) {
      sharedBuffer = payload.sharedBuffer;
      statusArray  = new Int32Array(sharedBuffer, 0, 1);
      inputArray   = new Uint16Array(sharedBuffer, 16, 1024);
    }

    // โหลด Pyodide
    self.postMessage({ type: 'OUTPUT', text: 'กำลังโหลด Python runtime...', outputType: 'info' });

    importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js');
    
    // @ts-ignore
    pyodide = await loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
    });

    // capture stdout/stderr (batched ส่งข้อความแบบแยกบรรทัดมาให้ จึงเติม \n เพื่อให้แสดงผลขึ้นบรรทัดใหม่)
    pyodide.setStdout({
      batched: (text) => {
        self.postMessage({ type: 'OUTPUT', text: text + '\n', outputType: 'output' });
      }
    });
    pyodide.setStderr({
      batched: (text) => {
        self.postMessage({ type: 'OUTPUT', text: text + '\n', outputType: 'error' });
      }
    });

    // inject mock input
    if (hasSharedBuffer) {
      await pyodide.runPythonAsync(`
import builtins
import js

def _blocking_input(prompt=''):
    """
    บล็อก Worker thread รอ input จาก main thread
    ผ่าน SharedArrayBuffer + Atomics
    """
    # ส่ง prompt ไปแสดงที่ terminal ทันที และบอก main thread ว่ากำลังรอ input
    js._notify_waiting_input(str(prompt) if prompt is not None else '')

    # Atomics.wait — บล็อก thread จนกว่า status = 2
    # (main thread จะ set 2 และ Atomics.notify เมื่อผู้ใช้ส่งค่า)
    js._atomics_wait()

    # อ่านค่าจาก shared buffer
    val = js._read_input_value()

    # reset status กลับเป็น 0
    js._reset_status()

    # ตัด newline ท้าย string ที่อาจติดมาจาก terminal ถ้ามี
    if val.endswith('\\n'):
        val = val[:-1]
    if val.endswith('\\r'):
        val = val[:-1]

    return val

builtins.input = _blocking_input
`);

      // วาง JS helpers ใน Python namespace
      pyodide.globals.set('_notify_waiting_input', (prompt) => {
        // ถ้ามี prompt ให้ส่งออกเป็น OUTPUT ทันที (ไม่ใส่ \n เพื่อให้ input box อยู่ในบรรทัดเดียวกัน)
        if (prompt) {
          self.postMessage({ type: 'OUTPUT', text: prompt, outputType: 'output' });
        }
        // set status = 1 (waiting)
        Atomics.store(statusArray, 0, 1);
        self.postMessage({ type: 'WAITING_INPUT', prompt: prompt || '' });
      });

      pyodide.globals.set('_atomics_wait', () => {
        // block จนกว่า status เปลี่ยนจาก 1 → 2
        while (Atomics.load(statusArray, 0) !== 2) {
          Atomics.wait(statusArray, 0, 1, 100);
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
    } else {
      await pyodide.runPythonAsync(`
import builtins

def _fallback_input(prompt=''):
    raise OSError("เบราว์เซอร์นี้ไม่รองรับการรับค่าผ่าน input() เนื่องจากระบบความปลอดภัยของเบราว์เซอร์บล็อก SharedArrayBuffer (กรุณาใช้งานผ่าน HTTPS หรือ localhost)")

builtins.input = _fallback_input
`);
    }

    self.postMessage({ type: 'READY' });
  }

  else if (type === 'RUN') {
    const { code } = payload;

    // ตรวจสอบและโหลด packages พร้อมแจ้งเตือนผู้ใช้ใน Terminal
    try {
      let isPackageDownloading = false;
      await pyodide.loadPackagesFromImports(code, {
        messageCallback: (msg) => {
          isPackageDownloading = true;
          self.postMessage({ type: 'OUTPUT', text: `📦 ${msg}\n`, outputType: 'info' });
        },
      });
      if (isPackageDownloading) {
        self.postMessage({ type: 'OUTPUT', text: '✓ โหลดแพ็กเกจเสร็จสิ้น\n', outputType: 'info' });
      }
    } catch {}

    // รันโค้ด
    try {
      await pyodide.runPythonAsync(code);
      self.postMessage({ type: 'DONE', exitCode: 0 });
    } catch (err) {
      // clean up traceback
      const msg = String(err)
        .split('\n')
        .filter(l =>
          !l.includes('_pyodide') &&
          !l.includes('CodeRunner') &&
          !l.includes('run_async')
        )
        .join('\n')
        .trim();
      self.postMessage({ type: 'OUTPUT', text: msg ? msg + '\n' : '', outputType: 'error' });
      self.postMessage({ type: 'DONE', exitCode: 1 });
    }
  }

  else if (type === 'SEND_INPUT') {
    if (statusArray && inputArray) {
      const { value } = payload;
      const chars = (value || '').split('').map(c => c.charCodeAt(0));

      inputArray.fill(0);
      chars.forEach((c, i) => {
        if (i < inputArray.length - 1) inputArray[i] = c;
      });

      Atomics.store(statusArray, 0, 2);
      Atomics.notify(statusArray, 0, 1);
    }
  }

  else if (type === 'STOP') {
    if (inputArray && statusArray) {
      // force unblock ด้วย empty input
      inputArray.fill(0);
      Atomics.store(statusArray, 0, 2);
      Atomics.notify(statusArray, 0, 1);
    }
  }
};
