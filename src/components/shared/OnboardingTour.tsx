import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { Bot, HelpCircle, ArrowLeft, ArrowRight, X } from 'lucide-react';

interface TourStep {
  title: string;
  content: string;
  targetId?: string; // If undefined, show in center of screen
}

export function OnboardingTour() {
  const { userMode, theme, aiPanelOpen, setAIPanelOpen } = useAppStore();
  const [currentStep, setCurrentStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [originalAIPanelOpen, setOriginalAIPanelOpen] = useState(false);

  // Check if tour should run
  useEffect(() => {
    const isDone = localStorage.getItem('tour_done') === 'true';
    if (userMode === 'beginner' && !isDone) {
      setIsVisible(true);
      setOriginalAIPanelOpen(aiPanelOpen);
    } else {
      setIsVisible(false);
    }
  }, [userMode]);

  const steps: TourStep[] = [
    {
      title: 'ยินดีต้อนรับสู่ Nextcode IDE! 🚀',
      content: 'สภาพแวดล้อมการพัฒนาเว็บและรันโค้ดแบบครบครันในเบราว์เซอร์ของคุณ เราขอแนะนำส่วนประกอบที่จำเป็นเพื่อเริ่มใช้งานอย่างรวดเร็ว',
    },
    {
      title: 'โครงสร้างไฟล์และเครื่องมือ (Sidebar) 📁',
      content: 'ฝั่งซ้ายเป็นที่รวมไฟล์ทั้งหมดของโปรเจกต์ คุณสามารถสร้าง/ลบไฟล์ หรือคลิกปุ่มลัด (Snippet) เพื่อใส่โค้ดสำเร็จรูปอย่างรวดเร็ว',
      targetId: 'ide-sidebar',
    },
    {
      title: 'หน้าต่างเขียนโค้ดทรงพลัง (Editor) ✍️',
      content: 'ตรงกลางคือ Monaco Editor ที่รองรับระบบ Ghost Text แนะนำโค้ดแบบป๊อปอัปและอินไลน์ (พิมพ์แล้วกด Tab เพื่อเติมโค้ด), จัดฟอร์แมต (Ctrl+Shift+F) และปุ่มลัดครบครันเหมือน VS Code',
      targetId: 'ide-editor',
    },
    {
      title: 'หน้าต่างแสดงผลลัพธ์ (Output Panel) 💻',
      content: 'ฝั่งขวานี้จะแสดงหน้าเว็บพรีวิว (Preview) หรือเทอร์มินัลคำสั่ง (Terminal) สำหรับภาษา Python/C/C++ โดยจะเปลี่ยนไปตามรูปแบบโค้ดที่คุณเขียนแบบเรียลไทม์',
      targetId: 'ide-output-panel',
    },
    {
      title: 'ผู้ช่วยเขียนโค้ด AI ส่วนตัว (AI Assistant) 🤖',
      content: 'แถบด้านล่างนี้คือ AI Panel ที่สามารถช่วยคุณหาบั๊ก วิเคราะห์คำสั่ง อธิบายจุดบกพร่อง หรือช่วยเจนโค้ดใหม่ด้วย Gemini 2.5 Flash Lite ล่าสุด',
      targetId: 'ide-ai-panel',
    },
    {
      title: 'พร้อมพัฒนาซอฟต์แวร์แล้ว! 🎉',
      content: 'แนะนำการใช้งานเสร็จสิ้นแล้ว! คุณสามารถเปลี่ยนขนาดฟอนต์ ธีมสี หรือสลับเป็นโหมดเชี่ยวชาญ (Expert) ได้ที่ปุ่มตั้งค่า (⚙️) มุมขวาบนได้ทันที',
    }
  ];

  const activeStep = steps[currentStep];

  // Automate AI Panel open/close for Step 4 (Index 4)
  useEffect(() => {
    if (!isVisible) return;

    if (activeStep.targetId === 'ide-ai-panel') {
      // Force open AI panel
      setAIPanelOpen(true);
    } else if (currentStep < 4) {
      // Restore previous state if we went back
      setAIPanelOpen(originalAIPanelOpen);
    }
  }, [currentStep, isVisible, activeStep.targetId]);

  // Track target element bounding rect
  useEffect(() => {
    if (!isVisible || !activeStep.targetId) {
      setRect(null);
      return;
    }

    const updateRect = () => {
      const el = document.getElementById(activeStep.targetId!);
      if (el) {
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    const interval = setInterval(updateRect, 300); // handle dynamic layouts

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      clearInterval(interval);
    };
  }, [currentStep, isVisible, activeStep.targetId]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleFinish = () => {
    localStorage.setItem('tour_done', 'true');
    setIsVisible(false);
    // Restore original AI panel state
    setAIPanelOpen(originalAIPanelOpen);
  };

  const handleSkip = () => {
    handleFinish();
  };

  if (!isVisible) return null;

  // Calculate card positioning based on target rect
  let cardStyle: React.CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    zIndex: 110,
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  };

  if (rect) {
    const cardWidth = 320;
    const cardHeight = 220;
    const margin = 20;

    const spaceRight = window.innerWidth - (rect.left + rect.width);
    const spaceLeft = rect.left;
    const spaceBelow = window.innerHeight - (rect.top + rect.height);
    
    // Choose placement strategy: right, left, below, above
    if (spaceRight > cardWidth + margin) {
      cardStyle = {
        position: 'fixed',
        top: Math.max(margin, Math.min(window.innerHeight - cardHeight - margin, rect.top + (rect.height - cardHeight) / 2)),
        left: rect.left + rect.width + margin,
        zIndex: 110,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    } else if (spaceLeft > cardWidth + margin) {
      cardStyle = {
        position: 'fixed',
        top: Math.max(margin, Math.min(window.innerHeight - cardHeight - margin, rect.top + (rect.height - cardHeight) / 2)),
        left: rect.left - cardWidth - margin,
        zIndex: 110,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    } else if (spaceBelow > cardHeight + margin) {
      cardStyle = {
        position: 'fixed',
        top: rect.top + rect.height + margin,
        left: Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, rect.left + (rect.width - cardWidth) / 2)),
        zIndex: 110,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    } else {
      cardStyle = {
        position: 'fixed',
        top: rect.top - cardHeight - margin,
        left: Math.max(margin, Math.min(window.innerWidth - cardWidth - margin, rect.left + (rect.width - cardWidth) / 2)),
        zIndex: 110,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      };
    }
  }

  const padding = 6;
  const spotlightStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.75)',
    borderRadius: '12px',
    border: '3px solid #6366f1',
    zIndex: 100,
    pointerEvents: 'none',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
  } : {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 100,
    transition: 'all 0.3s ease',
  };

  const isDark = theme === 'dark';
  const cardBgCls = isDark ? 'bg-surface-900 border-surface-700 text-white' : 'bg-white border-zinc-200 text-zinc-900 shadow-xl';

  return (
    <>
      {/* Backdrop & Spotlight */}
      <div style={spotlightStyle} className="pointer-events-none animate-pulse-border" />

      {/* Tour Card */}
      <div
        style={cardStyle}
        className={`w-80 border rounded-2xl p-5 shadow-2xl flex flex-col gap-4 select-none ${cardBgCls}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-primary-400 font-semibold text-sm">
            <Bot className="w-4 h-4" />
            <span>Nextcode Tour</span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-primary-950/20 text-primary-400 border border-primary-500/20">
            {currentStep + 1} จาก {steps.length}
          </span>
        </div>

        {/* Content */}
        <div className="space-y-1">
          <h3 className="font-bold text-sm leading-snug">{activeStep.title}</h3>
          <p className={`text-xs leading-relaxed ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {activeStep.content}
          </p>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-1 border-t border-border/10">
          <button
            onClick={handleSkip}
            className={`text-xs hover:underline transition-colors ${isDark ? 'text-zinc-500 hover:text-zinc-300' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            ข้ามทัวร์
          </button>
          
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handleBack}
                className={`p-1.5 border border-border/50 rounded-xl hover:bg-surface-700/50 transition-colors`}
                title="ย้อนกลับ"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white font-semibold rounded-xl text-xs shadow-lg transition-all duration-200"
            >
              <span>{currentStep === steps.length - 1 ? 'เสร็จสิ้น' : 'ถัดไป'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// Add CSS rule for pulsing border
if (typeof document !== 'undefined') {
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    @keyframes pulseBorder {
      0%, 100% { border-color: rgba(99, 102, 241, 1); }
      50% { border-color: rgba(99, 102, 241, 0.4); }
    }
    .animate-pulse-border {
      animation: pulseBorder 2s infinite ease-in-out;
    }
  `;
  document.head.appendChild(styleEl);
}
