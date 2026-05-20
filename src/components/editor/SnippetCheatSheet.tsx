import React, { useState, useEffect, useRef } from 'react';
import { BUILTIN_SNIPPETS, Snippet, insertSnippetAtCursor } from '../../utils/snippetShortcuts';
import { db } from '../../storage/db';
import { useAppStore } from '../../store/appStore';
import { Keyboard, Plus, X, Search, ChevronDown, Trash2, Zap } from 'lucide-react';
import { toast } from '../shared/Toast';

// ── Custom snippet type stored in IndexedDB ──────────────────
export interface CustomSnippet extends Snippet {
  id?: number;
  createdAt: number;
}

// Languages shown in the tab bar
const LANG_TABS = [
  { key: 'html',       label: 'HTML',    color: 'text-orange-400' },
  { key: 'css',        label: 'CSS',     color: 'text-blue-400'   },
  { key: 'javascript', label: 'JS',      color: 'text-yellow-400' },
  { key: 'python',     label: 'Python',  color: 'text-green-400'  },
  { key: 'c',          label: 'C',       color: 'text-zinc-300'   },
  { key: 'cpp',        label: 'C++',     color: 'text-cyan-400'   },
] as const;

type LangKey = (typeof LANG_TABS)[number]['key'];

interface Props {
  onClose: () => void;
}

