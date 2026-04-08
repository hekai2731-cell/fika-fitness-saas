/**
 * CoachSessionView.tsx
 * iPad 11寸（1180×820）精准布局 + 心率实时监控集成
 * 放到：frontend/src/components/CoachSessionView.tsx
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Client } from '@/lib/db';
import { useHeartRate } from '@/hooks/useHeartRate';
import { ZONE_COLORS, ZONE_BG } from '@/lib/heartRateUtils';

// ─── 类型 ────────────────────────────────────────────────────
interface ExerciseSet {
  num: number;
  weight: string;
  reps: string;
  done: boolean;
}

interface Exercise {
  id: string;
  name: string;
  nameEn?: string;
  groupTag?: string;       // A1 A2 B1...
  sectionTitle: string;
  sectionFormat?: string;
  restSeconds: number;
  rhythm?: string;
  cue?: string;
  dyline?: string;
  sets: ExerciseSet[];
}

interface RecordedSession {
  date: string;
  day: string;
  week: number;
  level: number;
  duration: number;
  rpe: number;
  performance: string;
  price: number;
  note: string;
  hrAvg?: number;
  hrMax?: number;
  hrMin?: number;
  hrZoneDurations?: Record<number, number>;
}

interface CoachSessionViewProps {
  client: Client;
  coachCode?: string;
  onClose: () => void;
  onRecordSession: (session: RecordedSession) => Promise<void>;
  onCancelSession?: () => void;
}

// ─── 工具 ────────────────────────────────────────────────────
function genId() { return `ex-${Date.now()}-${Math.floor(Math.random() * 999)}`; }

const TAG_COLORS: Record<string, string> = {
  A: '#7C3AED', B: '#0D9488', C: '#D97706', D: '#DC2626', E: '#2563EB', F: '#9333EA',
};
function tagColor(tag?: string) {
  if (!tag) return '#6B7280';
  return TAG_COLORS[tag[0]] || '#6B7280';
}

function parsePlan(client: Client): Exercise[] {
  const blocks = (client as any).blocks || [];
  const exs: Exercise[] = [];
  for (const b of blocks) {
    for (const w of (b.training_weeks || b.weeks || [])) {
      for (const d of (w.days || [])) {
        const mods = (d as any).modules || [];
        for (const mod of mods) {
          for (const ex of (mod.exercises || [])) {
            const sets = ex.sets || 3;
            exs.push({
              id: ex.id || genId(),
              name: ex.name || '',
              nameEn: ex.name_en || ex.nameEn || '',
              groupTag: ex.group_tag || ex.groupTag || '',
              sectionTitle: mod.module_name || mod.name || '',
              sectionFormat: mod.format || '',
              restSeconds: ex.rest_seconds || ex.restSeconds || 0,
              rhythm: ex.rhythm || '',
              cue: ex.cue || '',
              dyline: ex.dyline || '',
              sets: Array.from({ length: typeof sets === 'number' ? sets : 3 }, (_, i) => ({
                num: i + 1,
                reps: String(ex.reps || '10'),
                weight: ex.weight || '',
                done: false,
              })),
            });
          }
        }
        if (exs.length > 0) return exs; // 取第一个有计划的训练日
      }
    }
  }
  return exs;
}

function fmt(secs: number) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

// ─── 心率顶栏 ────────────────────────────────────────────────
function HRTopBar({ hr }: { hr: ReturnType<typeof useHeartRate> }) {
  const zone = hr.currentZone;
  const bpm = hr.bpm;
  const zoneColor = zone ? ZONE_COLORS[zone.zone] : 'rgba(255,255,255,0.3)';
  const zoneBg = zone ? ZONE_BG[zone.zone] : 'transparent';

  // 区间分布（实时）
  const zd: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  hr.samples.forEach(s => { if (s.zone) zd[s.zone]++; });
  const total = hr.samples.length || 1;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 20px',
      height: 44,
      background: 'rgba(255,255,255,0.04)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
    }}>
      {/* 心跳图标 + BPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke={bpm ? zoneColor : 'rgba(255,255,255,0.2)'}
          strokeWidth="2" strokeLinecap="round" style={{ transition: 'stroke 0.4s' }}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{
            fontSize: 22, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
            color: bpm ? zoneColor : 'rgba(255,255,255,0.2)',
            transition: 'color 0.4s', lineHeight: 1,
            minWidth: 48,
          }}>{bpm ?? '---'}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '.08em' }}>BPM</span>
        </div>
      </div>

      {/* 区间 pill */}
      {bpm && zone && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', borderRadius: 20,
          background: zoneBg, border: `1px solid ${zoneColor}40`,
          flexShrink: 0, transition: 'all 0.4s',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: zoneColor }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: zoneColor }}>Z{zone.zone}</span>
          <span style={{ fontSize: 11, color: zoneColor, opacity: 0.85 }}>{zone.label}</span>
        </div>
      )}

      {/* 区间分布进度条 */}
      {hr.samples.length > 5 && (
        <div style={{ display: 'flex', gap: 2, width: 140, height: 4, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
          {[1, 2, 3, 4, 5].map(z => {
            const pct = (zd[z] / total) * 100;
            return pct > 0 ? (
              <div key={z} style={{
                flex: pct, background: ZONE_COLORS[z], opacity: 0.8,
                minWidth: 2, borderRadius: 2,
              }} />
            ) : null;
          })}
        </div>
      )}

      {/* 体感提示 */}
      {zone && (
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {zone.description}
        </span>
      )}

      {/* 连接/断开按钮 */}
      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
        {hr.status === 'connected' ? (
          <button onClick={hr.disconnect} style={{
            fontSize: 10, padding: '4px 10px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          }}>断开心率带</button>
        ) : (
          <button onClick={hr.connect} disabled={hr.status === 'connecting' || hr.status === 'unsupported'} style={{
            fontSize: 10, padding: '4px 12px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.2)',
            background: hr.status === 'connecting' ? 'rgba(255,255,255,0.04)' : 'rgba(124,58,237,0.2)',
            color: hr.status === 'connecting' ? 'rgba(255,255,255,0.3)' : 'rgba(167,139,250,0.9)',
            cursor: hr.status === 'connecting' ? 'not-allowed' : 'pointer',
          }}>
            {hr.status === 'connecting' ? '连接中...' : '连接心率带'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 组数行 ──────────────────────────────────────────────────
function SetRow({
  set, isCurrent,
  onToggle, onDelete, onUpdateWeight, onUpdateReps,
}: {
  set: ExerciseSet; isCurrent: boolean;
  onToggle: () => void; onDelete: () => void;
  onUpdateWeight: (v: string) => void; onUpdateReps: (v: string) => void;
}) {
  const state = set.done ? 'done' : isCurrent ? 'current' : 'pending';
  const bg = state === 'done' ? 'rgba(34,197,94,0.06)' : state === 'current' ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.02)';
  const border = state === 'done' ? 'rgba(34,197,94,0.2)' : state === 'current' ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.06)';
  const numColor = state === 'done' ? '#4ade80' : state === 'current' ? '#a78bfa' : 'rgba(255,255,255,0.25)';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 10px', borderRadius: 10,
      background: bg, border: `1px solid ${border}`,
      marginBottom: 5, transition: 'all 0.15s',
    }}>
      {/* 组号 */}
      <div style={{
        width: 20, textAlign: 'center', fontSize: 12, fontWeight: 700,
        color: numColor, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
      }}>
        {set.done ? '✓' : set.num}
      </div>

      {/* 重量输入 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        <input
          type="number"
          value={set.weight}
          placeholder="kg"
          disabled={set.done}
          onChange={e => onUpdateWeight(e.target.value)}
          style={{
            width: 58, height: 32, textAlign: 'center', fontSize: 13,
            fontFamily: 'monospace', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7, color: set.done ? 'rgba(255,255,255,0.3)' : '#fff',
            outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.7)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
        />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>kg ×</span>

        {/* 次数输入 */}
        <input
          type="text"
          value={set.reps}
          disabled={set.done}
          onChange={e => onUpdateReps(e.target.value)}
          style={{
            width: 58, height: 32, textAlign: 'center', fontSize: 13,
            fontFamily: 'monospace', fontWeight: 600,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 7, color: set.done ? 'rgba(255,255,255,0.3)' : '#fff',
            outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(124,58,237,0.7)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
        />
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>次</span>
      </div>

      {/* 删除 */}
      {!set.done && (
        <button onClick={onDelete} style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: 'rgba(239,68,68,0.08)', border: 'none',
          color: 'rgba(248,113,113,0.5)', cursor: 'pointer', fontSize: 13,
        }}>×</button>
      )}

      {/* 完成勾 */}
      <button onClick={onToggle} style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: set.done ? 'rgba(34,197,94,0.18)' : isCurrent ? '#7C3AED' : 'rgba(255,255,255,0.06)',
        border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
        color: set.done ? '#4ade80' : isCurrent ? '#fff' : 'rgba(255,255,255,0.3)',
        transition: 'all 0.15s',
      }}>✓</button>
    </div>
  );
}

