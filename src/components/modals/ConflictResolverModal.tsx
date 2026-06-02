import React, { useState } from 'react';
import { AlertTriangle, HardDrive, Cloud, Check } from 'lucide-react';

export interface ConflictItem {
  projectId: string;
  projectName: string;
  localProject: { updatedAt: number };
  cloudProject: { updatedAt: number };
}

interface Props {
  conflicts: ConflictItem[];
  onResolve: (resolutions: Record<string, 'local' | 'cloud'>) => void;
  onClose: () => void;
}

export function ConflictResolverModal({ conflicts, onResolve, onClose }: Props) {
  const [selections, setSelections] = useState<Record<string, 'local' | 'cloud'>>(() => {
    const initial: Record<string, 'local' | 'cloud'> = {};
    conflicts.forEach(c => {
      // Default to the newer one
      initial[c.projectId] = c.localProject.updatedAt >= c.cloudProject.updatedAt ? 'local' : 'cloud';
    });
    return initial;
  });

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const handleSelect = (projId: string, type: 'local' | 'cloud') => {
    setSelections(prev => ({ ...prev, [projId]: type }));
  };

  const handleSubmit = () => {
    onResolve(selections);
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/75 backdrop-blur-md">
      <div className="bg-surface-800 border border-border rounded-2xl w-full max-w-lg shadow-surface-lg animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-border bg-yellow-950/20">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-500">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">พบข้อมูลทับซ้อน (Sync Conflict)</h2>
            <p className="text-xs text-zinc-400 mt-0.5">มีโปรเจกต์ที่แก้ไขทั้งบนเครื่องนี้และบนคลาวด์พร้อมกัน กรุณาเลือกเวอร์ชันที่ต้องการเก็บไว้</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[50vh] overflow-y-auto space-y-4">
          {conflicts.map((c) => {
            const currentSelection = selections[c.projectId];
            return (
              <div key={c.projectId} className="border border-border rounded-xl p-4 bg-surface-900/50 space-y-3">
                <h3 className="font-semibold text-sm text-white">{c.projectName}</h3>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Local Option */}
                  <button
                    onClick={() => handleSelect(c.projectId, 'local')}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      currentSelection === 'local'
                        ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500'
                        : 'border-border bg-surface-800 hover:border-zinc-750'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-1 text-xs font-semibold text-zinc-300">
                        <HardDrive className="w-3.5 h-3.5" /> เวอร์ชันบนเครื่อง (Local)
                      </span>
                      {currentSelection === 'local' && <div className="w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center text-white"><Check className="w-2.5 h-2.5" /></div>}
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-2 font-mono">{formatDate(c.localProject.updatedAt)}</span>
                  </button>

                  {/* Cloud Option */}
                  <button
                    onClick={() => handleSelect(c.projectId, 'cloud')}
                    className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                      currentSelection === 'cloud'
                        ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500'
                        : 'border-border bg-surface-800 hover:border-zinc-750'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="flex items-center gap-1 text-xs font-semibold text-zinc-300">
                        <Cloud className="w-3.5 h-3.5" /> เวอร์ชันคลาวด์ (Cloud)
                      </span>
                      {currentSelection === 'cloud' && <div className="w-4 h-4 rounded-full bg-primary-500 flex items-center justify-center text-white"><Check className="w-2.5 h-2.5" /></div>}
                    </div>
                    <span className="text-[10px] text-zinc-500 mt-2 font-mono">{formatDate(c.cloudProject.updatedAt)}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-5 border-t border-border bg-surface-850">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-surface-700 hover:bg-surface-650 text-zinc-400 hover:text-zinc-200 rounded-xl text-xs font-semibold transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
          >
            ยืนยันการใช้ข้อมูล
          </button>
        </div>
      </div>
    </div>
  );
}
