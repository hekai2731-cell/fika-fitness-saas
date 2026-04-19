/**
 * StudentPortal.tsx
 * 完整学员端：今日训练 / 进步图表 / 训练历史 / 我的档案
 * 放到 frontend/src/components/student/StudentPortal.tsx
 */

import { useState, useEffect, type ReactNode } from 'react';

// ── 类型 ─────────────────────────────────────────────────────
interface Session {
  id: string;
  date: string;
  day?: string;
  day_id?: string;
  block_id?: string;
  rpe?: number;
  duration?: number;
  performance?: string;
  note?: string;
  week?: number;
  block_index?: number;
  block_week?: number;
}

interface WeeklyData {
  date: string;
  weight?: number;
  bf?: number;
  waist?: number;
  hip?: number;
  attendance?: number;
  paid?: number;
}

interface Exercise {
  name: string;
  name_en?: string;
  group_tag?: string;
  sets: number;
  reps: string;
  rhythm?: string;
  cue?: string;
  rest_seconds?: number;
}

interface Module {
  module_name: string;
  format?: string;
  exercises: Exercise[];
}

interface Plan {
  session_name?: string;
  tier?: string;
  modules: Module[];
}

interface Client {
  id: string;
  roadCode?: string;
  membershipLevel?: 'standard' | 'advanced' | 'professional' | 'elite';
  name: string;
  gender?: string;
  age?: number;
  height?: number;
  weight?: number;
  tier?: string;
  goal?: string;
  weeks?: number;
  current_week?: number;
  current_day?: string;
  current_day_id?: string;
  current_block_id?: string;
  injury?: string;
  blocks?: Block[];
  published_blocks?: Block[];
  plan_draft_version?: number;
  plan_published_version?: number;
  plan_updated_at?: string;
  plan_published_at?: string;
  sessions?: Session[];
  weeklyData?: WeeklyData[];
}

interface Day {
  id: string;
  day: string;
  name?: string;
  focus?: string;
  modules?: Module[];
  plan?: Plan | null;
}

interface Week {
  id: string;
  week_num?: number;
  num?: number;
  focus?: string;
  days: Day[];
}

interface Block {
  id: string;
  title: string;
  focus?: string;
  training_weeks?: Week[];
  weeks?: Week[];
}

// ── 工具 ─────────────────────────────────────────────────────
function membershipGroupLabel(level?: string) {
  return (level === 'professional' || level === 'elite') ? '动力链训练' : '传统分化训练';
}
function isPro(level?: string) {
  return level === 'professional' || level === 'elite';
}

function getTagColor(tag?: string) {
  if (!tag) return '#6B7280';
  const m: Record<string, string> = { A: '#7C3AED', B: '#0D9488', C: '#D97706', D: '#DC2626', E: '#2563EB', F: '#9333EA' };
  return m[tag[0]] || '#6B7280';
}

type PublishedDayRef = {
  blockIndex: number;
  blockId: string;
  weekNum: number;
  weekId: string;
  dayIndex: number;
  dayId: string;
  dayLabel: string;
  day: Day;
  weekDays: Day[];
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
        refs.push({
          blockIndex,
          blockId: String(block.id || `block-${blockIndex}`),
          weekNum,
          weekId,
          dayIndex,
          dayId,
          dayLabel: String(day.day || ''),
          day,
          weekDays,
        });
      });
    });
  });
  return refs;
}

function resolvePointerIndex(c: Client, refs: PublishedDayRef[]): number {
  if (refs.length === 0) return -1;

  if (c.current_day_id) {
    const idxByDayId = refs.findIndex((r) => r.dayId === c.current_day_id);
    if (idxByDayId >= 0) return idxByDayId;
  }

  const idxByComposite = refs.findIndex((r) => {
    const weekMatch = c.current_week ? r.weekNum === Number(c.current_week) : true;
    const dayMatch = c.current_day ? r.dayLabel === String(c.current_day) : true;
    const blockMatch = c.current_block_id ? r.blockId === String(c.current_block_id) : true;
    return weekMatch && dayMatch && blockMatch;
  });
  if (idxByComposite >= 0) return idxByComposite;

  if (c.current_week) {
    const idxByWeek = refs.findIndex((r) => r.weekNum === Number(c.current_week));
    if (idxByWeek >= 0) return idxByWeek;
  }

  return 0;
}

function buildPlanFromDay(day: Day): Plan | null {
  const modules = Array.isArray(day.modules) ? day.modules : day.plan?.modules;
  if (Array.isArray(modules) && modules.length > 0) {
    return {
      session_name: day.name,
      modules,
    };
  }

  const summaryTitle = String(day.name || day.focus || '今日训练安排').trim();
  const summaryCue = String(day.focus || day.name || '').trim();
  if (!summaryTitle && !summaryCue) return null;

  return {
    session_name: summaryTitle || '今日训练安排',
    modules: [
      {
        module_name: summaryTitle || '今日训练安排',
        format: '已发布周计划（待细化）',
        exercises: [
          {
            name: summaryCue || '教练已发布本周计划，请按本日重点执行',
            sets: 1,
            reps: '按计划执行',
            cue: '如需具体动作组数，请在教练端生成并发布单次训练计划。',
          },
        ],
      },
    ],
  };
}

function resolveTodayEntry(c: Client): {
  plan: Plan | null;
  dayRef: PublishedDayRef | null;
  refs: PublishedDayRef[];
  timelineDays: Day[];
} {
  const refs = flattenPublishedDays(c);
  if (refs.length === 0) {
    return { plan: null, dayRef: null, refs: [], timelineDays: [] };
  }
  const pointerIndex = resolvePointerIndex(c, refs);
  const dayRef = refs[Math.max(0, pointerIndex)] || refs[0];
  return {
    plan: buildPlanFromDay(dayRef.day),
    dayRef,
    refs,
    timelineDays: dayRef.weekDays,
  };
}

function getPlanVersionLabel(c: Client): string {
  const version = Number(c.plan_published_version || 0);
  if (!version) return '当前还没有已发布计划';
  if (!c.plan_published_at) return `当前计划 v${version}`;
  const at = new Date(c.plan_published_at).toLocaleString('zh-CN', { hour12: false });
  return `当前计划 v${version} · 发布于 ${at}`;
}

