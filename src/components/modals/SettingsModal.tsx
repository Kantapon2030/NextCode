import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { setSetting } from '../../storage/db';
import { toast } from '../shared/Toast';
import {
  X, Moon, Sun, CheckCircle,
  Minus, Plus, User, Zap, Download
} from 'lucide-react';

interface Props { onClose: () => void; }

export default function SettingsModal({ onClose }: Props) {
  const { theme, setTheme, fontSize, setFontSize, userMode, setUserMode, fontFamily, setFontFamily } = useAppStore();
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

  async function handleTheme(t: 'dark' | 'light' | 'high-contrast') {
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

  async function handleFontFamily(font: string) {
    setFontFamily(font);
    await setSetting('font_family', font);
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
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleTheme('dark')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                  theme === 'dark' ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-border bg-surface-700 text-zinc-400'
                }`}
              >
                <Moon className="w-3.5 h-3.5" /> มืด
              </button>
              <button
                onClick={() => handleTheme('light')}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                  theme === 'light' ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-border bg-surface-700 text-zinc-400'
                }`}
              >
                <Sun className="w-3.5 h-3.5" /> สว่าง
              </button>
              <button
                onClick={() => handleTheme('high-contrast')}
                className={`flex items-center justify-center gap-1 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                  theme === 'high-contrast' ? 'border-yellow-500 bg-yellow-550/10 text-yellow-400' : 'border-border bg-surface-700 text-zinc-400'
                }`}
                title="ธีมสีคอนทราสต์สูง (High Contrast)"
              >
                <Sun className="w-3.5 h-3.5 text-yellow-500" /> คอนทราสต์สูง
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

          {/* Font Family */}
          <section>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">แบบอักษร Editor</h3>
            <select
              value={fontFamily}
              onChange={(e) => handleFontFamily(e.target.value)}
              className="w-full px-3 py-2 bg-surface-700 border border-border rounded-xl text-sm text-white outline-none focus:border-primary-500 transition-colors"
            >
              {[
                'JetBrains Mono',
                'Fira Code',
                'Source Code Pro',
                'Inconsolata',
                'Roboto Mono',
                'Share Tech Mono',
                'VT323'
              ].map((f) => (
                <option key={f} value={f} style={{ fontFamily: `"${f}", monospace` }}>
                  {f}
                </option>
              ))}
            </select>
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
              Designed by <span className="text-zinc-400 font-semibold">Kantapon</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
