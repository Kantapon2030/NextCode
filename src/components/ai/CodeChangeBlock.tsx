import React, { useState } from 'react';
import { diffLines } from 'diff';
import { CheckCircle, Copy, ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import type { CodeChange } from '../../types/chatTypes';
import { toast } from '../shared/Toast';

interface Props {
  change: CodeChange;
  oldContent?: string;
  onApply: () => void;
  onReject: () => void;
}

export function CodeChangeBlock({ change, oldContent = '', onApply, onReject }: Props) {
  const [showDiff, setShowDiff] = useState(true);
  const diffs = diffLines(oldContent, change.newContent);

  function handleCopy() {
    navigator.clipboard.writeText(change.newContent);
    toast('success', 'คัดลอกแล้ว');
  }

  const ext = change.filename.split('.').pop()?.toLowerCase() ?? '';
  const addedLines = diffs.filter((d) => d.added).reduce((sum, d) => sum + (d.count ?? 0), 0);
  const removedLines = diffs.filter((d) => d.removed).reduce((sum, d) => sum + (d.count ?? 0), 0);

  return (
    <div
      className={`rounded-xl overflow-hidden border transition-all ${
        change.applied
          ? 'border-green-600/40 bg-green-950/20'
          : 'border-border bg-surface-800'
      }`}
    >
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-700/60 border-b border-border">
        <FileCode className="w-3.5 h-3.5 text-primary-400 shrink-0" />
        <span className="text-xs font-mono text-zinc-300 flex-1 truncate">{change.filename}</span>

        {!change.applied && (
          <div className="flex items-center gap-1 text-xs">
            {addedLines > 0 && (
              <span className="text-green-400">+{addedLines}</span>
            )}
            {removedLines > 0 && (
              <span className="text-red-400">−{removedLines}</span>
            )}
          </div>
        )}

        {change.applied ? (
          <span className="flex items-center gap-1 text-xs text-green-400 font-medium">
            <CheckCircle className="w-3 h-3" /> Applied
          </span>
        ) : (
          <button
            onClick={() => setShowDiff(!showDiff)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-0.5"
          >
            {showDiff ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Diff view */}
      {showDiff && !change.applied && (
        <div className="max-h-52 overflow-y-auto font-mono text-xs">
          {diffs.map((part, i) => (
            <div
              key={i}
              className={`px-3 py-px whitespace-pre-wrap leading-5 ${
                part.added
                  ? 'bg-green-950/40 text-green-300'
                  : part.removed
                  ? 'bg-red-950/40 text-red-400 line-through opacity-70'
                  : 'text-zinc-500'
              }`}
            >
              {part.added ? '+ ' : part.removed ? '− ' : '  '}
              {part.value}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {!change.applied && (
        <div className="flex gap-1.5 p-2 bg-surface-900/50">
          <button
            onClick={onApply}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <CheckCircle className="w-3.5 h-3.5" /> ใช้โค้ดนี้
          </button>
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-lg text-xs transition-colors"
            title="คัดลอก"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onReject}
            className="px-3 py-1.5 bg-surface-700 hover:bg-surface-600 text-zinc-500 rounded-lg text-xs transition-colors"
            title="ยกเลิก"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
