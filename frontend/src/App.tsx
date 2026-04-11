/**
 * App.tsx — 更新版
 * 变更：
 * 1. StudentPortal → 替换为完整 React 组件（含四个 Tab 和课后反馈）
 * 2. AdminPortal → 替换为完整 React 组件（含六个 Tab）
 * 3. 登录逻辑 → 路书码真实匹配客户数据，教练码匹配教练数据
 * 4. 管理员入口 → 密码验证 fika2024
 */

import { useMemo, useState, useEffect } from 'react';
import { CoachSessionView } from './components/CoachSessionView';
import type { Client } from '@/lib/db';
import { CoachShell, type CoachTab } from './components/coach/CoachShell';
import { ClientsPage } from './components/coach/ClientsPage';
import { PlanningPage } from './components/coach/PlanningPage';
import { FinancePage } from './components/coach/FinancePage';
import { HeartRatePage } from './components/coach/HeartRatePage';
import { DietPage } from './components/coach/DietPage';
import { getClientsFromCache, getCoachesFromCache, loadClients, loadCoaches, saveClient, updateClientsCache } from '@/lib/store';
import { calcLtvScore } from '@/lib/ltvScore';
import QRCode from 'qrcode';
// ↓ 新增两个组件 import
import { StudentPortal } from './components/student/StudentPortal';
import { AdminPortal } from './components/admin/AdminPortal';

type Page = 'landing' | 'student' | 'coach' | 'admin';
const SESSION_KEY = 'fika_session';
const LAST_LOGIN_KEY = 'fika_last_login';

type SessionData =
  | { role: 'student'; clientId?: string; roadCode?: string }
  | { role: 'coach'; coachCode: string; coachName?: string }
  | { role: 'admin' };

type LastLoginData = {
  remember: boolean;
  roadCode?: string;
  coachCode?: string;
};

// ── LocalStorage 工具 ──────────────────────────────────────────
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

// 初始化演示数据（首次运行时）
function initDemoData() {
  if (lsGet('data_initialized', false)) return;
  lsSet('coaches', [
    { code: 'COACH001', name: '龙教练', specialties: ['功能性力量', '减脂塑形'], clients: [] },
    { code: 'COACH002', name: '林教练', specialties: ['运动康复', '体能提升'], clients: [] },
  ]);
  lsSet('clients', [
    {
      id: 'CL001',
      roadCode: 'FIKA-WF001',
      name: '上官',
      gender: 'male',
      age: 28,
      height: 178,
      weight: 72.4,
      tier: 'pro',
      goal: '功能性力量提升',
      weeks: 15,
      injury: '右膝注意',
      coachCode: 'COACH001',
      blocks: [],
      sessions: [],
      weeklyData: [],
      dietPlans: [],
    },
    {
      id: 'CL002',
      roadCode: 'FIKA-WF002',
      name: '林思凡',
      gender: 'female',
      age: 25,
      height: 163,
      weight: 55,
      tier: 'standard',
      goal: '减脂塑形',
      weeks: 12,
      injury: '',
      coachCode: 'COACH001',
      blocks: [],
      sessions: [],
      weeklyData: [],
      dietPlans: [],
    },
    {
      id: 'CL003',
      roadCode: 'FIKA-WF003',
      name: '陈明',
      gender: 'male',
      age: 32,
      height: 175,
      weight: 80,
      tier: 'ultra',
      goal: '运动表现提升',
      weeks: 20,
      injury: '',
      coachCode: 'COACH002',
      blocks: [],
      sessions: [],
      weeklyData: [],
      dietPlans: [],
    },
  ]);
  lsSet('data_initialized', true);
}

// ── 动画背景 ───────────────────────────────────────────────────
function Background() {
  return (
    <div className="bg">
      <div className="bg-a" />
      <div className="bg-b" />
      <div className="bg-c" />
    </div>
  );
}

