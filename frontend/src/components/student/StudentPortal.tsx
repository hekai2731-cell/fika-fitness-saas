/**
 * StudentPortal.tsx — UI 完整重写 v2
 * 所有业务逻辑、API 调用、数据结构保持不变，仅重写 UI 层
 */

import { useState, useEffect, type ReactNode } from 'react';

// ─── 类型（与原版完全一致）────────────────────────────────────
interface Session {
  id: string; date: string; day?: string; day_id?: string; block_id?: string;
  rpe?: number; duration?: number; performance?: string; note?: string;
  week?: number; block_index?: number; block_week?: number;
}
interface WeeklyData {
  date: string; weight?: number; bf?: number; waist?: number; hip?: number;
  attendance?: number; paid?: number;
}
interface Exercise {
  name: string; name_en?: string; group_tag?: string; sets: number; reps: string;
  rhythm?: string; cue?: string; rest_seconds?: number;
}
interface Module { module_name: string; format?: string; exercises: Exercise[]; }
interface Plan { session_name?: string; tier?: string; modules: Module[]; }
interface Client {
  id: string; roadCode?: string; membershipLevel?: 'standard' | 'advanced' | 'professional' | 'elite';
  name: string; gender?: string; age?: number; height?: number; weight?: number; tier?: string;
  goal?: string; weeks?: number; current_week?: number; current_day?: string;
  current_day_id?: string; current_block_id?: string; injury?: string;
  blocks?: Block[]; published_blocks?: Block[];
  plan_draft_version?: number; plan_published_version?: number;
  plan_updated_at?: string; plan_published_at?: string;
  sessions?: Session[]; weeklyData?: WeeklyData[];
}
interface Day { id: string; day: string; name?: string; focus?: string; modules?: Module[]; plan?: Plan | null; }
interface Week { id: string; week_num?: number; num?: number; focus?: string; days: Day[]; }
interface Block { id: string; title: string; focus?: string; training_weeks?: Week[]; weeks?: Week[]; }

// ─── 工具（原版逻辑，一字不动）─────────────────────────────────
function membershipGroupLabel(level?: string) {
  return (level === 'professional' || level === 'elite') ? '动力链训练' : '传统分化训练';
}

function getTagColor(tag?: string) {
  if (!tag) return '#6B7280';
  const m: Record<string, string> = { A: '#7C3AED', B: '#0D9488', C: '#D97706', D: '#DC2626', E: '#2563EB', F: '#9333EA' };
  return m[tag[0]] || '#6B7280';
}
type PublishedDayRef = {
  blockIndex: number; blockId: string; weekNum: number; weekId: string;
  dayIndex: number; dayId: string; dayLabel: string; day: Day; weekDays: Day[];
};
function flattenPublishedDays(c: Client): PublishedDayRef[] {
  const blocks = (c.published_blocks || []).filter(Boolean);
  const refs: PublishedDayRef[] = [];
  blocks.forEach((block, blockIndex) => {
    const weeks = (block.training_weeks || block.weeks || []).filter(Boolean);
    weeks.forEach((week, weekIndex) => {
      const weekNum = Number(week.week_num ?? week.num ?? weekIndex + 1);
      const weekId = String(week.id || `${block.id || `block-${blockIndex}`}-week-${weekNum}`);
      const weekDays = (week.days || []).filter(Boolean);
      weekDays.forEach((day, dayIndex) => {
        const dayId = String(day.id || `${weekId}-day-${dayIndex + 1}`);
        refs.push({ blockIndex, blockId: String(block.id || `block-${blockIndex}`), weekNum, weekId, dayIndex, dayId, dayLabel: String(day.day || ''), day, weekDays });
      });
    });
  });
  return refs;
}
function resolvePointerIndex(c: Client, refs: PublishedDayRef[]): number {
  if (refs.length === 0) return -1;
  if (c.current_day_id) { const i = refs.findIndex(r => r.dayId === c.current_day_id); if (i >= 0) return i; }
  const i2 = refs.findIndex(r => {
    const wm = c.current_week ? r.weekNum === Number(c.current_week) : true;
    const dm = c.current_day ? r.dayLabel === String(c.current_day) : true;
    const bm = c.current_block_id ? r.blockId === String(c.current_block_id) : true;
    return wm && dm && bm;
  });
  if (i2 >= 0) return i2;
  if (c.current_week) { const i3 = refs.findIndex(r => r.weekNum === Number(c.current_week)); if (i3 >= 0) return i3; }
  return 0;
}
function buildPlanFromDay(day: Day): Plan | null {
  const modules = Array.isArray(day.modules) ? day.modules : day.plan?.modules;
  if (Array.isArray(modules) && modules.length > 0) return { session_name: day.name, modules };
  const summaryTitle = String(day.name || day.focus || '今日训练安排').trim();
  const summaryCue = String(day.focus || day.name || '').trim();
  if (!summaryTitle && !summaryCue) return null;
  return {
    session_name: summaryTitle || '今日训练安排',
    modules: [{ module_name: summaryTitle || '今日训练安排', format: '已发布周计划（待细化）', exercises: [{ name: summaryCue || '教练已发布本周计划，请按本日重点执行', sets: 1, reps: '按计划执行', cue: '如需具体动作组数，请在教练端生成并发布单次训练计划。' }] }],
  };
}
function resolveTodayEntry(c: Client): { plan: Plan | null; dayRef: PublishedDayRef | null; refs: PublishedDayRef[]; timelineDays: Day[]; } {
  const refs = flattenPublishedDays(c);
  if (refs.length === 0) return { plan: null, dayRef: null, refs: [], timelineDays: [] };
  const pointerIndex = resolvePointerIndex(c, refs);
  const dayRef = refs[Math.max(0, pointerIndex)] || refs[0];
  return { plan: buildPlanFromDay(dayRef.day), dayRef, refs, timelineDays: dayRef.weekDays };
}
function getPlanVersionLabel(c: Client): string {
  const version = Number(c.plan_published_version || 0);
  if (!version) return '当前还没有已发布计划';
  if (!c.plan_published_at) return `当前计划 v${version}`;
  const at = new Date(c.plan_published_at).toLocaleString('zh-CN', { hour12: false });
  return `当前计划 v${version} · 发布于 ${at}`;
}
function isSameClientSnapshot(a: Client | null, b: Client | null): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function findClientById(clientId: string): Client | null {
  try { const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]'); return all.find(item => item.id === clientId) || null; } catch { return null; }
}

