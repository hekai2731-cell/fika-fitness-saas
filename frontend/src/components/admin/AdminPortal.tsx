/**
 * AdminPortal.tsx
 * 完整管理端：总览 / 路书码 / 教练管理 / 客户管理 / 财务 / AI开关
 * 放到 frontend/src/components/admin/AdminPortal.tsx
 */

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { loadCoaches, saveCoaches, getCoachesFromCache, updateClientsCache } from '@/lib/store';

// ── 类型 ─────────────────────────────────────────────────────
interface Session {
  id: string;
  date: string;
  day?: string;
  rpe?: number;
  duration?: number;
  price?: number;
  note?: string;
}

interface WeeklyData {
  date: string;
  weight?: number;
  bf?: number;
  paid?: number;
  attendance?: number;
}

interface Client {
  id: string;
  roadCode?: string;
  name: string;
  gender?: string;
  age?: number;
  height?: number;
  weight?: number;
  tier?: string;
  goal?: string;
  weeks?: number;
  injury?: string;
  coachCode?: string;
  coachName?: string;
  blocks?: Block[];
  sessions?: Session[];
  weeklyData?: WeeklyData[];
  dietPlans?: DietPlan[];
  deletedAt?: string;
  deletedByCoachCode?: string;
  deletedByCoachName?: string;
  membershipLevel?: string;
  bodyMetrics?: Record<string, number | undefined>;
  assessments?: Array<Record<string, unknown>>;
}

interface DietPlan {
  title: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  period?: string;
  notes?: string;
}

interface Block {
  id: string;
  title: string;
  weeks: Week[];
}

interface Week {
  id: string;
  num: number;
  days: Day[];
}

interface Day {
  id: string;
  day: string;
  plan?: Plan | null;
}

interface Plan {
  modules: Module[];
}

interface Module {
  module_name: string;
  exercises: Exercise[];
}

interface Exercise {
  name: string;
  sets: number;
  reps: string;
}

interface Coach {
  code: string;
  name: string;
  specialties?: string[];
}

interface AiSettings {
  training_session?: boolean;
  training_week?: boolean;
  training_ultra?: boolean;
  nutrition_phase?: boolean;
  nutrition_daily?: boolean;
}

// ── LocalStorage 工具 ────────────────────────────────────────
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

const COACH_CLIENTS_KEY = 'fika_coach_clients_v1';

function readCoachClients(): Client[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(COACH_CLIENTS_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as Client[]) : [];
  } catch {
    return [];
  }
}

function loadMergedClientsFromStores(): Client[] {
  const adminClients = lsGet<Client[]>('clients', []);
  const coachClients = readCoachClients();
  const map = new Map<string, Client>();
  coachClients.forEach((c) => map.set(c.id, c));
  adminClients.forEach((c) => map.set(c.id, { ...(map.get(c.id) || {}), ...c } as Client));
  return Array.from(map.values());
}

function persistClientsToStores(clients: Client[]) {
  updateClientsCache(clients as any);
  lsSet('clients', clients);
  localStorage.setItem(COACH_CLIENTS_KEY, JSON.stringify(clients));
  window.dispatchEvent(new Event('fika:clients-updated'));
}

async function syncClientToServer(client: Client) {
  const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(client),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function softDeleteClientOnServer(client: Client, deletedByCoachCode: string, deletedByCoachName: string) {
  const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deletedByCoachCode, deletedByCoachName }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function restoreClientOnServer(client: Client) {
  const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}/restore`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function hardDeleteClientOnServer(client: Client) {
  const res = await fetch(`/api/clients/${encodeURIComponent(client.id)}/hard`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sanitizeCodeInput(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 15);
}

function generateRandomCode(existing: Set<string>, length = 6): string {
  for (let i = 0; i < 100; i += 1) {
    let code = '';
    for (let j = 0; j < length; j += 1) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!existing.has(code)) return code;
  }
  return `${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z0-9]/g, '').slice(0, length).padEnd(length, 'A');
}

// ── 工具函数 ─────────────────────────────────────────────────
function tierLabel(t?: string) {
  return t === 'ultra' ? 'Ultra 高级' : t === 'pro' ? 'Pro 进阶' : 'Standard 基础';
}

function calcBalance(c: Client) {
  const paid = (c.weeklyData || []).reduce((s, w) => s + (w.paid || 0), 0);
  const spent = (c.sessions || []).reduce((s, se) => s + (se.price || 328), 0);
  return paid - spent;
}

// ── 通用弹窗 ─────────────────────────────────────────────────
interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}

function Modal({ title, children, onClose, footer }: ModalProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(0,0,0,.5)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,.15)',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--s100)' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 13 }}>{children}</div>
        {footer && (
          <div
            style={{
              padding: '14px 24px',
              borderTop: '1px solid var(--s100)',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '.1em',
        textTransform: 'uppercase',
        color: 'var(--s500)',
        display: 'block',
        marginBottom: 5,
      }}
    >
      {children}
    </div>
  );
}

// ── 总览 Tab ─────────────────────────────────────────────────
interface DashboardData {
  totalClients: number;
  totalCoaches: number;
  totalRevenue: number;
  recentSessions: number;
  recentSessionList: Array<{ clientId?: string; date?: string; duration?: number; rpe?: number; note?: string }>;
}

