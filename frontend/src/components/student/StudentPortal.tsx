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
  rpe?: number;
  duration?: number;
  performance?: string;
  note?: string;
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

interface PlanRecord {
  _id: string;
  clientId?: string;
  planType?: string;
  title?: string;
  result?: any;
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
function tierLabel(t?: string) {
  return t === 'ultra' ? 'Ultra 高级' : t === 'pro' ? 'Pro 进阶' : 'Standard 基础';
}

function getTagColor(tag?: string) {
  if (!tag) return '#6B7280';
  const m: Record<string, string> = { A: '#7C3AED', B: '#0D9488', C: '#D97706', D: '#DC2626', E: '#2563EB', F: '#9333EA' };
  return m[tag[0]] || '#6B7280';
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

function getTodayPlan(c: Client): Plan | null {
  // 优先使用教练端发布的训练内容
  const publishedBlocks = (c.published_blocks || []).filter(Boolean);
  if (publishedBlocks.length === 0) {
    console.log('No published blocks found for client:', c.id);
    return null;
  }

  const allWeeks = publishedBlocks.flatMap((b) => b.training_weeks || b.weeks || []);
  if (allWeeks.length === 0) {
    console.log('No weeks found in published blocks');
    return null;
  }

  const targetWeekNum = Number(c.current_week || 1);
  const currentWeek = allWeeks.find((w) => Number(w.week_num ?? w.num ?? 1) === targetWeekNum) || allWeeks[0];
  if (!currentWeek) {
    console.log('No current week found for week:', targetWeekNum);
    return null;
  }

  const todayLabel = WEEKDAY_LABELS[new Date().getDay()];
  const matchedDay = (currentWeek.days || []).find((d) => d.day === todayLabel);
  const selectedDay = matchedDay || (currentWeek.days || [])[0];
  if (!selectedDay) {
    console.log('No matching day found for today:', todayLabel);
    return null;
  }

  const modules = Array.isArray(selectedDay.modules) ? selectedDay.modules : selectedDay.plan?.modules;
  if (!modules || modules.length === 0) {
    const summaryTitle = String(selectedDay.name || selectedDay.focus || '今日训练安排').trim();
    const summaryCue = String(selectedDay.focus || selectedDay.name || '').trim();

    if (!summaryTitle && !summaryCue) {
      console.log('No modules found for today\'s training');
      return null;
    }

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

  console.log('Found today\'s plan:', { session_name: selectedDay.name, modules: modules.length, isToday: !!matchedDay });
  return {
    session_name: selectedDay.name,
    modules,
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
  planOverride,
}: {
  client: Client;
  onFeedback: (rpe: number, note: string) => void;
  planOverride?: Plan | null;
}) {
  const [feedbackRpe, setFeedbackRpe] = useState(7);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);

  const todayPlan = planOverride || getTodayPlan(client);
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
            const hasNewData = !currentClient.published_blocks || 
                             !coachClient.published_blocks ||
                             JSON.stringify(currentClient.published_blocks) !== JSON.stringify(coachClient.published_blocks);
            
            if (hasNewData) {
              console.log('Found new coach data, updating...');
              
              // 更新本地客户端数据
              const updatedClient = {
                ...currentClient,
                published_blocks: coachClient.published_blocks,
                plan_published_version: coachClient.plan_published_version,
                plan_published_at: coachClient.plan_published_at,
                current_week: coachClient.current_week
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

  // 获取当前周计划信息
  const getCurrentWeekPlan = () => {
    const currentWeek = client.current_week || 1;
    // 优先使用 published_blocks 而不是 blocks
    const blocks = client.published_blocks || client.blocks || [];
    
    console.log('getCurrentWeekPlan:', { currentWeek, blocksCount: blocks.length, publishedBlocksCount: client.published_blocks?.length || 0 });
    
    for (const block of blocks) {
      const week = block.training_weeks?.find(w => w.week_num === currentWeek);
      if (week) {
        return {
          blockTitle: block.title,
          weekNum: week.week_num,
          days: week.days || []
        };
      }
    }
    return null;
  };

  const weekPlan = getCurrentWeekPlan();
  const todayLabel = WEEKDAY_LABELS[new Date().getDay()];
  const timelineDays = weekPlan?.days || [];
  const todayIndex = timelineDays.findIndex((d) => d.day === todayLabel);
  const weekFocusSummary = timelineDays.find((d) => d.focus)?.focus || '本周重点聚焦动作质量与强度推进，保持恢复节奏。';
  const resolvedMembershipLevel: 'standard' | 'advanced' | 'professional' | 'elite' =
    client.membershipLevel || (client.tier === 'ultra' ? 'elite' : client.tier === 'pro' ? 'professional' : 'standard');

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
      {weekPlan && (
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
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: tierTheme.accent, letterSpacing: '.05em' }}>
              {`WEEK ${weekPlan.weekNum || 1}`} / 第{client.current_week || weekPlan.weekNum || 1}周
            </div>
          </div>

          <div style={{ fontSize: 22, lineHeight: 1.1, fontWeight: 900, color: '#101a33', marginBottom: 8 }}>本周重点介绍</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#607089', letterSpacing: '.08em', marginBottom: 8 }}>WEEKLY FOCUS OVERVIEW</div>
          <div style={{ fontSize: 14, color: '#3f4c64', lineHeight: 1.38, fontWeight: 600, marginBottom: 10 }}>
            {weekFocusSummary}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '.06em',
                color: tierTheme.accent,
                border: `1px solid ${tierTheme.ring}`,
                background: tierTheme.soft,
                borderRadius: 999,
                padding: '4px 10px',
              }}
            >
              VOLUME: MODERATE
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: '.06em',
                color: tierTheme.accent,
                border: `1px solid ${tierTheme.ring}`,
                background: tierTheme.soft,
                borderRadius: 999,
                padding: '4px 10px',
              }}
            >
              INTENSITY: HIGH
            </span>
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {timelineDays.map((day, idx) => {
                const isToday = day.day === todayLabel;
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
                      <div style={{ fontSize: 16, lineHeight: 1.2, fontWeight: 900, color: mainColor, marginBottom: 4 }}>
                        {day.name || `${day.day} 训练`}
                      </div>
                      <div style={{ fontSize: 13, lineHeight: 1.22, fontWeight: 800, color: subColor }}>
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
        <button
          className="btn btn-o"
          style={{ fontSize: 10, padding: '2px 6px', height: 'auto' }}
          onClick={() => {
            // 手动触发同步
            const coachClients = JSON.parse(localStorage.getItem('fika_coach_clients_v1') || '[]');
            const coachClient = coachClients.find((c: any) => c.id === client.id || c.roadCode === client.roadCode);
            
            if (coachClient && coachClient.published_blocks) {
              const currentClient = findClientById(client.id);
              if (currentClient) {
                const updatedClient = {
                  ...currentClient,
                  published_blocks: coachClient.published_blocks,
                  plan_published_version: coachClient.plan_published_version,
                  plan_published_at: coachClient.plan_published_at,
                  current_week: coachClient.current_week
                };
                
                const all: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
                const idx = all.findIndex((c) => c.id === updatedClient.id);
                if (idx >= 0) all[idx] = updatedClient;
                else all.push(updatedClient);
                localStorage.setItem('fika_clients', JSON.stringify(all));
                localStorage.setItem('fika_current_client', JSON.stringify(updatedClient));
                
                alert('训练计划已同步！');
                window.location.reload();
              }
            } else {
              alert('未找到教练端的训练计划，请先在教练端发布训练内容。');
            }
          }}
        >
          🔄 同步训练计划
        </button>
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
              {[5, 6, 7, 8, 9, 10].map((v) => (
                <button
                  key={v}
                  type="button"
                  style={{
                    flex: 1,
                    height: 44,
                    borderRadius: 10,
                    border: '1.5px solid',
                    borderColor: feedbackRpe === v ? 'var(--p)' : 'var(--s200)',
                    background: feedbackRpe === v ? 'var(--p2)' : 'var(--s50)',
                    color: feedbackRpe === v ? 'var(--p)' : 'var(--s600)',
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: 'pointer',
                  }}
                  onClick={() => setFeedbackRpe(v)}
                >
                  {v}
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
  const wData = client.weeklyData || [];
  const sessions = client.sessions || [];
  const latest = wData.slice(-1)[0] || {};
  const prev = wData.slice(-2, -1)[0] || {};
  const weightDelta = latest.weight && prev.weight ? +(latest.weight - prev.weight).toFixed(1) : null;
  const bfDelta = latest.bf && prev.bf ? +(latest.bf - prev.bf).toFixed(1) : null;

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.01em', marginBottom: 14 }}>我的进步</div>

      {/* 四格数据 */}
      <div className="stu-stat-grid">
        <div className="card-sm stu-stat">
          <div className="lbl">体重</div>
          <div className="val">
            {latest.weight || client.weight || '—'}
            <span style={{ fontSize: 13, color: 'var(--s400)' }}> kg</span>
          </div>
          {weightDelta !== null && (
            <div className="delta" style={{ color: weightDelta < 0 ? 'var(--g)' : 'var(--r)' }}>
              {weightDelta > 0 ? '+' : ''}
              {weightDelta} kg
            </div>
          )}
        </div>
        <div className="card-sm stu-stat">
          <div className="lbl">体脂率</div>
          <div className="val">
            {latest.bf || '—'}
            <span style={{ fontSize: 13, color: 'var(--s400)' }}> %</span>
          </div>
          {bfDelta !== null && (
            <div className="delta" style={{ color: bfDelta < 0 ? 'var(--g)' : 'var(--r)' }}>
              {bfDelta > 0 ? '+' : ''}
              {bfDelta}%
            </div>
          )}
        </div>
        <div className="card-sm stu-stat">
          <div className="lbl">总课次</div>
          <div className="val">{sessions.length}</div>
        </div>
        <div className="card-sm stu-stat">
          <div className="lbl">本周出勤</div>
          <div className="val">
            {latest.attendance || 0}
            <span style={{ fontSize: 13, color: 'var(--s400)' }}> 节</span>
          </div>
        </div>
      </div>

      {/* 体重折线图（用 bar 模拟） */}
      {wData.length > 1 ? (
        <div className="card-sm" style={{ padding: 16, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>体重变化趋势</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {wData.slice(-8).map((w, i) => {
              const vals = wData.map((d) => d.weight || 0).filter(Boolean);
              const maxW = Math.max(...vals);
              const minW = Math.min(...vals);
              const h = maxW > minW ? Math.round(((w.weight! - minW) / (maxW - minW)) * 60) + 10 : 40;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', background: 'var(--p)', borderRadius: '4px 4px 0 0', height: h, opacity: 0.7 }} />
                  <div style={{ fontSize: 8, color: 'var(--s400)' }}>{w.weight || '—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="card-sm" style={{ padding: 16, marginTop: 4, color: 'var(--s400)', fontSize: 12, textAlign: 'center' }}>
          数据积累中，继续打卡 💪
        </div>
      )}

      {/* RPE 柱状 */}
      {sessions.length > 0 && (
        <div className="card-sm" style={{ padding: 16, marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>RPE 强度变化</div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 60 }}>
            {sessions.slice(-10).map((s, i) => {
              const rpe = s.rpe || 5;
              const h = Math.round((rpe / 10) * 50) + 4;
              const color = rpe >= 8 ? 'var(--r)' : rpe <= 4 ? 'var(--g)' : 'var(--p)';
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                  <div style={{ width: '100%', background: color, borderRadius: '3px 3px 0 0', height: h, opacity: 0.75 }} />
                  <div style={{ fontSize: 8, color: 'var(--s400)' }}>{rpe}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 档位能力说明 */}
      {client.tier !== 'standard' && (
        <div className="card-sm" style={{ padding: 14, marginTop: 10, background: 'var(--p2)', border: '1px solid var(--p3)' }}>
          <div className="lbl" style={{ color: 'var(--p)', marginBottom: 6 }}>
            {tierLabel(client.tier)} · 专项指标
          </div>
          {[
            ['动力链完整度', client.tier === 'ultra' ? '筋膜神经视角' : 'X-Sling 对角线'],
            ['训练节奏', client.tier === 'ultra' ? 'X012 爆发制动' : '3030 离心控制'],
            ['模块格式', client.tier === 'ultra' ? 'EMOM + 循环' : '超级组 + 功能链'],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--p3)', fontSize: 11 }}
            >
              <span style={{ color: 'var(--s600)' }}>{k}</span>
              <span style={{ fontWeight: 600, color: 'var(--p)' }}>{v}</span>
            </div>
          ))}
        </div>
      )}
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

  const getHeartRateData = (_session: any) => {
    // 模拟心率数据，实际应从session数据中获取
    return {
      avg: 142,
      max: 168,
      zones: {
        zone1: 5,  // 热身区
        zone2: 15, // 燃脂区
        zone3: 25, // 有氧区
        zone4: 10, // 无氧区
        zone5: 5   // 极限区
      }
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
                  padding: '12px 16px', 
                  marginBottom: isExpanded ? 0 : 8, 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 12,
                  cursor: 'pointer',
                  borderRadius: isExpanded ? '12px 12px 0 0' : 12
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
                        {client.tier === 'ultra' ? 'Ultra 高级训练' : client.tier === 'pro' ? 'Pro 进阶训练' : 'Standard 基础训练'}
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

  const nutrientRows = [
    { 
      name: '总热量 / Total Calories', 
      target: `${dietPlan.target.calories} kcal`, 
      range: `${Math.round(dietPlan.target.calories * 0.94)} - ${Math.round(dietPlan.target.calories * 1.06)}`, 
      status: '优化 / OPTIMIZED', 
      color: '#5d64d6' 
    },
    { 
      name: '蛋白质 / Protein', 
      target: `${dietPlan.target.protein}g (25%)`, 
      range: `${Math.round(dietPlan.target.protein * 0.9)}g - ${Math.round(dietPlan.target.protein * 1.1)}g`, 
      status: '充足 / HIGH', 
      color: '#64748b' 
    },
    { 
      name: '碳水化合物 / Carbohydrates', 
      target: `${dietPlan.target.carbs}g (50%)`, 
      range: `${Math.round(dietPlan.target.carbs * 0.95)}g - ${Math.round(dietPlan.target.carbs * 1.08)}g`, 
      status: '优化 / OPTIMIZED', 
      color: '#5d64d6' 
    },
    { 
      name: '脂肪 / Fats', 
      target: `${dietPlan.target.fat}g (25%)`, 
      range: `${Math.round(dietPlan.target.fat * 0.9)}g - ${Math.round(dietPlan.target.fat * 1.2)}g`, 
      status: '均衡 / BALANCED', 
      color: '#a16207' 
    },
  ];

  return (
    <div className="card-sm" style={{ padding: 16, marginBottom: 10 }}>
      <div className="lbl" style={{ marginBottom: 10 }}>阶段饮食 / Phase Nutrition</div>
      
      {/* 饮食计划标题 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2438' }}>{dietPlan.title}</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{dietPlan.period}</div>
        {dietPlan.notes && (
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, fontStyle: 'italic' }}>{dietPlan.notes}</div>
        )}
      </div>

      {/* 营养目标表格 */}
      <div className="diet-nutrient-table-wrap" style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(216,221,236,0.8)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr', gap: 10, padding: '10px 14px', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#76829d', fontWeight: 700, background: 'rgba(241,243,248,0.9)' }}>
          <div>营养素 / Nutrient</div>
          <div>目标值 / Target (Daily)</div>
          <div>临床范围 / Clinical Range</div>
          <div>状态 / Status</div>
        </div>

        {nutrientRows.map((row, idx) => (
          <div key={row.name} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr', gap: 10, padding: '12px 14px', background: idx % 2 ? 'rgba(255,255,255,0.74)' : 'rgba(248,250,253,0.74)', borderTop: idx ? '1px solid rgba(226,232,240,0.8)' : 'none' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#20253a' }}>{row.name}</div>
            <div style={{ fontSize: 13, color: '#3a4358' }}>{row.target}</div>
            <div style={{ fontSize: 13, color: '#6b7287' }}>{row.range}</div>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 999, color: row.color, background: `${row.color}22` }}>{row.status}</span>
            </div>
          </div>
        ))}
      </div>

      {/* 饮食建议 */}
      <div style={{ marginTop: 12, padding: 10, background: 'rgba(93,100,214,0.08)', borderRadius: 8, border: '1px solid rgba(93,100,214,0.2)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#4f56c8', marginBottom: 4 }}>💡 饮食建议 / Nutrition Tips</div>
        <div style={{ fontSize: 11, color: '#5f677b', lineHeight: 1.4 }}>
          • 保证充足蛋白质摄入，支持肌肉恢复与增长<br/>
          • 适量碳水化合物为训练提供能量<br/>
          • 健康脂肪维持激素平衡与整体健康<br/>
          • 训练前后30分钟补充营养效果最佳
        </div>
      </div>
    </div>
  );
}

// ── 档案 Tab ──────────────────────────────────────────────────
function ProfileTab({ client }: { client: Client }) {
  const wData = client.weeklyData || [];
  const latest = wData.slice(-1)[0] || {};

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
          { label: '单腿平衡', value: (latest as any).balance ? `${(latest as any).balance}s` : '—', color: 'var(--g)' },
          { label: '动力链完整度', value: client.tier === 'ultra' ? '高级' : client.tier === 'pro' ? '进阶' : '基础', color: 'var(--p)' },
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
          ['身高', client.height ? `${client.height}cm` : '—'],
          ['体重', (latest as any).weight ? `${(latest as any).weight}kg` : client.weight ? `${client.weight}kg` : '—'],
          ['训练目标', client.goal || '—'],
          ['训练档位', tierLabel(client.tier)],
          ['周期', client.weeks ? `${client.weeks}周` : '—'],
          ['路书码', client.roadCode || client.id],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--s100)', fontSize: 12 }}>
            <span style={{ color: 'var(--s500)' }}>{k}</span>
            <span style={{ fontWeight: 500 }}>{v}</span>
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
  const [remoteTodayPlan, setRemoteTodayPlan] = useState<Plan | null>(null);

  // 生产环境使用相对路径，开发环境使用环境变量
  const isProduction = import.meta.env.PROD;
  const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '');
  const apiUrl = (path: string) => (apiBase ? String(apiBase).replace(/\/$/, '') + path : path);

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
    if (!clientId) return;

    const syncLatestClient = () => {
      const latest = findClientById(clientId);
      if (!latest) return;
      setClient((prev) => (isSameClientSnapshot(prev, latest) ? prev : latest));
    };

    syncLatestClient();
    const timer = window.setInterval(syncLatestClient, 3000);
    window.addEventListener('storage', syncLatestClient);
    window.addEventListener('focus', syncLatestClient);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('storage', syncLatestClient);
      window.removeEventListener('focus', syncLatestClient);
    };
  }, [propClient?.id, client?.id]);

  useEffect(() => {
    const roadCode = String(propClient?.roadCode || client?.roadCode || propClient?.id || client?.id || '').trim();
    if (!roadCode) {
      setRemoteTodayPlan(null);
      return;
    }

    let cancelled = false;

    const loadLatestPlan = async () => {
      try {
        const resp = await fetch(apiUrl(`/api/plans?clientId=${encodeURIComponent(roadCode)}&planType=session&limit=1`));
        if (!resp.ok) return;
        const list = (await resp.json()) as PlanRecord[];
        const latest = Array.isArray(list) ? list[0] : null;
        const modules = latest?.result?.modules;
        if (!cancelled && Array.isArray(modules) && modules.length > 0) {
          setRemoteTodayPlan({
            session_name: latest?.result?.session_name || latest?.title || '今日训练',
            tier: latest?.result?.tier,
            modules,
          });
        }
      } catch {
        if (!cancelled) setRemoteTodayPlan(null);
      }
    };

    void loadLatestPlan();
    const timer = window.setInterval(() => void loadLatestPlan(), 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [propClient?.roadCode, propClient?.id, client?.roadCode, client?.id]);

  const handleFeedback = (rpe: number, note: string) => {
    if (!client) return;
    const updated: Client = {
      ...client,
      sessions: [...(client.sessions || []), { id: 'SE' + Date.now(), date: new Date().toLocaleDateString('zh-CN'), rpe, note }],
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
    alert(`反馈已提交！RPE ${rpe} 已记录，下次计划会自动调整强度`);
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
              <span className="badge bp" style={{ fontSize: 11 }}>
                {client.name} · {tierLabel(client.tier)}
              </span>
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
            {tab === 'today' && <TodayTab client={client} onFeedback={handleFeedback} planOverride={remoteTodayPlan} />}
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