// ─── API URL helper ─────────────────────────────────────────────
const STU_API_BASE = import.meta.env.PROD ? '' : (((import.meta as any).env?.VITE_API_BASE_URL as string) || '');
function stuApiUrl(path: string) { return STU_API_BASE ? STU_API_BASE.replace(/\/$/, '') + path : path; }

// ─── tier 徽章文字 ──────────────────────────────────────────────
function tierLabel(level?: string) {
  return level === 'elite' ? 'Elite 至尊' : level === 'professional' ? 'Professional 专业' : level === 'advanced' ? 'Advanced 进阶' : 'Standard 基础';
}

// ══════════════════════════════════════════════════════════════
//  今日训练 Tab
// ══════════════════════════════════════════════════════════════
function TodayTab({ client, onFeedback }: { client: Client; onFeedback: (rpe: number, note: string) => void }) {
  const [feedbackRpe, setFeedbackRpe] = useState(7);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [setLogs, setSetLogs] = useState<Record<string, { done: boolean; actualReps: string; actualWeight: string }>>({});
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');

  const checkinApiUrl = (path: string) => stuApiUrl(path);

  const toggleSet = (key: string, defaultReps: string, defaultWeight: string) => {
    setSetLogs(prev => {
      const cur = prev[key];
      if (!cur) return { ...prev, [key]: { done: true, actualReps: defaultReps, actualWeight: defaultWeight } };
      return { ...prev, [key]: { ...cur, done: !cur.done } };
    });
  };
  const updateLog = (key: string, field: 'actualReps' | 'actualWeight', val: string) => {
    setSetLogs(prev => {
      const existing = prev[key] ?? { done: false, actualReps: '', actualWeight: '' };
      return { ...prev, [key]: { ...existing, [field]: val } };
    });
  };

  const todayEntry = resolveTodayEntry(client);
  const todayPlan = todayEntry.plan;
  const timelineDays = todayEntry.timelineDays;
  const todayIndex = todayEntry.dayRef?.dayIndex ?? -1;

  const allExercises = todayPlan?.modules.flatMap(m => m.exercises) ?? [];
  const totalSets = allExercises.reduce((s, ex) => s + (Number(ex.sets) || 1), 0);
  const doneSets = Object.values(setLogs).filter(v => v.done).length;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
  const anyDone = doneSets > 0;

  return (
    <div className="stu2-tab">
      {/* Hero */}
      <div className="stu2-hero">
        <div className="stu2-hero-greet">WEEK {todayEntry.dayRef?.weekNum || 1} · 第{todayEntry.dayRef?.weekNum || 1}周</div>
        <div className="stu2-hero-name">今日训练</div>
        <div className="stu2-hero-sub">
          {todayEntry.dayRef?.day?.name || todayEntry.dayRef?.dayLabel || '今日训练日'} · {membershipGroupLabel(client.membershipLevel)}
        </div>
        <div className="stu2-hero-chips">
          <span className="stu2-hero-chip hi">今日 TODAY</span>
          {todayPlan && <span className="stu2-hero-chip">{todayPlan.modules.length} 个模块</span>}
          {totalSets > 0 && <span className="stu2-hero-chip">{totalSets} 组</span>}
        </div>
      </div>

      {/* 周计划时间线 */}
      {timelineDays.length > 0 && (
        <div className="stu2-week-card">
          <div className="stu2-week-title">本周计划</div>
          <div className="stu2-timeline">
            {timelineDays.map((day, idx) => {
              const isToday = idx === todayIndex;
              const isDone = todayIndex >= 0 && idx < todayIndex;
              return (
                <div key={idx} className="stu2-tl-item">
                  <div className={`stu2-tl-dot${isDone ? ' done' : isToday ? ' today' : ''}`}>
                    {(isDone || isToday) && <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <div className="stu2-tl-body">
                    <div className={`stu2-tl-name${isToday ? ' today' : ''}`}>{day.name || `${day.day} 训练`}</div>
                    {day.focus && <div className={`stu2-tl-focus${isToday ? ' today' : ''}`}>{day.focus}</div>}
                  </div>
                  {(isToday || isDone) && (
                    <span className={`stu2-tl-badge${isToday ? ' today' : ' done'}`}>
                      {isToday ? 'TODAY' : '已完成'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 进度条 */}
      {totalSets > 0 && (
        <div className="stu2-prog-wrap">
          <div className="stu2-prog-top">
            <span className="stu2-prog-txt">已完成 {doneSets} / {totalSets} 组</span>
            <span className="stu2-prog-pct">{pct}%</span>
          </div>
          <div className="stu2-prog-track">
            <div className="stu2-prog-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="stu2-sec-lbl">今日训练计划</div>
      <div style={{ fontSize: 10, color: 'var(--stu-s400)', marginBottom: 10 }}>{getPlanVersionLabel(client)}</div>

      {todayPlan ? (
        <>
          {todayPlan.modules.map((mod, mi) => (
            <div key={mi} className="stu2-mod-card" style={{ animationDelay: `${mi * 0.05}s` }}>
              <div className="stu2-mod-hdr">
                <span className="stu2-mod-name">{mod.module_name}</span>
                {mod.format && <span className="stu2-mod-fmt">{mod.format}</span>}
              </div>
              <div>
                {mod.exercises.map((ex, ei) => {
                  const tc = getTagColor(ex.group_tag);
                  const numSets = Number(ex.sets) || 1;
                  const allDone = Array.from({ length: numSets }, (_, si) => `${ex.name}_set${si}`).every(k => setLogs[k]?.done);
                  return (
                    <div key={ei} className="stu2-ex-row">
                      <div className="stu2-ex-top">
                        {ex.group_tag && <span className="stu2-ex-tag" style={{ background: `${tc}20`, color: tc }}>{ex.group_tag}</span>}
                        <span className="stu2-ex-name">{ex.name}</span>
                        {allDone && <span style={{ fontSize: 12, color: 'var(--stu-grn)', fontWeight: 700 }}>✓</span>}
                        {ex.cue && <span className="stu2-ex-cue">{ex.cue}</span>}
                      </div>
                      <div className="stu2-set-rows">
                        {Array.from({ length: numSets }, (_, si) => {
                          const key = `${ex.name}_set${si}`;
                          const log = setLogs[key];
                          const isDone = log?.done ?? false;
                          const defReps = String(ex.reps || '');
                          const defWeight = String((ex as any).weight || '');
                          return (
                            <div key={si} className={`stu2-set-row${isDone ? ' done' : ''}`}>
                              <span className="stu2-set-num">第{si + 1}组</span>
                              <span className="stu2-set-plan">{defReps || '--'}次</span>
                              <input className="stu2-set-inp" type="number" placeholder={defReps || '次'}
                                value={log?.actualReps ?? ''} disabled={isDone}
                                onChange={e => updateLog(key, 'actualReps', e.target.value)} />
                              <span className="stu2-set-x">×</span>
                              <input className="stu2-set-inp" type="number" placeholder={defWeight || 'kg'}
                                value={log?.actualWeight ?? ''} disabled={isDone}
                                onChange={e => updateLog(key, 'actualWeight', e.target.value)} />
                              <button className={`stu2-set-check${isDone ? ' done' : ''}`}
                                onClick={() => toggleSet(key, log?.actualReps || defReps, log?.actualWeight || defWeight)}>
                                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      {ex.rest_seconds && ex.rest_seconds > 0 && <div className="stu2-rest-hint">组间休息 {ex.rest_seconds}s</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {anyDone && !showFeedback && submitStatus !== 'success' && (
            <button className="stu2-submit-btn" onClick={() => setShowFeedback(true)}>
              完成训练 · 提交反馈
            </button>
          )}
          {submitStatus === 'success' && <div className="stu2-success">🎉 训练已记录！教练已收到你的反馈</div>}
          {submitStatus === 'error' && <div className="stu2-error">记录失败，请重试</div>}

          {showFeedback && (
            <div className="stu2-feedback-panel">
              <div className="stu2-feedback-title">今天练得怎么样？</div>
              <div className="stu2-sec-lbl" style={{ marginTop: 0, marginBottom: 8 }}>疲劳程度 RPE</div>
              <div className="stu2-rpe-grid">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
                  <button key={v} className={`stu2-rpe-btn${feedbackRpe === v ? ' sel' : ''}`} onClick={() => setFeedbackRpe(v)}>{v}</button>
                ))}
              </div>
              <div className="stu2-sec-lbl" style={{ marginTop: 0, marginBottom: 6 }}>感受（选填）</div>
              <textarea
                className="textarea" rows={3}
                placeholder="今天感受、最喜欢的动作、下次想挑战的..."
                value={feedbackNote} onChange={e => setFeedbackNote(e.target.value)}
                style={{ marginBottom: 12, borderRadius: 12 }}
              />
              <div className="stu2-btn-row">
                <button className="stu2-btn-ghost" onClick={() => setShowFeedback(false)}>取消</button>
                <button className="stu2-btn-primary"
                  disabled={submitStatus === 'submitting'}
                  style={{ opacity: submitStatus === 'submitting' ? 0.7 : 1 }}
                  onClick={async () => {
                    setSubmitStatus('submitting');
                    const todayEntry2 = resolveTodayEntry(client);
                    const actualExercises = (todayPlan?.modules ?? []).flatMap(m =>
                      m.exercises.map(ex => {
                        const numSets2 = Number(ex.sets) || 1;
                        const setDetails = Array.from({ length: numSets2 }, (_, si) => {
                          const k = `${ex.name}_set${si}`; const lg = setLogs[k];
                          return { set: si + 1, actualReps: lg?.actualReps || String(ex.reps || ''), actualWeight: lg?.actualWeight || String((ex as any).weight || ''), done: lg?.done ?? false };
                        });
                        return { name: ex.name, sets_completed: setDetails.filter(s => s.done).length, set_details: setDetails };
                      })
                    );
                    try {
                      const res = await fetch(checkinApiUrl('/api/sessions'), {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clientId: client.id, date: new Date().toISOString(),
                          week: todayEntry2.dayRef?.weekNum || Number(client.current_week || 1),
                          day: todayEntry2.dayRef?.dayLabel || client.current_day,
                          rpe: feedbackRpe, note: feedbackNote,
                          performance: feedbackRpe >= 8 ? 'hard' : feedbackRpe >= 5 ? 'normal' : 'easy',
                          exercises: actualExercises,
                        }),
                      });
                      if (!res.ok) throw new Error(`HTTP ${res.status}`);
                      setSubmitStatus('success'); setShowFeedback(false); setSetLogs({}); setFeedbackNote('');
                      setTimeout(() => setSubmitStatus('idle'), 2000);
                      onFeedback(feedbackRpe, feedbackNote);
                    } catch { setSubmitStatus('error'); }
                  }}>
                  {submitStatus === 'submitting' ? '提交中...' : '提交训练记录'}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="stu2-no-plan">
          <div className="stu2-no-plan-icon">🏋️</div>
          <div className="stu2-no-plan-title">今日暂无训练计划</div>
          <div className="stu2-no-plan-sub">教练正在为你准备</div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  进步 Tab
// ══════════════════════════════════════════════════════════════
function HrTrendSection({ clientId }: { clientId: string }) {
  const [pts, setPts] = useState<{ date: string; hrAvg: number }[]>([]);
  useEffect(() => {
    if (!clientId) return;
    fetch(stuApiUrl(`/api/sessions?clientId=${encodeURIComponent(clientId)}&limit=10`))
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((json: any) => {
        const list: any[] = Array.isArray(json) ? json : (json.sessions || []);
        const filtered = list.filter((s: any) => typeof s.hrAvg === 'number' && s.hrAvg > 0)
          .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(-10).map((s: any) => ({ date: String(s.date || '').slice(5, 10), hrAvg: s.hrAvg as number }));
        setPts(filtered);
      }).catch(() => setPts([]));
  }, [clientId]);

  if (pts.length < 2) return null;
  const W = 300; const H = 80; const pL = 6; const pR = 6; const pT = 8; const pB = 6;
  const vals = pts.map(p => p.hrAvg);
  const yMin = Math.max(40, Math.min(...vals) - 8); const yMax = Math.min(200, Math.max(...vals) + 8);
  const x = (i: number) => pL + (i / (pts.length - 1)) * (W - pL - pR);
  const y = (v: number) => pT + (1 - (v - yMin) / Math.max(yMax - yMin, 1)) * (H - pT - pB);
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.hrAvg).toFixed(1)}`).join(' ');

  return (
    <div className="stu2-chart-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="stu2-chart-title" style={{ marginBottom: 0 }}>心率趋势</div>
        <div style={{ fontSize: 10, color: 'var(--stu-s400)' }}>近 {pts.length} 节课</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, overflow: 'visible' }}>
        <defs><linearGradient id="hrGrad2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f97316" stopOpacity=".18"/><stop offset="100%" stopColor="#f97316" stopOpacity="0"/></linearGradient></defs>
        <path d={`${pathD} L${x(pts.length - 1).toFixed(1)} ${H} L${pL} ${H} Z`} fill="url(#hrGrad2)"/>
        <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {pts.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.hrAvg)} r="3" fill="#fff" stroke="#f97316" strokeWidth="1.5"/>)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 9, color: 'var(--stu-s400)' }}>{pts[0].date}</span>
        <span style={{ fontSize: 9, color: 'var(--stu-s400)' }}>{pts[pts.length - 1].date}</span>
      </div>
    </div>
  );
}

function ProgressTab({ client }: { client: Client }) {
  const sessions = client.sessions || [];
  const assessments = Array.isArray((client as any).assessments)
    ? [...(client as any).assessments].filter((a: any) => a?.date).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];
  const latestA = assessments[assessments.length - 1] || {};
  const prevA = assessments[assessments.length - 2] || {};
  const weightDelta = (latestA.weight && prevA.weight) ? +(latestA.weight - prevA.weight).toFixed(1) : null;
  const bfDelta = (latestA.bf_pct != null && prevA.bf_pct != null) ? +(latestA.bf_pct - prevA.bf_pct).toFixed(1) : null;
  const fatDelta = (latestA.fat_kg != null && prevA.fat_kg != null) ? +(latestA.fat_kg - prevA.fat_kg).toFixed(1) : null;
  const smmDelta = (latestA.smm_kg != null && prevA.smm_kg != null) ? +(latestA.smm_kg - prevA.smm_kg).toFixed(1) : null;
  const recentRpes = sessions.slice(-6).map((s: any) => s.rpe || 0).filter(Boolean);
  const avgRpe = recentRpes.length ? +(recentRpes.reduce((a: number, b: number) => a + b, 0) / recentRpes.length).toFixed(1) : null;
  const rpeTrend = recentRpes.length >= 2 ? recentRpes[recentRpes.length - 1] - recentRpes[0] : 0;
  const blocks = (client as any).published_blocks || (client as any).blocks || [];
  const currentBlock = blocks[blocks.length - 1];

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const generateAiReport = async () => {
    setLoadingReport(true); setAiReport(null);
    try {
      const resp = await fetch(stuApiUrl('/api/progress-report'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipLevel: client.membershipLevel, totalSessions: sessions.length, blockTitle: currentBlock?.title || '', avgRpe, rpeTrend, weightDelta, bfDelta, fitnessGoal: (client as any).fitness_goal || client.goal || '' }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || '生成失败');
      setAiReport(json.report || '报告生成中，请稍后重试。');
    } catch { setAiReport('网络错误，请稍后重试。'); } finally { setLoadingReport(false); }
  };

  const statItems = [
    { label: '体重', value: latestA.weight ?? client.weight, unit: 'kg', delta: weightDelta, goodDown: true, color: 'var(--stu-acc)' },
    { label: '体脂率', value: latestA.bf_pct, unit: '%', delta: bfDelta, goodDown: true, color: '#D14A63' },
    { label: '脂肪重量', value: latestA.fat_kg, unit: 'kg', delta: fatDelta, goodDown: true, color: '#D97706' },
    { label: '骨骼肌', value: latestA.smm_kg, unit: 'kg', delta: smmDelta, goodDown: false, color: '#0D9488' },
    { label: '腰臀比', value: latestA.whr, unit: '', delta: null, goodDown: true, color: '#2563EB' },
    { label: '总课次', value: sessions.length, unit: '节', delta: null, goodDown: false, color: 'var(--stu-acc)' },
  ];

  return (
    <div className="stu2-tab">
      <div className="stu2-page-title">我的进步</div>
      <div className="stu2-page-sub">
        {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
        {assessments.length > 0 && ` · 共 ${assessments.length} 次体测`}
      </div>

      <div className="stu2-stats-grid">
        {statItems.map(item => (
          <div key={item.label} className="stu2-stat-card" style={{ borderColor: `${item.color}30` }}>
            <div className="stu2-stat-lbl">{item.label}</div>
            <div className="stu2-stat-val" style={{ color: item.value != null ? item.color : 'var(--stu-s300)' }}>
              {item.value ?? '—'}{item.value != null && item.unit && <span className="stu2-stat-unit">{item.unit}</span>}
            </div>
            {item.delta !== null && (
              <div className="stu2-stat-delta" style={{ color: (item.goodDown ? item.delta! < 0 : item.delta! > 0) ? 'var(--stu-grn)' : 'var(--stu-red)' }}>
                {item.delta! > 0 ? '↑' : '↓'} {Math.abs(item.delta!)}{item.unit} 较上次
              </div>
            )}
            {item.delta === null && item.value == null && <div style={{ fontSize: 10, color: 'var(--stu-s300)', marginTop: 4 }}>待体测</div>}
          </div>
        ))}
      </div>

      {assessments.length >= 2 && (
        <div className="stu2-chart-card">
          <div className="stu2-chart-title">身体数据趋势</div>
          {[
            { key: 'weight', label: '体重', unit: 'kg', color: '#6C63FF', current: latestA.weight },
            { key: 'bf_pct', label: '体脂率', unit: '%', color: '#D14A63', current: latestA.bf_pct },
            { key: 'fat_kg', label: '脂肪重量', unit: 'kg', color: '#D97706', current: latestA.fat_kg },
            { key: 'smm_kg', label: '骨骼肌', unit: 'kg', color: '#0D9488', current: latestA.smm_kg },
          ].map(metric => {
            const pts2 = assessments.map((a: any) => ({ v: a[metric.key], date: a.date })).filter((p: any) => p.v != null && typeof p.v === 'number');
            if (pts2.length < 2) return null;
            const vals2 = pts2.map((p: any) => p.v as number);
            const minV = Math.min(...vals2); const maxV = Math.max(...vals2); const range = maxV - minV || 1;
            const W2 = 280; const H2 = 44;
            const xf = (i: number) => (i / (pts2.length - 1)) * (W2 - 12) + 6;
            const yf = (v: number) => H2 - ((v - minV) / range) * (H2 - 10) - 5;
            const pathD2 = pts2.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'} ${xf(i).toFixed(1)} ${yf(p.v).toFixed(1)}`).join(' ');
            const diff = +(vals2[vals2.length - 1] - vals2[0]).toFixed(2);
            const gid = `g2_${metric.key}`;
            return (
              <div key={metric.key} className="stu2-chart-row">
                <div className="stu2-chart-head">
                  <span className="stu2-chart-metric">{metric.label}</span>
                  <div className="stu2-chart-num-wrap">
                    <span className="stu2-chart-num" style={{ color: metric.color }}>{metric.current ?? vals2[vals2.length - 1]}</span>
                    <span className="stu2-chart-unit">{metric.unit}</span>
                    <span className="stu2-chart-diff" style={{ color: diff === 0 ? 'var(--stu-s400)' : diff > 0 ? 'var(--stu-red)' : 'var(--stu-grn)' }}>{diff > 0 ? '+' : ''}{diff}{metric.unit}</span>
                  </div>
                </div>
                <svg viewBox={`0 0 ${W2} ${H2}`} style={{ width: '100%', height: H2, overflow: 'visible' }}>
                  <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={metric.color} stopOpacity=".18"/><stop offset="100%" stopColor={metric.color} stopOpacity="0"/></linearGradient></defs>
                  <path d={`${pathD2} L ${xf(pts2.length - 1).toFixed(1)} ${H2} L 6 ${H2} Z`} fill={`url(#${gid})`}/>
                  <path d={pathD2} fill="none" stroke={metric.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  {pts2.map((p: any, i: number) => <circle key={i} cx={xf(i)} cy={yf(p.v)} r="3" fill="#fff" stroke={metric.color} strokeWidth="2"/>)}
                </svg>
              </div>
            );
          })}
        </div>
      )}

      {sessions.length > 0 && (
        <div className="stu2-chart-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div className="stu2-chart-title" style={{ marginBottom: 0 }}>训练强度趋势</div>
            <div style={{ fontSize: 10, color: 'var(--stu-s400)' }}>近 {Math.min(sessions.length, 10)} 节课</div>
          </div>
          <div className="stu2-rpe-bars">
            {sessions.slice(-10).map((s: any, i: number) => {
              const rpe = s.rpe || 5;
              const h = Math.round((rpe / 10) * 50) + 4;
              const color = rpe >= 8 ? 'var(--stu-red)' : rpe <= 4 ? 'var(--stu-grn)' : 'var(--stu-acc)';
              return (
                <div key={i} className="stu2-rpe-bar-wrap">
                  <div className="stu2-rpe-bar" style={{ height: h, background: color }} />
                  <span className="stu2-rpe-bar-val">{rpe}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {blocks.length > 0 && (
        <div className="stu2-chart-card">
          <div className="stu2-chart-title">训练阶段</div>
          <div className="stu2-stages">
            {blocks.map((b: any, i: number) => {
              const isActive = i === blocks.length - 1; const isDone = i < blocks.length - 1;
              return (
                <div key={i} className="stu2-stage" style={{
                  background: isActive ? 'var(--stu-acc2)' : isDone ? 'var(--stu-grn2)' : 'var(--stu-s50)',
                  color: isActive ? 'var(--stu-acc)' : isDone ? 'var(--stu-grn)' : 'var(--stu-s400)',
                  borderRight: i < blocks.length - 1 ? '1.5px solid var(--stu-s200)' : 'none',
                }}>
                  {isDone ? '✓ ' : isActive ? '▶ ' : ''}{b.title?.replace('期', '') || `B${i + 1}`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <HrTrendSection clientId={client.id} />

      <div className="stu2-ai-card">
        <div className="stu2-ai-header">
          <div className="stu2-ai-title">✨ 本阶段进展报告</div>
          <button className="stu2-ai-btn" disabled={loadingReport || sessions.length === 0} onClick={generateAiReport}>
            {loadingReport ? '生成中...' : aiReport ? '重新生成' : 'AI 生成报告'}
          </button>
        </div>
        {aiReport && <div className="stu2-ai-body">{aiReport}</div>}
        {!aiReport && !loadingReport && sessions.length > 0 && <div style={{ fontSize: 11, color: 'var(--stu-s400)' }}>点击生成个性化训练进度分析</div>}
        {loadingReport && <div className="dots" style={{ marginTop: 8 }}><span/><span/><span/></div>}
        {sessions.length === 0 && <div style={{ fontSize: 11, color: 'var(--stu-s400)', marginTop: 6 }}>完成第一次训练后可生成报告</div>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  历史 Tab
// ══════════════════════════════════════════════════════════════
function HistoryTab({ client }: { client: Client }) {
  const [apiSessions, setApiSessions] = useState<any[] | null>(null);
  const [histLoading, setHistLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [showFullTraining, setShowFullTraining] = useState<number | null>(null);

  useEffect(() => {
    if (!client.id) { setHistLoading(false); return; }
    setHistLoading(true);
    fetch(stuApiUrl(`/api/sessions?clientId=${encodeURIComponent(client.id)}&limit=100`))
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then((json: any) => {
        const list: any[] = Array.isArray(json) ? json : (json.sessions || []);
        const local = client.sessions || [];
        const merged = [...list];
        for (const _s of local) {
          const s = _s as any;
          const dup = merged.some(a => (a._id && s._id && a._id === s._id) || (a.id && s.id && a.id === s.id) || (a.date && s.date && a.date === s.date && String(a.week || '') === String(s.week || '')));
          if (!dup) merged.push(s);
        }
        merged.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
        setApiSessions(merged);
      }).catch(() => setApiSessions(null)).finally(() => setHistLoading(false));
  }, [client.id]);

  const sessions = histLoading ? [] : (apiSessions ?? [...(client.sessions || [])].reverse());

  const toggleExpand = (i: number) => setExpandedIdx(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const getHeartRateData = (session: any) => {
    const zd = (session?.hrZoneDurations || {}) as Record<number, number>;
    const hasHr = typeof session?.hrAvg === 'number' || typeof session?.hrMax === 'number' || Object.keys(zd).length > 0;
    if (!hasHr) return { avg: '--', max: '--', kcal: typeof session?.kcal === 'number' ? session.kcal.toFixed(1) : '--', zones: { z1:1,z2:1,z3:1,z4:1,z5:1 } };
    return { avg: typeof session?.hrAvg === 'number' ? session.hrAvg : '--', max: typeof session?.hrMax === 'number' ? session.hrMax : '--', kcal: typeof session?.kcal === 'number' ? session.kcal.toFixed(1) : '--', zones: { z1: Number(zd[1]||0), z2: Number(zd[2]||0), z3: Number(zd[3]||0), z4: Number(zd[4]||0), z5: Number(zd[5]||0) } };
  };

  const getFullTrainingContent = (session: any) => {
    const rawExercises: any[] = Array.isArray(session?.exercises) ? session.exercises : [];
    if (rawExercises.length > 0) {
      const moduleMap: Record<string, any[]> = {};
      rawExercises.forEach((ex: any) => { const mn = ex.module_name || ex.sectionTitle || '训练内容'; if (!moduleMap[mn]) moduleMap[mn] = []; moduleMap[mn].push(ex); });
      return { date: session.date, duration: session.duration || 0, rpe: session.rpe || 0, modules: Object.entries(moduleMap).map(([name, exs]) => ({ name, format: exs[0]?.sectionFormat || '', exercises: exs.map((ex: any) => ({ name: ex.name || '', sets: ex.sets_completed != null ? `${ex.sets_completed}组` : (ex.sets ? `${ex.sets}组` : ''), reps: ex.reps || '', rhythm: ex.rhythm || undefined, rest: ex.rest_seconds ? `${ex.rest_seconds}s` : undefined, cue: ex.cue || undefined })) })) };
    }
    return { date: session.date, duration: session.duration || 0, rpe: session.rpe || 0, modules: [] };
  };

  const parseDateParts = (dateStr: string) => {
    const parts = (dateStr || '').split(/[\/\-]/);
    if (parts.length >= 3) return { day: parts[2].padStart(2, '0'), mon: ['', 'JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][parseInt(parts[1])] || parts[1] };
    return { day: '--', mon: '---' };
  };

  return (
    <div className="stu2-tab">
      <div className="stu2-page-title">训练历史</div>
      {histLoading && <div className="stu2-loading">加载中...</div>}
      {!histLoading && sessions.length === 0 && (
        <div className="stu2-empty">
          <div className="stu2-empty-icon">⏱</div>
          <div className="stu2-empty-title">暂无训练记录</div>
          <div className="stu2-empty-sub">完成第一节课后会显示在这里</div>
        </div>
      )}
      {sessions.map((s, i) => {
        const isExpanded = expandedIdx.has(i);
        const hr = getHeartRateData(s);
        const { day, mon } = parseDateParts(String(s.date || ''));
        return (
          <div key={i} className="stu2-hist-item">
            <div className="stu2-hist-hdr" onClick={() => toggleExpand(i)}>
              <div className="stu2-hist-date">
                <div className="stu2-hist-day">{day}</div>
                <div className="stu2-hist-mon">{mon}</div>
              </div>
              <div className="stu2-hist-info">
                <div className="stu2-hist-name">{s.day || '训练记录'}</div>
                <div className="stu2-hist-meta">{s.duration || 0}min · RPE {s.rpe || '--'}</div>
                <div className="stu2-hist-chips">
                  {s.performance && <span className="stu2-hist-chip" style={{ background: 'var(--stu-grn2)', color: 'var(--stu-grn)' }}>{s.performance === 'hard' ? '高强度' : s.performance === 'normal' ? '良好' : s.performance}</span>}
                  {s.week && <span className="stu2-hist-chip" style={{ background: 'var(--stu-acc2)', color: 'var(--stu-acc)' }}>Week {s.week}</span>}
                  {s.rpe >= 8 && <span className="stu2-hist-chip" style={{ background: 'rgba(240,68,56,.08)', color: 'var(--stu-red)' }}>RPE {s.rpe}</span>}
                </div>
              </div>
              <div className={`stu2-hist-arrow${isExpanded ? ' open' : ''}`}>
                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
            {isExpanded && (
              <div className="stu2-hist-detail">
                <div className="stu2-hist-hr-grid">
                  <div className="stu2-hist-hr-cell"><div className="stu2-hist-hr-v" style={{ color: 'var(--stu-acc)' }}>{hr.avg}</div><div className="stu2-hist-hr-l">平均 BPM</div></div>
                  <div className="stu2-hist-hr-cell"><div className="stu2-hist-hr-v" style={{ color: 'var(--stu-red)' }}>{hr.max}</div><div className="stu2-hist-hr-l">最高 BPM</div></div>
                  <div className="stu2-hist-hr-cell"><div className="stu2-hist-hr-v" style={{ color: 'var(--stu-amb)' }}>{hr.kcal}</div><div className="stu2-hist-hr-l">消耗 kcal</div></div>
                </div>
                <div className="stu2-zone-strip">
                  {[['#4CAF50', hr.zones.z1], ['#8BC34A', hr.zones.z2], ['#FFC107', hr.zones.z3], ['#FF9800', hr.zones.z4], ['#F44336', hr.zones.z5]].map(([c, v], zi) => (
                    <div key={zi} style={{ flex: Number(v) || 1, background: c as string }} title={`Z${zi + 1}`} />
                  ))}
                </div>
                {s.note && <div style={{ fontSize: 12, color: 'var(--stu-s600)', fontStyle: 'italic', paddingLeft: 8, borderLeft: '2px solid var(--stu-s200)', lineHeight: 1.55 }}>{s.note}</div>}
                <button
                  style={{ marginTop: 10, padding: '6px 14px', borderRadius: 8, background: 'var(--stu-s50)', border: '1.5px solid var(--stu-s200)', color: 'var(--stu-s600)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font)' }}
                  onClick={e => { e.stopPropagation(); setShowFullTraining(i); }}>
                  查看完整训练内容
                </button>
              </div>
            )}
          </div>
        );
      })}

      {showFullTraining !== null && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowFullTraining(null)}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: '20px 20px 0 0', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 3, background: 'var(--stu-s200)', borderRadius: 2, margin: '10px auto 0' }} />
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--stu-s100)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--stu-s900)' }}>完整训练内容</div>
              <div style={{ fontSize: 12, color: 'var(--stu-s400)', marginTop: 2 }}>{sessions[showFullTraining]?.date} · {sessions[showFullTraining]?.duration || 0}分钟 · RPE {sessions[showFullTraining]?.rpe || '--'}</div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {getFullTrainingContent(sessions[showFullTraining]).modules.length === 0
                ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--stu-s400)', fontSize: 13 }}>本次课程暂无详细动作记录</div>
                : getFullTrainingContent(sessions[showFullTraining]).modules.map((module, mIdx) => (
                  <div key={mIdx} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--stu-s900)' }}>{module.name}</div>
                      {module.format && <span style={{ fontSize: 11, color: 'var(--stu-s500)', background: 'var(--stu-s50)', padding: '2px 6px', borderRadius: 4 }}>{module.format}</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {module.exercises.map((ex, eIdx) => (
                        <div key={eIdx} style={{ background: 'var(--stu-s50)', borderRadius: 10, padding: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--stu-s900)', marginBottom: 4 }}>{ex.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--stu-s600)', marginBottom: 4 }}>{ex.sets} × {ex.reps}{ex.rhythm ? ` · ${ex.rhythm}` : ''}{ex.rest ? ` · 休息${ex.rest}` : ''}</div>
                          {ex.cue && <div style={{ fontSize: 11, color: 'var(--stu-s500)', fontStyle: 'italic' }}>💡 {ex.cue}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              }
            </div>
            <div style={{ padding: 16, borderTop: '1px solid var(--stu-s100)' }}>
              <button className="stu2-btn-primary" style={{ width: '100%' }} onClick={() => setShowFullTraining(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  档案 Tab
// ══════════════════════════════════════════════════════════════
function ProfileTab({ client }: { client: Client }) {
  const assessments = Array.isArray((client as any).assessments)
    ? [...(client as any).assessments].filter((a: any) => a?.date).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];
  const latestA = assessments[0] || {};
  const initial = client.name?.[0] ?? '?';

  return (
    <div className="stu2-tab">
      <div className="stu2-profile-hero">
        <div className="stu2-avatar">{initial}</div>
        <div>
          <div className="stu2-profile-name">{client.name}</div>
          <div className="stu2-profile-badge">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            {tierLabel(client.membershipLevel)}
          </div>
        </div>
      </div>

      {client.injury && (
        <div className="stu2-injury-banner">
          <div className="stu2-injury-label">⚠ 伤病限制</div>
          <div className="stu2-injury-txt">{client.injury}</div>
          <div className="stu2-injury-note">AI 已自动规避相关动作</div>
        </div>
      )}

      <div className="stu2-profile-card">
        <div className="stu2-profile-card-title">基本信息</div>
        {[
          ['姓名', client.name],
          ['性别', client.gender === 'female' ? '女' : '男'],
          ['年龄', client.age ? `${client.age}岁` : '—'],
          ['身高', latestA.height ? `${latestA.height}cm` : client.height ? `${client.height}cm` : '—'],
          ['体重', latestA.weight ? `${latestA.weight}kg` : client.weight ? `${client.weight}kg` : '—'],
          ['训练目标', client.goal || '—'],
          ['训练方式', membershipGroupLabel(client.membershipLevel)],
          ['会员档位', tierLabel(client.membershipLevel)],
          ['周期', client.weeks ? `${client.weeks}周` : '—'],
          ['路书码', client.roadCode || client.id],
        ].map(([k, v]) => (
          <div key={k} className="stu2-profile-row">
            <span className="stu2-profile-key">{k}</span>
            <span className="stu2-profile-val" style={k === '路书码' ? { fontFamily: "'DM Mono', var(--mono)", fontSize: 12 } : {}}>{v}</span>
          </div>
        ))}
      </div>

      {assessments.length > 0 && (
        <div className="stu2-profile-card">
          <div className="stu2-profile-card-title">最近体测</div>
          {[
            ['体脂率', latestA.bf_pct != null ? `${latestA.bf_pct}%` : '—', '#D14A63'],
            ['骨骼肌', latestA.smm_kg != null ? `${latestA.smm_kg}kg` : '—', '#0D9488'],
            ['基础代谢', latestA.bmr != null ? `${latestA.bmr} kcal` : '—', 'var(--stu-acc)'],
            ['腰臀比', latestA.whr != null ? String(latestA.whr) : '—', '#2563EB'],
            ['体测日期', latestA.date || '—', 'var(--stu-s700)'],
          ].map(([k, v, c]) => (
            <div key={k} className="stu2-profile-row">
              <span className="stu2-profile-key">{k}</span>
              <span className="stu2-profile-val" style={{ color: c as string }}>{v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  饮食 Tab
// ══════════════════════════════════════════════════════════════
interface StuAiDraft { id: string; status: 'pending' | 'approved' | 'rejected'; output_result: string; createdAt: string; }
type StuDayMenu = { breakfast?: string; lunch?: string; dinner?: string; snack?: string; [k: string]: string | undefined };
function parseStuDiet(raw: string): Record<string, StuDayMenu> | null {
  try { const j = JSON.parse(raw); if (j && typeof j === 'object' && !Array.isArray(j)) return j; } catch { /**/ }
  return null;
}
const STU_DAY: Record<string, string> = { monday:'周一', tuesday:'周二', wednesday:'周三', thursday:'周四', friday:'周五', saturday:'周六', sunday:'周日' };
const STU_MEAL: Record<string, string> = { breakfast:'早餐', lunch:'午餐', dinner:'晚餐', snack:'加餐' };
const MEAL_ICONS: Record<string, string> = { breakfast:'🌅', lunch:'☀️', dinner:'🌙', snack:'🍎' };

function DietTab({ client }: { client: Client }) {
  const [drafts, setDrafts] = useState<StuAiDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useEffect(() => {
    if (!client.id) return;
    setLoading(true);
    fetch(stuApiUrl(`/api/ai/drafts?clientId=${encodeURIComponent(client.id)}&planType=diet&status=approved`))
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(json => {
        const list: StuAiDraft[] = Array.isArray(json) ? json : (json.drafts || []);
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setDrafts(list);
      }).catch(() => setDrafts([])).finally(() => setLoading(false));
  }, [client.id]);

  if (loading) return <div className="stu2-loading">加载中...</div>;
  if (drafts.length === 0) return (
    <div className="stu2-tab">
      <div className="stu2-page-title">饮食方案</div>
      <div className="stu2-empty"><div className="stu2-empty-icon">🥗</div><div className="stu2-empty-title">教练暂未制定饮食计划</div><div className="stu2-empty-sub">待教练生成并审核后将在此显示</div></div>
    </div>
  );

  const current = drafts[selectedIdx];
  const parsed = parseStuDiet(current.output_result);

  return (
    <div className="stu2-tab">
      <div className="stu2-page-title">饮食方案</div>
      {drafts.length > 1 && (
        <div className="stu2-diet-tabs">
          {drafts.map((d, i) => (
            <button key={d.id} className="stu2-diet-tab-btn" onClick={() => setSelectedIdx(i)} style={{ border: i === selectedIdx ? '1.5px solid var(--stu-acc)' : '1px solid var(--stu-s200)', background: i === selectedIdx ? 'var(--stu-acc2)' : 'transparent', color: i === selectedIdx ? 'var(--stu-acc)' : 'var(--stu-s500)' }}>
              {new Date(d.createdAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
            </button>
          ))}
        </div>
      )}
      {parsed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(parsed).map(([dayKey, meals]) => (
            <div key={dayKey} className="stu2-diet-card">
              <div className="stu2-diet-hdr">
                <div>
                  <div className="stu2-diet-name">{STU_DAY[dayKey.toLowerCase()] || dayKey}</div>
                </div>
                <span className="stu2-diet-status" style={{ background: 'var(--stu-grn2)', color: 'var(--stu-grn)' }}>已确认</span>
              </div>
              <div className="stu2-diet-body">
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mk => {
                  const content = meals[mk]; if (!content) return null;
                  return (
                    <div key={mk} className="stu2-meal-row">
                      <div className="stu2-meal-icon">{MEAL_ICONS[mk]}</div>
                      <div><div className="stu2-meal-name">{STU_MEAL[mk]}</div><div className="stu2-meal-content">{content}</div></div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--stu-s700)', background: 'rgba(255,255,255,.6)', padding: 12, borderRadius: 12 }}>{current.output_result}</pre>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  主组件
// ══════════════════════════════════════════════════════════════
type StuTab = 'today' | 'progress' | 'history' | 'profile' | 'diet';
interface StudentPortalProps { display: 'block' | 'none'; onLogout: () => void; client?: Client; }

export function StudentPortal({ display, onLogout, client: propClient }: StudentPortalProps) {
  const [tab, setTab] = useState<StuTab>('today');
  const [client, setClient] = useState<Client | null>(propClient || null);

  useEffect(() => {
    if (propClient) { setClient(propClient); return; }
    try { const stored = localStorage.getItem('fika_current_client'); if (stored) setClient(JSON.parse(stored)); } catch { /**/ }
  }, [propClient]);

  useEffect(() => {
    const clientId = propClient?.id || client?.id;
    const roadCode = String(propClient?.roadCode || client?.roadCode || '').trim().toUpperCase();
    if (!clientId && !roadCode) return;
    const syncLatestClient = async () => {
      let latest: Client | null = null;
      if (roadCode) { try { const resp = await fetch(`/api/clients/by-road-code/${encodeURIComponent(roadCode)}`); if (resp.ok) latest = await resp.json(); } catch { /**/ } }
      if (!latest && clientId) latest = findClientById(clientId);
      if (!latest) return;
      try { const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]'); const idx = all.findIndex(c => c.id === latest!.id); if (idx >= 0) all[idx] = { ...all[idx], ...latest }; else all.push(latest); localStorage.setItem('fika_clients', JSON.stringify(all)); localStorage.setItem('fika_current_client', JSON.stringify(latest)); } catch { /**/ }
      setClient(prev => isSameClientSnapshot(prev, latest) ? prev : latest);
    };
    void syncLatestClient();
    const timer = window.setInterval(() => void syncLatestClient(), 3000);
    const onStorage = () => void syncLatestClient();
    const onFocus = () => void syncLatestClient();
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('storage', onStorage); window.removeEventListener('focus', onFocus); };
  }, [propClient?.id, propClient?.roadCode, client?.id, client?.roadCode]);

  const handleFeedback = (rpe: number, note: string) => {
    if (!client) return;
    const todayEntry = resolveTodayEntry(client);
    const refs = todayEntry.refs;
    const currentRef = todayEntry.dayRef;
    const currentIdx = currentRef ? refs.findIndex(r => r.dayId === currentRef.dayId && r.weekId === currentRef.weekId && r.blockId === currentRef.blockId) : -1;
    const nextRef = currentIdx >= 0 && currentIdx + 1 < refs.length ? refs[currentIdx + 1] : currentRef || refs[0] || null;
    const updated: Client = {
      ...client,
      sessions: [...(client.sessions || []), { id: 'SE' + Date.now(), date: new Date().toLocaleDateString('zh-CN'), rpe, note, week: currentRef?.weekNum || Number(client.current_week || 1), day: currentRef?.dayLabel || client.current_day, day_id: currentRef?.dayId || client.current_day_id, block_id: currentRef?.blockId || client.current_block_id, block_index: currentRef?.blockIndex, block_week: currentRef?.weekNum }],
      current_week: nextRef?.weekNum || Number(client.current_week || 1),
      current_day: nextRef?.dayLabel || client.current_day,
      current_day_id: nextRef?.dayId || client.current_day_id,
      current_block_id: nextRef?.blockId || client.current_block_id,
    };
    setClient(updated);
    try { const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]'); const idx = all.findIndex(c => c.id === updated.id); if (idx >= 0) all[idx] = updated; else all.push(updated); localStorage.setItem('fika_clients', JSON.stringify(all)); localStorage.setItem('fika_current_client', JSON.stringify(updated)); } catch { /**/ }
  };

  const navItems: { key: StuTab; label: string; icon: ReactNode }[] = [
    { key: 'today', label: '今日', icon: <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
    { key: 'progress', label: '进步', icon: <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> },
    { key: 'history', label: '历史', icon: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { key: 'profile', label: '档案', icon: <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
    { key: 'diet', label: '饮食', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a9 9 0 00-9 9c0 4.97 4.03 9 9 9s9-4.03 9-9"/><path d="M12 6v6l4 2"/><path d="M16 2c0 3-4 5-4 5s-4-2-4-5"/></svg> },
  ];

  return (
    <div id="pg-student" className="z1" style={{ display: display === 'block' ? 'flex' : 'none', flexDirection: 'column', height: '100vh', position: 'relative', overflow: 'hidden' }}>
      {/* Header */}
      <div className="stu2-hdr">
        <div className="stu2-hdr-inner">
          <div className="stu2-brand">Fi<em>KA</em></div>
          <div className="stu2-hdr-right">
            {client && <>
              <span className="stu2-tier-badge">{tierLabel(client.membershipLevel)}</span>
              <span className="stu2-hdr-name">{client.name}</span>
            </>}
            <button className="stu2-logout-btn" onClick={onLogout}>退出</button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="stu2-content">
        {!client ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--stu-s400)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>未找到客户信息</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>请检查路书码是否正确</div>
            <button className="btn btn-o" style={{ marginTop: 16 }} onClick={onLogout}>返回登录</button>
          </div>
        ) : (
          <>
            {tab === 'today' && <TodayTab client={client} onFeedback={handleFeedback} />}
            {tab === 'progress' && <ProgressTab client={client} />}
            {tab === 'history' && <HistoryTab client={client} />}
            {tab === 'profile' && <ProfileTab client={client} />}
            {tab === 'diet' && <DietTab client={client} />}
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <nav className="stu2-nav">
        {navItems.map(item => (
          <button key={item.key} className={`stu2-nav-btn${tab === item.key ? ' active' : ''}`} onClick={() => setTab(item.key)}>
            <div className="stu2-nav-icon">{item.icon}</div>
            <span className="stu2-nav-lbl">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