function OverviewTab({ clients, coaches }: { clients: Client[]; coaches: Coach[] }) {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [lastSessionMap, setLastSessionMap] = useState<Map<string, string>>(new Map());
  const [churnLoading, setChurnLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/dashboard');
        if (res.ok) setDashboardData(await res.json() as DashboardData);
      } catch (e) {
        console.error('[OverviewTab] dashboard fetch failed:', e);
      } finally {
        setDashLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/sessions?limit=200');
        if (res.ok) {
          const sessions: Array<{ clientId?: string; date?: string }> = await res.json();
          const map = new Map<string, string>();
          sessions.forEach(s => {
            if (!s.clientId || !s.date) return;
            const prev = map.get(s.clientId);
            if (!prev || s.date > prev) map.set(s.clientId, s.date);
          });
          setLastSessionMap(map);
        }
      } catch (e) {
        console.error('[OverviewTab] churn sessions fetch failed:', e);
      } finally {
        setChurnLoading(false);
      }
    };
    load();
  }, []);

  const totalBalance = clients.reduce((s, c) => s + calcBalance(c), 0);
  const lowBalanceClients = clients.filter((c) => calcBalance(c) < 500);

  const dash = dashboardData;
  const ph = '--';

  const recentActivity = dash?.recentSessionList
    ? dash.recentSessionList.map(s => ({
        ...s,
        clientName: clients.find(c => c.id === s.clientId)?.name || s.clientId || '未知客户',
      }))
    : clients
        .flatMap((c) => (c.sessions || []).map((s) => ({ ...s, clientName: c.name })))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 8);

  return (
    <div>
      {/* KPI */}
      <div className="admin-kpi-grid">
        {[
          { label: '总客户', value: dashLoading ? ph : (dash?.totalClients ?? clients.length) + '人', color: 'var(--p)' },
          { label: '教练数', value: dashLoading ? ph : (dash?.totalCoaches ?? coaches.length) + '人', color: 'var(--b)' },
          { label: '总收入', value: dashLoading ? ph : '¥' + (dash?.totalRevenue ?? 0).toLocaleString(), color: 'var(--g)' },
          { label: '总余额', value: '¥' + totalBalance.toLocaleString(), color: 'var(--a)' },
          { label: '总课次', value: dashLoading ? ph : (dash?.recentSessions ?? 0) + '节', color: 'var(--r)' },
        ].map((kpi) => (
          <div key={kpi.label} className="card-sm kpi-card" style={{ borderLeft: `3px solid ${kpi.color}` }}>
            <div className="lbl">{kpi.label}</div>
            <div className="kpi-val" style={{ color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 余额预警 */}
        <div className="card-sm" style={{ padding: 16 }}>
          <div className="lbl" style={{ marginBottom: 10 }}>
            余额状态
          </div>
          {clients.map((c) => {
            const bal = calcBalance(c);
            return (
              <div
                key={c.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 0',
                  borderBottom: '1px solid var(--s100)',
                }}
              >
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                  <span className="badge bp" style={{ fontSize: 9, marginLeft: 6 }}>
                    {tierLabel(c.tier)}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: bal < 500 ? 'var(--r)' : bal < 2000 ? 'var(--a)' : 'var(--g)',
                  }}
                >
                  ¥{bal.toLocaleString()}
                </span>
              </div>
            );
          })}
          {lowBalanceClients.length > 0 && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                background: 'var(--r2)',
                borderRadius: 8,
                fontSize: 11,
                color: '#991b1b',
              }}
            >
              ⚠️ {lowBalanceClients.map((c) => c.name).join('、')} 余额不足
            </div>
          )}
        </div>

        {/* 最近动态 */}
        <div className="card-sm" style={{ padding: 16 }}>
          <div className="lbl" style={{ marginBottom: 10 }}>
            最近动态
          </div>
          {recentActivity.length > 0 ? (
            recentActivity.map((s, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--s100)',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--s500)' }}>
                  {s.clientName} · {s.date}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500 }}>{s.duration || 0}min</span>
              </div>
            ))
          ) : (
            <div style={{ color: 'var(--s400)', fontSize: 12, padding: '8px 0' }}>暂无动态</div>
          )}
        </div>
      </div>

      {/* 流失预警 */}
      {(() => {
        const now = Date.now();
        const activeClients = clients.filter(c => !(c as any).deletedAt);
        const atRisk = activeClients
          .map(c => {
            const lastDate = lastSessionMap.get(c.id);
            const diffDays = lastDate
              ? Math.floor((now - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
              : null;
            return { c, diffDays };
          })
          .filter(({ diffDays }) => diffDays === null || diffDays > 14)
          .sort((a, b) => (b.diffDays ?? 9999) - (a.diffDays ?? 9999));

        return (
          <div className="card-sm" style={{ padding: 16, marginTop: 0 }}>
            <div className="lbl" style={{ marginBottom: 10 }}>流失预警</div>
            {churnLoading ? (
              <div style={{ fontSize: 12, color: 'var(--s400)', padding: '4px 0' }}>加载中...</div>
            ) : atRisk.length === 0 ? (
              <div style={{
                fontSize: 12, color: '#15803d', padding: '8px 10px',
                background: '#f0fdf4', borderRadius: 8,
              }}>✓ 所有客户均在 14 天内有上课记录</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {atRisk.map(({ c, diffDays }) => (
                  <div
                    key={c.id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '7px 0', borderBottom: '1px solid var(--s100)',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>
                      <span className="badge bp" style={{ fontSize: 9, marginLeft: 6 }}>{tierLabel(c.tier)}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--r)', whiteSpace: 'nowrap' }}>
                      {diffDays === null ? '从未上课' : `${diffDays} 天未上课`}
                    </span>
                  </div>
                ))}
                <div style={{
                  marginTop: 8, padding: '8px 10px',
                  background: 'var(--r2)', borderRadius: 8,
                  fontSize: 11, color: '#991b1b',
                }}>
                  ⚠️ {atRisk.length} 位客户超过 14 天未上课，建议主动跟进
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── 路书码 Tab ────────────────────────────────────────────────
function CodesTab({
  clients,
  coaches,
  onClientsChange,
  onCoachesChange,
}: {
  clients: Client[];
  coaches: Coach[];
  onClientsChange: (clients: Client[]) => void;
  onCoachesChange: (coaches: Coach[]) => void;
}) {
  const [clientCodeDrafts, setClientCodeDrafts] = useState<Record<string, string>>({});
  const [coachCodeDrafts, setCoachCodeDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    clients.forEach((c) => {
      next[c.id] = String(c.roadCode || c.id || '');
    });
    setClientCodeDrafts(next);
  }, [clients]);

  useEffect(() => {
    const next: Record<string, string> = {};
    coaches.forEach((c) => {
      next[c.code] = String(c.code || '');
    });
    setCoachCodeDrafts(next);
  }, [coaches]);

  const saveClientCode = (clientId: string) => {
    const nextCode = sanitizeCodeInput(clientCodeDrafts[clientId] || '');
    if (!nextCode) {
      alert('路书码不能为空');
      return;
    }
    const duplicate = clients.find((c) => c.id !== clientId && String(c.roadCode || '').toUpperCase() === nextCode);
    if (duplicate) {
      alert('路书码重复，请使用不同编码');
      return;
    }
    const updated = clients.map((c) => (c.id === clientId ? { ...c, roadCode: nextCode } : c));
    setClientCodeDrafts((prev) => ({ ...prev, [clientId]: nextCode }));
    onClientsChange(updated);
    const changedClient = updated.find((c) => c.id === clientId);
    if (changedClient) {
      void syncClientToServer(changedClient).catch((err) => {
        console.error('[AdminPortal] Failed to sync client code change:', err);
      });
    }
  };

  const saveCoachCode = (oldCode: string) => {
    const nextCode = sanitizeCodeInput(coachCodeDrafts[oldCode] || '');
    if (!nextCode) {
      alert('教练码不能为空');
      return;
    }
    const duplicate = coaches.find((ch) => ch.code !== oldCode && String(ch.code).toUpperCase() === nextCode);
    if (duplicate) {
      alert('教练码重复，请使用不同编码');
      return;
    }
    const updatedCoaches = coaches.map((ch) => (ch.code === oldCode ? { ...ch, code: nextCode } : ch));
    const updatedClients = clients.map((c) =>
      String(c.coachCode || '') === String(oldCode) ? { ...c, coachCode: nextCode } : c,
    );
    setCoachCodeDrafts((prev) => {
      const next = { ...prev };
      delete next[oldCode];
      next[nextCode] = nextCode;
      return next;
    });
    onCoachesChange(updatedCoaches);
    onClientsChange(updatedClients);
    updatedClients
      .filter((c) => String(c.coachCode || '') === String(nextCode))
      .forEach((client) => {
        void syncClientToServer(client).catch((err) => {
          console.error('[AdminPortal] Failed to sync coach code remap:', err);
        });
      });
  };

  return (
    <div>
      <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--s500)' }}>
        路书码支持修改，最多 15 位（字母 + 数字）。
      </div>

      <div className="card-sm" style={{ marginBottom: 16 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--s100)' }}>
          <div className="lbl">客户路书码</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['路书码', '客户姓名', '档位', '教练', '状态'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: 'var(--s500)',
                    borderBottom: '1px solid var(--s200)',
                    background: 'var(--s50)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="inp"
                      style={{ height: 30, width: 150, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}
                      maxLength={15}
                      value={clientCodeDrafts[c.id] || ''}
                      onChange={(e) =>
                        setClientCodeDrafts((prev) => ({ ...prev, [c.id]: sanitizeCodeInput(e.target.value) }))
                      }
                    />
                    <button className="btn btn-o btn-sm" onClick={() => saveClientCode(c.id)}>
                      保存
                    </button>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>{c.name}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>
                  <span className="badge bp">{tierLabel(c.tier)}</span>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)', color: 'var(--s600)' }}>
                  {coaches.find((ch) => ch.code === c.coachCode)?.name || '未分配'}
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>
                  <span className="badge bg_">使用中</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card-sm">
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--s100)' }}>
          <div className="lbl">教练码</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {['教练码', '教练姓名', '专长', '客户数', '状态'].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '.1em',
                    textTransform: 'uppercase',
                    color: 'var(--s500)',
                    borderBottom: '1px solid var(--s200)',
                    background: 'var(--s50)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coaches.map((ch) => (
              <tr key={ch.code}>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      className="inp"
                      style={{ height: 30, width: 150, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}
                      maxLength={15}
                      value={coachCodeDrafts[ch.code] || ''}
                      onChange={(e) =>
                        setCoachCodeDrafts((prev) => ({ ...prev, [ch.code]: sanitizeCodeInput(e.target.value) }))
                      }
                    />
                    <button className="btn btn-p btn-sm" onClick={() => saveCoachCode(ch.code)}>
                      保存
                    </button>
                  </div>
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>{ch.name}</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)', color: 'var(--s600)' }}>
                  {(ch.specialties || []).join('、') || '—'}
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)', fontWeight: 600, color: 'var(--p)' }}>
                  {clients.filter((c) => c.coachCode === ch.code).length}
                </td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--s100)' }}>
                  <span className="badge bg_">正常</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}

// ── 教练管理 Tab ──────────────────────────────────────────────
function CoachesTab({
  clients,
  coaches,
  onCoachesChange,
}: {
  clients: Client[];
  coaches: Coach[];
  onCoachesChange: (coaches: Coach[]) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', specialties: '' });

  const addCoach = async () => {
    if (!form.name.trim()) return;
    const existingCodes = new Set(coaches.map((c) => String(c.code).toUpperCase()));
    const code = generateRandomCode(existingCodes, 6);
    const specialties = form.specialties.split(',').map((s) => s.trim()).filter(Boolean);
    const updated = [...coaches, { code, name: form.name, specialties }];
    onCoachesChange(updated);
    lsSet('coaches', updated);
    setShowModal(false);
    setForm({ name: '', specialties: '' });
    void fetch('/api/coaches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name: form.name, specialties }),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    }).catch((err) => {
      console.error('[AdminPortal] Failed to sync new coach:', err);
      alert('教练已在本地添加，但同步服务器失败，请检查网络后重试。');
    });
  };

  const deleteCoach = (coach: Coach) => {
    if (!window.confirm(`确认删除教练「${coach.name}」(${coach.code})？\n该教练下的客户将变为未分配状态。`)) return;
    const updated = coaches.filter((c) => c.code !== coach.code);
    onCoachesChange(updated);
    lsSet('coaches', updated);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-p btn-sm" onClick={() => setShowModal(true)}>
          新建教练
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {coaches.map((ch) => {
          const myClients = clients.filter((c) => c.coachCode === ch.code);
          return (
            <div
              key={ch.code}
              className="card-sm"
              style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg,var(--p),var(--p4))',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 16,
                  flexShrink: 0,
                }}
              >
                {ch.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{ch.name}</div>
                <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 2 }}>
                  {ch.code} · {(ch.specialties || []).join('、') || '未设置专长'}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
                  {myClients.map((c) => (
                    <span key={c.id} className="badge bp" style={{ fontSize: 9 }}>
                      {c.name}
                    </span>
                  ))}
                  {myClients.length === 0 && <span style={{ fontSize: 11, color: 'var(--s400)' }}>暂无客户</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--p)' }}>{myClients.length}</div>
                <div className="lbl">客户</div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: '#B42318', fontSize: 11 }}
                  onClick={() => deleteCoach(ch)}
                  title="删除教练"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showModal && (
        <Modal
          title="新建教练"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-o" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className="btn btn-p" onClick={addCoach}>
                创建
              </button>
            </>
          }
        >
          <div>
            <FieldLabel>教练姓名</FieldLabel>
            <input
              className="inp"
              placeholder="如：王教练"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <FieldLabel>专长（逗号分隔）</FieldLabel>
            <input
              className="inp"
              placeholder="功能性力量,减脂塑形"
              value={form.specialties}
              onChange={(e) => setForm((f) => ({ ...f, specialties: e.target.value }))}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── 客户管理 Tab ──────────────────────────────────────────────
function ClientsTab({
  clients,
  coaches,
  onClientsChange,
}: {
  clients: Client[];
  coaches: Coach[];
  onClientsChange: (clients: Client[]) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [viewPlanClient, setViewPlanClient] = useState<Client | null>(null);
  const [searchText, setSearchText] = useState('');
  const [form, setForm] = useState({
    name: '',
    gender: 'male',
    age: '',
    membershipLevel: 'standard',
    weeks: '15',
    goal: '',
    coachCode: '',
    weight: '',
    height: '',
    bf_pct: '',
    smm_kg: '',
    waist_cm: '',
    hip_cm: '',
    rhr: '',
    sleep_hours: '',
    training_age_months: '',
    notes: '',
  });
  const activeClients = clients.filter((c) => !c.deletedAt);
  const filteredClients = searchText.trim()
    ? activeClients.filter(c =>
        c.name.includes(searchText) ||
        String(c.roadCode || '').toUpperCase().includes(searchText.toUpperCase())
      )
    : activeClients;
  const deletedClients = clients.filter((c) => !!c.deletedAt);

  const assignCoach = (clientId: string, coachCode: string) => {
    const updated = clients.map((c) => (c.id === clientId ? { ...c, coachCode } : c));
    onClientsChange(updated);
    persistClientsToStores(updated);
    const changedClient = updated.find((c) => c.id === clientId);
    if (changedClient) {
      void syncClientToServer(changedClient).catch((err) => {
        console.error('[AdminPortal] Failed to sync assigned coach:', err);
      });
    }
  };

  const addClient = () => {
    if (!form.name.trim()) { alert('请填写客户姓名'); return; }
    if (!form.age) { alert('请填写年龄'); return; }
    if (!form.weight) { alert('请填写体重（首次体测必填）'); return; }
    if (!form.height) { alert('请填写身高（首次体测必填）'); return; }
    if (!form.bf_pct) { alert('请填写体脂率（首次体测必填）'); return; }

    const w = parseFloat(form.weight);
    const h = parseFloat(form.height);
    const age = parseInt(form.age);
    const isMale = form.gender !== 'female';
    const bf = parseFloat(form.bf_pct);
    const smm_kg = form.smm_kg ? parseFloat(form.smm_kg) : undefined;
    const waist = form.waist_cm ? parseFloat(form.waist_cm) : undefined;
    const hip = form.hip_cm ? parseFloat(form.hip_cm) : undefined;
    const rhr = form.rhr ? parseFloat(form.rhr) : undefined;
    const sleep = form.sleep_hours ? parseFloat(form.sleep_hours) : undefined;
    const trainAge = form.training_age_months ? parseFloat(form.training_age_months) : undefined;

    const fat_kg = +((w * bf / 100).toFixed(2));
    const lean_kg = +((w - fat_kg).toFixed(2));
    const smm_pct = smm_kg ? +((smm_kg / w * 100).toFixed(1)) : undefined;
    const bmi = +(w / ((h / 100) ** 2)).toFixed(1);
    const whr = (waist && hip) ? +(waist / hip).toFixed(2) : undefined;
    const bmr = Math.round(
      isMale
        ? 10 * w + 6.25 * h - 5 * age + 5
        : 10 * w + 6.25 * h - 5 * age - 161
    );

    const bodyMetrics = {
      bf_pct: bf,
      smm_kg,
      smm_pct,
      waist_cm: waist,
      hip_cm: hip,
      rhr,
      sleep_hours: sleep,
      training_age_months: trainAge,
      fat_kg,
      lean_kg,
      bmi,
      whr,
      bmr,
    };

    const firstAssessment = {
      date: new Date().toISOString().slice(0, 10),
      weight: w,
      height: h,
      bf_pct: bf,
      fat_kg,
      lean_kg,
      smm_kg,
      smm_pct,
      waist_cm: waist,
      hip_cm: hip,
      whr,
      rhr,
      bmr,
      bmi,
      sleep_hours: sleep,
      training_age_months: trainAge,
      notes: form.notes || '初次建档体测',
      score_snapshot: 0,
    };

    const existingCodes = new Set(
      clients.map((c) => String(c.roadCode || '').toUpperCase()).filter(Boolean)
    );

    const selectedCoach = form.coachCode ? coaches.find(ch => ch.code === form.coachCode) : undefined;

    const newClient: Client = {
      id: 'CL' + Date.now(),
      roadCode: generateRandomCode(existingCodes, 6),
      name: form.name.trim(),
      gender: form.gender,
      age,
      height: h,
      weight: w,
      tier: (form.membershipLevel === 'professional' || form.membershipLevel === 'elite') ? 'pro' : 'standard',
      membershipLevel: form.membershipLevel as any,
      goal: form.goal || '',
      coachCode: selectedCoach?.code || '',
      coachName: (selectedCoach as any)?.name || '',
      injury: '',
      blocks: [],
      sessions: [],
      weeklyData: [],
      dietPlans: [],
      bodyMetrics,
      assessments: [firstAssessment],
    };

    const updated = [...clients, newClient];
    onClientsChange(updated);
    persistClientsToStores(updated);
    void syncClientToServer(newClient).catch((err) => {
      console.error('[AdminPortal] Failed to sync new client:', err);
      alert('客户已在本地新增，但同步服务器失败，请检查网络后重试。');
    });

    setForm({
      name: '', gender: 'male', age: '', membershipLevel: 'standard',
      weeks: '15', goal: '', coachCode: '', weight: '', height: '', bf_pct: '',
      smm_kg: '', waist_cm: '', hip_cm: '', rhr: '', sleep_hours: '',
      training_age_months: '', notes: '',
    });
    setShowModal(false);
  };

  const formatDeletedAt = (value?: string) => {
    if (!value) return '—';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString('zh-CN', { hour12: false });
  };

  const softDeleteClient = async (client: Client) => {
    if (!window.confirm(`确认删除客户「${client.name}」？\n删除后客户将移至"已删除客户"列表，可在管理端恢复或彻底删除。`)) return;
    try {
      await softDeleteClientOnServer(client, 'ADMIN', '管理员');
      const updated = clients.map((c) =>
        c.id === client.id
          ? {
              ...c,
              deletedAt: new Date().toISOString(),
              deletedByCoachCode: 'ADMIN',
              deletedByCoachName: '管理员',
            }
          : c
      );
      onClientsChange(updated);
      persistClientsToStores(updated);
    } catch (err) {
      console.error('[AdminPortal] Failed to delete client:', err);
      alert('删除客户失败，未保存到服务器。');
    }
  };

  const restoreClient = async (client: Client) => {
    if (!window.confirm(`确认恢复客户「${client.name}」？`)) return;
    try {
      await restoreClientOnServer(client);
      const updated = clients.map((c) =>
        c.id === client.id
          ? {
              ...c,
              deletedAt: undefined,
              deletedByCoachCode: undefined,
              deletedByCoachName: undefined,
            }
          : c
      );
      onClientsChange(updated);
      persistClientsToStores(updated);
    } catch (err) {
      console.error('[AdminPortal] Failed to restore client:', err);
      alert('恢复客户失败，请稍后重试。');
    }
  };

  const hardDeleteClient = async (client: Client) => {
    if (!window.confirm(`确认彻底删除客户「${client.name}」？\n此操作将删除所有训练与财务数据，且不可恢复。`)) return;
    try {
      await hardDeleteClientOnServer(client);
      const updated = clients.filter((c) => c.id !== client.id);
      onClientsChange(updated);
      persistClientsToStores(updated);
    } catch (err) {
      console.error('[AdminPortal] Failed to hard delete client:', err);
      alert('彻底删除失败，未保存到服务器。');
    }
  };

  const renderPlanSummary = (c: Client) => {
    const allDays = (c.blocks || []).flatMap((b) => (b.weeks || []).flatMap((w) => (w.days || []).filter((d) => d.plan)));
    if (!allDays.length) return <div style={{ color: 'var(--s400)', fontSize: 12 }}>暂无训练计划</div>;
    return allDays.slice(0, 5).map((d, i) => (
      <div key={i} style={{ marginBottom: 8, padding: 10, background: 'var(--s50)', borderRadius: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{d.day}</div>
        {d.plan?.modules.map((mod, mi) => (
          <div key={mi} style={{ fontSize: 11, color: 'var(--s600)', marginBottom: 2 }}>
            {mod.module_name}: {mod.exercises.slice(0, 2).map((e) => e.name).join('、')}
            {mod.exercises.length > 2 ? `... +${mod.exercises.length - 2}` : ''}
          </div>
        ))}
      </div>
    ));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12 }}>
        <input
          className="inp"
          style={{ flex: 1, maxWidth: 280 }}
          placeholder="搜索姓名或路书码"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
        />
        <button className="btn btn-p btn-sm" onClick={() => setShowModal(true)}>
          新建客户
        </button>
      </div>

      <div className="card-sm">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
            <thead>
              <tr>
                {['客户', '路书码', '档位', '分配教练', '余额', '课次', '操作'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'var(--s500)',
                      borderBottom: '1px solid var(--s200)',
                      background: 'var(--s50)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--s100)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--s400)' }}>
                      {c.gender === 'female' ? '女' : '男'} {c.age}岁
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--p)', fontSize: 12 }}>
                      {c.roadCode || c.id}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className="badge bp">{tierLabel(c.tier)}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <select
                      className="select"
                      style={{ height: 30, fontSize: 11, width: 100 }}
                      value={c.coachCode || ''}
                      onChange={(e) => assignCoach(c.id, e.target.value)}
                    >
                      <option value="">未分配</option>
                      {coaches.map((ch) => (
                        <option key={ch.code} value={ch.code}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      fontWeight: 700,
                      color: calcBalance(c) < 500 ? 'var(--r)' : 'var(--g)',
                    }}
                  >
                    ¥{calcBalance(c).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{(c.sessions || []).length}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setViewPlanClient(c)}>
                        查看计划
                      </button>
                      <button
                        className="btn btn-sm"
                        style={{ background: '#B42318', color: '#fff' }}
                        onClick={() => softDeleteClient(c)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!activeClients.length && (
                <tr>
                  <td colSpan={7} style={{ padding: '18px 12px', color: 'var(--s500)', textAlign: 'center' }}>
                    暂无正常客户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card-sm" style={{ marginTop: 16 }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--s100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="lbl">已删除客户</div>
          <div style={{ fontSize: 11, color: 'var(--s500)' }}>保留历史训练与财务记录，支持管理端彻底删除</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 600 }}>
            <thead>
              <tr>
                {['客户', '路书码', '删除教练', '删除时间', '操作'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'var(--s500)',
                      borderBottom: '1px solid var(--s200)',
                      background: 'var(--s50)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {deletedClients.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--s100)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'var(--mono)', color: 'var(--p)' }}>{c.roadCode || c.id}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--s700)' }}>
                    {c.deletedByCoachName || c.deletedByCoachCode || '未知教练'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--s700)' }}>{formatDeletedAt(c.deletedAt)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'var(--p)', color: '#fff' }}
                        onClick={() => restoreClient(c)}
                      >
                        恢复
                      </button>
                      <button className="btn btn-sm" style={{ background: '#B42318', color: '#fff' }} onClick={() => hardDeleteClient(c)}>
                        彻底删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!deletedClients.length && (
                <tr>
                  <td colSpan={5} style={{ padding: '18px 12px', color: 'var(--s500)', textAlign: 'center' }}>
                    暂无已删除客户
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 新建客户弹窗 */}
      {showModal && (
        <Modal
          title="新建客户"
          onClose={() => setShowModal(false)}
          footer={
            <>
              <button className="btn btn-o" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className="btn btn-p" onClick={addClient}>
                创建并建档
              </button>
            </>
          }
        >
          {/* 基本信息 */}
          <div style={{
            fontSize: 10, fontWeight: 800, color: '#8a90a6',
            letterSpacing: '.14em', textTransform: 'uppercase',
            paddingBottom: 8, borderBottom: '1px solid rgba(216,221,236,.4)',
            marginBottom: 12,
          }}>
            基本信息
          </div>
          <div className="grid2" style={{ marginBottom: 12 }}>
            <div>
              <FieldLabel>姓名 *</FieldLabel>
              <input className="inp" placeholder="客户姓名"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>性别 *</FieldLabel>
              <select className="select" value={form.gender}
                onChange={(e) => setForm(f => ({ ...f, gender: e.target.value }))}>
                <option value="male">男</option>
                <option value="female">女</option>
              </select>
            </div>
            <div>
              <FieldLabel>年龄 *</FieldLabel>
              <input className="inp" type="number" placeholder="如：28"
                value={form.age}
                onChange={(e) => setForm(f => ({ ...f, age: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>会员档位 *</FieldLabel>
              <select className="select" value={form.membershipLevel}
                onChange={(e) => setForm(f => ({ ...f, membershipLevel: e.target.value }))}>
                <option value="standard">Standard 基础</option>
                <option value="advanced">Advanced 进阶</option>
                <option value="professional">Professional 专业</option>
                <option value="elite">Elite 至尊</option>
              </select>
            </div>
            <div>
              <FieldLabel>训练周期（周）</FieldLabel>
              <input className="inp" type="number" placeholder="15"
                value={form.weeks}
                onChange={(e) => setForm(f => ({ ...f, weeks: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>训练目标</FieldLabel>
              <input className="inp" placeholder="如：增肌减脂"
                value={form.goal}
                onChange={(e) => setForm(f => ({ ...f, goal: e.target.value }))} />
            </div>
            <div>
              <FieldLabel>分配教练</FieldLabel>
              <select className="select" value={form.coachCode}
                onChange={(e) => setForm(f => ({ ...f, coachCode: e.target.value }))}>
                <option value="">暂不分配</option>
                {coaches.map(ch => (
                  <option key={ch.code} value={ch.code}>{ch.name}（{ch.code}）</option>
                ))}
              </select>
            </div>
          </div>

          {/* 首次体测数据 */}
          <div style={{
            fontSize: 10, fontWeight: 800, color: '#8a90a6',
            letterSpacing: '.14em', textTransform: 'uppercase',
            paddingBottom: 8, borderBottom: '1px solid rgba(216,221,236,.4)',
            marginBottom: 12,
          }}>
            首次体测数据（必填）
          </div>
          <div className="grid2" style={{ marginBottom: 12 }}>
            {[
              { key: 'weight', label: '体重 (kg) *', placeholder: '如：65.5' },
              { key: 'height', label: '身高 (cm) *', placeholder: '如：170' },
              { key: 'bf_pct', label: '体脂率 (%) *', placeholder: '如：18.5' },
              { key: 'smm_kg', label: '骨骼肌 (kg)', placeholder: '如：28.5' },
              { key: 'waist_cm', label: '腰围 (cm)', placeholder: '如：76' },
              { key: 'hip_cm', label: '髋围 (cm)', placeholder: '如：92' },
              { key: 'rhr', label: '静息心率 (bpm)', placeholder: '如：62' },
              { key: 'sleep_hours', label: '睡眠时长 (h/晚)', placeholder: '如：7.5' },
            ].map(f => (
              <div key={f.key}>
                <FieldLabel>{f.label}</FieldLabel>
                <input
                  className="inp"
                  type="number"
                  placeholder={f.placeholder}
                  value={(form as any)[f.key]}
                  onChange={(e) => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          {/* 自动计算预览 */}
          {form.weight && form.bf_pct && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 12,
              background: 'rgba(93,100,214,.06)',
              border: '1px solid rgba(93,100,214,.15)',
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            }}>
              {[
                {
                  label: '脂肪重量',
                  value: `${(+form.weight * +form.bf_pct / 100).toFixed(1)}kg`,
                  color: '#D97706',
                },
                {
                  label: '去脂体重',
                  value: `${(+form.weight - +form.weight * +form.bf_pct / 100).toFixed(1)}kg`,
                  color: '#0D9488',
                },
                {
                  label: 'BMI',
                  value: form.height
                    ? (+form.weight / ((+form.height / 100) ** 2)).toFixed(1)
                    : '--',
                  color: '#5d64d6',
                },
                {
                  label: '腰臀比',
                  value: (form.waist_cm && form.hip_cm)
                    ? (+form.waist_cm / +form.hip_cm).toFixed(2)
                    : '--',
                  color: '#2563EB',
                },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#8a90a6', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* 备注 */}
          <div>
            <FieldLabel>备注（选填）</FieldLabel>
            <input className="inp" placeholder="初次建档备注..."
              value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </Modal>
      )}

      {/* 查看计划弹窗 */}
      {viewPlanClient && (
        <Modal
          title={`${viewPlanClient.name} 的训练计划`}
          onClose={() => setViewPlanClient(null)}
          footer={
            <button className="btn btn-o" onClick={() => setViewPlanClient(null)}>
              关闭
            </button>
          }
        >
          {renderPlanSummary(viewPlanClient)}
        </Modal>
      )}
    </div>
  );
}

// ── 财务 Tab ──────────────────────────────────────────────────
function FinanceTab({ clients }: { clients: Client[] }) {
  const [sessionMap, setSessionMap] = useState<Map<string, { spent: number; count: number }>>(new Map());
  const [sessionsLoading, setSessionsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/sessions?limit=500');
        if (res.ok) {
          const sessions: Array<{ clientId?: string; price?: number }> = await res.json();
          const map = new Map<string, { spent: number; count: number }>();
          sessions.forEach(s => {
            if (!s.clientId) return;
            const cur = map.get(s.clientId) || { spent: 0, count: 0 };
            map.set(s.clientId, { spent: cur.spent + (s.price || 0), count: cur.count + 1 });
          });
          setSessionMap(map);
        }
      } catch (e) {
        console.error('[FinanceTab] sessions fetch failed:', e);
      } finally {
        setSessionsLoading(false);
      }
    };
    load();
  }, []);

  const totalRevenue = clients.reduce((s, c) => (c.weeklyData || []).reduce((ss, w) => ss + (w.paid || 0), s), 0);
  const totalBalance = clients.reduce((s, c) => {
    const paid = (c.weeklyData || []).reduce((ss, w) => ss + (w.paid || 0), 0);
    const spent = sessionsLoading ? (c.sessions || []).reduce((ss, se) => ss + ((se as any).price || 0), 0) : (sessionMap.get(c.id)?.spent || 0);
    return s + paid - spent;
  }, 0);
  const avgBalance = clients.length ? Math.round(totalBalance / clients.length) : 0;

  return (
    <div>
      <div className="admin-kpi-grid">
        {[
          { label: '总收入', value: '¥' + totalRevenue.toLocaleString(), color: 'var(--g)' },
          { label: '总余额', value: sessionsLoading ? '--' : '¥' + totalBalance.toLocaleString(), color: 'var(--a)' },
          { label: '客户数', value: clients.length.toString(), color: 'var(--p)' },
          { label: '平均余额', value: sessionsLoading ? '--' : '¥' + avgBalance.toLocaleString(), color: 'var(--b)' },
        ].map((kpi) => (
          <div key={kpi.label} className="card-sm kpi-card" style={{ borderLeft: `3px solid ${kpi.color}` }}>
            <div className="lbl">{kpi.label}</div>
            <div className="kpi-val" style={{ color: kpi.color }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="card-sm">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['客户', '档位', '累计付款', '已消费', '余额', '课次'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '.1em',
                      textTransform: 'uppercase',
                      color: 'var(--s500)',
                      borderBottom: '1px solid var(--s200)',
                      background: 'var(--s50)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sessionsLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--s400)', fontSize: 12 }}>
                    加载中...
                  </td>
                </tr>
              ) : clients.map((c) => {
                const paid = (c.weeklyData || []).reduce((s, w) => s + (w.paid || 0), 0);
                const info = sessionMap.get(c.id) || { spent: 0, count: 0 };
                const bal = paid - info.spent;
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--s100)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>{c.name}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="badge bp">{tierLabel(c.tier)}</span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>¥{paid.toLocaleString()}</td>
                    <td style={{ padding: '10px 12px' }}>¥{info.spent.toLocaleString()}</td>
                    <td
                      style={{
                        padding: '10px 12px',
                        fontWeight: 700,
                        color: bal < 500 ? 'var(--r)' : bal < 2000 ? 'var(--a)' : 'var(--g)',
                      }}
                    >
                      ¥{bal.toLocaleString()}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{info.count}节</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── AI开关 Tab ────────────────────────────────────────────────
function AiSettingsTab() {
  const [apiKey, setApiKey] = useState(() => lsGet<string>('apiKey', ''));
  const [settings, setSettings] = useState<AiSettings>({});
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/admin/config');
        if (res.ok) {
          const data = await res.json() as AiSettings;
          setSettings(data);
        }
      } catch (e) {
        console.error('[AiSettingsTab] load config failed:', e);
        setSettings(lsGet<AiSettings>('ai_settings', {}));
      } finally {
        setConfigLoading(false);
      }
    };
    load();
  }, []);

  const saveApiKey = () => {
    lsSet('apiKey', apiKey);
    alert('API Key 已保存');
  };

  const toggleSetting = async (key: keyof AiSettings, val: boolean) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    setConfigSaving(true);
    try {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
    } catch (e) {
      console.error('[AiSettingsTab] save config failed:', e);
    } finally {
      setConfigSaving(false);
    }
  };

  const switches: { key: keyof AiSettings; title: string; desc: string }[] = [
    { key: 'training_session', title: '单次训练AI生成', desc: '教练生成单节课计划' },
    { key: 'training_week', title: '周计划AI生成', desc: '教练生成整周计划' },
    { key: 'training_ultra', title: 'Ultra 档位解锁', desc: '控制教练端 Ultra 课程是否可用' },
    { key: 'nutrition_phase', title: '阶段饮食AI生成', desc: 'AI生成阶段饮食方案' },
    { key: 'nutrition_daily', title: '每日饮食AI生成', desc: 'AI生成每日食谱' },
  ];

  return (
    <div>
      <div className="card-sm" style={{ padding: 16, marginBottom: 16 }}>
        <div className="lbl" style={{ marginBottom: 4 }}>
          Qwen API Key
        </div>
        <div style={{ fontSize: 12, color: 'var(--s500)', marginBottom: 8 }}>填写后所有教练端AI生成功能生效。前往 bailian.aliyun.com 获取。</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className="inp"
            placeholder="sk-xxxx"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-p btn-sm" onClick={saveApiKey}>
            保存
          </button>
        </div>
        {apiKey && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--g)', display: 'flex', alignItems: 'center', gap: 4 }}>
            ✓ API Key 已配置
          </div>
        )}
      </div>

      <div className="card-sm" style={{ overflow: 'hidden' }}>
        {configLoading && (
          <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--s400)' }}>加载中...</div>
        )}
        {!configLoading && configSaving && (
          <div style={{ padding: '4px 16px', fontSize: 11, color: 'var(--s400)' }}>保存中...</div>
        )}
        {switches.map((sw) => (
          <div
            key={sw.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderBottom: '1px solid var(--s100)',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{sw.title}</div>
              <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 1 }}>{sw.desc}</div>
            </div>
            <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={settings[sw.key] !== false}
                onChange={(e) => toggleSetting(sw.key, e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--p)' }}
              />
              <span style={{ fontSize: 12, color: 'var(--s600)' }}>{settings[sw.key] !== false ? '开启' : '关闭'}</span>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 规则管理 Tab ──────────────────────────────────────────────
interface CoachRuleDoc {
  _id: string;
  coachCode: string;
  clientId: string | null;
  rule: string;
  source: string;
  createdAt: string;
}

function RulesTab({ coaches, clients }: { coaches: Coach[]; clients: Client[] }) {
  const [rules, setRules] = useState<CoachRuleDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [systemInput, setSystemInput] = useState('');
  const [systemAdding, setSystemAdding] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/coach-rules');
      if (res.ok) setRules(await res.json() as CoachRuleDoc[]);
    } catch (e) {
      console.error('[RulesTab] fetch rules failed:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchRules(); }, []);

  const deleteRule = async (id: string) => {
    if (!window.confirm('确认删除该规则？')) return;
    try {
      await fetch(`/api/coach-rules/${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r._id !== id));
    } catch (e) {
      console.error('[RulesTab] delete rule failed:', e);
      alert('删除失败');
    }
  };

  const addSystemRule = async () => {
    if (!systemInput.trim()) return;
    setSystemAdding(true);
    try {
      const res = await fetch('/api/coach-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachCode: 'SYSTEM', clientId: null, rule: systemInput.trim(), source: 'manual' }),
      });
      if (res.ok) {
        const doc = await res.json() as CoachRuleDoc;
        setRules(prev => [doc, ...prev]);
        setSystemInput('');
      }
    } catch (e) {
      console.error('[RulesTab] add system rule failed:', e);
      alert('添加失败');
    } finally {
      setSystemAdding(false);
    }
  };

  const systemRules = rules.filter(r => r.coachCode === 'SYSTEM');
  const coachRules = rules.filter(r => r.coachCode !== 'SYSTEM');

  const grouped = coaches.reduce<Record<string, CoachRuleDoc[]>>((acc, ch) => {
    acc[ch.code] = coachRules.filter(r => r.coachCode === ch.code);
    return acc;
  }, {});
  const unknownCoaches = [...new Set(coachRules.map(r => r.coachCode))].filter(
    code => !coaches.find(ch => ch.code === code)
  );

  const renderRuleRow = (r: CoachRuleDoc) => {
    const clientName = r.clientId ? (clients.find(c => c.id === r.clientId)?.name || r.clientId) : '全局';
    const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : '—';
    return (
      <div key={r._id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--s100)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{r.rule}</div>
          <div style={{ fontSize: 10, color: 'var(--s400)', marginTop: 3, display: 'flex', gap: 8 }}>
            <span>{r.source === 'auto' ? '自动学习' : '手动添加'}</span>
            <span>·</span>
            <span>适用客户：{clientName}</span>
            <span>·</span>
            <span>{date}</span>
          </div>
        </div>
        <button
          className="btn btn-sm"
          style={{ background: '#B42318', color: '#fff', flexShrink: 0 }}
          onClick={() => deleteRule(r._id)}
        >
          删除
        </button>
      </div>
    );
  };

  return (
    <div>
      {/* 全局系统规则 */}
      <div className="card-sm" style={{ padding: 16, marginBottom: 16 }}>
        <div className="lbl" style={{ marginBottom: 10 }}>全局系统规则（对所有教练生效）</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            className="inp"
            style={{ flex: 1 }}
            placeholder="输入系统级规则，如：所有计划必须包含热身和拉伸"
            value={systemInput}
            onChange={e => setSystemInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void addSystemRule(); }}
          />
          <button className="btn btn-p btn-sm" onClick={() => void addSystemRule()} disabled={systemAdding}>
            {systemAdding ? '添加中...' : '添加'}
          </button>
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--s400)' }}>加载中...</div>
        ) : systemRules.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--s400)', padding: '6px 0' }}>暂无系统规则</div>
        ) : (
          systemRules.map(renderRuleRow)
        )}
      </div>

      {/* 教练规则分组 */}
      {loading ? null : (
        <>
          {coaches.map(ch => {
            const cRules = grouped[ch.code] || [];
            return (
              <div key={ch.code} className="card-sm" style={{ padding: 16, marginBottom: 12 }}>
                <div className="lbl" style={{ marginBottom: 8 }}>
                  {ch.name}
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--s400)', marginLeft: 6 }}>({ch.code})</span>
                  <span style={{ fontSize: 11, color: 'var(--s500)', marginLeft: 8 }}>{cRules.length} 条规则</span>
                </div>
                {cRules.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--s400)', padding: '4px 0' }}>暂无规则</div>
                ) : (
                  cRules.map(renderRuleRow)
                )}
              </div>
            );
          })}
          {unknownCoaches.map(code => (
            <div key={code} className="card-sm" style={{ padding: 16, marginBottom: 12 }}>
              <div className="lbl" style={{ marginBottom: 8 }}>
                未知教练
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--s400)', marginLeft: 6 }}>({code})</span>
              </div>
              {coachRules.filter(r => r.coachCode === code).map(renderRuleRow)}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────
type AdminTab = 'overview' | 'codes' | 'coaches' | 'clients' | 'finance' | 'ai-settings' | 'rules';

interface AdminPortalProps {
  display: 'block' | 'none';
  onLogout: () => void;
}

export function AdminPortal({ display, onLogout }: AdminPortalProps) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [clients, setClients] = useState<Client[]>(() => loadMergedClientsFromStores());
  const [coaches, setCoaches] = useState<Coach[]>(() => getCoachesFromCache());
  const [coachesLoading, setCoachesLoading] = useState(true);
  const isPersistingClientsRef = useRef(false);

  const refreshClientsFromServer = async () => {
    try {
      const res = await fetch('/api/clients');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const serverClients = (await res.json()) as Client[];
      if (Array.isArray(serverClients)) {
        setClients(serverClients);
        persistClientsToStores(serverClients);
      }
    } catch (err) {
      console.warn('[AdminPortal] Failed to fetch clients from server, using local merged data:', err);
      setClients(loadMergedClientsFromStores());
    }
  };

  // 页面加载时从服务器拉取教练数据
  useEffect(() => {
    loadCoaches().then(fetchedCoaches => {
      setCoaches(fetchedCoaches);
      setCoachesLoading(false);
    }).catch(err => {
      console.error('[AdminPortal] Failed to load coaches:', err);
      setCoaches(getCoachesFromCache());
      setCoachesLoading(false);
    });
  }, []);

  // 同步教练列表到服务器
  useEffect(() => {
    if (!coachesLoading) {
      saveCoaches(coaches).catch(err => console.error('[AdminPortal] Failed to save coaches:', err));
    }
  }, [coaches, coachesLoading]);

  useEffect(() => {
    isPersistingClientsRef.current = true;
    persistClientsToStores(clients);
    isPersistingClientsRef.current = false;
  }, [clients]);

  useEffect(() => {
    if (display === 'block') {
      void refreshClientsFromServer();
    }
  }, [display]);

  useEffect(() => {
    const syncFromStorage = () => setClients(loadMergedClientsFromStores());
    const syncFromInTabEvent = () => {
      if (isPersistingClientsRef.current) return;
      setClients(loadMergedClientsFromStores());
    };
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener('fika:clients-updated', syncFromInTabEvent);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener('fika:clients-updated', syncFromInTabEvent);
    };
  }, []);

  const navItems: { key: AdminTab; label: string; icon: ReactNode }[] = [
    {
      key: 'overview',
      label: '总览 Overview',
      icon: (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </>
      ),
    },
    {
      key: 'codes',
      label: '路书码管理',
      icon: (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M16 10l-4 4-4-4" />
        </>
      ),
    },
    {
      key: 'coaches',
      label: '教练管理',
      icon: (
        <>
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </>
      ),
    },
    {
      key: 'clients',
      label: '客户管理',
      icon: (
        <>
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      ),
    },
    {
      key: 'finance',
      label: '财务管理',
      icon: (
        <>
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </>
      ),
    },
    { key: 'ai-settings', label: 'AI 开关', icon: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /> },
    { key: 'rules', label: '规则管理', icon: <><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></> },
  ];

  const tabTitles: Record<AdminTab, string> = {
    overview: '总览 Overview',
    codes: '路书码管理',
    coaches: '教练管理',
    clients: '客户管理',
    finance: '财务管理',
    'ai-settings': 'AI 功能开关',
    rules: '规则管理',
  };

  return (
    <div id="pg-admin" className="z1" style={{ display }}>
      {/* 侧边栏 */}
      <div className="admin-sidebar">
        <div className="admin-logo-area">
          <div style={{ fontSize: 16 }}>
            <span style={{ color: '#a78bfa', fontWeight: 900 }}>Fi</span>
            <span style={{ color: '#fff', fontWeight: 900 }}>KA</span>
          </div>
          <div
            style={{
              fontSize: 9,
              letterSpacing: '.2em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,.35)',
              marginTop: 2,
            }}
          >
            Admin Console
          </div>
        </div>
        <div className="admin-nav">
          {navItems.map((it) => (
            <button key={it.key} className={"admin-nav-item" + (tab === it.key ? ' on' : '')} type="button" onClick={() => setTab(it.key)}>
              <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                {it.icon}
              </svg>
              {it.label}
            </button>
          ))}
        </div>
        <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,.08)' }}>
          <button className="admin-nav-item" type="button" style={{ color: 'rgba(239,68,68,.7)' }} onClick={onLogout}>
            <svg className="admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            退出
          </button>
        </div>
      </div>

      <div className="admin-main">
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{tabTitles[tab]}</div>
          <div className="divider" />

          {tab === 'overview' ? (
            <OverviewTab clients={clients} coaches={coaches} />
          ) : tab === 'codes' ? (
            <CodesTab clients={clients} coaches={coaches} onClientsChange={setClients} onCoachesChange={setCoaches} />
          ) : tab === 'coaches' ? (
            <CoachesTab clients={clients} coaches={coaches} onCoachesChange={setCoaches} />
          ) : tab === 'clients' ? (
            <ClientsTab clients={clients} coaches={coaches} onClientsChange={setClients} />
          ) : tab === 'finance' ? (
            <FinanceTab clients={clients} />
          ) : tab === 'ai-settings' ? (
            <AiSettingsTab />
          ) : (
            <RulesTab coaches={coaches} clients={clients} />
          )}
        </div>
      </div>
    </div>
  );
}
