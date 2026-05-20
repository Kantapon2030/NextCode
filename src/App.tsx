import React, { useEffect, useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { loadAuthFromLocalStorage, isTokenExpired } from './services/googleAuth';
import { getSetting } from './storage/db';
import { ToastContainer } from './components/shared/Toast';
import { LoadingSpinner } from './components/shared/LoadingSpinner';

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

  useEffect(() => {
    async function init() {
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
      setAuthChecked(true);
    }
    init();
  }, []);

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
      </div>
    </BrowserRouter>
  );
}