export function SnippetCheatSheet({ onClose }: Props) {
  const { theme, activeLanguage } = useAppStore();
  const [activeLang, setActiveLang] = useState<LangKey>(() => {
    // default to current editor language
    const matched = LANG_TABS.find((t) => activeLanguage.startsWith(t.key));
    return matched?.key ?? 'html';
  });
  const [search, setSearch] = useState('');
  const [customSnippets, setCustomSnippets] = useState<CustomSnippet[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSnippet, setNewSnippet] = useState<Omit<CustomSnippet, 'id' | 'createdAt'>>({
    trigger: '',
    label: '',
    description: '',
    body: '',
    language: ['html'],
  });

  // Load custom snippets from IndexedDB
  useEffect(() => {
    loadCustomSnippets();
  }, []);

  async function loadCustomSnippets() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all = await (db as any).custom_snippets?.toArray?.() ?? [];
      setCustomSnippets(all);
    } catch {
      setCustomSnippets([]);
    }
  }

  async function handleSaveCustom() {
    if (!newSnippet.trigger.trim() || !newSnippet.body.trim()) {
      toast('error', 'กรุณากรอก Trigger และ Body');
      return;
    }
    try {
      const record: CustomSnippet = {
        ...newSnippet,
        trigger: newSnippet.trigger.trim(),
        label: newSnippet.label || newSnippet.trigger,
        createdAt: Date.now(),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).custom_snippets?.add?.(record);
      toast('success', `เพิ่ม snippet "${record.label}" แล้ว`);
      setShowAddForm(false);
      setNewSnippet({ trigger: '', label: '', description: '', body: '', language: ['html'] });
      loadCustomSnippets();
    } catch {
      toast('error', 'บันทึก snippet ไม่สำเร็จ');
    }
  }

  async function handleDeleteCustom(id: number) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).custom_snippets?.delete?.(id);
      loadCustomSnippets();
      toast('info', 'ลบ snippet แล้ว');
    } catch { /* ignore */ }
  }

  function handleInsert(body: string) {
    // Dispatch custom event — MonacoWrapper listens for this
    window.dispatchEvent(new CustomEvent('nextcode:insertSnippet', { detail: { body } }));
    toast('success', '✓ แทรกโค้ดแล้ว');
    onClose();
  }

  // Filter builtin snippets for current lang tab
  const langTargets = activeLang === 'javascript'
    ? ['javascript', 'typescript']
    : [activeLang];

  const builtinForLang = BUILTIN_SNIPPETS.filter((s) =>
    s.language.some((l) => langTargets.includes(l))
  );

  const customForLang = customSnippets.filter((s) =>
    s.language.some((l) => langTargets.includes(l) || l === 'all')
  );

  const allSnippets = [...builtinForLang, ...customForLang];
  const filtered = search.trim()
    ? allSnippets.filter((s) =>
        s.trigger.includes(search) ||
        s.label.toLowerCase().includes(search.toLowerCase()) ||
        s.description.toLowerCase().includes(search.toLowerCase())
      )
    : allSnippets;

  const bg       = theme === 'dark' ? 'bg-surface-900 border-border' : 'bg-zinc-50 border-zinc-200';
  const panelBg  = theme === 'dark' ? 'bg-surface-800' : 'bg-white';
  const rowHover = theme === 'dark' ? 'hover:bg-surface-700' : 'hover:bg-zinc-100';
  const inputBg  = theme === 'dark' ? 'bg-surface-700 border-border text-white' : 'bg-white border-zinc-300 text-zinc-900';

  return (
    <div className={`flex flex-col h-full border-r ${bg} text-sm overflow-hidden`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2.5 border-b border-border ${panelBg} shrink-0`}>
        <Keyboard className="w-4 h-4 text-primary-400" />
        <span className="text-xs font-semibold text-white flex-1">Snippet Shortcuts</span>
        <button
          onClick={() => setShowAddForm((x) => !x)}
          className="p-1 hover:bg-surface-600 rounded text-zinc-400 hover:text-green-400 transition-colors"
          title="เพิ่ม snippet ของฉัน"
        >
          <Plus className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-1 hover:bg-surface-600 rounded text-zinc-500 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search */}
      <div className="px-2 py-1.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-600" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา snippet..."
            className={`w-full pl-7 pr-2 py-1 rounded-lg text-xs border outline-none focus:border-primary-500 transition-colors ${inputBg}`}
          />
        </div>
      </div>

      {/* Language tabs */}
      <div className="flex gap-px px-2 shrink-0 overflow-x-auto scrollbar-hide">
        {LANG_TABS.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => setActiveLang(key)}
            className={`px-2 py-1 text-xs font-mono rounded-t transition-colors whitespace-nowrap ${
              activeLang === key
                ? `${color} border-b-2 border-primary-500 bg-surface-800`
                : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add Custom Snippet Form */}
      {showAddForm && (
        <div className={`p-3 border-t border-b border-border space-y-2 shrink-0 ${panelBg}`}>
          <p className="text-xs font-medium text-zinc-400">เพิ่ม Snippet ของฉัน</p>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              value={newSnippet.trigger}
              onChange={(e) => setNewSnippet((s) => ({ ...s, trigger: e.target.value }))}
              placeholder="!trigger"
              className={`px-2 py-1 rounded text-xs border outline-none focus:border-primary-500 font-mono ${inputBg}`}
            />
            <input
              value={newSnippet.label}
              onChange={(e) => setNewSnippet((s) => ({ ...s, label: e.target.value }))}
              placeholder="ชื่อ snippet"
              className={`px-2 py-1 rounded text-xs border outline-none focus:border-primary-500 ${inputBg}`}
            />
          </div>
          {/* Language selector */}
          <select
            value={newSnippet.language[0]}
            onChange={(e) => setNewSnippet((s) => ({ ...s, language: [e.target.value] }))}
            className={`w-full px-2 py-1 rounded text-xs border outline-none focus:border-primary-500 ${inputBg}`}
          >
            <option value="html">HTML</option>
            <option value="css">CSS</option>
            <option value="javascript">JavaScript</option>
            <option value="python">Python</option>
            <option value="c">C</option>
            <option value="cpp">C++</option>
            <option value="all">ทุกภาษา</option>
          </select>
          <textarea
            value={newSnippet.body}
            onChange={(e) => setNewSnippet((s) => ({ ...s, body: e.target.value }))}
            placeholder={`โค้ด template...\nใช้ \${1:placeholder} สำหรับ tab stops`}
            rows={4}
            className={`w-full px-2 py-1.5 rounded text-xs border outline-none focus:border-primary-500 font-mono resize-none ${inputBg}`}
          />
          <div className="flex gap-1">
            <button
              onClick={handleSaveCustom}
              className="flex-1 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded text-xs font-medium transition-colors"
            >
              บันทึก
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded text-xs transition-colors"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* Snippet list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 text-zinc-700 text-xs">
            <Keyboard className="w-6 h-6 mb-1 opacity-30" />
            ไม่พบ snippet
          </div>
        ) : (
          <div className="p-1 space-y-0.5">
            {filtered.map((s, i) => {
              const isCustom = 'createdAt' in s;
              return (
                <div
                  key={`${s.trigger}-${i}`}
                  className={`group flex items-start gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${rowHover}`}
                  onClick={() => handleInsert(s.body)}
                  title={`คลิกเพื่อแทรก: ${s.label}`}
                >
                  {/* Trigger badge */}
                  <span className="shrink-0 font-mono text-[10px] bg-primary-900/40 text-primary-300 border border-primary-700/30 rounded px-1.5 py-0.5 mt-0.5 min-w-[2.5rem] text-center">
                    {s.trigger || '!'}
                  </span>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-white truncate font-medium">{s.label}</span>
                      {isCustom && (
                        <span className="text-[9px] bg-yellow-900/30 text-yellow-500 border border-yellow-700/20 rounded px-1">
                          custom
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-zinc-600 truncate">{s.description}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Zap className="w-3 h-3 text-primary-400" />
                    {isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCustom((s as CustomSnippet).id!);
                        }}
                        className="text-red-500 hover:text-red-400 transition-colors"
                        title="ลบ"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-border shrink-0">
        <p className="text-[10px] text-zinc-700 text-center">
          คลิกเพื่อแทรก · พิมพ์ <span className="font-mono text-zinc-500">!...</span> แล้วกด Tab
        </p>
      </div>
    </div>
  );
}
