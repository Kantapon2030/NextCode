import React from 'react';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '../../types/chatTypes';
import { CodeChangeBlock } from './CodeChangeBlock';
import { useAppStore } from '../../store/appStore';

interface Props {
  message: ChatMessage;
  onApplyChange: (msgId: string, filename: string, newContent: string) => void;
  onRejectChange: (msgId: string, filename: string) => void;
  getOldContent: (filename: string) => string;
}

/** Render markdown แบบ lightweight — ไม่ต้องติดตั้ง library ใหม่ */
function renderMarkdown(text: string): string {
  return text
    // code blocks ```...```
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `<pre class="code-block" data-lang="${lang}"><code>${escapeHtml(code.trim())}</code></pre>`
    )
    // inline code `...`
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // bold **...**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // italic *...*
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // newlines
    .replace(/\n/g, '<br />');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'เมื่อกี้';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} นาทีที่แล้ว`;
  return `${Math.floor(diff / 3_600_000)} ชั่วโมงที่แล้ว`;
}

export function ChatBubble({ message, onApplyChange, onRejectChange, getOldContent }: Props) {
  const { vfs } = useAppStore();
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-2.5 animate-fade-in ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isUser
            ? 'bg-primary-600/30 text-primary-400'
            : 'bg-surface-600 text-zinc-300'
        }`}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Bubble content */}
      <div className={`flex-1 space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`max-w-full px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-primary-600/20 border border-primary-600/30 text-zinc-200 rounded-tr-sm'
              : 'bg-surface-700 border border-border text-zinc-200 rounded-tl-sm'
          } ${message.status === 'error' ? 'border-red-500/40 bg-red-950/20' : ''}`}
        >
          {message.status === 'sending' ? (
            /* typing indicator */
            <span className="flex gap-1 items-center h-4">
              <span className="ai-dot" />
              <span className="ai-dot" />
              <span className="ai-dot" />
            </span>
          ) : (
            <div
              className="chat-markdown"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
          )}
        </div>

        {/* Attachments info */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {message.attachments.map((att) => (
              <span
                key={att.filename}
                className="text-xs px-2 py-0.5 bg-surface-700 text-zinc-400 rounded-full border border-border"
              >
                📎 {att.filename}
              </span>
            ))}
          </div>
        )}

        {/* Code change blocks */}
        {message.codeChanges && message.codeChanges.length > 0 && (
          <div className="w-full space-y-2">
            {message.codeChanges.map((change) => (
              <CodeChangeBlock
                key={change.filename}
                change={change}
                oldContent={getOldContent(change.filename)}
                onApply={() => onApplyChange(message.id, change.filename, change.newContent)}
                onReject={() => onRejectChange(message.id, change.filename)}
              />
            ))}
            {/* Apply All button */}
            {message.codeChanges.filter((c) => !c.applied).length > 1 && (
              <button
                onClick={() => {
                  message.codeChanges!
                    .filter((c) => !c.applied)
                    .forEach((c) => onApplyChange(message.id, c.filename, c.newContent));
                }}
                className="w-full py-1.5 text-xs bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 text-green-400 rounded-lg transition-colors font-medium"
              >
                ✓ ใช้ทั้งหมด ({message.codeChanges.filter((c) => !c.applied).length} ไฟล์)
              </button>
            )}
          </div>
        )}

        {/* Token + timestamp */}
        <div className="flex items-center gap-2 text-[10px] text-zinc-600">
          <span>{relativeTime(message.timestamp)}</span>
          {message.estimatedTokens && (
            <span>~{message.estimatedTokens.toLocaleString()} tokens</span>
          )}
          {message.status === 'error' && (
            <span className="text-red-500">❌ เกิดข้อผิดพลาด</span>
          )}
        </div>
      </div>
    </div>
  );
}
