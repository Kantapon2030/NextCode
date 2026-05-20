import React, { Suspense, lazy, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { getMonacoLanguage } from '../../storage/vfsHelpers';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import {
  registerCompletionProvider,
  registerTabExpansion,
  insertSnippetAtCursor,
} from '../../utils/snippetShortcuts';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef  = useRef<any>(null);

  const language    = getMonacoLanguage(filename);
  const editorTheme = theme === 'dark' ? 'vs-dark' : 'vs';

  // ── Listen for snippet insert events from SnippetCheatSheet ──
  useEffect(() => {
    function handler(e: Event) {
      if (!isActive) return;
      const body = (e as CustomEvent<{ body: string }>).detail?.body;
      if (body && editorRef.current) {
        editorRef.current.focus();
        insertSnippetAtCursor(editorRef.current, body);
      }
    }
    window.addEventListener('nextcode:insertSnippet', handler);
    return () => window.removeEventListener('nextcode:insertSnippet', handler);
  }, [isActive]);

  // ── Re-apply markers when they change ──
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      applyMarkers(editorRef.current, monacoRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

  // ── onMount ──────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleEditorDidMount(editor: any, monaco: any) {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    // Keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,  onSave);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB,  onToggleAI);

    // Cursor tracking
    editor.onDidChangeCursorPosition(
      (e: { position: { lineNumber: number; column: number } }) => {
        onCursorChange(e.position.lineNumber, e.position.column);
      }
    );

    // ── Snippet: Completion provider (autocomplete dropdown) ──
    registerCompletionProvider(monaco, language);

    // ── Snippet: Tab-key expansion ────────────────────────────
    registerTabExpansion(editor, monaco, language);

    // ── Error markers ─────────────────────────────────────────
    applyMarkers(editor, monaco);
  }

  // ── Apply Monaco error/warning markers safely ─────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyMarkers(editor: any, monaco: any) {
    if (!monaco || !editor) return;
    try {
      const mo = monaco as {
        editor: {
          setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void;
          MarkerSeverity?: { Error?: number; Warning?: number };
        };
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const model = (editor as any).getModel?.();
      if (!model) return;
      if (!mo.editor?.setModelMarkers) return;

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

  return (
    <div
      className="h-full w-full"
      style={{
        visibility: isActive ? 'visible' : 'hidden',
        position:   isActive ? 'relative' : 'absolute',
      }}
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
            // Snippet-aware autocomplete
            quickSuggestions: { other: true, comments: false, strings: true },
            suggestOnTriggerCharacters: true,
            snippetSuggestions: 'top',       // show snippets first in dropdown
            tabCompletion: 'off',            // we handle Tab ourselves
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
