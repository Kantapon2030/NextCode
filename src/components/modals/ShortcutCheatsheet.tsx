import React from 'react';
import { useAppStore } from '../../store/appStore';
import { X, HelpCircle, Keyboard, Play } from 'lucide-react';
import { toast } from '../shared/Toast';

interface Props {
  onClose: () => void;
}

export default function ShortcutCheatsheet({ onClose }: Props) {
  const { theme } = useAppStore();

  const shortcuts = [
    { keys: ['Ctrl', 'S'], desc: 'บันทึกไฟล์ปัจจุบัน (Save)' },
    { keys: ['Ctrl', 'Enter'], desc: 'รันโค้ดปัจจุบันในเทอร์มินัล (Run)' },
    { keys: ['Ctrl', 'B'], desc: 'เปิด/ปิดแถบผู้ช่วย AI (AI Panel)' },
    { keys: ['Ctrl', 'Shift', 'F'], desc: 'ค้นหาคำในทุกไฟล์ของโปรเจกต์ (Search in Files)' },
    { keys: ['Alt', 'W'], desc: 'ครอบโค้ดที่ไฮไลต์ด้วยแท็ก HTML (Wrap Tag)' },
    { keys: ['Tab'], desc: 'ขยายคีย์ลัด/คำแนะนำ Ghost Text (Autocomplete)' },
    { keys: ['Esc'], desc: 'ยกเลิก Ghost Text หรือปิดหน้าต่างย่อย' },
    { keys: ['?'], desc: 'เปิด/ปิด หน้านี้ (คีย์ลัดทั้งหมด)' },
  ];

  const isDark = theme === 'dark';
  const bgCls = isDark ? 'bg-surface-900 border-surface-700 text-white' : 'bg-white border-zinc-200 text-zinc-900 shadow-xl';

  const handleRestartTour = () => {
    localStorage.removeItem('tour_done');
    onClose();
    // Refresh page to trigger tour startup
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className={`w-[450px] max-w-[90vw] border rounded-2xl p-6 shadow-2xl flex flex-col gap-4 animate-slide-up relative ${bgCls}`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-800 text-zinc-500 hover:text-white transition-colors"
          title="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-2 border-b border-border/10 pb-3">
          <Keyboard className="w-5 h-5 text-primary-400" />
          <h3 className="font-bold text-base">คีย์ลัดของ Nextcode IDE</h3>
        </div>

        {/* Shortcuts List */}
        <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-border/5">
              <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>{s.desc}</span>
              <div className="flex gap-1 items-center">
                {s.keys.map((k, kIdx) => (
                  <React.Fragment key={kIdx}>
                    {kIdx > 0 && <span className="text-zinc-600">+</span>}
                    <kbd className="px-1.5 py-0.5 rounded border border-border bg-surface-950 font-mono text-[10px] font-semibold text-zinc-300 shadow">
                      {k}
                    </kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Extra Action */}
        <div className="flex items-center justify-between pt-2 border-t border-border/10">
          <span className="text-[10px] text-zinc-500">Nextcode v1.1.0</span>
          <button
            onClick={handleRestartTour}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl text-xs shadow-md transition-all duration-200"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            เริ่มต้นแนะนำตัวโปรแกรมใหม่ (Onboarding Tour)
          </button>
        </div>
      </div>
    </div>
  );
}
