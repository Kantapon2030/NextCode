import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { setSetting, getSetting } from '../../storage/db';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../../storage/cryptoHelpers';
import { testApiKey } from '../../services/geminiAI';
import { toast } from '../shared/Toast';
import {
  X, Moon, Sun, Key, Trash2, CheckCircle, XCircle, Loader2,
  Minus, Plus, User, Zap, ExternalLink, Download
} from 'lucide-react';

interface Props { onClose: () => void; }

export default function SettingsModal({ onClose }: Props) {
  const { user, theme, setTheme, fontSize, setFontSize, userMode, setUserMode } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [maskedKey, setMaskedKey] = useState('');
  const [newKey, setNewKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'valid' | 'rate_limited' | 'invalid' | null>(null);
  const [testErrorDetails, setTestErrorDetails] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    setIsStandalone(!!isStandaloneMode);

    const prompt = (window as any).deferredPrompt;
    if (prompt) {
      setInstallPrompt(prompt);
    }

    const handler = (e: Event) => {
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  async function handleInstallPWA() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      toast('success', 'เริ่มทำการติดตั้งแอปพลิเคชัน');
    }
    (window as any).deferredPrompt = null;
    setInstallPrompt(null);
  }

  useEffect(() => {
    async function load() {
      if (!user) return;
      const encrypted = await getSetting<{ iv: string; ciphertext: string } | null>(
        `gemini_key_${user.id}`, null
      );
      if (encrypted) {
        const plain = await decryptApiKey(encrypted.iv, encrypted.ciphertext, user.id);
        setApiKey(plain);
        setMaskedKey(maskApiKey(plain));
      }
    }
    load();
  }, [user]);

  async function handleSaveKey() {
    if (!newKey.trim() || !user) return;
    const encrypted = await encryptApiKey(newKey.trim(), user.id);
    await setSetting(`gemini_key_${user.id}`, encrypted);
    setApiKey(newKey.trim());
    setMaskedKey(maskApiKey(newKey.trim()));
    setNewKey('');
    setShowKeyInput(false);
    toast('success', 'อัปเดต API Key แล้ว');
  }

  async function handleDeleteKey() {
    if (!user) return;
    await setSetting(`gemini_key_${user.id}`, null);
    setApiKey('');
    setMaskedKey('');
    toast('info', 'ลบ API Key แล้ว');
  }

  async function handleTest() {
    const key = newKey || apiKey;
    if (!key) return;
    setTesting(true);
    setTestResult(null);
    setTestErrorDetails(null);
    const result = await testApiKey(key);
    setTestResult(result.status);
    if (result.errorDetails) {
      setTestErrorDetails(result.errorDetails);
    }
    setTesting(false);
  }

  async function handleTheme(t: 'dark' | 'light') {
    setTheme(t);
    await setSetting('theme', t);
  }

  async function handleFontSize(delta: number) {
    const next = Math.max(10, Math.min(20, fontSize + delta));
    setFontSize(next);
    await setSetting('font_size', next);
  }

  async function handleMode(m: 'beginner' | 'expert') {
    setUserMode(m);
    await setSetting('user_mode', m);
  }



  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-800 border border-border rounded-2xl w-full max-w-md shadow-surface-lg animate-slide-up">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-white">ตั้งค่า</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Theme */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">ธีม</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleTheme('dark')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  theme === 'dark' ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-border bg-surface-700 text-zinc-400'
                }`}
              >
                <Moon className="w-4 h-4" /> โหมดมืด
              </button>
              <button
                onClick={() => handleTheme('light')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  theme === 'light' ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-border bg-surface-700 text-zinc-400'
                }`}
              >
                <Sun className="w-4 h-4" /> โหมดสว่าง
              </button>
            </div>
          </section>

          {/* Font size */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">ขนาดตัวอักษร Editor</h3>
            <div className="flex items-center gap-4">
              <button onClick={() => handleFontSize(-1)} className="p-2 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors">
                <Minus className="w-4 h-4 text-zinc-400" />
              </button>
              <span className="text-white font-mono text-lg w-8 text-center">{fontSize}</span>
              <button onClick={() => handleFontSize(1)} className="p-2 bg-surface-700 hover:bg-surface-600 rounded-lg transition-colors">
                <Plus className="w-4 h-4 text-zinc-400" />
              </button>
              <span className="text-zinc-500 text-sm">px (10–20)</span>
            </div>
          </section>



          {/* Mode */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">โหมดผู้ใช้</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleMode('beginner')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  userMode === 'beginner' ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-border bg-surface-700 text-zinc-400'
                }`}
              >
                <User className="w-4 h-4" /> มือใหม่
              </button>
              <button
                onClick={() => handleMode('expert')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                  userMode === 'expert' ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-border bg-surface-700 text-zinc-400'
                }`}
              >
                <Zap className="w-4 h-4" /> ผู้เชี่ยวชาญ
              </button>
            </div>
          </section>

          {/* API Key */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">Gemini API Key</h3>
            {maskedKey && !showKeyInput ? (
              <>
                <div className="flex items-center gap-2 p-3 bg-surface-700 rounded-xl mb-3">
                  <Key className="w-4 h-4 text-green-400" />
                  <span className="text-white font-mono text-sm flex-1">{maskedKey}</span>
                  <span className="text-xs text-green-400">✓ ตั้งค่าแล้ว</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowKeyInput(true)}
                    className="flex-1 py-2 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-xl text-sm transition-colors"
                  >
                    อัปเดต Key
                  </button>
                  <button
                    onClick={handleDeleteKey}
                    className="p-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <>
                <a
                  href="https://aistudio.google.com"
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary-400 hover:text-primary-300 mb-3 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  รับ Key ฟรีที่ aistudio.google.com
                </a>
                <input
                  type="password"
                  value={newKey}
                  onChange={(e) => { setNewKey(e.target.value); setTestResult(null); }}
                  placeholder="AIza..."
                  className="w-full px-4 py-3 bg-surface-700 border border-border rounded-xl text-sm text-white placeholder-zinc-600 outline-none focus:border-primary-500 transition-colors font-mono mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleTest}
                    disabled={testing || (!newKey && !apiKey)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-surface-700 hover:bg-surface-600 text-zinc-300 rounded-xl text-sm transition-colors disabled:opacity-50"
                  >
                    {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    ทดสอบ
                    {testResult === 'valid' && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
                    {testResult === 'rate_limited' && <CheckCircle className="w-3.5 h-3.5 text-yellow-400" />}
                    {testResult === 'invalid' && <XCircle className="w-3.5 h-3.5 text-red-400" />}
                    {testResult === 'valid' && <span className="text-green-400 text-xs">ใช้งานได้</span>}
                    {testResult === 'rate_limited' && <span className="text-yellow-400 text-xs">Key OK (quota เต็ม)</span>}
                    {testResult === 'invalid' && <span className="text-red-400 text-xs">ไม่ถูกต้อง</span>}
                  </button>
                  <button
                    onClick={handleSaveKey}
                    disabled={!newKey.trim()}
                    className="flex-1 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    บันทึก Key
                  </button>
                  {showKeyInput && (
                    <button
                      onClick={() => { setShowKeyInput(false); setNewKey(''); }}
                      className="p-2 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-xl transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {testErrorDetails && testResult === 'invalid' && (
                  <div className="mt-2 text-xs text-red-400 bg-red-900/10 border border-red-900/30 p-2.5 rounded-lg flex items-start gap-1.5 whitespace-pre-wrap">
                    <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                    <span>สาเหตุ: {testErrorDetails}</span>
                  </div>
                )}

                {testErrorDetails && testResult === 'rate_limited' && (
                  <div className="mt-2 text-xs text-yellow-400 bg-yellow-900/10 border border-yellow-900/30 p-2.5 rounded-lg flex items-start gap-1.5 whitespace-pre-wrap">
                    <CheckCircle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                    <span>ข้อมูลเพิ่มเติม: {testErrorDetails}</span>
                  </div>
                )}
              </>
            )}
          </section>

          {/* PWA Installation */}
          <section className="pt-2">
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">การติดตั้งแอปพลิเคชัน</h3>
            {isStandalone ? (
              <div className="flex items-center gap-2.5 p-3.5 bg-primary-500/10 border border-primary-500/20 rounded-xl text-green-400 text-xs">
                <CheckCircle className="w-4 h-4 shrink-0 text-green-400" />
                <span className="font-medium">ติดตั้งเป็นแอปพลิเคชันแล้วและกำลังรันแบบ Standalone</span>
              </div>
            ) : installPrompt ? (
              <button
                onClick={handleInstallPWA}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition-all duration-200"
              >
                <Download className="w-4 h-4" /> ติดตั้ง Nextcode IDE ลงเครื่อง
              </button>
            ) : (
              <div className="p-3.5 bg-surface-700/50 border border-border/50 rounded-xl space-y-2 text-[11px] text-zinc-400 leading-relaxed">
                <p className="font-semibold text-zinc-300">วิธีติดตั้งเป็นแอปพลิเคชัน Shortcut:</p>
                <ul className="list-disc list-inside space-y-1.5 pl-0.5">
                  <li><strong>Chrome / Edge (คอมพิวเตอร์):</strong> คลิกไอคอนติดตั้ง <span className="text-zinc-200 font-semibold">⊕ (Install)</span> ที่ด้านขวาสุดของแถบที่อยู่ URL</li>
                  <li><strong>iOS (Safari):</strong> กดปุ่ม <span className="text-zinc-200">แชร์ (Share)</span> และเลือก <span className="text-zinc-200 font-semibold">เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)</span></li>
                  <li><strong>Android (Chrome):</strong> กดเมนูสามจุด <span className="text-zinc-200">⋮</span> และเลือก <span className="text-zinc-200 font-semibold">ติดตั้งแอป (Install App)</span></li>
                </ul>
              </div>
            )}
          </section>

          {/* Credits */}
          <div className="mt-6 pt-4 border-t border-border/40 flex flex-col items-center gap-1 opacity-60 text-center shrink-0">
            <p className="text-xs text-zinc-400 font-semibold">Nextcode IDE</p>
            <p className="text-[10px] text-zinc-500">
              Designed by <span className="text-zinc-400 font-semibold">Kantapon</span> · Powered by Gemini 2.0 Flash
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