// ── 登录页 ─────────────────────────────────────────────────────
function LandingPage({
  display,
  onStudentLogin,
  onCoachLogin,
  onAdminLogin,
}: {
  display: 'flex' | 'none';
  onStudentLogin: (roadCode: string, remember: boolean) => Promise<boolean>;
  onCoachLogin: (coachCode: string, remember: boolean) => boolean;
  onAdminLogin: (pass: string, remember: boolean) => boolean;
}) {
  const [roadCode, setRoadCode] = useState('');
  const [coachCode, setCoachCode] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [stuError, setStuError] = useState('');
  const [coachError, setCoachError] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_LOGIN_KEY);
      if (!saved) return;
      const last = JSON.parse(saved) as LastLoginData;
      if (last.roadCode) setRoadCode(String(last.roadCode).toUpperCase());
      if (last.coachCode) setCoachCode(String(last.coachCode).toUpperCase());
      if (typeof last.remember === 'boolean') setRememberDevice(last.remember);
    } catch {
      // ignore
    }
  }, []);

  const handleStudentLogin = async () => {
    const code = roadCode.trim().toUpperCase();
    if (!code) {
      setStuError('请输入路书码');
      return;
    }
    try {
      const ok = await onStudentLogin(code, rememberDevice);
      if (!ok) setStuError('路书码无效，请检查后重试');
      else setStuError('');
    } catch (error) {
      setStuError('登录失败，请重试');
      console.error('[app] Student login error:', error);
    }
  };

  const handleCoachLogin = () => {
    const code = coachCode.trim().toUpperCase();
    if (!code) {
      setCoachError('请输入教练码');
      return;
    }
    const ok = onCoachLogin(code, rememberDevice);
    if (!ok) setCoachError('教练码无效，请检查后重试');
    else setCoachError('');
  };

  const handleAdminLogin = () => {
    const pass = prompt('请输入管理员密码：');
    if (pass === null) return;
    const ok = onAdminLogin(pass, rememberDevice);
    if (!ok) alert('密码错误');
  };

  return (
    <div id="pg-landing" className="z1" style={{ display }}>
      <div style={{ textAlign: 'center' }}>
        <div className="landing-logo">
          <span style={{ color: 'var(--p)', fontWeight: 900, fontSize: 36 }}>Fi</span>
          <span style={{ fontWeight: 900, fontSize: 36, color: 'var(--s900)' }}>KA</span>
        </div>
        <div className="landing-brand">Fitness · 身体资产运维中心</div>
      </div>

      <div className="card" style={{ width: '100%', maxWidth: 380, overflow: 'hidden' }}>
        {/* 学员登录 */}
        <div style={{ padding: '28px 26px' }}>
          <div style={{ width: 44, height: 3, background: 'var(--p)', borderRadius: 2, margin: '0 auto 22px' }} />
          <div style={{ fontSize: 24, fontWeight: 800, textAlign: 'center', color: 'var(--s900)', letterSpacing: '-.02em' }}>
            FiKA 身体资产运维中心
          </div>
          <div style={{ fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--s400)', textAlign: 'center', marginTop: 4 }}>
            BODY ASSET OPERATIONS CENTER
          </div>

          <div style={{ marginTop: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--s700)', display: 'block', marginBottom: 2 }}>路书码</span>
            <span style={{ fontSize: 10, color: 'var(--s400)', letterSpacing: '.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              ROADBOOK CODE
            </span>
            <input
              className="stu-roadbook-inp"
              placeholder="FiKA-WF001"
              value={roadCode}
              onChange={(e) => {
                setRoadCode(e.target.value.toUpperCase());
                setStuError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleStudentLogin();
              }}
            />
            {stuError && <div style={{ color: 'var(--r)', fontSize: 11, marginTop: 4, textAlign: 'center' }}>{stuError}</div>}
            <div style={{ fontSize: 11, color: 'var(--s400)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
              请输入您的个人路书码以同步今日训练计划
              <br />
              <span style={{ fontSize: 10 }}>Please enter your code to sync today's session.</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => setRememberDevice(e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--p)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--s600)' }}>在本设备上保持运维状态</span>
            </label>
            <button className="stu-login-btn" onClick={handleStudentLogin}>
              开始运维 →
            </button>
          </div>
        </div>

        {/* 教练登录 */}
        <div style={{ borderTop: '1px solid var(--s100)', padding: '16px 26px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>教练登录</div>
          <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--s400)', marginTop: 2 }}>COACH LOGIN</div>
          <input
            className="inp"
            placeholder="教练码 COACH001"
            value={coachCode}
            onChange={(e) => {
              setCoachCode(e.target.value.toUpperCase());
              setCoachError('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCoachLogin();
            }}
            style={{ marginTop: 10 }}
          />
          {coachError && <div style={{ color: 'var(--r)', fontSize: 11, marginTop: 4 }}>{coachError}</div>}
          <button className="btn btn-o" style={{ width: '100%', marginTop: 8, fontSize: 13 }} onClick={handleCoachLogin}>
            进入教练台
          </button>
        </div>

        {/* 管理员 */}
        <div style={{ borderTop: '1px solid var(--s100)', padding: '14px 26px', textAlign: 'center' }}>
          <button className="btn-ghost btn" style={{ fontSize: 12, color: 'var(--s500)' }} onClick={handleAdminLogin}>
            管理员入口 Admin
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '0 0 14px' }}>
          <span style={{ fontSize: 11, color: 'var(--p)', cursor: 'pointer' }}>找不到路书码？获取帮助 Get Help</span>
        </div>
      </div>
    </div>
  );
}

// ── 教练端（保持原有结构，只补充登录验证）─────────────────────
function CoachClientSelectPage({
  onPick,
  onLogout,
  coachCode,
}: {
  onPick: (clientId: string) => void;
  onLogout: () => void;
  coachCode?: string | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState<NonNullable<Client['tier']>>('standard');
  const [newGoal, setNewGoal] = useState('');
  const [showRecruitmentCode, setShowRecruitmentCode] = useState(false);
  const [recruitmentQrUrl, setRecruitmentQrUrl] = useState('');
  const [showTodayWorkstation, setShowTodayWorkstation] = useState(true);
  type MembershipLevel = 'standard' | 'advanced' | 'professional' | 'elite';

  const genRoadCode = () => {
    const suffix = String(Math.floor(100 + Math.random() * 900));
    return `FIKA-WF${suffix}`;
  };

  const syncClientStores = (nextClients: Client[]) => {
    updateClientsCache(nextClients);
  };

  const refreshClients = () => {
    const cached = getClientsFromCache().filter((c) => c.name !== '示例客户');
    const activeClients = cached.filter((c: any) => !(c as any).deletedAt);
    const visible = coachCode ? activeClients.filter((c: any) => String(c.coachCode || '') === String(coachCode)) : activeClients;
    setClients(visible);
  };

  const readAllMergedClients = () => {
    const cached = getClientsFromCache().filter((c) => c.name !== '示例客户');
    return cached as Client[];
  };

  useEffect(() => {
    refreshClients();
  }, [coachCode]);

  useEffect(() => {
    if (!showRecruitmentCode || !coachCode) {
      setRecruitmentQrUrl('');
      return;
    }
    const link = `https://saas.fikafitness.com/survey?coach=${coachCode}`;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((data: string) => {
        setRecruitmentQrUrl(data);
      })
      .catch((e: unknown) => {
        console.error('[coach-select] recruitment qrcode generate failed', e);
      });
  }, [showRecruitmentCode, coachCode]);

  const todayStr = new Date().toLocaleDateString('zh-CN');
  const todaySessions = clients
    .map((client) => {
      const sessions = Array.isArray((client as any).sessions) ? (client as any).sessions : [];
      const todaySession = sessions.find((s: any) => s?.date && new Date(s.date).toLocaleDateString('zh-CN') === todayStr);
      return todaySession ? { client, session: todaySession } : null;
    })
    .filter(Boolean) as Array<{ client: Client; session: any }>;

  const createClient = () => {
    const all = readAllMergedClients().filter((c) => c.name !== '示例客户');
    const name = newName.trim();
    if (!name) return;
    const roadCode = genRoadCode();
    const newClient: Client = {
      id: `CL${Date.now()}`,
      name,
      roadCode: roadCode as any,
      tier: newTier,
      age: 0,
      height: 0,
      weight: 0,
      goal: '',
      injury: '',
      weeklyData: [],
      start_date: '',
      current_week: 0,
      blocks: [],
      published_blocks: [],
      plan_draft_version: 0,
      plan_published_version: 0,
      plan_updated_at: '',
      plan_published_at: '',
      sessions: [],
    };
    (newClient as any).coachCode = coachCode || '';
    syncClientStores([...all, newClient]);
    void saveClient(newClient).catch((err) => {
      console.error('[app] Failed to sync new coach client to server:', err);
    });
    refreshClients();
    setCreateOpen(false);
    setNewName('');
    setNewTier('standard');
    setNewGoal('');
  };

  const confirmDeleteClient = () => {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== '确认删除') {
      alert('请输入“确认删除”后再继续');
      return;
    }
    const all = readAllMergedClients();
    const coaches = lsGet<Array<{ code?: string; name?: string }>>('coaches', []);
    const coachName = coaches.find((c) => String(c.code || '') === String(coachCode || ''))?.name || '未知教练';
    const deletedAt = new Date().toISOString();
    const updated = all.map((c) =>
      c.id === deleteTarget.id
        ? ({
            ...c,
            deletedAt,
            deletedByCoachCode: coachCode || '',
            deletedByCoachName: coachName,
          } as Client)
        : c,
    );
    syncClientStores(updated);
    setDeleteTarget(null);
    setDeleteConfirmText('');
    refreshClients();
  };

  const markTodaySession = (clientId: string) => {
    const all = readAllMergedClients();
    const updated = all.map((c) => {
      if (c.id !== clientId) return c;
      const sessions = Array.isArray((c as any).sessions) ? (c as any).sessions : [];
      return {
        ...c,
        sessions: [
          ...sessions,
          {
            date: todayStr,
            rpe: 0,
            performance: '',
            note: '',
            price: 0,
            week: (c as any).current_week || 1,
            level: 1,
            day: '标记课程',
            duration: 0,
          },
        ],
      } as Client;
    });
    syncClientStores(updated);
    refreshClients();
  };

  const resolveMembershipLevel = (c: Client): MembershipLevel => {
    const stored = (c as any).membershipLevel as MembershipLevel | undefined;
    if (stored === 'standard' || stored === 'advanced' || stored === 'professional' || stored === 'elite') return stored;
    if (c.tier === 'ultra') return 'elite';
    if (c.tier === 'pro') return 'professional';
    return 'standard';
  };

  const getTierVisual = (level: MembershipLevel) => {
    if (level === 'elite') {
      return {
        cn: '至尊会员',
        en: 'Elite',
        key: 'elite',
        border: 'rgba(195,59,59,.36)',
        glow: 'rgba(195,59,59,.24)',
        cardBg: 'linear-gradient(152deg, rgba(255,242,244,.92), rgba(255,221,227,.8))',
        badgeBg: 'linear-gradient(140deg, rgba(226,88,95,.98), rgba(182,47,53,.94))',
        badgeBorder: 'rgba(145,31,36,.46)',
        badgeText: '#fff8f8',
        accent: '#C33B3B',
      };
    }
    if (level === 'professional') {
      return {
        cn: '专业会员',
        en: 'Professional',
        key: 'professional',
        border: 'rgba(207,122,37,.35)',
        glow: 'rgba(207,122,37,.2)',
        cardBg: 'linear-gradient(152deg, rgba(255,246,235,.92), rgba(255,230,201,.8))',
        badgeBg: 'linear-gradient(140deg, rgba(240,165,90,.98), rgba(199,113,28,.95))',
        badgeBorder: 'rgba(157,84,18,.42)',
        badgeText: '#fff9f1',
        accent: '#CF7A25',
      };
    }
    if (level === 'advanced') {
      return {
        cn: '进阶会员',
        en: 'Advanced',
        key: 'advanced',
        border: 'rgba(47,138,86,.35)',
        glow: 'rgba(47,138,86,.18)',
        cardBg: 'linear-gradient(152deg, rgba(241,251,245,.92), rgba(219,242,229,.8))',
        badgeBg: 'linear-gradient(140deg, rgba(93,191,133,.98), rgba(43,126,78,.95))',
        badgeBorder: 'rgba(35,95,61,.42)',
        badgeText: '#f7fffa',
        accent: '#2F8A56',
      };
    }
    return {
      cn: '基础会员',
      en: 'Standard',
      key: 'standard',
      border: 'rgba(36,38,45,.22)',
      glow: 'rgba(36,38,45,.14)',
      cardBg: 'linear-gradient(152deg, rgba(248,249,253,.9), rgba(233,237,245,.8))',
      badgeBg: 'linear-gradient(140deg, rgba(164,171,190,.95), rgba(112,121,147,.94))',
      badgeBorder: 'rgba(91,99,124,.45)',
      badgeText: '#f5f7fb',
      accent: '#24262D',
    };
  };

  return (
    <div className="coach-content" style={{ padding: 20 }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div className="logo" style={{ fontSize: 20 }}>
            <div>
              <span className="logo-fi">Fi</span>
              <span className="logo-ka">KA</span>
            </div>
            <div className="logo-sub">Coach Pro · Select Client</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {coachCode && (
              <button
                className="btn btn-o"
                style={{ fontSize: 12 }}
                onClick={() => setShowRecruitmentCode(true)}
                type="button"
              >
                招募码 QR
              </button>
            )}
            <button className="btn btn-o" style={{ fontSize: 12 }} onClick={() => setCreateOpen(true)} type="button">
              + 新增客户
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onLogout} type="button">
              退出
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, position: 'relative', padding: 6, overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => setShowTodayWorkstation((v) => !v)}
              style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 14,
                fontWeight: 700,
                color: '#1f2435',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{showTodayWorkstation ? '▾' : '▸'}</span>
                • TODAY'S WORKSTATION（今日工作台）
              </div>
              {todaySessions.length > 0 && (
                <div style={{
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: '#e3f2fd',
                  color: '#1565c0',
                  fontSize: 11,
                  fontWeight: 700,
                }}>
                  {todaySessions.length}
                </div>
              )}
            </button>

            {showTodayWorkstation && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {todaySessions.length === 0 ? (
                  <div style={{
                    padding: 16,
                    borderRadius: 10,
                    border: '1px solid rgba(216,221,236,.75)',
                    background: 'rgba(255,255,255,.55)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      今日暂无课程 · 可手动标记今天上课的客户
                    </div>
                    {clients.map((client) => (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => markTodaySession(client.id)}
                        style={{
                          padding: '8px 12px',
                          borderRadius: 8,
                          border: '1px solid rgba(216,221,236,.75)',
                          background: 'rgba(255,255,255,.55)',
                          color: '#475569',
                          fontSize: 12,
                          cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        标记 {client.name} 今日上课
                      </button>
                    ))}
                  </div>
                ) : (
                  todaySessions.map(({ client, session }) => (
                    <div
                      key={client.id}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid rgba(216,221,236,.75)',
                        background: 'rgba(255,255,255,.55)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2435' }}>{client.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>今日课程：{session.day || '训练课'}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {clients.length === 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, color: '#68708b' }}>当前没有客户，先点右上角“新增客户”。下方是卡片预览样式：</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
                {[
                  { id: 'preview-1', name: '客户预览 A', level: 'standard' as MembershipLevel },
                  { id: 'preview-2', name: '客户预览 B', level: 'advanced' as MembershipLevel },
                  { id: 'preview-3', name: '客户预览 C', level: 'professional' as MembershipLevel },
                  { id: 'preview-4', name: '客户预览 D', level: 'elite' as MembershipLevel },
                ].map((c) => {
                  const tierVisual = getTierVisual(c.level);
                  return (
                    <div
                      key={c.id}
                      className={`coach-client-card tier-${tierVisual.key}`}
                      style={{
                        borderRadius: 16,
                        border: `1px solid ${tierVisual.border}`,
                        background: tierVisual.cardBg,
                        boxShadow: `0 10px 24px ${tierVisual.glow}, inset 0 1px 0 rgba(255,255,255,.68)`,
                        padding: 14,
                        textAlign: 'left',
                        opacity: .9,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: '#23293f' }}>{c.name}</div>
                        <span className="coach-tier-badge" style={{ fontSize: 10, fontWeight: 800, color: tierVisual.badgeText, background: tierVisual.badgeBg, border: `1px solid ${tierVisual.badgeBorder}`, borderRadius: 999, padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 4px 10px rgba(25,32,58,.18)' }}>
                          {tierVisual.cn} / {tierVisual.en}
                        </span>
                      </div>
                      <div style={{ marginTop: 10, borderRadius: 12, background: 'rgba(255,255,255,.54)', border: '1px solid rgba(255,255,255,.72)', padding: '8px 10px', fontSize: 12, color: '#4f566f', lineHeight: 1.5 }}>
                        训练目标展示区域
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { k: '路书码', v: 'FIKA-WF000' },
                          { k: '周期', v: '12周' },
                          { k: '当前周', v: 'Week 1' },
                          { k: '单次', v: '0 Sessions' },
                        ].map((item) => (
                          <div key={item.k} style={{ borderRadius: 10, padding: '8px 9px', background: 'rgba(255,255,255,.48)', border: '1px solid rgba(255,255,255,.72)' }}>
                            <div style={{ fontSize: 10, color: '#7b839b', letterSpacing: '.08em' }}>{item.k}</div>
                            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: tierVisual.accent }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
              {clients.map((c) => {
                const level = resolveMembershipLevel(c);
                const tierVisual = getTierVisual(level);
                const cycleWeeks = (c as any).weeks_total || (c as any).weeks || Math.max(4, (c.blocks || []).length * 4);
                const sessionsCount = (c.sessions || []).length;
                const ltvScore = typeof c.ltv_score === 'number' ? c.ltv_score : calcLtvScore(c);
                const ltvTag = ltvScore >= 70 ? '高价值' : (ltvScore < 30 && sessionsCount > 10 ? '流失风险' : '');
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onPick(c.id)}
                    className={`coach-client-card tier-${tierVisual.key}`}
                    style={{
                      borderRadius: 16,
                      border: `1px solid ${tierVisual.border}`,
                      background: tierVisual.cardBg,
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      padding: 14,
                      textAlign: 'left',
                      boxShadow: `0 10px 24px ${tierVisual.glow}, inset 0 1px 0 rgba(255,255,255,.72)`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#23293f' }}>{c.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ltvTag && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: 10,
                              fontWeight: 900,
                              borderRadius: 999,
                              padding: '4px 8px',
                              border: ltvTag === '高价值' ? '1px solid rgba(217,119,6,.5)' : '1px solid rgba(220,38,38,.5)',
                              background: ltvTag === '高价值' ? 'rgba(245,158,11,.18)' : 'rgba(220,38,38,.14)',
                              color: ltvTag === '高价值' ? '#b45309' : '#b91c1c',
                            }}
                          >
                            {ltvTag}
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, color: tierVisual.badgeText, background: tierVisual.badgeBg, border: `1px solid ${tierVisual.badgeBorder}`, borderRadius: 999, padding: '4px 9px', letterSpacing: '.08em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.36), 0 4px 10px rgba(25,32,58,.2)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,.9)', boxShadow: '0 0 6px rgba(255,255,255,.75)' }} />
                          {(c.tier || 'standard').toUpperCase()}
                        </span>
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(c);
                            setDeleteConfirmText('');
                          }}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 800,
                            color: '#B42318',
                            borderRadius: 999,
                            border: '1px solid rgba(180,35,24,.35)',
                            background: 'rgba(255,236,233,.86)',
                            padding: '4px 8px',
                            cursor: 'pointer',
                          }}
                        >
                          删除
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, borderRadius: 12, background: 'rgba(255,255,255,.56)', border: '1px solid rgba(255,255,255,.74)', padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#7b839b', letterSpacing: '.08em', textTransform: 'uppercase' }}>目标 / Goal</div>
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: '#37405a', lineHeight: 1.45, minHeight: 36 }}>
                        {c.goal || '未设置目标'}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { k: '路书码', v: String((c as any).roadCode || c.id) },
                        { k: '周期', v: `${cycleWeeks}周` },
                        { k: '当前周', v: `Week ${c.current_week || 1}` },
                        { k: '单次', v: `${(c.sessions || []).length} Sessions` },
                      ].map((item) => (
                        <div key={item.k} style={{ borderRadius: 10, padding: '8px 9px', background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.75)' }}>
                          <div style={{ fontSize: 10, color: '#7b839b', letterSpacing: '.08em' }}>{item.k}</div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: tierVisual.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {showRecruitmentCode && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999,
              }}
              onClick={() => setShowRecruitmentCode(false)}
            >
              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  padding: 24,
                  maxWidth: 400,
                  textAlign: 'center',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>招募二维码</div>
                {recruitmentQrUrl && (
                  <div style={{ marginBottom: 16 }}>
                    <img src={recruitmentQrUrl} alt="recruitment qr" style={{ width: 200, height: 200, display: 'block', margin: '0 auto' }} />
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>长按保存二维码分享给客户</div>
                <button
                  type="button"
                  onClick={() => setShowRecruitmentCode(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: '#5a41d6',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {createOpen && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 80,
                background: 'rgba(13,16,28,.42)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 18,
              }}
              onClick={() => setCreateOpen(false)}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 420,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,.34)',
                  background: 'linear-gradient(150deg, rgba(255,255,255,.18), rgba(214,224,255,.14))',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 20px 40px rgba(8,10,20,.35)',
                  padding: 14,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f4f7ff' }}>新增客户</div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(223,231,255,.82)' }}>填写姓名 / 档位 / 目标</div>

                <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
                  <input
                    className="inp"
                    placeholder="客户姓名"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <select className="inp" value={newTier} onChange={(e) => setNewTier(e.target.value as NonNullable<Client['tier']>)}>
                    <option value="standard">Standard</option>
                    <option value="pro">Pro</option>
                    <option value="ultra">Elite</option>
                  </select>
                  <textarea
                    className="inp"
                    placeholder="训练目标"
                    value={newGoal}
                    onChange={(e) => setNewGoal(e.target.value)}
                    rows={3}
                    style={{ resize: 'none', paddingTop: 8 }}
                  />
                </div>

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost" type="button" onClick={() => setCreateOpen(false)}>取消</button>
                  <button className="btn btn-o" type="button" onClick={createClient}>创建</button>
                </div>
              </div>
            </div>
          )}

          {deleteTarget && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 85,
                background: 'rgba(13,16,28,.5)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 18,
              }}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmText('');
              }}
            >
              <div
                style={{
                  width: '100%',
                  maxWidth: 420,
                  borderRadius: 16,
                  border: '1px solid rgba(255,255,255,.34)',
                  background: 'linear-gradient(150deg, rgba(255,255,255,.2), rgba(241,208,208,.16))',
                  backdropFilter: 'blur(14px)',
                  WebkitBackdropFilter: 'blur(14px)',
                  boxShadow: '0 20px 40px rgba(8,10,20,.35)',
                  padding: 14,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f4f7ff' }}>删除客户卡片</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(223,231,255,.82)', lineHeight: 1.5 }}>
                  将从教练端客户卡片中移除：{deleteTarget.name}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#ff9f9f' }}>
                  请输入 <span style={{ color: '#EF4444', fontWeight: 900 }}>确认删除</span> 后继续
                </div>
                <input
                  className="inp"
                  style={{ marginTop: 8 }}
                  placeholder="输入：确认删除"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                />
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setDeleteTarget(null);
                      setDeleteConfirmText('');
                    }}
                  >
                    取消
                  </button>
                  <button className="btn" type="button" style={{ background: '#B42318', color: '#fff' }} onClick={confirmDeleteClient}>
                    确认删除
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <style>{`
          .coach-client-card {
            position: relative;
            overflow: hidden;
            transition: transform .24s ease, box-shadow .26s ease;
          }

          .coach-client-card:hover {
            transform: translateY(-2px);
          }

          .coach-client-card::before {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: inherit;
            border: 1px solid transparent;
            opacity: 0;
          }

          .coach-client-card.tier-advanced::before {
            opacity: .95;
            border-color: rgba(47,138,86,.48);
            animation: tier-breath-green 2.4s ease-in-out infinite;
          }

          .coach-client-card.tier-professional::before {
            opacity: .95;
            border-color: rgba(207,122,37,.52);
            animation: tier-breath-amber 2.2s ease-in-out infinite;
          }

          .coach-client-card.tier-elite::before {
            opacity: 1;
            border-color: rgba(195,59,59,.58);
            animation: tier-breath-elite 2.1s ease-in-out infinite;
          }

          .coach-client-card.tier-elite::after {
            content: '';
            position: absolute;
            top: -26%;
            left: -48%;
            width: 44%;
            height: 160%;
            transform: rotate(15deg);
            pointer-events: none;
            background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,216,158,.72), rgba(255,255,255,0));
            animation: tier-gold-shimmer 2.8s ease-in-out infinite;
          }

          .coach-tier-badge {
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }

          @keyframes tier-breath-green {
            0%, 100% { box-shadow: 0 0 0 0 rgba(47,138,86,.08), inset 0 0 0 1px rgba(47,138,86,.32); }
            50% { box-shadow: 0 0 0 6px rgba(47,138,86,.14), inset 0 0 0 1px rgba(47,138,86,.48); }
          }

          @keyframes tier-breath-amber {
            0%, 100% { box-shadow: 0 0 0 0 rgba(207,122,37,.08), inset 0 0 0 1px rgba(207,122,37,.32); }
            50% { box-shadow: 0 0 0 6px rgba(207,122,37,.14), inset 0 0 0 1px rgba(207,122,37,.48); }
          }

          @keyframes tier-breath-elite {
            0%, 100% { box-shadow: 0 0 0 0 rgba(195,59,59,.08), inset 0 0 0 1px rgba(195,59,59,.4); }
            50% { box-shadow: 0 0 0 7px rgba(195,59,59,.14), inset 0 0 0 1px rgba(195,59,59,.56); }
          }

          @keyframes tier-gold-shimmer {
            0% { left: -54%; opacity: 0; }
            18% { opacity: .82; }
            42% { opacity: .26; }
            100% { left: 122%; opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}

function CoachPortal({
  display,
  onLogout,
  coachCode,
}: {
  display: 'block' | 'none';
  onLogout: () => void;
  coachCode?: string | null;
}) {
  const [tab, setTab] = useState<CoachTab>('clients');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionClient, setSessionClient] = useState<Client | null>(null);

  const openSession = (client: Client) => {
    setSessionClient(client);
    setSessionOpen(true);
  };

  const canAccessClient = (clientId: string | null) => {
    if (!clientId) return false;
    const target = getClientsFromCache().find((c) => c.id === clientId);
    if (!target) return false;
    if (!coachCode) return true;
    return String((target as any).coachCode || '') === String(coachCode);
  };

  if (sessionOpen && sessionClient) {
    return (
      <CoachSessionView
        client={sessionClient}
        onClose={() => setSessionOpen(false)}
        onRecordSession={async (session) => {
          // 更新教练端客户数据
          setSessionClient((prev) => (prev ? { ...prev, sessions: [...(prev.sessions || []), session] } : prev));
          
          // 同步到全局客户数据，确保学生端能看到
          const allClients = JSON.parse(localStorage.getItem('fika_clients') || '[]');
          const clientIndex = allClients.findIndex((c: any) => c.id === sessionClient?.id || c.roadCode === sessionClient?.roadCode);
          if (clientIndex !== -1) {
            allClients[clientIndex] = {
              ...allClients[clientIndex],
              sessions: [...(allClients[clientIndex].sessions || []), session],
            };
            localStorage.setItem('fika_clients', JSON.stringify(allClients));
          }

          // 同时更新教练端的客户数据存储
          const coachClients = JSON.parse(localStorage.getItem('fika_coach_clients_v1') || '[]');
          const coachClientIndex = coachClients.findIndex((c: any) => c.id === sessionClient?.id || c.roadCode === sessionClient?.roadCode);
          if (coachClientIndex !== -1) {
            coachClients[coachClientIndex] = {
              ...coachClients[coachClientIndex],
              sessions: [...(coachClients[coachClientIndex].sessions || []), session],
            };
            localStorage.setItem('fika_coach_clients_v1', JSON.stringify(coachClients));
          }
        }}
      />
    );
  }

  return (
    <div id="pg-coach" className="z1" style={{ display }}>
      {!selectedClientId ? (
        <CoachClientSelectPage
          onPick={(id) => {
            if (!canAccessClient(id)) return;
            setSelectedClientId(id);
            setTab('clients');
          }}
          onLogout={onLogout}
          coachCode={coachCode}
        />
      ) : (
      <CoachShell
        tab={tab}
        onTab={setTab}
        onLogout={onLogout}
        onBackHome={() => {
          setSelectedClientId(null);
          setTab('clients');
        }}
      >
        {tab === 'clients' ? (
          <ClientsPage
            selectedClientId={selectedClientId}
            onSelect={(id) => {
              if (!canAccessClient(id)) return;
              setSelectedClientId(id);
              setTab('planning');
            }}
            coachCode={coachCode}
          />
        ) : tab === 'planning' ? (
          <PlanningPage
            selectedClientId={selectedClientId}
            onSelectClient={(id) => {
              if (!canAccessClient(id)) return;
              setSelectedClientId(id);
            }}
            onOpenSession={(c) => openSession(c)}
          />
        ) : tab === 'finance' ? (
          <FinancePage selectedClientId={selectedClientId} />
        ) : tab === 'heartrate' ? (
          <HeartRatePage selectedClientId={selectedClientId} />
        ) : (
          <DietPage selectedClientId={selectedClientId} />
        )}
      </CoachShell>
      )}
    </div>
  );
}

// ── App 根组件 ─────────────────────────────────────────────────
function App() {
  const [page, setPage] = useState<Page>('landing');
  const [currentStudent, setCurrentStudent] = useState<any>(null);
  const [currentCoachCode, setCurrentCoachCode] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const persistSession = (session: SessionData, remember: boolean) => {
    if (remember) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      localStorage.removeItem(SESSION_KEY);
    }
  };

  const persistLastLogin = (patch: Partial<LastLoginData>, remember: boolean) => {
    const base: LastLoginData = { remember };
    try {
      const prev = JSON.parse(localStorage.getItem(LAST_LOGIN_KEY) || '{}') as LastLoginData;
      const next = { ...base, ...prev, ...patch, remember };
      localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify(next));
    } catch {
      localStorage.setItem(LAST_LOGIN_KEY, JSON.stringify({ ...base, ...patch }));
    }
  };

  // 初始化数据 + 自动登录恢复
  useEffect(() => {
    (async () => {
      try {
        setIsInitializing(true);

        // 从服务器拉取客户和教练数据
        await Promise.all([
          loadClients().catch((err: any) => {
            console.warn('[app] Failed to load clients:', err);
          }),
          loadCoaches().catch((err: any) => {
            console.warn('[app] Failed to load coaches:', err);
          }),
        ]);

        console.log('[app] Initialized clients and coaches from server');
      } catch (error) {
        console.warn('[app] Error during initialization:', error);
      } finally {
        setIsInitializing(false);
      }

      // 自动登录恢复
      try {
        const saved = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
        if (saved) {
          const sess = JSON.parse(saved) as SessionData;
          if (sess.role === 'student' && (sess.clientId || sess.roadCode)) {
            const clients = lsGet<any[]>('clients', []);
            let client = clients.find((c) => c.id === (sess as any).clientId);
            if (!client && (sess as any).roadCode) {
              client = clients.find((c) => String(c.roadCode || '').toUpperCase() === String((sess as any).roadCode).toUpperCase());
            }
            if (!client && (sess as any).roadCode) {
              const code = String((sess as any).roadCode).toUpperCase();
              client = {
                id: 'DEMO_' + code,
                roadCode: code,
                name: code,
                gender: 'male',
                age: 25,
                height: 170,
                weight: 65,
                tier: 'pro',
                goal: '功能性力量',
                weeks: 15,
                injury: '',
                coachCode: 'COACH001',
                blocks: [],
                sessions: [],
                weeklyData: [],
                dietPlans: [],
              };
            }
            if (client) {
              setCurrentStudent(client);
              setPage('student');
            }
          } else if (sess.role === 'coach' && sess.coachCode) {
            setCurrentCoachCode(sess.coachCode);
            setPage('coach');
          } else if (sess.role === 'admin') {
            setPage('admin');
          }
        }
      } catch {
        // ignore
      }

      // Load initial data from server
      try {
        await loadClients();
        await loadCoaches();
        console.log('[app] Initial data loaded from server');
      } catch (error) {
        console.warn('[app] Failed to load initial data from server:', error);
      }
    })();

    initDemoData();
  }, []);

  // 学员登录 - 强制从服务器拉取
  const handleStudentLogin = async (roadCode: string, remember: boolean): Promise<boolean> => {
    try {
      // 清空本地缓存，强制从服务器拉取
      localStorage.removeItem('fika_current_client');
      sessionStorage.removeItem('fika_current_client');
      
      const isProduction = import.meta.env.PROD;
      const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '/api');
      const apiUrl = (path: string) => (apiBase ? String(apiBase).replace(/\/$/, '') + path : path);
      
      console.log('[app] Force fetching student data from server for roadCode:', roadCode);
      
      // 从服务器拉取所有客户端数据
      const response = await fetch(apiUrl('/api/clients'));
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const allClients = await response.json();
      console.log('[app] Fetched', allClients.length, 'clients from server');
      
      // 路书码主键化匹配 - 大小写敏感检查
      const normalizedRoadCode = String(roadCode).trim().toUpperCase();
      let client = allClients.find((c: any) => {
        const dbRoadCode = String(c.roadCode || '').trim().toUpperCase();
        return dbRoadCode === normalizedRoadCode;
      });
      
      if (!client) {
        console.warn('[app] No client found for roadCode:', normalizedRoadCode);
        console.log('[app] Available roadCodes:', allClients.map((c: any) => String(c.roadCode || '').trim().toUpperCase()));
        return false;
      }
      
      // 设置客户端数据
      setCurrentStudent(client);
      lsSet('current_client', client);
      persistSession({ role: 'student', clientId: client.id, roadCode }, remember);
      persistLastLogin({ roadCode }, remember);
      setPage('student');
      
      console.log('[app] Student successfully logged in from server:', {
        roadCode: normalizedRoadCode,
        clientId: client.id,
        clientName: client.name
      });
      
      return true;
      
    } catch (error) {
      console.error('[app] Failed to fetch student data from server:', error);
      return false;
    }
  };

  // 教练登录
  const handleCoachLogin = (coachCode: string, remember: boolean): boolean => {
    const latestCoaches = getCoachesFromCache();
    const legacyCoaches = lsGet<Array<{ code: string; name: string }>>('coaches', []);
    const coaches = latestCoaches.length > 0 ? latestCoaches : legacyCoaches;
    const coach = coaches.find((c) => String(c.code || '').toUpperCase() === coachCode);
    if (!coach) return false;
    persistSession({ role: 'coach', coachCode: coach.code, coachName: coach.name }, remember);
    persistLastLogin({ coachCode: coach.code }, remember);
    setCurrentCoachCode(coach.code);
    setPage('coach');
    return true;
  };

  // 管理员登录
  const handleAdminLogin = (pass: string, remember: boolean): boolean => {
    if (pass !== 'fika2024') return false;
    persistSession({ role: 'admin' }, remember);
    persistLastLogin({}, remember);
    setPage('admin');
    return true;
  };

  // 退出
  const handleLogout = () => {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setCurrentStudent(null);
    setCurrentCoachCode(null);
    setPage('landing');
  };

  const display = useMemo(
    () => ({
      landing: page === 'landing' ? ('flex' as const) : ('none' as const),
      student: page === 'student' ? ('block' as const) : ('none' as const),
      coach: page === 'coach' ? ('block' as const) : ('none' as const),
      admin: page === 'admin' ? ('block' as const) : ('none' as const),
    }),
    [page],
  );

  // 等待初始化完成
  if (isInitializing) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#f5f5f5' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', marginBottom: '20px', color: '#666' }}>正在加载数据...</div>
          <div style={{ width: '40px', height: '40px', border: '4px solid #ddd', borderTop: '4px solid #4CAF50', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto' }} />
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <>
      <Background />

      {/* 登录页 */}
      <LandingPage
        display={display.landing}
        onStudentLogin={handleStudentLogin}
        onCoachLogin={handleCoachLogin}
        onAdminLogin={handleAdminLogin}
      />

      {/* 学员端 */}
      <StudentPortal display={display.student} onLogout={handleLogout} client={currentStudent || undefined} />

      {/* 教练端 */}
      <CoachPortal display={display.coach} onLogout={handleLogout} coachCode={currentCoachCode} />

      {/* 管理端 */}
      <AdminPortal display={display.admin} onLogout={handleLogout} />
    </>
  );
}

export default App;
