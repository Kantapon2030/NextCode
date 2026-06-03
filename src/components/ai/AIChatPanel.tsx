import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../store/appStore';
import { callGeminiChat, BUILTIN_KEY } from '../../services/geminiAI';
import { getSetting } from '../../storage/db';
import { decryptApiKey } from '../../storage/cryptoHelpers';
import { toast } from '../shared/Toast';
import { db } from '../../storage/db';
import {
  Bot, X, RefreshCw, Send, Paperclip, MessageSquare, Trash2, Key, AlertCircle, Sparkles
} from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import { buildSmartContext, buildGeminiHistory } from '../../services/contextEngine';
import { readFileAttachment, attachmentToTextBlock, attachmentToInlinePart } from '../../services/fileReaders';
import type { ChatMessage, FileAttachment } from '../../types/chatTypes';

interface Props {
  onApplyChange: (filename: string, content: string) => void;
}

export function AIChatPanel({ onApplyChange }: Props) {
  const {
    chatMessages,
    chatLoading,
    chatPanelOpen,
    projectSnapshot,
    setChatLoading,
    setChatPanelOpen,
    addChatMessage,
    updateChatMessage,
    clearChat,
    setProjectSnapshot,
    vfs,
    currentProject,
    user,
    activeTab,
    theme,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [usingBuiltinKey, setUsingBuiltinKey] = useState(false);
  const [panelWidth, setPanelWidth] = useState(380);
  const isDragging = useRef(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  // Load custom API key status
  useEffect(() => {
    async function checkKey() {
      const userId = user?.id || 'guest';
      const enc = await getSetting<{ iv: string; ciphertext: string } | null>(
        `gemini_key_${userId}`,
        null
      );
      setUsingBuiltinKey(!enc);
    }
    checkKey();
  }, [user]);

  // Listen for hover explain symbol requests
  useEffect(() => {
    const handleExplainSymbol = (e: Event) => {
      const symbol = (e as CustomEvent<{ symbol: string }>).detail?.symbol;
      if (symbol) {
        setInput(`ช่วยอธิบายคำสั่ง \`${symbol}\` ในการเขียนโปรแกรมอย่างละเอียด พร้อมยกตัวอย่างวิธีใช้ที่ถูกต้องให้หน่อย`);
        setChatPanelOpen(true);
      }
    };
    window.addEventListener('nextcode:explainSymbol', handleExplainSymbol);
    return () => window.removeEventListener('nextcode:explainSymbol', handleExplainSymbol);
  }, [setChatPanelOpen]);

  // Resolve API Key
  async function resolveApiKey(): Promise<string> {
    try {
      const userId = user?.id || 'guest';
      const enc = await getSetting<{ iv: string; ciphertext: string } | null>(
        `gemini_key_${userId}`, null
      );
      if (enc) {
        const plain = await decryptApiKey(enc.iv, enc.ciphertext, userId);
        const trimmed = plain?.trim();
        if (trimmed) {
          setUsingBuiltinKey(false);
          return trimmed;
        }
      }
    } catch (err) {
      console.error('Failed to resolve custom API key:', err);
    }
    setUsingBuiltinKey(true);
    return BUILTIN_KEY;
  }

  // Handle resizing
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging.current) return;
    const newWidth = window.innerWidth - e.clientX;
    setPanelWidth(Math.max(280, Math.min(600, newWidth)));
  }

  function handleMouseUp() {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }

  // Handle file selection
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setAttaching(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (attachments.some((a) => a.filename === file.name)) {
          toast('warning', `ไฟล์ ${file.name} ถูกแนบแล้ว`);
          continue;
        }

        const att = await readFileAttachment(file);
        if (att) {
          setAttachments((prev) => [...prev, att]);
        } else {
          toast('error', `ไม่รองรับไฟล์ประเภทนี้: ${file.name}`);
        }
      }
    } catch (err: any) {
      toast('error', `เกิดข้อผิดพลาดในการอ่านไฟล์: ${err.message || err}`);
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // Remove attachment
  function removeAttachment(filename: string) {
    setAttachments((prev) => prev.filter((a) => a.filename !== filename));
  }

  // Calculate current context stats for rendering
  const smartContext = buildSmartContext({
    vfs,
    activeTab,
    userMessage: input,
    projectSnapshot,
    projectName: currentProject?.name || 'Project',
  });

  const estimatedPromptTokens = smartContext.estimatedTokens;

  // Send message handler
  async function handleSend() {
    if ((!input.trim() && attachments.length === 0) || chatLoading) return;

    const userText = input.trim();
    setInput('');
    const currentAttachments = [...attachments];
    setAttachments([]);

    const userMsgId = Math.random().toString(36).substring(7);
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: userText,
      timestamp: Date.now(),
      attachments: currentAttachments,
      status: 'done',
    };

    addChatMessage(userMsg);
    setChatLoading(true);

    const assistantMsgId = Math.random().toString(36).substring(7);
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'sending',
    };
    addChatMessage(assistantMsg);

    try {
      const apiKey = await resolveApiKey();

      // ─── 1. Build prompt parts incorporating attachments ───
      let promptPartsText = userText;
      if (currentAttachments.length > 0) {
        const attBlocks = currentAttachments.map(attachmentToTextBlock).join('\n\n');
        promptPartsText = `${attBlocks}\n\nคำถามของผู้ใช้:\n${userText}`;
      }

      // ─── 2. Build history ───
      const historyTurns = buildGeminiHistory(chatMessages, 6);

      // ─── 3. Construct intelligent context ───
      const context = buildSmartContext({
        vfs,
        activeTab,
        userMessage: userText,
        projectSnapshot,
        projectName: currentProject?.name || 'Project',
      });

      // ─── 4. Make Gemini Request ───
      const response = await callGeminiChat({
        apiKey,
        systemInstruction: context.systemInstruction,
        history: historyTurns,
        userMessage: promptPartsText,
      });

      // ─── 5. Update snapshot if null ───
      if (!projectSnapshot) {
        setProjectSnapshot({
          summary: context.systemInstruction,
          generatedAt: Date.now(),
          fileList: Object.keys(vfs.files),
          filesChecksum: '',
        });
      }

      updateChatMessage(assistantMsgId, {
        content: response.text,
        codeChanges: response.codeChanges,
        status: 'done',
        estimatedTokens: response.text.length / 4 + context.estimatedTokens,
      });

    } catch (err: any) {
      console.error(err);
      updateChatMessage(assistantMsgId, {
        content: `เกิดข้อผิดพลาด: ${err.message || 'ไม่สามารถติดต่อ AI ได้'}`,
        status: 'error',
      });
      toast('error', `AI Error: ${err.message || err}`);
    } finally {
      setChatLoading(false);
    }
  }

  // Apply code changes
  function handleApplyCodeChange(msgId: string, filename: string, newContent: string) {
    onApplyChange(filename, newContent);

    // Update message state to show applied badge
    const message = chatMessages.find((m) => m.id === msgId);
    if (message && message.codeChanges) {
      const updatedChanges = message.codeChanges.map((c) =>
        c.filename === filename ? { ...c, applied: true } : c
      );
      updateChatMessage(msgId, { codeChanges: updatedChanges });
    }
    toast('success', `ปรับใช้โค้ดกับ ${filename} เรียบร้อย`);
  }

  // Reject code changes
  function handleRejectCodeChange(msgId: string, filename: string) {
    const message = chatMessages.find((m) => m.id === msgId);
    if (message && message.codeChanges) {
      const updatedChanges = message.codeChanges.filter((c) => c.filename !== filename);
      updateChatMessage(msgId, { codeChanges: updatedChanges });
    }
  }

  function getOldFileContent(filename: string): string {
    return vfs.files[filename]?.content ?? '';
  }

  if (!chatPanelOpen) return null;

  const isDark = theme === 'dark';
  const panelBg = isDark ? 'bg-surface-900 border-border' : 'bg-zinc-50 border-zinc-200';
  const headerBg = isDark ? 'bg-surface-800 border-border' : 'bg-white border-zinc-200';
  const inputBg = isDark ? 'bg-surface-800 border-border' : 'bg-white border-zinc-200';

  return (
    <div
      style={{ width: panelWidth }}
      className={`flex h-full shrink-0 border-l relative ${panelBg} transition-all z-20`}
    >
      {/* Resizer Handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-500 bg-transparent transition-colors z-30"
        onMouseDown={handleMouseDown}
      />

      {/* Main Panel Content */}
      <div className="flex flex-col w-full h-full overflow-hidden">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b shrink-0 ${headerBg}`}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-primary-600/10 flex items-center justify-center border border-primary-500/20">
              <Bot className="w-4 h-4 text-primary-400" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-white">AI ผู้ช่วยอัจฉริยะ</h3>
              <p className="text-[10px] text-zinc-500 flex items-center gap-1">
                Gemini Chat
                {usingBuiltinKey ? (
                  <span className="flex items-center gap-0.5 text-zinc-600">
                    <Key className="w-2.5 h-2.5" /> shared
                  </span>
                ) : (
                  <span className="text-green-500 font-medium">Custom Key</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={clearChat}
              className="p-1.5 hover:bg-surface-700 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
              title="เริ่มแชทใหม่ (ล้าง token)"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setChatPanelOpen(false)}
              className="p-1.5 hover:bg-surface-700 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Message Log */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-primary-600/10 border border-primary-500/20 flex items-center justify-center animate-pulse-dot">
                <Sparkles className="w-6 h-6 text-primary-400" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-white">แชทกับ AI</h4>
                <p className="text-xs text-zinc-500 mt-1 max-w-[240px]">
                  ถามเรื่องโค้ด, ให้ช่วยเขียนฟังก์ชัน, หรือลากรูปภาพและ PDF เข้ามาเพื่อให้ AI ช่วยวิเคราะห์
                </p>
              </div>
            </div>
          ) : (
            chatMessages.map((msg) => (
              <ChatBubble
                key={msg.id}
                message={msg}
                onApplyChange={handleApplyCodeChange}
                onRejectChange={handleRejectCodeChange}
                getOldContent={getOldFileContent}
              />
            ))
          )}
          {chatLoading && chatMessages[chatMessages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-surface-600 flex items-center justify-center mt-0.5">
                <Bot className="w-3.5 h-3.5 text-zinc-300" />
              </div>
              <div className="bg-surface-700 border border-border px-3 py-2.5 rounded-2xl rounded-tl-sm text-sm">
                <span className="flex gap-1 items-center h-4">
                  <span className="ai-dot" />
                  <span className="ai-dot" />
                  <span className="ai-dot" />
                </span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="p-3 border-t border-border bg-surface-900/60 space-y-2 shrink-0">
          {/* Attachments view */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pb-1">
              {attachments.map((att) => (
                <div
                  key={att.filename}
                  className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-surface-700 border border-border text-zinc-300 rounded-full"
                >
                  <span className="truncate max-w-[120px]">{att.filename}</span>
                  <button
                    onClick={() => removeAttachment(att.filename)}
                    className="text-zinc-500 hover:text-zinc-300 p-0.5 ml-0.5 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Context and token info bar */}
          <div className="flex items-center justify-between text-[10px] text-zinc-500 px-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-zinc-600 font-medium">บริบท:</span>
              {smartContext.includedFiles.map((file) => (
                <span
                  key={file}
                  className={`px-1.5 py-0.5 rounded font-mono ${
                    file === activeTab ? 'bg-primary-950/40 text-primary-400 border border-primary-950' : 'bg-surface-800 text-zinc-400'
                  }`}
                >
                  {file.split('/').pop()}
                </span>
              ))}
              {smartContext.wasTruncated && (
                <span className="text-yellow-600 flex items-center gap-0.5" title="ข้อมูลบางไฟล์ถูกตัดเพื่อให้ไม่เกินขีดจำกัด">
                  <AlertCircle className="w-2.5 h-2.5" /> ตัดเนื้อหาบางส่วน
                </span>
              )}
            </div>
            <div className="font-medium text-zinc-400 select-none shrink-0 ml-2">
              ~{estimatedPromptTokens.toLocaleString()} tokens
            </div>
          </div>

          {/* Input Box */}
          <div className={`flex gap-1.5 items-end p-1.5 rounded-xl border ${inputBg}`}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              multiple
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={attaching || chatLoading}
              className="p-1.5 hover:bg-surface-700 disabled:opacity-50 text-zinc-500 hover:text-zinc-300 rounded-lg transition-colors"
              title="แนบรูปภาพ/PDF/ข้อความ"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={Math.min(4, Math.max(1, input.split('\n').length))}
              placeholder="ถาม AI ได้เลย... (Enter เพื่อส่ง)"
              className="flex-1 bg-transparent border-0 outline-none text-zinc-200 placeholder-zinc-500 text-xs py-1.5 resize-none leading-relaxed"
            />

            <button
              onClick={handleSend}
              disabled={(!input.trim() && attachments.length === 0) || chatLoading}
              className="p-1.5 bg-primary-600 hover:bg-primary-500 disabled:bg-surface-800 disabled:text-zinc-700 text-white rounded-lg transition-colors shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
