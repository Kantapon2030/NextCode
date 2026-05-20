import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { db } from '../../storage/db';
import { saveVFSFile } from '../../storage/vfsHelpers';
import { TEMPLATES } from '../../templates';
import { toast } from '../shared/Toast';
import { getMimeType } from '../../storage/vfsHelpers';
import { X, Code2, Globe, Terminal } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  html: <Globe className="w-5 h-5" />,
  python: <Terminal className="w-5 h-5" />,
  c: <Code2 className="w-5 h-5" />,
  cpp: <Code2 className="w-5 h-5" />,
  blank: <Code2 className="w-5 h-5" />,
};

const TEMPLATE_COLORS: Record<string, string> = {
  html: 'from-orange-500 to-red-500',
  python: 'from-blue-500 to-cyan-500',
  c: 'from-gray-500 to-zinc-600',
  cpp: 'from-cyan-500 to-blue-600',
  blank: 'from-zinc-600 to-zinc-700',
};

export default function NewProjectModal({ onClose }: Props) {
  const navigate = useNavigate();
  const { addProject, projects } = useAppStore();
  const [name, setName] = useState(`โปรเจกต์ ${projects.length + 1}`);
  const [selectedTemplate, setSelectedTemplate] = useState('html');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const template = TEMPLATES.find((t) => t.id === selectedTemplate)!;
    const now = Date.now();
    const project = {
      id,
      name: name.trim(),
      language: template.language,
      template: template.id,
      created_at: now,
      updated_at: now,
    };
    await db.projects.add(project);
    for (const [filename, content] of Object.entries(template.files)) {
      await saveVFSFile(id, filename, content, getMimeType(filename));
    }
    addProject(project as any);
    toast('success', 'สร้างโปรเจกต์ใหม่แล้ว');
    navigate(`/project/${id}`);
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-surface-800 border border-border rounded-2xl p-6 w-full max-w-lg shadow-surface-lg animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">โปรเจกต์ใหม่</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-700 rounded-lg transition-colors text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-zinc-400 mb-2">ชื่อโปรเจกต์</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            className="w-full px-4 py-3 bg-surface-700 border border-border rounded-xl text-white outline-none focus:border-primary-500 transition-colors text-sm"
            placeholder="ชื่อโปรเจกต์"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-400 mb-3">เลือก Template</label>
          <div className="grid grid-cols-1 gap-2">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => setSelectedTemplate(tmpl.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  selectedTemplate === tmpl.id
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-border bg-surface-700 hover:border-zinc-500'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${TEMPLATE_COLORS[tmpl.id]} flex items-center justify-center text-white`}>
                  {TEMPLATE_ICONS[tmpl.id]}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{tmpl.label}</p>
                  <p className="text-xs text-zinc-500">{tmpl.previewMode === 'web' ? 'แสดงผลใน Browser' : 'แสดงผลใน Terminal'}</p>
                </div>
                {selectedTemplate === tmpl.id && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-primary-500 flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full" />
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-surface-700 hover:bg-surface-600 text-zinc-400 rounded-xl text-sm font-medium transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex-1 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {creating ? 'กำลังสร้าง...' : 'สร้างโปรเจกต์'}
          </button>
        </div>
      </div>
    </div>
  );
}
