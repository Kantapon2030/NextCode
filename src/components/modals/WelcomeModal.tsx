import React, { useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { setSetting } from '../../storage/db';
import { encryptApiKey } from '../../storage/cryptoHelpers';
import { testApiKey } from '../../services/geminiAI';
import { toast } from '../shared/Toast';
import { Code2, Zap, User, ArrowRight, Key, ExternalLink, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function WelcomeModal({ onClose }: Props) {
  const { user, setUserMode, userMode } = useAppStore();
  const [step, setStep] = useState(1);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);

  async function handleSave() {
    await setSetting('user_mode', userMode);
    if (apiKey.trim() && user) {
      try {
        const encrypted = await encryptApiKey(apiKey.trim(), user.id);
        await setSetting(`gemini_key_${user.id}`, encrypted);
        toast('success', 'บันทึก API Key แล้ว');
      } catch {
        toast('error', 'ไม่สามารถบันทึก API Key ได้');
      }
    }
    onClose();
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    const ok = await testApiKey(apiKey.trim());
    setTestResult(ok ? 'ok' : 'fail');
    setTesting(false);
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-800 border border-border rounded-2xl p-8 w-full max-w-md shadow-surface-lg animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-purple-600 rounded-xl flex items-center justify-center">
            <Code2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              {step === 1 ? 'ยินดีต้อนรับ! 👋' : 'ตั้งค่า AI Assistant'}
            </h2>
            <p className="text-xs text-zinc-500">ขั้นตอน {step}/2</p>
          </div>
        </div>

        {/* Step indicators */}
        <div className="flex gap-2 mb-6">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? 'bg-primary-500' : 'bg-surface-700'
              }`}
            />
          ))}
        </div>

        {step === 1 ? (
          <>
            <p className="text-zinc-400 text-sm mb-6">คุณเขียนโค้ดมานานแค่ไหน?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setUserMode('beginner')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  userMode === 'beginner'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border bg-surface-700 hover:border-zinc-500'
                }`}
              >
                <User className="w-6 h-6 text-blue-400" />
                <span className="text-sm font-medium text-white">มือใหม่</span>
                <span className="text-xs text-zinc-500 text-center">เพิ่งเริ่มเขียนโค้ด</span>
              </button>
              <button
                onClick={() => setUserMode('expert')}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  userMode === 'expert'
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border bg-surface-700 hover:border-zinc-500'
                }`}
              >
                <Zap className="w-6 h-6 text-yellow-400" />
                <span className="text-sm font-medium text-white">ผู้เชี่ยวชาญ</span>
                <span className="text-xs text-zinc-500 text-center">เขียนโค้ดเป็นประจำ</span>
              </button>
            </div>
            <button
              onClick={() => setStep(2)}
              className="w-full mt-6 flex items-center justify-center gap-2 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-medium transition-colors"
            >
              ถัดไป <ArrowRight className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            {/* Built-in key notice */}
            <div className="bg-green-900/20 border border-green-700/30 rounded-xl p-3 mb-4 text-sm text-green-400 flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">AI พร้อมใช้งานแล้ว!</p>
                <p className="text-xs text-green-600 mt-1">ระบบมี built-in key ไว้ให้แล้ว คุณสามารถใส่ key ของตัวเองเพื่อเพิ่ม quota ได้ (ไม่บังคับ)</p>
              </div>
            </div>

            <a
              href="https://aistudio.google.com"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-primary-400 hover:text-primary-300 text-sm mb-4 transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              รับ API Key ฟรีของตัวเองที่ → aistudio.google.com
            </a>

            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder="AIza... (ไม่บังคับ)"
                className="w-full pl-10 pr-4 py-3 bg-surface-700 border border-border rounded-xl text-sm text-white placeholder-zinc-600 outline-none focus:border-primary-500 transition-colors font-mono"
              />
            </div>

            {apiKey && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="mt-2 flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                ทดสอบ Key
                {testResult === 'ok' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                {testResult === 'fail' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                {testResult === 'ok' && <span className="text-green-400">ใช้งานได้!</span>}
                {testResult === 'fail' && <span className="text-red-400">Key ไม่ถูกต้อง</span>}
              </button>
            )}

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={onClose}
                className="py-3 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-xl text-sm font-medium transition-colors"
              >
                ข้ามไปก่อน
              </button>
              <button
                onClick={handleSave}
                className="py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                {apiKey ? 'บันทึกและเริ่มใช้งาน' : 'เริ่มใช้งานเลย!'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
