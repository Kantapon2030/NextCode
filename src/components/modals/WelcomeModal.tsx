import React from 'react';
import { useAppStore } from '../../store/appStore';
import { setSetting } from '../../storage/db';
import { Code2, Zap, User, ArrowRight } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function WelcomeModal({ onClose }: Props) {
  const { setUserMode, userMode } = useAppStore();

  async function handleSave() {
    await setSetting('user_mode', userMode);
    onClose();
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
            <h2 className="text-lg font-bold text-white">ยินดีต้อนรับสู่ Nextcode IDE! 👋</h2>
            <p className="text-xs text-zinc-500">เลือกโหมดการใช้งานที่เหมาะกับคุณ</p>
          </div>
        </div>

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
          onClick={handleSave}
          className="w-full mt-6 flex items-center justify-center gap-2 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-medium transition-colors cursor-pointer"
        >
          เริ่มเขียนโค้ดเลย! <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
