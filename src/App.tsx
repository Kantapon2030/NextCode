import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { loadAuthFromLocalStorage, isTokenExpired } from './services/googleAuth';
import { getSetting } from './storage/db';
import { ToastContainer } from './components/shared/Toast';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import { Download, X } from 'lucide-react';

const LandingPage = lazy(() => import('./components/pages/LandingPage'));
const Dashboard = lazy(() => import('./components/pages/Dashboard'));
const IDEPage = lazy(() => import('./components/pages/IDEPage'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAppStore();
  return user ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  const { user, setUser, setAccessToken, setTheme, setFontSize, setUserMode, theme } =
    useAppStore();
  const [authChecked, setAuthChecked] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const auth = loadAuthFromLocalStorage();
        if (auth && !isTokenExpired(auth.expiry_time)) {
          setUser({ id: auth.id, name: auth.name, email: auth.email, avatar: auth.avatar });
          setAccessToken(auth.access_token, auth.expiry_time);
        }
        const savedTheme = await getSetting<'dark' | 'light'>('theme', 'dark');
        const savedFont = await getSetting<number>('font_size', 14);
        const savedMode = await getSetting<'beginner' | 'expert'>('user_mode', 'beginner');
        setTheme(savedTheme);
        setFontSize(savedFont);
        setUserMode(savedMode);
      } catch (err) {
        console.error('App auth initialization failed:', err);
      } finally {
        setAuthChecked(true);
      }
    }
    init();
  }, []);

  // ดักจับเหตุการณ์การขอติดตั้ง PWA
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPrompt = e;
      
      // ตรวจสอบว่าผู้ใช้เคยปิดป๊อปอัปติดตั้งล่าสุดเมื่อใด
      const dismissedTime = localStorage.getItem('pwa_install_dismissed');
      if (dismissedTime) {
        const diff = Date.now() - parseInt(dismissedTime, 10);
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (diff < sevenDays) {
          return; // ไม่ต้องแสดงรบกวนหากเพิ่งปิดไปไม่เกิน 7 วัน
        }
      }
      setShowInstallPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
    }
    setDeferredPrompt(null);
    (window as any).deferredPrompt = null;
    setShowInstallPrompt(false);
  };

  const handleDismissPrompt = () => {
    localStorage.setItem('pwa_install_dismissed', Date.now().toString());
    setShowInstallPrompt(false);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [theme]);

  if (!authChecked) {
    return <LoadingSpinner fullscreen message="กำลังตรวจสอบการเข้าสู่ระบบ..." />;
  }

  return (
    <BrowserRouter>
      <div
        className={`h-full flex flex-col ${
          theme === 'dark' ? 'bg-surface-900 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
        }`}
      >
        <Suspense fallback={<LoadingSpinner fullscreen message="กำลังโหลด..." />}>
          <Routes>
            <Route
              path="/"
              element={user ? <Navigate to="/dashboard" replace /> : <LandingPage />}
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/project/:projectId"
              element={
                <ProtectedRoute>
                  <IDEPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <ToastContainer />

        {/* PWA Custom Install Popup Banner */}
        {showInstallPrompt && (
          <div className="fixed bottom-6 right-6 z-[9999] max-w-sm w-[calc(100vw-3rem)] p-4 rounded-2xl border border-primary-500/20 bg-surface-950/95 backdrop-blur-md shadow-2xl flex flex-col gap-3 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-start justify-between">
              <div className="flex gap-3">
                <img
                  src={`${import.meta.env.BASE_URL}icon-192.png`}
                  alt="Nextcode Logo"
                  className="w-12 h-12 rounded-xl object-cover shadow-md shrink-0"
                />
                <div>
                  <h4 className="text-sm font-semibold text-white">ติดตั้ง Nextcode IDE</h4>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    ติดตั้งลงบนหน้าจอเพื่อรันแบบรวดเร็วออฟไลน์ และสัมผัสประสบการณ์ใช้งานแบบแอปพลิเคชันเต็มรูปแบบ
                  </p>
                </div>
              </div>
              <button 
                onClick={handleDismissPrompt}
                className="p-1 text-zinc-500 hover:text-white rounded-lg hover:bg-surface-800 transition-colors"
                title="ปิด"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="flex gap-2 justify-end mt-1">
              <button
                onClick={handleDismissPrompt}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 font-medium transition-colors"
              >
                ไว้ทีหลัง
              </button>
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-lg shadow-md transition-all duration-200"
              >
                <Download className="w-3.5 h-3.5" /> ติดตั้งเลย
              </button>
            </div>
          </div>
        )}

        {/* Floating Version Display */}
        <div 
          className="fixed bottom-3 left-3 z-[9999] text-[10px] font-mono text-zinc-500/80 select-none bg-surface-950/40 backdrop-blur-sm px-2 py-0.5 rounded border border-border/20 pointer-events-none"
          title="Nextcode IDE Version"
        >
          v1.0.3
        </div>
      </div>
    </BrowserRouter>
  );
}
