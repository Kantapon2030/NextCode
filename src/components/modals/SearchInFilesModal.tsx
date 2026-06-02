import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { Search, X } from 'lucide-react';
import type { VFSState } from '../../types';

interface SearchResult {
  filePath:  string;
  lineNum:   number;
  lineText:  string;
  matchStart:number;
  matchEnd:  number;
}

interface Props {
  onClose: () => void;
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase();
  let emoji = '📝';
  if (ext === 'html') emoji = '🌐';
  else if (ext === 'css') emoji = '🎨';
  else if (ext === 'js' || ext === 'jsx') emoji = '🟨';
  else if (ext === 'ts' || ext === 'tsx') emoji = '📘';
  else if (ext === 'py') emoji = '🐍';
  else if (ext === 'c' || ext === 'cpp') emoji = '⚙️';
  return <span className="text-sm">{emoji}</span>;
}

function groupBy<T, K extends string | number | symbol>(list: T[], getKey: (item: T) => K): Record<K, T[]> {
  return list.reduce((acc, item) => {
    const key = getKey(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

export const SearchInFilesModal: React.FC<Props> = ({ onClose }) => {
  const { vfs, openTab, setActiveTab } = useAppStore();
  const [query,   setQuery]   = useState('');
  const [useRegex,setUseRegex]= useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // search ทุกครั้งที่ query เปลี่ยน (debounce 300ms)
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => {
      setResults(searchAllFiles(vfs, query, useRegex));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, useRegex, vfs]);

  const handleResultClick = (r: SearchResult) => {
    openTab(r.filePath);
    setActiveTab(r.filePath);
    // jump ไปบรรทัดนั้น → ส่ง event ให้ Monaco
    window.dispatchEvent(new CustomEvent('goto-line', {
      detail: { path: r.filePath, line: r.lineNum }
    }));
    onClose();
  };

  // group by file
  const grouped = groupBy(results, r => r.filePath);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="search-modal bg-surface-900 border border-border text-sm flex flex-col w-[680px] max-w-[90vw] max-h-[70vh] rounded-2xl overflow-hidden shadow-2xl animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Input */}
        <div className="search-input-row flex items-center gap-2.5 px-4 py-3 border-b border-border bg-surface-950">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาในทุกไฟล์..."
            className="search-input flex-1 bg-transparent border-none text-sm text-white placeholder-zinc-600 outline-none"
          />
          <div className="flex items-center gap-4 shrink-0">
            <label className="search-toggle flex items-center gap-1 cursor-pointer select-none text-xs text-zinc-400 hover:text-white transition-colors">
              <input
                type="checkbox"
                checked={useRegex}
                onChange={e => setUseRegex(e.target.checked)}
                className="accent-primary-500"
              />
              <span title="Regular Expression" className="font-mono bg-surface-700 px-1 py-0.5 rounded border border-border/20">.*</span>
            </label>
            <span className="search-count text-xs text-zinc-500 font-mono">
              {results.length} ผลลัพธ์
            </span>
            <button onClick={onClose} className="p-1 hover:bg-surface-800 rounded transition-colors text-zinc-500 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="search-results overflow-y-auto flex-1 p-2 space-y-2">
          {Object.entries(grouped).map(([path, items]) => (
            <div key={path} className="search-file-group border border-border/40 rounded-xl overflow-hidden bg-surface-950/20">
              <div className="search-file-header flex items-center gap-2 px-3 py-2 bg-surface-800 border-b border-border/40 text-xs font-semibold text-zinc-300">
                <FileIcon name={path} />
                <span className="font-mono text-xs">{path}</span>
                <span className="search-file-count ml-auto bg-surface-700 text-zinc-400 text-[10px] px-1.5 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>
              <div className="divide-y divide-border/20">
                {items.slice(0, 50).map((r, i) => (
                  <button
                    key={i}
                    className="search-result-row flex items-center gap-3 px-3 py-2 w-full text-left bg-transparent border-none hover:bg-surface-800/40 cursor-pointer text-xs text-zinc-400 transition-colors"
                    onClick={() => handleResultClick(r)}
                  >
                    <span className="search-line-num font-mono text-[10px] text-zinc-600 min-w-[20px] text-right">
                      {r.lineNum}
                    </span>
                    <span className="search-line-text font-mono truncate text-zinc-300 flex-1">
                      {highlightMatch(
                        r.lineText, r.matchStart, r.matchEnd
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {results.length === 0 && query && (
            <div className="search-empty text-center py-8 text-xs text-zinc-600 font-medium">
              ไม่พบ "{query}" ในโปรเจกต์
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// search helper
function searchAllFiles(
  vfs: VFSState, query: string, useRegex: boolean
): SearchResult[] {
  const results: SearchResult[] = [];
  let regex: RegExp;
  try {
    regex = useRegex
      ? new RegExp(query, 'gi')
      : new RegExp(
          query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'gi'
        );
  } catch {
    return [];
  }

  for (const [path, node] of Object.entries(vfs.flatIndex)) {
    if (node.type !== 'file' || !node.content || typeof node.content !== 'string') continue;
    const lines = node.content.split('\n');
    lines.forEach((line, i) => {
      regex.lastIndex = 0;
      const m = regex.exec(line);
      if (m) {
        results.push({
          filePath:   path,
          lineNum:    i + 1,
          lineText:   line.trim().slice(0, 120),
          matchStart: m.index,
          matchEnd:   m.index + m[0].length,
        });
      }
    });
    if (results.length >= 500) break; // limit
  }
  return results;
}

// highlight match ใน line
function highlightMatch(
  text: string, start: number, end: number
): React.ReactNode {
  // make sure values are positive and valid
  const s = Math.max(0, start);
  const e = Math.min(text.length, end);
  return (
    <>
      {text.slice(0, s)}
      <mark className="search-highlight bg-yellow-500/20 text-yellow-300 rounded px-0.5">
        {text.slice(s, e)}
      </mark>
      {text.slice(e)}
    </>
  );
}
