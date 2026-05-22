// ระบบกลางจัดการ input/output ของทุกภาษา

export type OutputHandler = (
  text: string,
  type: 'output' | 'error' | 'info' | 'input-echo' | 'warning' | 'stdin-echo'
) => void;

export type InputRequestHandler = (
  prompt: string
) => Promise<string>;

export interface RunSession {
  language: 'python' | 'c' | 'cpp';
  onOutput:  OutputHandler;
  onInputRequest: InputRequestHandler;
  onFinish: (exitCode: number) => void;
}

// Global session สำหรับ terminal ที่กำลังรันอยู่
let activeSession: RunSession | null = null;

export function startSession(session: RunSession): void {
  activeSession = session;
}

export function endSession(): void {
  activeSession = null;
}

export function getActiveSession(): RunSession | null {
  return activeSession;
}
