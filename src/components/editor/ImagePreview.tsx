import React, { useEffect, useState } from 'react';
import type { VFSState } from '../../types';

interface ImagePreviewProps {
  filename: string;
  vfs: VFSState;
}

export function ImagePreview({ filename, vfs }: ImagePreviewProps) {
  const [url, setUrl] = useState('');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const cleanPath = filename.replace(/^\.\//, '').replace(/^\//, '').replace(/\\/g, '/');
    const asset = vfs.assets[cleanPath] ?? vfs.assets[filename];
    let createdUrl = '';

    if (asset) {
      const blob = new Blob([asset.buffer], { type: asset.mimeType });
      createdUrl = URL.createObjectURL(blob);
      setUrl(createdUrl);
    } else {
      const file = vfs.files[cleanPath] ?? vfs.files[filename];
      if (file) {
        const content = file.content;
        const blob = typeof content === 'string'
          ? new Blob([content], { type: file.mimeType || 'image/svg+xml' })
          : new Blob([content as unknown as ArrayBuffer], { type: file.mimeType || 'image/svg+xml' });
        createdUrl = URL.createObjectURL(blob);
        setUrl(createdUrl);
      }
    }

    // Reset dimensions on tab change
    setDimensions(null);

    return () => {
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [filename, vfs]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  };

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-surface-950 p-4">
        ไม่พบข้อมูลรูปภาพ
      </div>
    );
  }

  const isSvg = filename.toLowerCase().endsWith('.svg');

  return (
    <div className="flex flex-col items-center justify-center h-full bg-surface-950 p-6 overflow-auto select-none">
      <div className="max-w-full max-h-[75%] p-4 border border-border rounded-xl bg-surface-900/60 shadow-xl backdrop-blur-md flex items-center justify-center relative group overflow-hidden">
        {/* Transparent grid background for PNG transparency check */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none" 
          style={{ 
            backgroundImage: 'radial-gradient(#ccc 1px, transparent 1px), radial-gradient(#ccc 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            backgroundPosition: '0 0, 10px 10px'
          }} 
        />
        <img 
          src={url} 
          alt={filename} 
          onLoad={handleImageLoad}
          className="max-w-full max-h-[500px] object-contain z-10 transition-transform duration-300 group-hover:scale-[1.02] select-none"
        />
      </div>
      <div className="mt-4 flex flex-col items-center gap-1.5 z-10 text-center">
        <span className="text-xs font-semibold font-mono text-zinc-300 bg-surface-900 border border-border px-3 py-1 rounded-full shadow-md">
          {filename.split('/').pop()}
        </span>
        <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-medium">
          <span>{isSvg ? 'Vector Graphic (SVG)' : 'Image File'}</span>
          {dimensions && (
            <>
              <span className="opacity-40">•</span>
              <span className="font-mono text-zinc-400">{dimensions.width} × {dimensions.height}px</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
