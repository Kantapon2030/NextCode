import React, { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { fetchUserInfo, saveAuthToLocalStorage } from '../../services/googleAuth';
import { Code2, Zap, CloudOff, ChevronRight, Globe, Terminal, Sparkles } from 'lucide-react';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
            prompt?: string;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
const SCOPES = 'openid profile email https://www.googleapis.com/auth/drive.file';

const features = [
  {
    icon: <Globe className="w-6 h-6" />,
    title: 'รองรับหลากหลายภาษา',
    desc: 'HTML/CSS/JS, Python, C, C++ พร้อม runtime รันสดในเบราว์เซอร์',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: <Terminal className="w-6 h-6" />,
    title: 'Monaco Code Editor',
    desc: 'ขุมพลังเดียวกับ VS Code รองรับ IntelliSense, Snippets และจัดโค้ด (Ctrl+Shift+F)',
    color: 'from-purple-500 to-indigo-500',
  },
  {
    icon: <CloudOff className="w-6 h-6" />,
    title: 'บันทึกอัตโนมัติแบบ Local-First',
    desc: 'ข้อมูลทั้งหมดเก็บในเบราว์เซอร์ของคุณโดยตรง รวดเร็ว ปลอดภัย ทำงานได้แม้ไม่มีเน็ต',
    color: 'from-green-500 to-emerald-500',
  },
];

export default function LandingPage() {
  const { setUser, setAccessToken } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const tokenClientRef = useRef<{ requestAccessToken: (opts?: { prompt?: string }) => void } | null>(null);

  useEffect(() => {
    // Load Google Identity Services
    if (document.getElementById('gsi-script')) return;
    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = initTokenClient;
    script.onerror = (e) => {
      console.error('Failed to load Google Sign-In script:', e);
    };
    document.head.appendChild(script);
  }, []);

  // ปลดล็อกสถานะ Loading เมื่อผู้ใช้โฟกัสกลับมาที่แท็บหลัก
  useEffect(() => {
    const handleFocus = () => {
      const timer = setTimeout(() => {
        setLoading(false);
      }, 2000);
      return () => clearTimeout(timer);
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  function initTokenClient() {
    if (!window.google || !GOOGLE_CLIENT_ID) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: async (resp) => {
        if (resp.error || !resp.access_token) {
          console.error('Google OAuth callback error response:', resp);
          setError(`ไม่สามารถเข้าสู่ระบบได้ (${resp.error || 'ไม่มี access token'})`);
          setLoading(false);
          return;
        }
        try {
          const expiry_time = Date.now() + (resp.expires_in ?? 3600) * 1000;
          const info = await fetchUserInfo(resp.access_token);
          const userInfo = {
            id: info.id,
            name: info.name,
            email: info.email,
            avatar: info.picture,
            access_token: resp.access_token,
            expiry_time,
          };
          saveAuthToLocalStorage(userInfo);
          setUser({ id: info.id, name: info.name, email: info.email, avatar: info.picture });
          setAccessToken(resp.access_token, expiry_time);
        } catch (err) {
          console.error('Google OAuth fetch user info error:', err);
          setError('เกิดข้อผิดพลาดในการดึงข้อมูลโปรไฟล์ผู้ใช้');
        } finally {
          setLoading(false);
        }
      },
    });
  }

  function handleLogin() {
    if (!GOOGLE_CLIENT_ID) {
      setError('ยังไม่ได้ตั้งค่า Google Client ID ใน .env.local (คุณสามารถกด "เริ่มเขียนโค้ดทันที" เพื่อใช้งานได้โดยไม่ต้องเข้าสู่ระบบ)');
      return;
    }
    if (!tokenClientRef.current) {
      initTokenClient();
      if (!tokenClientRef.current) {
        setError('Google Sign-In ยังไม่พร้อม กรุณารอสักครู่หรือกด "เริ่มเขียนโค้ดทันที"');
        return;
      }
    }
    setLoading(true);
    setError('');
    tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
  }

  function handleGuestStart() {
    const guestUser = {
      id: 'guest',
      name: 'Guest Developer',
      email: 'guest@nextcode.local',
      avatar: '',
    };
    saveAuthToLocalStorage({
      ...guestUser,
      access_token: '',
      expiry_time: Date.now() + 365 * 24 * 3600 * 1000,
    });
    setUser(guestUser);
    setAccessToken(null, null);
  }

  return (
    <div className="min-h-screen bg-surface-900 overflow-auto">
      {/* Background gradient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary-600/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-600/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-900/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Nav bar */}
        <nav className="flex items-center justify-between px-8 py-5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Code2 className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg text-white">Nextcode IDE</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <Zap className="w-3.5 h-3.5 text-primary-400" />
            <span>Pure In-Browser Code IDE</span>
          </div>
        </nav>

        {/* Hero section */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
          {/* Badge */}
          <div className="flex items-center gap-2 px-4 py-1.5 bg-primary-500/10 border border-primary-500/20 rounded-full text-primary-400 text-sm mb-8 animate-fade-in">
            <Sparkles className="w-4 h-4" />
            <span>เครื่องมือเขียนโค้ดบนเบราว์เซอร์ Chrome ฟรี 100%</span>
          </div>

          {/* Logo */}
          <div className="mb-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="w-20 h-20 bg-gradient-to-br from-primary-500 via-purple-500 to-pink-500 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-glow">
              <Code2 className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-6xl md:text-7xl font-black text-white mb-4 leading-none tracking-tight">
              Next<span className="gradient-text">code</span>
            </h1>
            <p className="text-xl md:text-2xl text-zinc-300 font-light mb-2">
              เขียนโค้ด รันได้เลย ไม่ต้องติดตั้งอะไร
            </p>
            <p className="text-sm text-zinc-500">
              รองรับ HTML · Python · C · C++ · ปรับแต่งเพื่อการเขียนโค้ดเพียวๆ บน Chrome
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col items-center gap-4 mt-8 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <button
                id="btn-guest-start"
                onClick={handleGuestStart}
                className="flex items-center gap-2 px-8 py-4 bg-primary-600 hover:bg-primary-500 text-white rounded-2xl font-semibold text-base shadow-glow transition-all duration-200 hover:scale-[1.02] cursor-pointer"
              >
                <Code2 className="w-5 h-5" />
                <span>เริ่มเขียนโค้ดทันที</span>
                <ChevronRight className="w-4 h-4 ml-1" />
              </button>

              <button
                id="btn-google-login"
                onClick={handleLogin}
                disabled={loading}
                className="group flex items-center gap-3 px-6 py-4 bg-surface-800 hover:bg-surface-700 text-zinc-200 border border-border rounded-2xl font-medium text-sm shadow-surface-lg transition-all duration-200 hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <div className="w-4 h-4 border-2 border-zinc-400 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                )}
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google'}
              </button>
            </div>

            {error && (
              <p className="text-amber-400 text-xs bg-amber-900/20 px-4 py-2 rounded-lg border border-amber-800/40 max-w-md">
                {error}
              </p>
            )}

            <p className="text-xs text-zinc-500">
              ข้อมูลทั้งหมดเก็บในเบราว์เซอร์ของคุณโดยตรงผ่าน IndexedDB · ปลอดภัย ไม่ผ่านเซิร์ฟเวอร์
            </p>
          </div>

          {/* Feature highlights */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-20 max-w-4xl w-full animate-slide-up" style={{ animationDelay: '0.3s' }}>
            {features.map((f, i) => (
              <div
                key={i}
                className="group glass rounded-2xl p-6 text-left hover:border-primary-500/20 transition-all duration-300 hover:-translate-y-1"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className="text-white font-semibold mb-2">{f.title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          {/* Language badges */}
          <div className="flex flex-wrap justify-center gap-2 mt-12 animate-fade-in" style={{ animationDelay: '0.4s' }}>
            {['HTML', 'CSS', 'JavaScript', 'Python', 'C', 'C++'].map((lang) => (
              <span
                key={lang}
                className="px-3 py-1 bg-surface-800 border border-border text-zinc-400 text-xs rounded-full font-mono"
              >
                {lang}
              </span>
            ))}
          </div>
        </main>

        {/* Footer */}
        <footer className="text-center py-8 text-zinc-500 text-xs border-t border-border/10">
          <div className="flex flex-col items-center justify-center gap-1.5">
            <div className="flex items-center gap-2">
              <Terminal className="w-3.5 h-3.5 text-primary-400" />
              <span>Designed & Developed by <strong className="text-zinc-300 font-medium">Kantapon</strong></span>
            </div>
            <p className="text-[11px] text-zinc-600">Pure In-Browser Web IDE · Fast & Privacy-Focused</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
