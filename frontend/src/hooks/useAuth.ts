import { useState, useEffect, useCallback } from 'react';
import type { Client } from '@/lib/db';
import { getClientsFromCache, getCoachesFromCache, loadClients, loadCoaches } from '@/lib/store';

export type Page = 'landing' | 'student' | 'coach' | 'admin';

export const SESSION_KEY = 'fika_session';
export const LAST_LOGIN_KEY = 'fika_last_login';

type SessionData =
  | { role: 'student'; clientId?: string; roadCode?: string }
  | { role: 'coach'; coachCode: string; coachName?: string }
  | { role: 'admin' };

type LastLoginData = {
  remember: boolean;
  roadCode?: string;
  coachCode?: string;
};

function lsGet<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem('fika_' + key) || '') ?? fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, val: unknown) {
  localStorage.setItem('fika_' + key, JSON.stringify(val));
}

function initDemoData() {
  if (lsGet('data_initialized', false)) return;
  lsSet('coaches', [
    { code: 'COACH001', name: '龙教练', specialties: ['功能性力量', '减脂塑形'], clients: [] },
    { code: 'COACH002', name: '林教练', specialties: ['运动康复', '体能提升'], clients: [] },
  ]);
  lsSet('data_initialized', true);
}

function persistSession(session: SessionData, remember: boolean) {
  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    localStorage.removeItem(SESSION_KEY);
  }
}

function persistLastLogin(patch: Partial<LastLoginData>, remember: boolean) {
  const base: LastLoginData = { remember };
  try {
    const prev = JSON.parse(localStorage.getItem(LAST_LOGIN_KEY) || '{}') as LastLoginData;
    localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ ...base, ...prev, ...patch, remember }));
  } catch {
    localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ ...base, ...patch }));
  }
}

export function useAuth() {
  const [page, setPage] = useState<Page>('landing');
  const [currentStudent, setCurrentStudent] = useState<Client | null>(null);
  const [currentCoachCode, setCurrentCoachCode] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 初始化：拉数据 + 恢复会话
  useEffect(() => {
    initDemoData();
    (async () => {
      setIsInitializing(true);
      try {
        await Promise.all([
          loadClients().catch((e: unknown) => console.warn('[auth] load clients failed:', e)),
          loadCoaches().catch((e: unknown) => console.warn('[auth] load coaches failed:', e)),
        ]);
      } finally {
        setIsInitializing(false);
      }

      // 会话恢复
      try {
        const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
        if (!saved) return;
        const sess = JSON.parse(saved) as SessionData;
        if (sess.role === 'student' && (sess.clientId || sess.roadCode)) {
          const cached = getClientsFromCache();
          let client = cached.find((c) => c.id === (sess as any).clientId);
          if (!client && (sess as any).roadCode) {
            client = cached.find(
              (c) => String((c as any).roadCode || '').toUpperCase() === String((sess as any).roadCode).toUpperCase(),
            );
          }
          if (client) { setCurrentStudent(client); setPage('student'); }
        } else if (sess.role === 'coach' && sess.coachCode) {
          setCurrentCoachCode(sess.coachCode);
          setPage('coach');
        } else if (sess.role === 'admin') {
          setPage('admin');
        }
      } catch { /* ignore */ }
    })();
  }, []);

  // 学员登录
  const handleStudentLogin = useCallback(async (roadCode: string, remember: boolean): Promise<boolean> => {
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const allClients: Client[] = await res.json();
      const normalized = String(roadCode).trim().toUpperCase();
      const client = allClients.find(
        (c) => String((c as any).roadCode || '').trim().toUpperCase() === normalized,
      );
      if (!client) return false;
      setCurrentStudent(client);
      persistSession({ role: 'student', clientId: client.id, roadCode }, remember);
      persistLastLogin({ roadCode }, remember);
      setPage('student');
      return true;
    } catch (err) {
      console.error('[auth] student login failed:', err);
      return false;
    }
  }, []);

  // 教练登录
  const handleCoachLogin = useCallback((coachCode: string, remember: boolean): boolean => {
    const coaches = getCoachesFromCache().length > 0
      ? getCoachesFromCache()
      : lsGet<Array<{ code: string; name: string }>>('coaches', []);
    const coach = coaches.find((c) => String(c.code || '').toUpperCase() === coachCode.toUpperCase());
    if (!coach) return false;
    persistSession({ role: 'coach', coachCode: (coach as any).code, coachName: (coach as any).name }, remember);
    persistLastLogin({ coachCode: (coach as any).code }, remember);
    setCurrentCoachCode((coach as any).code);
    setPage('coach');
    return true;
  }, []);

  // 管理员登录
  const handleAdminLogin = useCallback((pass: string, remember: boolean): boolean => {
    const adminPass = (import.meta as any).env?.VITE_ADMIN_PASS || 'fika2024';
    if (pass !== adminPass) return false;
    persistSession({ role: 'admin' }, remember);
    persistLastLogin({}, remember);
    setPage('admin');
    return true;
  }, []);

  // 退出
  const handleLogout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentStudent(null);
    setCurrentCoachCode(null);
    setPage('landing');
  }, []);

  return {
    page,
    currentStudent,
    currentCoachCode,
    isInitializing,
    handleStudentLogin,
    handleCoachLogin,
    handleAdminLogin,
    handleLogout,
  };
}