function isSameClientSnapshot(a: Client | null, b: Client | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function findClientById(clientId: string): Client | null {
  try {
    const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
    return all.find((item) => item.id === clientId) || null;
  } catch {
    return null;
  }
}

// ── 今日训练 Tab ──────────────────────────────────────────────
function TodayTab({
  client,
  onFeedback,
}: {
  client: Client;
  onFeedback: (rpe: number, note: string) => void;
}) {
  const [feedbackRpe, setFeedbackRpe] = useState(7);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const todayEntry = resolveTodayEntry(client);
  const todayPlan = todayEntry.plan;
  const planVersionLabel = getPlanVersionLabel(client);

  // 定期同步教练端发布的训练内容
  useEffect(() => {
    if (!client?.id) return;

    const syncCoachData = () => {
      try {
        console.log('Syncing coach data for client:', client.id, client.roadCode);
        
        // 从教练端数据中获取最新的发布内容
        const coachClients = JSON.parse(localStorage.getItem('fika_coach_clients_v1') || '[]');
        const coachClient = coachClients.find((c: any) => c.id === client.id || c.roadCode === client.roadCode);
        
        console.log('Found coach client:', !!coachClient, coachClient?.name);
        
        if (coachClient) {
          console.log('Coach client has published_blocks:', !!coachClient.published_blocks, coachClient.published_blocks?.length);
          console.log('Current client has published_blocks:', !!client.published_blocks, client.published_blocks?.length);
          
          const currentClient = findClientById(client.id);
          if (currentClient) {
            const hasNewData =
              JSON.stringify(currentClient.published_blocks || []) !== JSON.stringify(coachClient.published_blocks || []) ||
              Number(currentClient.plan_published_version || 0) !== Number(coachClient.plan_published_version || 0) ||
              Number(currentClient.current_week || 1) !== Number(coachClient.current_week || 1) ||
              String(currentClient.current_day_id || '') !== String(coachClient.current_day_id || '') ||
              String(currentClient.current_block_id || '') !== String(coachClient.current_block_id || '');
            
            if (hasNewData) {
              console.log('Found new coach data, updating...');
              
              // 更新本地客户端数据
              const updatedClient = {
                ...currentClient,
                published_blocks: coachClient.published_blocks,
                plan_published_version: coachClient.plan_published_version,
                plan_published_at: coachClient.plan_published_at,
                current_week: coachClient.current_week,
                current_day: coachClient.current_day,
                current_day_id: coachClient.current_day_id,
                current_block_id: coachClient.current_block_id,
              };
              
              console.log('Updated client data:', {
                hasPublishedBlocks: !!updatedClient.published_blocks,
                blocksCount: updatedClient.published_blocks?.length,
                version: updatedClient.plan_published_version
              });
              
              // 更新 localStorage
              const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
              const idx = all.findIndex((c) => c.id === updatedClient.id);
              if (idx >= 0) all[idx] = updatedClient;
              else all.push(updatedClient);
              localStorage.setItem('fika_clients', JSON.stringify(all));
              localStorage.setItem('fika_current_client', JSON.stringify(updatedClient));
              
              console.log('Synced coach data to student portal');
              
              // 触发重新渲染
              window.dispatchEvent(new Event('storage'));
            } else {
              console.log('No new data found');
            }
          }
        } else {
          console.log('No coach client found for:', client.id, client.roadCode);
        }
      } catch (error) {
        console.error('Error syncing coach data:', error);
      }
    };

    // 立即同步一次
    syncCoachData();
    
    // 每10秒同步一次
    const timer = setInterval(syncCoachData, 10000);
    
    return () => clearInterval(timer);
  }, [client?.id, client?.roadCode]);

  const timelineDays = todayEntry.timelineDays;
  const todayIndex = todayEntry.dayRef?.dayIndex ?? -1;
  const weekFocusSummary = timelineDays.find((d) => d.focus)?.focus || '本周重点聚焦动作质量与强度推进，保持恢复节奏。';
  const resolvedMembershipLevel: 'standard' | 'advanced' | 'professional' | 'elite' =
    client.membershipLevel || 'standard';

  const tierTheme =
    resolvedMembershipLevel === 'elite'
      ? {
          accent: '#C33B3B',
          soft: 'rgba(195,59,59,.16)',
          ring: 'rgba(195,59,59,.3)',
          bg: 'linear-gradient(145deg, rgba(255,242,244,.96), rgba(255,226,231,.9))',
        }
      : resolvedMembershipLevel === 'professional'
        ? {
            accent: '#CF7A25',
            soft: 'rgba(207,122,37,.16)',
            ring: 'rgba(207,122,37,.3)',
            bg: 'linear-gradient(145deg, rgba(255,246,235,.96), rgba(255,231,203,.9))',
          }
        : resolvedMembershipLevel === 'advanced'
          ? {
              accent: '#2F8A56',
              soft: 'rgba(47,138,86,.16)',
              ring: 'rgba(47,138,86,.3)',
              bg: 'linear-gradient(145deg, rgba(241,251,245,.96), rgba(221,245,230,.9))',
            }
          : {
              accent: '#24262D',
              soft: 'rgba(36,38,45,.14)',
              ring: 'rgba(36,38,45,.3)',
              bg: 'linear-gradient(145deg, rgba(248,249,253,.96), rgba(233,237,245,.9))',
            };

  return (
    <div>
      {/* 周计划概览 */}
      {timelineDays.length > 0 && (
        <div
          className="card-sm"
          style={{
            padding: 12,
            marginBottom: 12,
            borderRadius: 14,
            border: `1px solid ${tierTheme.ring}`,
            background: tierTheme.bg,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.45)',
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: tierTheme.accent, letterSpacing: '.05em' }}>
              {`WEEK ${todayEntry.dayRef?.weekNum || 1}`} / 第{todayEntry.dayRef?.weekNum || 1}周
            </div>
          </div>

          <div style={{ fontSize: 13, color: '#3f4c64', lineHeight: 1.38, fontWeight: 600, marginBottom: 10 }}>
            {weekFocusSummary}
          </div>

          <div style={{ position: 'relative', paddingLeft: 2 }}>
            <div
              style={{
                position: 'absolute',
                left: 10,
                top: 2,
                bottom: 4,
                width: 3,
                borderRadius: 999,
                background: tierTheme.ring,
              }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {timelineDays.map((day, idx) => {
                const isToday = idx === todayIndex;
                const isDone = todayIndex >= 0 && idx < todayIndex;
                const isFuture = !isToday && !isDone;
                const mainColor = isToday ? tierTheme.accent : isDone ? '#2e3445' : '#9aa3bb';
                const subColor = isToday ? tierTheme.accent : isDone ? '#5f6982' : '#8c95ad';

                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, position: 'relative', zIndex: 1 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#d2d8e8',
                        display: 'grid',
                        placeItems: 'center',
                        marginTop: 2,
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 11,
                          height: 11,
                          borderRadius: '50%',
                          background: isToday ? tierTheme.accent : '#373f50',
                          opacity: isFuture ? 0.85 : 1,
                        }}
                      />
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, lineHeight: 1.2, fontWeight: 700, color: mainColor, marginBottom: 4 }}>
                        {day.name || `${day.day} 训练`}
                      </div>
                      <div style={{ fontSize: 11, lineHeight: 1.22, fontWeight: 800, color: subColor }}>
                        Focus: {day.focus || '待生成训练重点'}
                      </div>
                    </div>

                    {!isFuture && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 900,
                          letterSpacing: '.08em',
                          color: isToday ? tierTheme.accent : '#303746',
                          background: isToday ? tierTheme.soft : '#c4cad8',
                          borderRadius: 16,
                          padding: '5px 9px',
                          marginTop: 2,
                          flexShrink: 0,
                        }}
                      >
                        {isToday ? 'TODAY' : 'COMPLETED'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s600)', marginBottom: 10 }}>今日训练计划</div>
      <div style={{ fontSize: 11, color: 'var(--s500)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        {planVersionLabel}
      </div>

      {todayPlan ? (
        todayPlan.modules.map((mod, mi) => (
          <div key={mi} className="stu-module-card">
            <div className="stu-module-hdr">
              <span className="stu-module-name">{mod.module_name}</span>
              {mod.format && <span className="stu-module-fmt">{mod.format}</span>}
            </div>
            {mod.exercises.map((ex, ei) => {
              const tc = getTagColor(ex.group_tag);
              return (
                <div key={ei} className="stu-ex-row">
                  {ex.group_tag ? (
                    <span className="stu-ex-tag" style={{ background: `${tc}20`, color: tc }}>
                      {ex.group_tag}
                    </span>
                  ) : (
                    <div style={{ width: 4 }} />
                  )}
                  <div className="stu-ex-info">
                    <div className="stu-ex-name">{ex.name}</div>
                    <div className="stu-ex-sets">
                      {ex.sets}组 × {ex.reps}
                      {ex.rhythm && ` · ${ex.rhythm}`}
                      {ex.rest_seconds && ex.rest_seconds > 0 ? ` · 休息${ex.rest_seconds}s` : ''}
                    </div>
                    {ex.cue && <div className="stu-cue">{ex.cue}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ))
      ) : (
        <div className="card-sm" style={{ padding: 20, textAlign: 'center', color: 'var(--s400)', marginTop: 8 }}>
          今日暂无训练计划
          <br />
          <small>教练正在为你准备</small>
        </div>
      )}

      {todayPlan && !showFeedback && (
        <button
          type="button"
          onClick={() => setShowFeedback(true)}
          style={{
            width: '100%', height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg, var(--p), var(--p4))',
            border: 'none', color: '#fff',
            fontSize: 14, fontWeight: 700,
            marginTop: 16, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(108,99,255,.3)',
          }}
        >
          完成训练 · 提交反馈
        </button>
      )}

      {/* 课后反馈弹窗 */}
      {showFeedback && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setShowFeedback(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: '#fff',
              borderRadius: '20px 20px 0 0',
              padding: 24,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>课后反馈</div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--s500)',
                marginBottom: 8,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              疲劳度 / RPE
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
              {[
                { v: 5, label: '很轻松' },
                { v: 6, label: '还好' },
                { v: 7, label: '适中' },
                { v: 8, label: '有点累' },
                { v: 9, label: '很累' },
                { v: 10, label: '力竭' },
              ].map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  style={{
                    flex: 1,
                    height: 54,
                    borderRadius: 10,
                    border: '1.5px solid',
                    borderColor: feedbackRpe === v ? 'var(--p)' : 'var(--s200)',
                    background: feedbackRpe === v ? 'var(--p2)' : 'var(--s50)',
                    color: feedbackRpe === v ? 'var(--p)' : 'var(--s600)',
                    fontWeight: 700,
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    transition: 'all .15s',
                  }}
                  onClick={() => setFeedbackRpe(v)}
                >
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{v}</span>
                  <span style={{ fontSize: 10, opacity: 0.8 }}>{label}</span>
                </button>
              ))}
            </div>

            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--s500)',
                marginBottom: 6,
                letterSpacing: '.1em',
                textTransform: 'uppercase',
              }}
            >
              今日感受
            </div>
            <textarea
              className="textarea"
              rows={3}
              placeholder="今天感受、最喜欢的动作、下次想挑战的..."
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-o" style={{ flex: 1 }} onClick={() => setShowFeedback(false)}>
                取消
              </button>
              <button
                className="btn btn-p"
                style={{ flex: 2 }}
                onClick={() => {
                  onFeedback(feedbackRpe, feedbackNote);
                  setShowFeedback(false);
                  setFeedbackNote('');
                }}
              >
                提交反馈
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 进步 Tab ──────────────────────────────────────────────────
function ProgressTab({ client }: { client: Client }) {
  const sessions = client.sessions || [];

  // 从 assessments 读取体测历史（按日期升序）
  const assessments = Array.isArray((client as any).assessments)
    ? [...(client as any).assessments]
        .filter((a: any) => a?.date)
        .sort((a: any, b: any) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
        )
    : [];

  const latestA = assessments[assessments.length - 1] || {};
  const prevA = assessments[assessments.length - 2] || {};

  // 各项变化值
  const weightDelta = (latestA.weight && prevA.weight)
    ? +(latestA.weight - prevA.weight).toFixed(1) : null;
  const bfDelta = (latestA.bf_pct != null && prevA.bf_pct != null)
    ? +(latestA.bf_pct - prevA.bf_pct).toFixed(1) : null;
  const fatDelta = (latestA.fat_kg != null && prevA.fat_kg != null)
    ? +(latestA.fat_kg - prevA.fat_kg).toFixed(1) : null;
  const smmDelta = (latestA.smm_kg != null && prevA.smm_kg != null)
    ? +(latestA.smm_kg - prevA.smm_kg).toFixed(1) : null;
  const whrDelta = (latestA.whr != null && prevA.whr != null)
    ? +(latestA.whr - prevA.whr).toFixed(2) : null;

  // RPE趋势
  const recentRpes = sessions.slice(-6)
    .map((s: any) => s.rpe || 0).filter(Boolean);
  const avgRpe = recentRpes.length
    ? +(recentRpes.reduce((a: number, b: number) => a + b, 0) / recentRpes.length).toFixed(1)
    : null;
  const rpeTrend = recentRpes.length >= 2
    ? recentRpes[recentRpes.length - 1] - recentRpes[0] : 0;

  // 训练阶段
  const blocks = (client as any).published_blocks
    || (client as any).blocks || [];
  const currentBlock = blocks[blocks.length - 1];

  const [aiReport, setAiReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // 生成AI进度报告
  const generateAiReport = async () => {
    setLoadingReport(true);
    setAiReport(null);
    try {
      const isProduction = import.meta.env.PROD;
      const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '');
      const apiUrl = (path: string) => (apiBase ? String(apiBase).replace(/\/$/, '') + path : path);

      const resp = await fetch(apiUrl('/api/progress-report'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          membershipLevel: client.membershipLevel,
          totalSessions: sessions.length,
          blockTitle: currentBlock?.title || '',
          avgRpe,
          rpeTrend,
          weightDelta,
          bfDelta,
          fitnessGoal: (client as any).fitness_goal || client.goal || '',
        }),
      });
      const json = await resp.json();
      if (!resp.ok || json.error) throw new Error(json.error || '生成失败');
      setAiReport(json.report || '报告生成中，请稍后重试。');
    } catch {
      setAiReport('网络错误，请稍后重试。');
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 4 }}>
        我的进步
      </div>
      <div style={{ fontSize: 11, color: 'var(--s400)', marginBottom: 14, letterSpacing: '.05em' }}>
        {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' })}
        {assessments.length > 0 && ` · 共 ${assessments.length} 次体测`}
      </div>

      {/* ── 六格核心数据 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {[
          {
            label: '体重', value: latestA.weight ?? client.weight,
            unit: 'kg', delta: weightDelta,
            goodDown: true, color: 'var(--p)',
            bg: 'rgba(108,99,255,.06)',
          },
          {
            label: '体脂率', value: latestA.bf_pct,
            unit: '%', delta: bfDelta,
            goodDown: true, color: '#D14A63',
            bg: 'rgba(209,74,99,.06)',
          },
          {
            label: '脂肪重量', value: latestA.fat_kg,
            unit: 'kg', delta: fatDelta,
            goodDown: true, color: '#D97706',
            bg: 'rgba(217,119,6,.06)',
          },
          {
            label: '骨骼肌', value: latestA.smm_kg,
            unit: 'kg', delta: smmDelta,
            goodDown: false, color: '#0D9488',
            bg: 'rgba(13,148,136,.06)',
          },
          {
            label: '腰臀比', value: latestA.whr,
            unit: '', delta: whrDelta,
            goodDown: true, color: '#2563EB',
            bg: 'rgba(37,99,235,.06)',
          },
          {
            label: '总课次', value: sessions.length,
            unit: '节', delta: null,
            goodDown: false, color: 'var(--p)',
            bg: 'rgba(108,99,255,.06)',
          },
        ].map((item) => (
          <div key={item.label} className="card-sm" style={{
            padding: '12px 14px',
            background: item.bg,
            border: `1px solid ${item.color}20`,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 700,
              color: 'var(--s500)', letterSpacing: '.08em',
              marginBottom: 4,
            }}>
              {item.label}
            </div>
            <div style={{
              fontSize: 26, fontWeight: 800,
              color: item.value != null ? item.color : 'var(--s300)',
              lineHeight: 1, letterSpacing: '-.02em',
            }}>
              {item.value ?? '—'}
              {item.value != null && item.unit && (
                <span style={{ fontSize: 12, color: 'var(--s400)', marginLeft: 3 }}>
                  {item.unit}
                </span>
              )}
            </div>
            {item.delta !== null && (
              <div style={{
                fontSize: 11, fontWeight: 700, marginTop: 4,
                color: (item.goodDown ? item.delta! < 0 : item.delta! > 0)
                  ? 'var(--g)' : 'var(--r)',
              }}>
                {item.delta! > 0 ? '↑' : '↓'} {Math.abs(item.delta!)}
                {item.unit} 较上次
              </div>
            )}
            {item.delta === null && item.value == null && (
              <div style={{ fontSize: 10, color: 'var(--s300)', marginTop: 4 }}>
                待体测
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 六条进步曲线 ── */}
      {assessments.length >= 2 ? (
        <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
            身体数据趋势
          </div>

          {[
            { key: 'weight', label: '体重', unit: 'kg', color: '#6C63FF', current: latestA.weight },
            { key: 'bf_pct', label: '体脂率', unit: '%', color: '#D14A63', current: latestA.bf_pct },
            { key: 'fat_kg', label: '脂肪重量', unit: 'kg', color: '#D97706', current: latestA.fat_kg },
            { key: 'smm_kg', label: '骨骼肌含量', unit: 'kg', color: '#0D9488', current: latestA.smm_kg },
            { key: 'whr', label: '腰臀比', unit: '', color: '#2563EB', current: latestA.whr },
            { key: 'score_snapshot', label: '身体资产评分', unit: '分', color: '#7C3AED', current: latestA.score_snapshot },
          ].map((metric) => {
            const pts = assessments
              .map((a: any) => ({ v: a[metric.key], date: a.date }))
              .filter((p: any) => p.v != null && typeof p.v === 'number');

            if (pts.length < 2) return null;

            const vals = pts.map((p: any) => p.v as number);
            const minV = Math.min(...vals);
            const maxV = Math.max(...vals);
            const range = maxV - minV || 1;
            const W = 280, H = 44;
            const x = (i: number) => (i / (pts.length - 1)) * (W - 12) + 6;
            const y = (v: number) => H - ((v - minV) / range) * (H - 10) - 5;
            const pathD = pts.map((p: any, i: number) =>
              `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`
            ).join(' ');
            const gradId = `g_${metric.key}`;

            const diff = +(vals[vals.length - 1] - vals[0]).toFixed(2);
            const diffStr = diff > 0 ? `+${diff}` : `${diff}`;

            return (
              <div key={metric.key} style={{
                marginBottom: 16,
                paddingBottom: 16,
                borderBottom: '1px solid var(--s100)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'baseline',
                  justifyContent: 'space-between', marginBottom: 6,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--s600)' }}>
                    {metric.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, color: metric.color }}>
                      {metric.current ?? vals[vals.length - 1]}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--s400)' }}>{metric.unit}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      color: diff === 0 ? 'var(--s400)' : diff > 0 ? 'var(--r)' : 'var(--g)',
                    }}>
                      {diffStr}{metric.unit}
                    </span>
                  </div>
                </div>

                <svg viewBox={`0 0 ${W} ${H}`}
                  style={{ width: '100%', height: H, overflow: 'visible' }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metric.color} stopOpacity="0.18" />
                      <stop offset="100%" stopColor={metric.color} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d={`${pathD} L ${x(pts.length-1).toFixed(1)} ${H} L 6 ${H} Z`}
                    fill={`url(#${gradId})`}
                  />
                  <path
                    d={pathD}
                    fill="none"
                    stroke={metric.color}
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {pts.map((p: any, i: number) => (
                    <circle key={i}
                      cx={x(i)} cy={y(p.v)} r="3"
                      fill="#fff" stroke={metric.color} strokeWidth="2"
                    />
                  ))}
                </svg>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                  <span style={{ fontSize: 9, color: 'var(--s400)' }}>
                    {pts[0].date?.slice(5)}
                  </span>
                  <span style={{ fontSize: 9, color: 'var(--s400)' }}>
                    {pts[pts.length - 1].date?.slice(5)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card-sm" style={{
          padding: 20, marginBottom: 10,
          textAlign: 'center', color: 'var(--s400)',
          lineHeight: 1.8,
        }}>
          <div style={{ fontSize: 24, marginBottom: 6 }}>📊</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {assessments.length === 0 ? '暂无体测记录' : '再完成 1 次体测'}
          </div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {assessments.length === 0
              ? '教练完成初次体测建档后将显示进步曲线'
              : '两次体测数据后将自动生成进步曲线'}
          </div>
        </div>
      )}

      {/* ── 训练阶段进度条 ── */}
      {blocks.length > 0 && (
        <div className="card-sm" style={{ padding: 14, marginBottom: 10 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>训练阶段</div>
            <span style={{ fontSize: 11, color: 'var(--p)', fontWeight: 600 }}>
              {currentBlock?.title || '当前阶段'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {blocks.map((b: any, i: number) => {
              const isActive = i === blocks.length - 1;
              const isDone = i < blocks.length - 1;
              return (
                <div key={i} style={{
                  flex: 1, textAlign: 'center',
                  padding: '6px 4px', fontSize: 10, fontWeight: 600,
                  borderRadius: i === 0 ? '6px 0 0 6px'
                    : i === blocks.length - 1 ? '0 6px 6px 0' : 0,
                  border: '1px solid',
                  borderColor: isActive ? 'var(--p)'
                    : isDone ? 'var(--g)' : 'var(--s200)',
                  background: isActive ? 'var(--p2)'
                    : isDone ? 'var(--g2)' : 'var(--s50)',
                  color: isActive ? 'var(--p)'
                    : isDone ? '#065f46' : 'var(--s400)',
                  borderLeft: i > 0 ? 'none' : undefined,
                }}>
                  {isDone ? '✓ ' : isActive ? '▶ ' : ''}
                  {b.title?.replace('期', '') || `B${i+1}`}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RPE趋势柱状图 ── */}
      {sessions.length > 0 && (
        <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 10,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>训练强度趋势</div>
            <div style={{ fontSize: 10, color: 'var(--s400)' }}>
              近 {Math.min(sessions.length, 10)} 节课
            </div>
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60 }}>
            {sessions.slice(-10).map((s: any, i: number) => {
              const rpe = s.rpe || 5;
              const h = Math.round((rpe / 10) * 50) + 4;
              const color = rpe >= 8 ? 'var(--r)' : rpe <= 4 ? 'var(--g)' : 'var(--p)';
              return (
                <div key={i} style={{
                  flex: 1, display: 'flex',
                  flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <div style={{
                    width: '100%', background: color,
                    borderRadius: '3px 3px 0 0',
                    height: h, opacity: 0.75,
                  }} />
                  <div style={{ fontSize: 8, color: 'var(--s400)' }}>{rpe}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {[
              ['var(--g)', 'RPE ≤4 轻松'],
              ['var(--p)', 'RPE 5-7 适中'],
              ['var(--r)', 'RPE ≥8 高强度'],
            ].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                <span style={{ fontSize: 9, color: 'var(--s400)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AI进度报告 ── */}
      <div className="card-sm" style={{
        padding: 16, marginTop: 10,
        border: '1px solid var(--p3)',
        background: 'var(--p2)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: aiReport ? 12 : 0,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--p)' }}>
            本阶段进展报告
          </div>
          <button
            type="button"
            onClick={generateAiReport}
            disabled={loadingReport || sessions.length === 0}
            style={{
              padding: '4px 12px', borderRadius: 6,
              fontSize: 11, fontWeight: 600,
              cursor: loadingReport || sessions.length === 0
                ? 'not-allowed' : 'pointer',
              border: '1px solid var(--p3)',
              background: loadingReport ? 'var(--p3)' : 'var(--p)',
              color: '#fff',
              opacity: sessions.length === 0 ? 0.5 : 1,
            }}
          >
            {loadingReport ? '生成中...' : aiReport ? '重新生成' : '✨ AI 生成报告'}
          </button>
        </div>
        {aiReport && (
          <div style={{
            fontSize: 13, color: 'var(--s700)',
            lineHeight: 1.7, whiteSpace: 'pre-wrap',
          }}>
            {aiReport}
          </div>
        )}
        {!aiReport && !loadingReport && sessions.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 6 }}>
            点击生成个性化训练进度分析
          </div>
        )}
        {loadingReport && (
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <div className="dots">
              <span /><span /><span />
            </div>
          </div>
        )}
        {sessions.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 6 }}>
            完成第一次训练后可生成报告
          </div>
        )}
      </div>
    </div>
  );
}

// ── 历史 Tab ──────────────────────────────────────────────────
function HistoryTab({ client }: { client: Client }) {
  const sessions = [...(client.sessions || [])].reverse();
  const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
  const [showFullTraining, setShowFullTraining] = useState<number | null>(null);

  const toggleExpand = (index: number) => {
    setExpandedSessions(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const formatTime = (dateStr: string) => {
    if (!dateStr) return '--:--';
    // 假设时间信息存储在扩展数据中，这里返回默认时间
    return '19:30'; // 可以根据实际数据结构调整
  };

  const getHeartRateData = (session: any) => {
    const zoneDurations = (session?.hrZoneDurations || {}) as Record<number, number>;
    const hasHr = typeof session?.hrAvg === 'number' || typeof session?.hrMax === 'number' || Object.keys(zoneDurations).length > 0;

    if (!hasHr) {
      return {
        avg: '--',
        max: '--',
        kcal: typeof session?.kcal === 'number' ? session.kcal.toFixed(1) : '--',
        zones: {
          zone1: 1,
          zone2: 1,
          zone3: 1,
          zone4: 1,
          zone5: 1,
        },
      };
    }

    return {
      avg: typeof session?.hrAvg === 'number' ? session.hrAvg : '--',
      max: typeof session?.hrMax === 'number' ? session.hrMax : '--',
      kcal: typeof session?.kcal === 'number' ? session.kcal.toFixed(1) : '--',
      zones: {
        zone1: Number(zoneDurations[1] || 0),
        zone2: Number(zoneDurations[2] || 0),
        zone3: Number(zoneDurations[3] || 0),
        zone4: Number(zoneDurations[4] || 0),
        zone5: Number(zoneDurations[5] || 0),
      },
    };
  };

  const getFullTrainingContent = (session: any) => {
    // 模拟完整训练内容，实际应从session数据中获取
    return {
      date: session.date,
      duration: session.duration || 60,
      rpe: session.rpe || 7,
      modules: [
        {
          name: '模块A：非对称大重量',
          format: '拮抗超级组',
          exercises: [
            { name: '哑铃垫高后撤步弓步蹲', sets: '4组', reps: '8次/侧', rhythm: 'X012', rest: undefined, cue: '爆发蹬起，顶峰锁定' },
            { name: 'TRX抗伸展推', sets: '4组', reps: '10次', rhythm: 'X012', rest: '75s', cue: '推离身体，核心绷紧' },
            { name: '单手壶铃摆', sets: '4组', reps: '12次/侧', rhythm: 'X012', rest: undefined, cue: '髋铰弹射，壶铃浮空' }
          ]
        },
        {
          name: '模块B：核心稳定',
          format: '循环训练',
          exercises: [
            { name: '平板支撑', sets: '3组', reps: '45s', rhythm: undefined, rest: '30s', cue: '核心收紧，身体成直线' },
            { name: '侧平板支撑', sets: '3组', reps: '30s/侧', rhythm: undefined, rest: '30s', cue: '髋部稳定，不要下沉' },
            { name: '鸟狗式', sets: '3组', reps: '12次/侧', rhythm: '2010', rest: undefined, cue: '控制动作，保持平衡' }
          ]
        },
        {
          name: '模块C：拉伸放松',
          format: '静态拉伸',
          exercises: [
            { name: '髋屈肌拉伸', sets: '2组', reps: '30s/侧', rhythm: undefined, rest: undefined, cue: '感受髋部前侧拉伸' },
            { name: '胸椎伸展', sets: '2组', reps: '45s', rhythm: undefined, rest: undefined, cue: '呼吸配合，放松上背' },
            { name: '腘绳肌拉伸', sets: '2组', reps: '30s/侧', rhythm: undefined, rest: undefined, cue: '膝盖微屈，避免过度牵拉' }
          ]
        }
      ]
    };
  };

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 14 }}>训练历史</div>
      {sessions.length > 0 ? (
        sessions.map((s, i) => {
          const isExpanded = expandedSessions.has(i);
          const heartRateData = getHeartRateData(s);
          
          return (
            <div key={i}>
              {/* 主记录卡片 */}
              <div
                className="card-sm"
                style={{ 
                  padding: '12px 14px', 
                  marginBottom: isExpanded ? 0 : 8, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12,
                  cursor: 'pointer',
                  borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                  background: 'rgba(255,255,255,0.8)',
                }}
                onClick={() => toggleExpand(i)}
              >
                {/* 日期块 */}
                <div style={{ width: 44, textAlign: 'center', background: 'var(--s50)', borderRadius: 8, padding: '5px 0', flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--s800)', lineHeight: 1 }}>{(s.date || '').split('/').slice(-1)[0] || '—'}</div>
                  <div style={{ fontSize: 9, color: 'var(--s400)' }}>{(s.date || '').split('/').slice(0, 2).join('/')}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--s800)' }}>{s.day || ''} {s.performance || ''}</div>
                  <div style={{ fontSize: 10, color: 'var(--s400)', marginTop: 2 }}>{s.duration || 0}min{s.note ? ' · ' + s.note.slice(0, 24) : ''}</div>
                  {(s.day || s.note) && (
                    <div style={{
                      fontSize: 12, color: 'var(--s600)',
                      marginTop: 4, fontWeight: 600,
                    }}>
                      {s.day || '训练记录'}
                      {s.duration ? ` · ${s.duration}分钟` : ''}
                    </div>
                  )}
                  {s.note && (
                    <div style={{
                      fontSize: 11, color: 'var(--s400)',
                      marginTop: 4, fontStyle: 'italic',
                      paddingLeft: 8,
                      borderLeft: '2px solid var(--s200)',
                      lineHeight: 1.5,
                    }}>
                      {s.note}
                    </div>
                  )}
                </div>
                {s.rpe && (
                  <span className={`badge ${s.rpe >= 8 ? 'br' : s.rpe <= 4 ? 'bg_' : 'bp'}`}>RPE {s.rpe}</span>
                )}
                <div style={{ fontSize: 12, color: 'var(--s400)', transition: 'transform 0.2s' }}>
                  {isExpanded ? '▲' : '▼'}
                </div>
              </div>

              {/* 展开的详细信息 */}
              {isExpanded && (
                <div 
                  className="card-sm" 
                  style={{ 
                    padding: 16, 
                    marginBottom: 8, 
                    borderRadius: '0 0 12px 12px',
                    borderTop: '1px solid var(--s100)',
                    background: 'var(--s25)'
                  }}
                >
                  {/* 训练档位 */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--s500)', marginBottom: 4 }}>训练档位</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 14, color: 'var(--s800)' }}>
                        {isPro(client.membershipLevel) ? '动力链训练' : '传统分化训练'}
                      </div>
                      <button
                        className="btn btn-o"
                        style={{ fontSize: 11, padding: '4px 8px', height: 'auto' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFullTraining(i);
                        }}
                      >
                        查看完整训练内容
                      </button>
                    </div>
                  </div>

                  {/* 具体时间 */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--s500)', marginBottom: 4 }}>具体时间</div>
                    <div style={{ fontSize: 14, color: 'var(--s800)' }}>
                      {s.date} {formatTime(s.date)}
                    </div>
                  </div>

                  {/* 训练记录 */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--s500)', marginBottom: 4 }}>训练记录</div>
                    <div style={{ fontSize: 13, color: 'var(--s700)', lineHeight: 1.4 }}>
                      {s.note || '暂无详细记录'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--s600)', marginTop: 4 }}>
                      训练时长: {s.duration || 0} 分钟 | RPE: {s.rpe || '--'}
                    </div>
                  </div>

                  {/* 心率记录 */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--s500)', marginBottom: 4 }}>心率记录</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                      <div>
                        <span style={{ fontSize: 12, color: 'var(--s600)' }}>平均: </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--s800)' }}>{heartRateData.avg} bpm</span>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: 'var(--s600)' }}>最高: </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--r)' }}>{heartRateData.max} bpm</span>
                      </div>
                      <div>
                        <span style={{ fontSize: 12, color: 'var(--s600)' }}>消耗: </span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--p)' }}>{heartRateData.kcal} kcal</span>
                      </div>
                    </div>
                    
                    {/* 心率区间分布 */}
                    <div style={{ display: 'flex', gap: 4, height: 20, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ flex: heartRateData.zones.zone1, background: '#4CAF50' }} title="热身区" />
                      <div style={{ flex: heartRateData.zones.zone2, background: '#8BC34A' }} title="燃脂区" />
                      <div style={{ flex: heartRateData.zones.zone3, background: '#FFC107' }} title="有氧区" />
                      <div style={{ flex: heartRateData.zones.zone4, background: '#FF9800' }} title="无氧区" />
                      <div style={{ flex: heartRateData.zones.zone5, background: '#F44336' }} title="极限区" />
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--s400)', marginTop: 2 }}>
                      心率区间分布
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--s400)', padding: 32, fontSize: 12 }}>
          暂无训练记录<br />完成第一节课后会显示在这里
        </div>
      )}

      {/* 完整训练内容弹窗 */}
      {showFullTraining !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setShowFullTraining(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 520,
              background: '#fff',
              borderRadius: '20px 20px 0 0',
              maxHeight: '80vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 拖动指示器 */}
            <div style={{ width: 36, height: 3, background: 'var(--s300)', borderRadius: 2, margin: '10px auto 0' }} />
            
            {/* 标题 */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--s100)' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2438' }}>完整训练内容</div>
              <div style={{ fontSize: 12, color: 'var(--s400)', marginTop: 2 }}>
                {sessions[showFullTraining]?.date} · {sessions[showFullTraining]?.duration || 0}分钟 · RPE {sessions[showFullTraining]?.rpe || '--'}
              </div>
            </div>
            
            {/* 训练内容 */}
            <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
              {getFullTrainingContent(sessions[showFullTraining]).modules.map((module, mIdx) => (
                <div key={mIdx} style={{ marginBottom: 20 }}>
                  {/* 模块标题 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2438' }}>{module.name}</div>
                    {module.format && (
                      <span style={{ fontSize: 11, color: 'var(--s500)', background: 'var(--s50)', padding: '2px 6px', borderRadius: 4 }}>
                        {module.format}
                      </span>
                    )}
                  </div>
                  
                  {/* 动作列表 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {module.exercises.map((exercise, eIdx) => (
                      <div key={eIdx} style={{ background: 'var(--s25)', borderRadius: 8, padding: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2438', marginBottom: 4 }}>
                          {exercise.name}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--s600)', marginBottom: 4 }}>
                          {exercise.sets} × {exercise.reps}
                          {exercise.rhythm && ` · ${exercise.rhythm}`}
                          {exercise.rest && ` · 休息${exercise.rest}`}
                        </div>
                        {exercise.cue && (
                          <div style={{ fontSize: 11, color: 'var(--s500)', fontStyle: 'italic' }}>
                            💡 {exercise.cue}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            {/* 底部按钮 */}
            <div style={{ padding: 16, borderTop: '1px solid var(--s100)' }}>
              <button
                className="btn btn-p"
                style={{ width: '100%' }}
                onClick={() => setShowFullTraining(null)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 阶段饮食组件 ──────────────────────────────────────────────────
interface MacroTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface DietPlan {
  id: string;
  title: string;
  period: string;
  target: MacroTarget;
  notes: string;
  meals: any[];
  createdAt: string;
}

function DietSection({ client }: { client: Client }) {
  // 从教练端数据中获取饮食计划
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);

  useEffect(() => {
    // 尝试从教练端数据获取饮食计划
    const coachClients = JSON.parse(localStorage.getItem('fika_coach_clients_v1') || '[]');
    const coachClient = coachClients.find((c: any) => c.id === client.id || c.roadCode === client.roadCode);
    
    if (coachClient && coachClient.dietPlan) {
      setDietPlan(coachClient.dietPlan);
    } else {
      // 如果没有教练端数据，使用默认数据
      setDietPlan({
        id: 'default',
        title: '基础饮食计划',
        period: '当前阶段',
        target: {
          calories: client.weight ? Math.round(client.weight * 33) : 2375,
          protein: client.weight ? Math.round(client.weight * 1.8) : 130,
          carbs: client.weight ? Math.round(client.weight * 4.5) : 350,
          fat: client.weight ? Math.round(client.weight * 1.0) : 75,
        },
        notes: '根据当前体重和训练目标自动计算',
        meals: [],
        createdAt: new Date().toISOString(),
      });
    }
  }, [client]);

  if (!dietPlan) {
    return (
      <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>
        <div className="lbl" style={{ marginBottom: 10 }}>阶段饮食 / Phase Nutrition</div>
        <div style={{ fontSize: 12, color: 'var(--s600)' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>

      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1f2438', letterSpacing: '.04em' }}>
            {dietPlan.title}
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, letterSpacing: '.06em' }}>
            阶段饮食 · {dietPlan.period}
          </div>
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700,
          padding: '4px 10px', borderRadius: 20,
          background: 'rgba(93,100,214,.1)',
          color: '#5d64d6',
          border: '1px solid rgba(93,100,214,.2)',
        }}>
          {dietPlan.target.calories} kcal / 天
        </div>
      </div>

      {/* 三大营养素卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {[
          {
            label: '蛋白质',
            value: dietPlan.target.protein,
            unit: 'g',
            pct: 25,
            color: '#0D9488',
            bg: 'rgba(13,148,136,.08)',
            border: 'rgba(13,148,136,.2)',
            min: Math.round(dietPlan.target.protein * 0.9),
            max: Math.round(dietPlan.target.protein * 1.1),
          },
          {
            label: '碳水',
            value: dietPlan.target.carbs,
            unit: 'g',
            pct: 50,
            color: '#5d64d6',
            bg: 'rgba(93,100,214,.08)',
            border: 'rgba(93,100,214,.2)',
            min: Math.round(dietPlan.target.carbs * 0.95),
            max: Math.round(dietPlan.target.carbs * 1.08),
          },
          {
            label: '脂肪',
            value: dietPlan.target.fat,
            unit: 'g',
            pct: 25,
            color: '#D97706',
            bg: 'rgba(217,119,6,.08)',
            border: 'rgba(217,119,6,.2)',
            min: Math.round(dietPlan.target.fat * 0.9),
            max: Math.round(dietPlan.target.fat * 1.2),
          },
        ].map((macro) => (
          <div key={macro.label} style={{
            borderRadius: 12,
            border: `1px solid ${macro.border}`,
            background: macro.bg,
            padding: '10px 10px 8px',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: macro.color, letterSpacing: '.08em', marginBottom: 4 }}>
              {macro.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1f2438', lineHeight: 1, letterSpacing: '-.02em' }}>
              {macro.value}
              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginLeft: 2 }}>{macro.unit}</span>
            </div>
            <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 3 }}>
              {macro.min}–{macro.max}{macro.unit}
            </div>
            {/* 进度条 */}
            <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'rgba(148,163,184,.2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${macro.pct * 2}%`, background: macro.color, borderRadius: 2, opacity: .7 }} />
            </div>
            <div style={{ fontSize: 9, color: macro.color, marginTop: 3, fontWeight: 700 }}>
              占比 {macro.pct}%
            </div>
          </div>
        ))}
      </div>

      {/* 训练时间建议 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          {
            icon: '⚡',
            label: '训练前 1 小时',
            tip: '香蕉 + 少量蛋白质',
            color: '#D97706',
            bg: 'rgba(217,119,6,.06)',
          },
          {
            icon: '💪',
            label: '训练后 30 分钟',
            tip: '乳清蛋白 + 快速碳水',
            color: '#0D9488',
            bg: 'rgba(13,148,136,.06)',
          },
        ].map((item) => (
          <div key={item.label} style={{
            borderRadius: 10,
            background: item.bg,
            border: `1px solid ${item.color}22`,
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}>
            <div style={{ fontSize: 14 }}>{item.icon}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: item.color }}>{item.label}</div>
            <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>{item.tip}</div>
          </div>
        ))}
      </div>

      {/* 饮食原则（如果有notes就显示，没有显示默认一句话） */}
      <div style={{
        padding: '8px 12px',
        borderRadius: 8,
        background: 'rgba(248,250,253,.9)',
        border: '1px solid rgba(226,232,240,.7)',
        fontSize: 12,
        color: '#64748b',
        lineHeight: 1.6,
      }}>
        {dietPlan.notes || '优先天然食材，减少精制糖。每日饮水体重 × 35ml。'}
      </div>
    </div>
  );
}

// ── 档案 Tab ──────────────────────────────────────────────────
function ProfileTab({ client }: { client: Client }) {
  const assessments = Array.isArray((client as any).assessments)
    ? [...(client as any).assessments]
        .filter((a: any) => a?.date)
        .sort((a: any, b: any) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        )
    : [];
  const latestA = assessments[0] || {};

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 14 }}>我的档案</div>

      {/* 伤病限制 */}
      {client.injury && (
        <div className="card-sm" style={{ padding: 14, background: 'rgba(245,158,11,.04)', borderColor: 'rgba(245,158,11,.3)', marginBottom: 10 }}>
          <div className="lbl" style={{ color: 'var(--a)', marginBottom: 4 }}>
            ⚠️ 伤病限制
          </div>
          <div style={{ fontSize: 12, color: 'var(--s700)' }}>{client.injury}</div>
          <div style={{ fontSize: 10, color: 'var(--s400)', marginTop: 4 }}>AI 已自动规避相关动作</div>
        </div>
      )}

      {/* 功能性评估 */}
      <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>
        <div className="lbl" style={{ marginBottom: 10 }}>功能性评估</div>
        {[
          { label: '深蹲活动度', value: '—', color: 'var(--p)' },
          { label: '肩关节活动度', value: '—', color: 'var(--a)' },
          { label: '单腿平衡', value: (latestA as any).balance ? `${(latestA as any).balance}s` : '—', color: 'var(--g)' },
          { label: '训练方式', value: isPro(client.membershipLevel) ? '动力链训练' : '传统分化训练', color: 'var(--p)' },
        ].map((item) => (
          <div
            key={item.label}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--s100)', fontSize: 12 }}
          >
            <span style={{ color: 'var(--s600)' }}>{item.label}</span>
            <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* 基本信息 */}
      <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>
        <div className="lbl" style={{ marginBottom: 10 }}>基本信息</div>
        {[
          ['姓名', client.name],
          ['性别', client.gender === 'female' ? '女' : '男'],
          ['年龄', client.age ? `${client.age}岁` : '—'],
          ['身高', latestA.height ? `${latestA.height}cm` : client.height ? `${client.height}cm` : '—'],
          ['体重', latestA.weight ? `${latestA.weight}kg` : client.weight ? `${client.weight}kg` : '—'],
          ['体脂率', latestA.bf_pct != null ? `${latestA.bf_pct}%` : '—'],
          ['骨骼肌', latestA.smm_kg != null ? `${latestA.smm_kg}kg` : '—'],
          ['基础代谢', latestA.bmr != null ? `${latestA.bmr} kcal` : '—'],
          ['最近体测', latestA.date || '—'],
          ['训练目标', client.goal || '—'],
          ['训练方式', membershipGroupLabel(client.membershipLevel)],
          ['会员档位', client.membershipLevel === 'elite' ? 'Elite 至尊'
            : client.membershipLevel === 'professional' ? 'Professional 专业'
            : client.membershipLevel === 'advanced' ? 'Advanced 进阶'
            : 'Standard 基础'],
          ['周期', client.weeks ? `${client.weeks}周` : '—'],
          ['路书码', client.roadCode || client.id],
        ].map(([k, v], idx) => (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '8px 0', fontSize: 12,
            borderBottom: '1px solid var(--s100)',
            background: idx % 2 === 0 ? 'transparent' : 'rgba(248,250,253,.5)',
          }}>
            <span style={{ color: 'var(--s500)' }}>{k}</span>
            <span style={{ fontWeight: 600, color: 'var(--s800)' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* 阶段饮食 */}
      <DietSection client={client} />
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────
type StuTab = 'today' | 'progress' | 'history' | 'profile';

interface StudentPortalProps {
  display: 'block' | 'none';
  onLogout: () => void;
  /** 从外部传入当前客户，如果没有则用本地缓存 */
  client?: Client;
}

export function StudentPortal({ display, onLogout, client: propClient }: StudentPortalProps) {
  const [tab, setTab] = useState<StuTab>('today');
  const [client, setClient] = useState<Client | null>(propClient || null);

  // 如果没有外部传入的 client，尝试从 localStorage 读取
  useEffect(() => {
    if (propClient) {
      setClient(propClient);
      return;
    }
    try {
      const stored = localStorage.getItem('fika_current_client');
      if (stored) setClient(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, [propClient]);

  useEffect(() => {
    const clientId = propClient?.id || client?.id;
    const roadCode = String(propClient?.roadCode || client?.roadCode || '').trim().toUpperCase();
    if (!clientId && !roadCode) return;

    const syncLatestClient = async () => {
      let latest: Client | null = null;

      if (roadCode) {
        try {
          const resp = await fetch(`/api/clients/by-road-code/${encodeURIComponent(roadCode)}`);
          if (resp.ok) {
            latest = (await resp.json()) as Client;
          }
        } catch {
          // 网络异常时走本地兜底
        }
      }

      if (!latest && clientId) {
        latest = findClientById(clientId);
      }

      if (!latest) return;

      // 将后端最新数据回写本地缓存，避免不同页面读取到旧数据
      try {
        const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
        const idx = all.findIndex((c) => c.id === latest!.id);
        if (idx >= 0) all[idx] = { ...all[idx], ...latest };
        else all.push(latest);
        localStorage.setItem('fika_clients', JSON.stringify(all));
        localStorage.setItem('fika_current_client', JSON.stringify(latest));
      } catch {
        // ignore local mirror failures
      }

      setClient((prev) => (isSameClientSnapshot(prev, latest) ? prev : latest));
    };

    void syncLatestClient();
    const timer = window.setInterval(() => { void syncLatestClient(); }, 3000);
    const onStorage = () => { void syncLatestClient(); };
    const onFocus = () => { void syncLatestClient(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
  }, [propClient?.id, propClient?.roadCode, client?.id, client?.roadCode]);

  const handleFeedback = (rpe: number, note: string) => {
    if (!client) return;
    const todayEntry = resolveTodayEntry(client);
    const refs = todayEntry.refs;
    const currentRef = todayEntry.dayRef;
    const currentIdx = currentRef
      ? refs.findIndex((r) => r.dayId === currentRef.dayId && r.weekId === currentRef.weekId && r.blockId === currentRef.blockId)
      : -1;
    const nextRef = currentIdx >= 0 && currentIdx + 1 < refs.length
      ? refs[currentIdx + 1]
      : currentRef || refs[0] || null;

    const updated: Client = {
      ...client,
      sessions: [
        ...(client.sessions || []),
        {
          id: 'SE' + Date.now(),
          date: new Date().toLocaleDateString('zh-CN'),
          rpe,
          note,
          week: currentRef?.weekNum || Number(client.current_week || 1),
          day: currentRef?.dayLabel || client.current_day,
          day_id: currentRef?.dayId || client.current_day_id,
          block_id: currentRef?.blockId || client.current_block_id,
          block_index: currentRef?.blockIndex,
          block_week: currentRef?.weekNum,
        },
      ],
      current_week: nextRef?.weekNum || Number(client.current_week || 1),
      current_day: nextRef?.dayLabel || client.current_day,
      current_day_id: nextRef?.dayId || client.current_day_id,
      current_block_id: nextRef?.blockId || client.current_block_id,
    };
    setClient(updated);
    // 同步到 localStorage（同时同步到全量 clients 列表）
    try {
      const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
      const idx = all.findIndex((c) => c.id === updated.id);
      if (idx >= 0) all[idx] = updated;
      else all.push(updated);
      localStorage.setItem('fika_clients', JSON.stringify(all));
      localStorage.setItem('fika_current_client', JSON.stringify(updated));
    } catch {
      // ignore
    }
    alert(`反馈已提交！RPE ${rpe} 已记录，已自动切换到下一次训练内容。`);
  };

  const navItems: { key: StuTab; label: string; icon: ReactNode }[] = [
    {
      key: 'today',
      label: '今日',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
    },
    {
      key: 'progress',
      label: '进步',
      icon: (
        <svg viewBox="0 0 24 24">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      key: 'history',
      label: '历史',
      icon: (
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
    },
    {
      key: 'profile',
      label: '档案',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
  ];

  return (
    <div id="pg-student" className="z1" style={{ display }}>
      {/* 导航 */}
      <nav className="stu-navbar">
        <div className="stu-navbar-inner">
          <div className="logo" style={{ fontSize: 18 }}>
            <div>
              <span className="logo-fi">Fi</span>
              <span className="logo-ka">KA</span>
            </div>
            <div className="logo-sub">Fitness</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {client && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: isPro(client.membershipLevel) ? '#CF7A25' : '#2F8A56',
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--s800)' }}>
                  {client.name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--s400)' }}>
                  {isPro(client.membershipLevel) ? '动力链' : '传统训练'}
                </span>
              </div>
            )}
            <button className="btn-ghost btn btn-sm" onClick={onLogout} type="button">
              退出
            </button>
          </div>
        </div>
      </nav>

      {/* 内容 */}
      <div className="stu-content">
        {!client ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--s400)' }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>未找到客户信息</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>请检查路书码是否正确</div>
            <button className="btn btn-o" style={{ marginTop: 16 }} onClick={onLogout}>
              返回登录
            </button>
          </div>
        ) : (
          <>
            {tab === 'today' && <TodayTab client={client} onFeedback={handleFeedback} />}
            {tab === 'progress' && <ProgressTab client={client} />}
            {tab === 'history' && <HistoryTab client={client} />}
            {tab === 'profile' && <ProfileTab client={client} />}
          </>
        )}
      </div>

      {/* 底部导航 */}
      <nav className="stu-bottom-nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            className={`stu-nav-btn${tab === item.key ? ' active' : ''}`}
            onClick={() => setTab(item.key)}
            type="button"
          >
            <div className="stu-nav-icon">{item.icon}</div>
            <span className="stu-nav-lbl">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
