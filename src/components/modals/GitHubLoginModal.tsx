import React, { useState } from 'react';
import { GitBranch, ExternalLink, Copy, Check } from 'lucide-react';
import {
  requestDeviceCode,
  pollForToken,
  fetchGitHubUser,
  saveGitHubToken,
} from '../../services/githubAuth';

interface Props {
  onSuccess: (token: string) => void;
  onSkip:    () => void;
}

type Step = 'intro' | 'code' | 'polling' | 'done';

export const GitHubLoginModal: React.FC<Props> = ({
  onSuccess, onSkip
}) => {
  const [step,       setStep]      = useState<Step>('intro');
  const [userCode,   setUserCode]  = useState('');
  const [verifyUrl,  setVerifyUrl] = useState('');
  const [copied,     setCopied]    = useState(false);
  const [countdown,  setCountdown] = useState(300);
  const [error,      setError]     = useState('');

  const handleStart = async () => {
    try {
      setError('');
      const state = await requestDeviceCode();
      setUserCode(state.userCode);
      setVerifyUrl(state.verificationUri);
      setStep('code');

      // เปิด github.com/login/device อัตโนมัติ
      window.open(state.verificationUri, '_blank');

      setStep('polling');

      const token = await pollForToken(
        state.deviceCode,
        state.interval,
        (left) => setCountdown(left)
      );

      saveGitHubToken(token);
      setStep('done');
      onSuccess(token);

    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'เกิดข้อผิดพลาด'
      );
      setStep('intro');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(userCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ maxWidth: 440 }}>

        <div className="modal-header">
          <GitBranch size={20} />
          <h2>เชื่อมต่อ GitHub</h2>
        </div>

        <p className="modal-desc">
          เชื่อมต่อ GitHub เพื่อบันทึกโปรเจกต์บน Gist
          และเข้าถึงได้จากทุกเครื่อง
          <br />
          <strong>ขอสิทธิ์แค่ gist เท่านั้น</strong>
          — ไม่แตะ repo หรือข้อมูลอื่น
        </p>

        {step === 'intro' && (
          <>
            {error && (
              <div className="modal-error">{error}</div>
            )}
            <button
              className="btn-primary full-width gh-connect-btn"
              onClick={handleStart}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px' }}
            >
              <GitBranch size={16} />
              เชื่อมต่อ GitHub
            </button>
            <button
              className="btn-ghost full-width"
              onClick={onSkip}
              style={{ marginTop: '10px', padding: '10px' }}
            >
              ข้ามไปก่อน (บันทึกแค่ในเครื่องนี้)
            </button>
          </>
        )}

        {(step === 'code' || step === 'polling') && (
          <div className="device-flow-box">
            <p>1. คัดลอก code นี้:</p>
            <div className="device-code-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f4f4f5', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
              <span className="device-code" style={{ fontSize: '1.2rem', fontWeight: 'bold', letterSpacing: '2px' }}>{userCode}</span>
              <button onClick={handleCopy} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                {copied ? <Check size={18}/> : <Copy size={18}/>}
              </button>
            </div>
            <p>2. วางที่ github.com/login/device</p>
            
            <a
              href={verifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline full-width gh-open-btn"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', marginTop: '10px', textDecoration: 'none', color: 'inherit', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <ExternalLink size={14} />
              เปิด GitHub
            </a>
            {step === 'polling' && (
              <p className="polling-status" style={{ textAlign: 'center', marginTop: '15px', color: '#666' }}>
                ⏳ รอการยืนยัน... ({countdown}s)
              </p>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="modal-success" style={{ textAlign: 'center', color: '#10b981', padding: '20px 0' }}>
            ✅ เชื่อมต่อสำเร็จ! กำลังโหลดข้อมูล...
          </div>
        )}

      </div>
    </div>
  );
};
