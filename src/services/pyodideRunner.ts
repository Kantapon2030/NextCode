/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    loadPyodide: (config: { indexURL: string }) => Promise<any>;
  }
}

let pyodide: any = null;
let loading = false;
let loadError: string | null = null;

const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/';

export async function initPyodide(onStatus: (msg: string) => void): Promise<any> {
  if (pyodide) return pyodide;
  if (loading) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (!loading) { clearInterval(check); resolve(); }
      }, 200);
    });
    if (pyodide) return pyodide;
    throw new Error(loadError ?? 'Pyodide failed to load');
  }

  loading = true;
  try {
    onStatus('กำลังโหลด Python runtime (อาจใช้เวลาสักครู่)...');
    if (!window.loadPyodide) {
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `${PYODIDE_CDN}pyodide.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Pyodide script'));
        document.head.appendChild(script);
      });
    }
    onStatus('กำลังเตรียม Python environment...');
    pyodide = await window.loadPyodide({ indexURL: PYODIDE_CDN });
    onStatus('Python runtime พร้อมแล้ว!');
    return pyodide;
  } catch (e) {
    loadError = String(e);
    throw e;
  } finally {
    loading = false;
  }
}

export async function runPython(
  code: string,
  onOutput: (text: string, type: 'output' | 'error') => void,
  onStatus: (msg: string) => void
): Promise<void> {
  const py = await initPyodide(onStatus);

  py.setStdout({ batched: (msg: string) => onOutput(msg, 'output') });
  py.setStderr({ batched: (msg: string) => onOutput(msg, 'error') });

  try {
    onStatus('กำลังโหลด packages...');
    await py.loadPackagesFromImports(code);
    onStatus('');
    await py.runPythonAsync(code);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    onOutput(msg, 'error');
  }
}