// ─── 倒计时覆盖层 ─────────────────────────────────────────────
function CountdownOverlay({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    const t = setTimeout(() => setCount(c => c - 1), count === 3 ? 0 : 800);
    return () => clearTimeout(t);
  }, [count, onDone]);

  const color = count === 0 ? '#7C3AED' : count === 1 ? '#a78bfa' : '#fff';

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(20px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
    }}>
      <div style={{
        fontSize: 'clamp(5rem,15vw,10rem)', fontWeight: 900, lineHeight: 1,
        color, transition: 'color 0.3s',
      }}>{count === 0 ? 'GO' : count}</div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '.28em', textTransform: 'uppercase' }}>
        准备开始
      </div>
    </div>
  );
}

// ─── 休息覆盖层 ──────────────────────────────────────────────
function RestOverlay({ seconds, onSkip }: { seconds: number; onSkip: () => void }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) { onSkip(); return; }
    const t = setInterval(() => setLeft(v => v - 1), 1000);
    return () => clearInterval(t);
  }, [left, onSkip]);

  const pct = ((seconds - left) / seconds) * 100;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 40,
      background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(12px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
    }}>
      <div style={{ fontSize: 11, color: 'rgba(167,139,250,0.5)', textTransform: 'uppercase', letterSpacing: '.2em' }}>组间休息</div>
      <div style={{
        fontSize: 'clamp(4rem,12vw,7rem)', fontWeight: 900,
        fontFamily: 'monospace', color: '#a78bfa', lineHeight: 1,
      }}>{left}</div>
      {/* 环形进度 */}
      <svg width="120" height="120" viewBox="0 0 120 120" style={{ position: 'absolute' }}>
        <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(167,139,250,0.1)" strokeWidth="4" />
        <circle cx="60" cy="60" r="54" fill="none" stroke="#7C3AED" strokeWidth="4"
          strokeDasharray={`${2 * Math.PI * 54}`}
          strokeDashoffset={`${2 * Math.PI * 54 * (1 - pct / 100)}`}
          strokeLinecap="round"
          style={{ transform: 'rotate(-90deg)', transformOrigin: '60px 60px', transition: 'stroke-dashoffset 0.9s linear' }}
        />
      </svg>
      <button onClick={onSkip} style={{
        marginTop: 80, padding: '10px 28px', borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.45)', fontSize: 12, cursor: 'pointer',
      }}>跳过休息</button>
    </div>
  );
}

