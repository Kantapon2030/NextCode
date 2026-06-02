import React, { Suspense, lazy, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { getMonacoLanguage } from '../../storage/vfsHelpers';
import { LoadingSpinner } from '../shared/LoadingSpinner';
import { formatCode } from '../../services/formatter';
import { toast } from '../shared/Toast';
import {
  registerCompletionProvider,
  registerTabExpansion,
  insertSnippetAtCursor,
} from '../../utils/snippetShortcuts';
import { VOID_TAGS } from '../../utils/emmetHelper';
import { registerInlineComplete } from '../../services/inlineComplete';
import { getSetting } from '../../storage/db';
import { useState } from 'react';

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
  const { theme, fontSize, userMode, user, fontFamily, minimapEnabled } = useAppStore();
  const [inlineCompleteEnabled, setInlineCompleteEnabled] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      const val = await getSetting<boolean>('inline_complete', true);
      setInlineCompleteEnabled(val);
    }
    loadSettings();
  }, []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef  = useRef<any>(null);
  const hoverProviderRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (hoverProviderRef.current) {
        hoverProviderRef.current.dispose();
      }
    };
  }, []);

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

  // ── Listen for format events from StatusBar ──
  useEffect(() => {
    function handler() {
      if (!isActive || !editorRef.current) return;
      editorRef.current.trigger('keyboard', 'format-document-custom', {});
    }
    window.addEventListener('nextcode:formatCode', handler);
    return () => window.removeEventListener('nextcode:formatCode', handler);
  }, [isActive]);

  // ── Listen for goto-line event from Search Modal ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { path, line } = (e as CustomEvent).detail;
      if (path === filename && editorRef.current) {
        editorRef.current.revealLineInCenter(line);
        editorRef.current.setPosition({ lineNumber: line, column: 1 });
        editorRef.current.focus();
      }
    };
    window.addEventListener('goto-line', handler);
    return () => window.removeEventListener('goto-line', handler);
  }, [filename]);

  // ── Re-apply markers when they change ──
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      applyMarkers(editorRef.current, monacoRef.current);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers]);

    // ── Use refs to avoid stale closures in Monaco commands ──
    const onSaveRef = useRef(onSave);
    const onRunRef = useRef(onRun);
    const onToggleAIRef = useRef(onToggleAI);
  
    useEffect(() => {
      onSaveRef.current = onSave;
      onRunRef.current = onRun;
      onToggleAIRef.current = onToggleAI;
    }, [onSave, onRun, onToggleAI]);
  
    // ── onMount ──────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function handleEditorDidMount(editor: any, monaco: any) {
      editorRef.current  = editor;
      monacoRef.current  = monaco;
  
      // Keyboard shortcuts
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => onToggleAIRef.current());

      // ── Wrap Selection with Tag (Alt + W) ──
      editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyW, () => {
        const selection = editor.getSelection();
        if (!selection) return;
        const model = editor.getModel();
        if (!model) return;
        const selectedText = model.getValueInRange(selection);
        const tag = window.prompt("ระบุชื่อ Tag ที่ต้องการครอบ (เช่น div, span, section):", "div");
        if (!tag) return;
        const cleanTag = tag.trim().toLowerCase();
        if (!cleanTag) return;
        const wrappedText = `<${cleanTag}>${selectedText}</${cleanTag}>`;
        editor.executeEdits('wrap-tag', [
          {
            range: selection,
            text: wrappedText,
            forceMoveMarkers: true,
          },
        ]);
      });

      // ── Auto-Closing Tags Listener ──
      editor.onDidChangeModelContent((e: any) => {
        if (!['html', 'javascript', 'typescript'].includes(language)) return;

        if (e.changes.length === 1 && e.changes[0].text === '>') {
          const position = editor.getPosition();
          if (!position) return;
          const model = editor.getModel();
          if (!model) return;
          const lineContent = model.getLineContent(position.lineNumber);
          const textBefore = lineContent.substring(0, position.column - 1);
          
          const tagMatch = textBefore.slice(0, -1).match(/<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)$/);
          if (tagMatch) {
            const tag = tagMatch[1];
            const attrs = tagMatch[2];
            if (attrs.endsWith('/') || VOID_TAGS.has(tag.toLowerCase())) {
              return;
            }
            const closingTag = `</${tag}>`;
            editor.executeEdits('auto-close', [
              {
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                text: closingTag,
                forceMoveMarkers: false,
              },
            ]);
          }
        }
      });

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

    // ── Monaco Hover Provider for Symbols ─────────────────────
    if (hoverProviderRef.current) {
      hoverProviderRef.current.dispose();
    }

    const explainCommandId = editor.addCommand(0, (_ctx: any, symbol: string) => {
      window.dispatchEvent(new CustomEvent('nextcode:explainSymbol', { detail: { symbol } }));
    });

    const hoverDisposable = monaco.languages.registerHoverProvider(language, {
      provideHover: (model: any, position: any) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const quickDescriptions: Record<string, string> = {
          // HTML
          div: 'HTML `<div>` Element: A generic container for flow content.',
          span: 'HTML `<span>` Element: A generic inline container for phrasing content.',
          a: 'HTML `<a>` Element: An anchor link element to create hyperlinks.',
          p: 'HTML `<p>` Element: Represents a paragraph of text.',
          img: 'HTML `<img>` Element: Embeds an image in the document.',
          
          // JS/TS
          console: '`console` object: Access browser or runtime debugging console.',
          log: '`console.log()`: Print logs/messages to the output console.',
          querySelector: '`document.querySelector()`: Returns the first Element matching the specified selector.',
          addEventListener: '`addEventListener()`: Sets up a function to be called when the specified event is delivered.',
          fetch: '`fetch()`: Starts the process of fetching a resource from the network.',
          
          // Python
          print: '`print(*objects, sep=\' \', end=\'\\n\', file=None, flush=False)`: Prints values to stream or stdout.',
          len: '`len(s)`: Return the length (the number of items) of an object.',
          range: '`range(stop)`: Generates a sequence of numbers.',
          input: '`input(prompt)`: Read a string from standard input.',
          
          // C/C++
          printf: '`printf(const char *format, ...)`: Print formatted output to stdout.',
          scanf: '`scanf(const char *format, ...)`: Read formatted input from stdin.',
          cout: '`std::cout`: Standard output stream in C++.',
          cin: '`std::cin`: Standard input stream in C++.',
          include: '`#include`: Preprocessor directive to include header files.',
          define: '`#define`: Preprocessor directive for macro definition.',
        };

        const desc = quickDescriptions[word.word];
        const mdText = [
          `### 🔍 ข้อมูลสัญลักษณ์: \`${word.word}\``,
          desc ? desc : `ไม่พบข้อมูลนิยามด่วนสำหรับ \`${word.word}\``,
          `\n---`,
          `🤖 **AI Assistant**:`,
          `[💡 อธิบายคำสั่งนี้ด้วย AI](command:${explainCommandId}?${encodeURIComponent(JSON.stringify(word.word))})`
        ].join('\n');

        return {
          range: new monaco.Range(
            position.lineNumber,
            word.startColumn,
            position.lineNumber,
            word.endColumn
          ),
          contents: [
            { value: mdText, isTrusted: true }
          ]
        };
      }
    });

    hoverProviderRef.current = hoverDisposable;

    // ── AI Inline Complete (Ghost Text) ──────────────────────
    if (inlineCompleteEnabled) {
      registerInlineComplete(editor, monaco, user?.id || 'guest', (msg: string, ms: number) => {
        console.log(`[InlineComplete Status] ${msg} (${ms}ms)`);
      });
    }

    // ── Custom Format Action (Ctrl+Shift+F) ──────────────────
    editor.addAction({
      id:    'format-document-custom',
      label: 'จัดรูปแบบโค้ด',
      keybindings: [
        monaco.KeyMod.CtrlCmd |
        monaco.KeyMod.Shift   |
        monaco.KeyCode.KeyF
      ],
      run: async (ed: any) => {
        const code = ed.getValue();
        const lang = ed.getModel()?.getLanguageId() ?? 'text';
        toast('info', '🔄 กำลังจัดรูปแบบ...');
        const formatted = await formatCode(code, lang, fontSize);
        if (formatted !== code) {
          ed.setValue(formatted);
          toast('success', '✓ จัดรูปแบบแล้ว');
        } else {
          toast('info', 'โค้ดสวยงามอยู่แล้ว ✨');
        }
      },
    });

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
            minimap: { enabled: minimapEnabled },
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
            linkedEditing: true,
            glyphMargin: markers.length > 0,
            padding: { top: 8, bottom: 8 },
            fontFamily: `"${fontFamily}", Consolas, monospace`,
            fontLigatures: true,
          }}
          onChange={(val) => onChange(val ?? '')}
          onMount={handleEditorDidMount}
        />
      </Suspense>
    </div>
  );
}
