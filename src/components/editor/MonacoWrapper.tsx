import React, { Suspense, lazy, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { getMonacoLanguage } from '../../storage/vfsHelpers';
import { LoadingSpinner } from '../shared/LoadingSpinner';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.default }))
);

interface Props {
  filename: string;
  content: string;
  isActive: boolean;
  onChange: (value: string) => void;
  onCursorChange: (line: number, col: number) => void;
  onSave: () => void;
  onRun: () => void;
  onToggleAI: () => void;
  markers?: { line: number; col: number; message: string; severity: 'error' | 'warning' }[];
}

export function MonacoWrapper({
  filename,
  content,
  isActive,
  onChange,
  onCursorChange,
  onSave,
  onRun,
  onToggleAI,
  markers = [],
}: Props) {
  const { theme, fontSize, userMode } = useAppStore();
  const editorRef = useRef<unknown>(null);
  const monacoRef = useRef<unknown>(null);

  const language = getMonacoLanguage(filename);
  const editorTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  function handleEditorDidMount(editor: unknown, monaco: unknown) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    const ed = editor as {
      addCommand: (key: number, fn: () => void) => void;
      onDidChangeCursorPosition: (fn: (e: { position: { lineNumber: number; column: number } }) => void) => void;
    };
    const mo = monaco as {
      KeyMod: { CtrlCmd: number };
      KeyCode: { KeyS: number; Enter: number; KeyB: number; KEY_K: number };
    };

    // Keyboard shortcuts
    ed.addCommand(mo.KeyMod.CtrlCmd | mo.KeyCode.KeyS, onSave);
    ed.addCommand(mo.KeyMod.CtrlCmd | mo.KeyCode.Enter, onRun);
    ed.addCommand(mo.KeyMod.CtrlCmd | mo.KeyCode.KeyB, onToggleAI);

    // Cursor position tracking
    ed.onDidChangeCursorPosition((e) => {
      onCursorChange(e.position.lineNumber, e.position.column);
    });

    // Apply error markers
    applyMarkers(editor, monaco);
  }

  function applyMarkers(editor: unknown, monaco: unknown) {
    if (!monaco || !editor) return;
    try {
      const mo = monaco as {
        editor: {
          setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void;
          MarkerSeverity?: { Error?: number; Warning?: number };
        };
      };
      const ed = editor as { getModel: () => unknown };
      const model = ed.getModel();
      if (!model) return;
      if (!mo.editor?.setModelMarkers) return;

      // MarkerSeverity numeric values: Error=8, Warning=4, Info=2, Hint=1
      const SevError   = mo.editor.MarkerSeverity?.Error   ?? 8;
      const SevWarning = mo.editor.MarkerSeverity?.Warning ?? 4;

      mo.editor.setModelMarkers(
        model,
        'nextcode',
        (markers ?? []).map((m) => ({
          startLineNumber: Math.max(1, m.line   ?? 1),
          startColumn:     Math.max(1, m.col    ?? 1),
          endLineNumber:   Math.max(1, m.line   ?? 1),
          endColumn:       Math.max(1, (m.col ?? 1) + 20),
          message:  m.message  ?? 'Error',
          severity: m.severity === 'warning' ? SevWarning : SevError,
        }))
      );
    } catch (err) {
      console.warn('[MonacoWrapper] applyMarkers error:', err);
    }
  }

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      applyMarkers(editorRef.current, monacoRef.current);
    }
  }, [markers]);

  return (
    <div
      className="h-full w-full"
      style={{ visibility: isActive ? 'visible' : 'hidden', position: isActive ? 'relative' : 'absolute' }}
    >
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-full">
            <LoadingSpinner message="กำลังโหลด editor..." />
          </div>
        }
      >
        <MonacoEditor
          height="100%"
          language={language}
          value={content}
          theme={editorTheme}
          options={{
            fontSize,
            tabSize: 2,
            wordWrap: 'on',
            minimap: { enabled: true },
            formatOnPaste: true,
            automaticLayout: true,
            quickSuggestions: true,
            suggestOnTriggerCharacters: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            renderLineHighlight: 'gutter',
            lineNumbers: 'on',
            folding: true,
            bracketPairColorization: { enabled: true },
            glyphMargin: markers.length > 0,
            padding: { top: 8, bottom: 8 },
            fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
            fontLigatures: true,
          }}
          onChange={(val) => onChange(val ?? '')}
          onMount={handleEditorDidMount}
        />
      </Suspense>
    </div>
  );
}