// ─── 结束弹窗 ────────────────────────────────────────────────
function FinishSheet({
  duration, hrStats,
  onSave, onCancel,
}: {
  duration: number;
  hrStats: ReturnType<ReturnType<typeof useHeartRate>['getStats']>;
  onSave: (rpe: number, perf: string, note: string) => void;
  onCancel: () => void;
}) {
  const [rpe, setRpe] = useState(7);
  const [perf, setPerf] = useState('良好');
  const [note, setNote] = useState('');

  const RPE_HINTS: Record<number, string> = {
    5: '很轻松，下次大幅加量', 6: '比较轻松，下次可加量',
    7: '适中，正常推进', 8: '有点累，注意恢复',
    9: '很累，下次需降载', 10: '力竭，必须降载',
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: '#18181B', borderRadius: '20px 20px 0 0',
        border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden',
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '10px auto 0' }} />

        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>训练总结</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
            时长 {Math.round(duration / 60)} 分钟
          </div>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 心率总结 */}
          {hrStats && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(167,139,250,0.6)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
                心率总结 · HR Summary
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                {[
                  { label: '平均', value: hrStats.avgBpm },
                  { label: '最高', value: hrStats.maxBpm },
                  { label: '最低', value: hrStats.minBpm },
                ].map(s => (
                  <div key={s.label} style={{
                    flex: 1, textAlign: 'center', padding: '8px',
                    background: 'rgba(255,255,255,0.05)', borderRadius: 9,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#c4b5fd', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{s.label} BPM</div>
                  </div>
                ))}
              </div>
              {/* 区间时长 */}
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(z => {
                  const secs = hrStats.zoneDurations[z] || 0;
                  if (!secs) return null;
                  const m = Math.floor(secs / 60), s = secs % 60;
                  return (
                    <div key={z} style={{
                      flex: 1, textAlign: 'center', padding: '5px 4px', borderRadius: 7,
                      background: ZONE_BG[z], border: `1px solid ${ZONE_COLORS[z]}30`,
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: ZONE_COLORS[z] }}>Z{z}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: ZONE_COLORS[z], fontVariantNumeric: 'tabular-nums' }}>
                        {m}:{String(s).padStart(2, '0')}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* RPE */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>RPE 强度感知</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[5, 6, 7, 8, 9, 10].map(v => (
                <button key={v} onClick={() => setRpe(v)} style={{
                  flex: 1, height: 42, borderRadius: 10, border: 'none',
                  background: rpe === v ? '#7C3AED' : 'rgba(255,255,255,0.06)',
                  color: rpe === v ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s',
                }}>{v}</button>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
              {RPE_HINTS[rpe] || ''}
            </div>
          </div>

          {/* 整体表现 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>整体表现</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['良好', '一般', '较差'].map(p => (
                <button key={p} onClick={() => setPerf(p)} style={{
                  flex: 1, height: 38, borderRadius: 10, border: 'none',
                  background: perf === p ? '#7C3AED' : 'rgba(255,255,255,0.06)',
                  color: perf === p ? '#fff' : 'rgba(255,255,255,0.4)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                }}>{p}</button>
              ))}
            </div>
          </div>

          {/* 笔记 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>教练笔记（选填）</div>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              rows={2} placeholder="下次注意离心控制..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'none',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '10px 20px 18px', display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 44, borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: 'none',
            color: 'rgba(255,255,255,0.45)', fontSize: 13, cursor: 'pointer',
          }}>取消</button>
          <button onClick={() => onSave(rpe, perf, note)} style={{
            flex: 2, height: 44, borderRadius: 12,
            background: '#7C3AED', border: 'none',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>完成并记录</button>
        </div>
      </div>
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
export function CoachSessionView({ client, onClose, onRecordSession, onCancelSession }: CoachSessionViewProps) {
  const [exercises, setExercises] = useState<Exercise[]>(() => parsePlan(client));
  const [curIdx, setCurIdx] = useState(0);
  const [phase, setPhase] = useState<'countdown' | 'session' | 'rest' | 'finish'>('countdown');
  const [restSecs, setRestSecs] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const [dyOpen, setDyOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const timerRef = useRef<number | null>(null);

  // 心率 hook
  const hr = useHeartRate(client.age, (client as any).rhr || 65);

  // 计时器
  useEffect(() => {
    if (phase !== 'session') return;
    timerRef.current = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const curEx = exercises[curIdx] ?? null;
  const curSetIdx = curEx?.sets.findIndex(s => !s.done) ?? -1;

  // 完成一组
  const completeSet = useCallback(() => {
    if (!curEx) return;
    const nsi = curEx.sets.findIndex(s => !s.done);
    if (nsi === -1) {
      // 全部完成 → 跳下一个动作
      if (curIdx < exercises.length - 1) setCurIdx(i => i + 1);
      return;
    }
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, si) => si !== nsi ? s : { ...s, done: true }),
      }
    ));
    // 触发休息
    if (curEx.restSeconds > 0) {
      setRestSecs(curEx.restSeconds);
      setPhase('rest');
    }
  }, [curEx, curIdx, exercises.length]);

  // 更新重量/次数
  const updateSet = (exIdx: number, si: number, key: 'weight' | 'reps', val: string) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : {
        ...ex,
        sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [key]: val }),
      }
    ));
  };

  // 加组
  const addSet = () => {
    if (!curEx) return;
    const last = curEx.sets[curEx.sets.length - 1];
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : {
        ...ex,
        sets: [...ex.sets, { num: ex.sets.length + 1, reps: last?.reps || '10', weight: last?.weight || '', done: false }],
      }
    ));
  };

  // 删组
  const delSet = (si: number) => {
    if (!curEx || curEx.sets.length <= 1) return;
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : {
        ...ex,
        sets: ex.sets.filter((_, j) => j !== si).map((s, j) => ({ ...s, num: j + 1 })),
      }
    ));
  };

  // 进度
  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const doneSets = exercises.reduce((n, ex) => n + ex.sets.filter(s => s.done).length, 0);
  const progPct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  // 取消课程
  const handleCancelSession = () => {
    setShowCancelConfirm(true);
  };

  const confirmCancelSession = () => {
    setShowCancelConfirm(false);
    if (onCancelSession) {
      onCancelSession();
    }
    onClose();
  };

  // 保存
  const handleSave = async (rpe: number, perf: string, note: string) => {
    const hrStats = hr.getStats();
    // 根据客户档位决定费用
    const tier = client.tier || 'standard';
    const price = tier === 'pro' ? 388 : 328;
    await onRecordSession({
      date: new Date().toLocaleDateString('zh-CN'),
      week: client.current_week || 1,
      level: 1,
      day: (curEx?.sectionTitle || '').trim() || '训练日',
      duration: Math.round(elapsed / 60),
      rpe, performance: perf, price, note,
      hrAvg: hrStats?.avgBpm,
      hrMax: hrStats?.maxBpm,
      hrMin: hrStats?.minBpm,
      hrZoneDurations: hrStats?.zoneDurations,
    });
    hr.clearSamples();
    onClose();
  };

  // 分组渲染左栏列表
  const sections: { title: string; exs: Array<{ ex: Exercise; idx: number }> }[] = [];
  exercises.forEach((ex, idx) => {
    const last = sections[sections.length - 1];
    if (!last || last.title !== ex.sectionTitle) {
      sections.push({ title: ex.sectionTitle, exs: [{ ex, idx }] });
    } else {
      last.exs.push({ ex, idx });
    }
  });

  // 主按钮文字
  const mainBtnLabel = (() => {
    if (!curEx) return '全部完成';
    const nsi = curEx.sets.findIndex(s => !s.done);
    if (nsi === -1) return `→ 下一动作`;
    return `完成第 ${nsi + 1} 组`;
  })();
  const mainBtnSub = (() => {
    if (!curEx) return '';
    const nsi = curEx.sets.findIndex(s => !s.done);
    if (nsi === -1) return '';
    return curEx.restSeconds > 0 ? `完成后休息 ${curEx.restSeconds}s` : '';
  })();

  const nextEx = exercises[curIdx + 1];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#0F0F12', color: '#fff',
      display: 'flex', flexDirection: 'column',
      fontFamily: "-apple-system, 'PingFang SC', sans-serif",
    }}>

      {/* ── 进度条（最顶部 3px）── */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${progPct}%`, background: '#7C3AED', transition: 'width 0.5s' }} />
      </div>

      {/* ── 心率顶栏 ── */}
      <HRTopBar hr={hr} />

      {/* ── 主体：左栏 + 右主区 ── */}
      {/* iPad 11寸：1180px 宽，左栏 220px，右侧 960px */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 左栏：动作列表 ── */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 客户名 + 进度 */}
          <div style={{
            padding: '10px 14px', flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{client.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2, fontFamily: 'monospace' }}>
              {doneSets}/{totalSets} 组 · {fmt(elapsed)}
            </div>
          </div>

          {/* 动作列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '5px 0' }}>
            {sections.map(sec => (
              <div key={sec.title}>
                <div style={{
                  padding: '6px 14px 2px',
                  fontSize: 9, fontWeight: 700, letterSpacing: '.12em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)',
                }}>{sec.title}</div>
                {sec.exs.map(({ ex, idx }) => {
                  const isActive = idx === curIdx;
                  const isDone = ex.sets.every(s => s.done);
                  const doneCount = ex.sets.filter(s => s.done).length;
                  const tc = tagColor(ex.groupTag);
                  return (
                    <button
                      key={ex.id}
                      onClick={() => setCurIdx(idx)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '7px 14px', border: 'none',
                        background: isActive ? 'rgba(124,58,237,0.18)' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 7,
                        position: 'relative', transition: 'background 0.1s',
                        opacity: isDone ? 0.4 : 1,
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                          width: 2, height: '55%', background: '#7C3AED',
                          borderRadius: '0 2px 2px 0',
                        }} />
                      )}
                      {/* 标签/完成图标 */}
                      {isDone ? (
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%',
                          background: 'rgba(34,197,94,0.2)', flexShrink: 0, marginTop: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, color: '#4ade80',
                        }}>✓</div>
                      ) : ex.groupTag ? (
                        <span style={{
                          fontSize: 9, fontWeight: 800, padding: '2px 4px', borderRadius: 3,
                          background: `${tc}22`, color: tc, flexShrink: 0, marginTop: 1,
                          letterSpacing: '.03em',
                        }}>{ex.groupTag}</span>
                      ) : (
                        <div style={{
                          width: 5, height: 5, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                          background: isActive ? 'rgba(124,58,237,0.8)' : 'rgba(255,255,255,0.18)',
                        }} />
                      )}
                      {/* 动作名 + 进度 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 500,
                          color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{ex.name}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1, fontFamily: 'monospace' }}>
                          {doneCount}/{ex.sets.length}组{ex.rhythm ? ` · ${ex.rhythm}` : ''}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* 结束训练按钮 */}
          <button
            onClick={() => setPhase('finish')}
            style={{
              margin: 8, padding: '8px', borderRadius: 10,
              background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: 'rgba(248,113,113,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              flexShrink: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(248,113,113,0.8)">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            结束训练
          </button>
        </div>

        {/* ── 右主区 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* 模块信息栏 */}
          <div style={{
            padding: '9px 20px', flexShrink: 0,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {curEx?.groupTag && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5,
                  background: `${tagColor(curEx.groupTag)}22`,
                  color: tagColor(curEx.groupTag),
                  border: `1px solid ${tagColor(curEx.groupTag)}40`,
                }}>{curEx.groupTag}</span>
              )}
              <span style={{
                fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{curEx?.sectionTitle}</span>
              {curEx?.sectionFormat && (
                <span style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.25)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '1px 5px',
                }}>
                  {curEx.sectionFormat}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', flexShrink: 0 }}>
              {fmt(elapsed)}
            </span>
          </div>

          {/* 动作信息 + 组数 — iPad 11: 左右分栏 */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* 左：动作信息区 */}
            <div style={{
              width: 420, flexShrink: 0, padding: '18px 20px',
              borderRight: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto',
            }}>
              {curEx ? (
                <>
                  {/* 节奏 */}
                  {curEx.rhythm && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
                      padding: '3px 8px', borderRadius: 5,
                      background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                      border: '1px solid rgba(245,158,11,0.2)',
                      alignSelf: 'flex-start',
                    }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      {curEx.rhythm}
                    </div>
                  )}

                  {/* 动作名 */}
                  <div>
                    <div style={{
                      fontSize: 'clamp(1.6rem, 3vw, 2.4rem)',
                      fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: '-.02em',
                    }}>{curEx.name}</div>
                    {curEx.nameEn && (
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.28)', marginTop: 4, fontWeight: 300 }}>
                        {curEx.nameEn}
                      </div>
                    )}
                  </div>

                  {/* CUE */}
                  {curEx.cue && (
                    <div style={{
                      padding: '11px 14px', borderRadius: 12,
                      background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.22)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(167,139,250,0.5)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 5 }}>CUE</div>
                      <div style={{ fontSize: 13, color: '#c4b5fd', fontWeight: 500, lineHeight: 1.4 }}>{curEx.cue}</div>
                    </div>
                  )}

                  {/* 动力线（可展开） */}
                  {curEx.dyline && (
                    <div>
                      <button
                        onClick={() => setDyOpen(v => !v)}
                        style={{
                          fontSize: 10, color: 'rgba(255,255,255,0.3)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          transition: 'color 0.12s', padding: '2px 0',
                        }}
                      >
                        <span style={{ fontSize: 9 }}>{dyOpen ? '▾' : '▸'}</span> 动力线解析
                      </button>
                      {dyOpen && (
                        <div style={{
                          marginTop: 5, padding: '8px 10px', borderRadius: 8,
                          background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)',
                          fontSize: 11, color: 'rgba(253,230,138,0.6)', fontStyle: 'italic', lineHeight: 1.5,
                        }}>
                          {curEx.dyline}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ color: 'rgba(255,255,255,0.2)', fontSize: 14, marginTop: 40, textAlign: 'center' }}>
                  从左侧选择动作
                </div>
              )}
            </div>

            {/* 右：组数区 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              {/* 组数列头 */}
              <div style={{
                padding: '10px 16px 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', gap: 8, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
                  <span style={{ width: 20 }}>#</span>
                  <span style={{ width: 58, textAlign: 'center' }}>重量</span>
                  <span style={{ width: 14 }} />
                  <span style={{ width: 58, textAlign: 'center' }}>次数</span>
                </div>
                <button
                  onClick={addSet}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
                >+ 加组</button>
              </div>

              {/* 组数列表 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 10px' }}>
                {curEx?.sets.map((set, si) => (
                  <SetRow
                    key={si}
                    set={set}
                    isCurrent={si === curSetIdx}
                    onToggle={() => {
                      const nsi = curEx.sets.findIndex(s => !s.done);
                      if (si === nsi) {
                        // 完成当前组
                        setExercises(prev => prev.map((ex, i) =>
                          i !== curIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: true }) }
                        ));
                        if (curEx.restSeconds > 0) { setRestSecs(curEx.restSeconds); setPhase('rest'); }
                      } else {
                        // 切换单个组的完成状态
                        setExercises(prev => prev.map((ex, i) =>
                          i !== curIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: !s.done }) }
                        ));
                      }
                    }}
                    onDelete={() => delSet(si)}
                    onUpdateWeight={v => updateSet(curIdx, si, 'weight', v)}
                    onUpdateReps={v => updateSet(curIdx, si, 'reps', v)}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* ── 底部操作栏 ── */}
          <div style={{
            padding: '10px 16px 12px', flexShrink: 0,
            borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 上一个 */}
              <button
                onClick={() => { if (curIdx > 0) { setCurIdx(i => i - 1); setDyOpen(false); } }}
                disabled={curIdx === 0}
                style={{
                  width: 42, height: 50, borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)', border: 'none',
                  color: curIdx === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)',
                  cursor: curIdx === 0 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>

              {/* 主按钮 */}
              <button
                onClick={completeSet}
                style={{
                  flex: 1, height: 50, borderRadius: 14,
                  background: curSetIdx === -1 ? 'rgba(34,197,94,0.25)' : '#7C3AED',
                  border: 'none', cursor: 'pointer', color: '#fff',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 14, fontWeight: 700 }}>{mainBtnLabel}</span>
                {mainBtnSub && <span style={{ fontSize: 9, opacity: 0.5 }}>{mainBtnSub}</span>}
              </button>

              {/* 下一个 */}
              <button
                onClick={() => { if (curIdx < exercises.length - 1) { setCurIdx(i => i + 1); setDyOpen(false); } }}
                disabled={curIdx >= exercises.length - 1}
                style={{
                  width: 42, height: 50, borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)', border: 'none',
                  color: curIdx >= exercises.length - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.55)',
                  cursor: curIdx >= exercises.length - 1 ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>

            {/* 下一个动作预告 */}
            {nextEx && (
              <div style={{
                textAlign: 'center', marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.25)',
              }}>
                下一个：<span style={{ color: 'rgba(255,255,255,0.45)' }}>{nextEx.name}</span>
                {nextEx.groupTag && (
                  <span style={{ color: `${tagColor(nextEx.groupTag)}80`, fontWeight: 700, marginLeft: 4 }}>
                    {nextEx.groupTag}
                  </span>
                )}
              </div>
            )}

            {/* 取消课程按钮 */}
            <button
              onClick={handleCancelSession}
              style={{
                width: '100%', height: 36, borderRadius: 8,
                background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.24)',
                color: '#f87171', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="9" x2="15" y2="15" />
                <line x1="15" y1="9" x2="9" y2="15" />
              </svg>
              取消课程 / Cancel Session
            </button>
          </div>
        </div>
      </div>

      {/* ── 覆盖层 ── */}
      {phase === 'countdown' && (
        <CountdownOverlay onDone={() => setPhase('session')} />
      )}
      {phase === 'rest' && (
        <RestOverlay seconds={restSecs} onSkip={() => setPhase('session')} />
      )}
      {phase === 'finish' && (
        <FinishSheet
          duration={elapsed}
          hrStats={hr.getStats()}
          onSave={handleSave}
          onCancel={() => setPhase('session')}
        />
      )}

      {/* 取消课程确认弹窗 */}
      {showCancelConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1a1e', borderRadius: 16, padding: '24px 20px',
            width: 320, maxWidth: '90vw', border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8, textAlign: 'center' }}>
              确认取消课程？
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 20, textAlign: 'center', lineHeight: 1.5 }}>
              取消后将不会扣费，本次训练记录将不会保存
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowCancelConfirm(false)}
                style={{
                  flex: 1, height: 40, borderRadius: 8,
                  background: 'rgba(255,255,255,0.08)', border: 'none',
                  color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                继续训练
              </button>
              <button
                onClick={confirmCancelSession}
                style={{
                  flex: 1, height: 40, borderRadius: 8,
                  background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)',
                  color: '#f87171', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                确认取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
