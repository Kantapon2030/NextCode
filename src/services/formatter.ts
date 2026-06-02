// Prettier WASM loading state
let prettierLoaded = false;

async function loadPrettier(): Promise<void> {
  if (prettierLoaded) return;
  await Promise.all([
    loadScript('https://cdn.jsdelivr.net/npm/prettier@3.4.2/standalone.js'),
    loadScript('https://cdn.jsdelivr.net/npm/prettier@3.4.2/plugins/babel.js'),
    loadScript('https://cdn.jsdelivr.net/npm/prettier@3.4.2/plugins/html.js'),
    loadScript('https://cdn.jsdelivr.net/npm/prettier@3.4.2/plugins/postcss.js'),
    loadScript('https://cdn.jsdelivr.net/npm/prettier@3.4.2/plugins/estree.js'),
  ]);
  prettierLoaded = true;
}

function loadScript(src: string): Promise<void> {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      res(); return;
    }
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(); s.onerror = rej;
    document.head.appendChild(s);
  });
}

// Pyodide lazy-loader for autopep8 Python formatting
let pyodideInstance: any = null;

async function getPyodideInstance(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  await loadScript('https://cdn.jsdelivr.net/pyodide/v0.26.0/full/pyodide.js');
  // @ts-ignore
  pyodideInstance = await window.loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.0/full/',
  });
  return pyodideInstance;
}

export async function formatCode(
  code:     string,
  language: string,
  tabWidth: number = 2
): Promise<string> {

  // ── Python: ใช้ autopep8 ผ่าน Pyodide ──
  if (language === 'python') {
    try {
      const pyodide = await getPyodideInstance();
      await pyodide.loadPackage('autopep8');
      const formatted = pyodide.runPython(`
import autopep8
autopep8.fix_code('''${code.replace(/'''/g, "\\'\\'\\'")}''',
  options={'max_line_length': 88})
`);
      return formatted as string;
    } catch (err) {
      console.warn('[Formatter] Python format error:', err);
      return code; // fallback
    }
  }

  // ── C/C++: ใช้ indent-based basic formatting ──
  if (language === 'c' || language === 'cpp') {
    return basicCFormat(code, tabWidth);
  }

  // ── HTML/CSS/JS/TS: Prettier ──
  try {
    await loadPrettier();
    const w = window as any;
    const parser = {
      html: 'html', css: 'css',
      javascript: 'babel', typescript: 'babel',
    }[language] ?? 'babel';

    const plugins = [
      w.prettierPlugins?.html,
      w.prettierPlugins?.babel,
      w.prettierPlugins?.postcss,
      w.prettierPlugins?.estree,
    ].filter(Boolean);

    return await w.prettier.format(code, {
      parser, plugins, tabWidth,
      semi: true, singleQuote: false,
      printWidth: 80,
    });
  } catch (err) {
    console.warn('[Formatter] Prettier format error:', err);
    return code;
  }
}

// basic C formatter (indent fix)
function basicCFormat(code: string, tabSize: number): string {
  const indent = ' '.repeat(tabSize);
  let level = 0;
  return code.split('\n').map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('}')) level = Math.max(0, level - 1);
    const result = indent.repeat(level) + trimmed;
    if (trimmed.endsWith('{')) level++;
    return result;
  }).join('\n');
}
