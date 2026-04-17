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
  notes?: string;          // Exercise-specific notes
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
  kcal?: number;
  actual_weights?: number[];
  coach_notes?: string;
  post_assessment?: {
    weight?: number;
    body_fat_pct?: number;
    rhr?: number;
  };
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

// ─── 右侧心率模块 ─────────────────────────────────────────────
function HRTopBar({
  hr,
  elapsedSecs,
  weightKg,
  doneSets,
  totalSets,
}: {
  hr: ReturnType<typeof useHeartRate>;
  elapsedSecs: number;
  weightKg: number;
  doneSets: number;
  totalSets: number;
}) {
  const zone = hr.currentZone;
  const bpm = hr.bpm;
  const hasBpm = typeof bpm === 'number' && bpm > 0;
  const zoneColor = zone ? ZONE_COLORS[zone.zone] : '#5b63d7';

  const profile = hr.profile;
  const intensity = (() => {
    if (!hasBpm || !profile) return 0;
    const range = profile.mhr - profile.rhr;
    if (!Number.isFinite(range) || range <= 0) return 0;
    const pct = ((bpm - profile.rhr) / range) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  })();

  const met = zone ? ({ 1: 3.5, 2: 5.5, 3: 7.5, 4: 9.5, 5: 11.5 }[zone.zone]) : 3.0;
  const minutes = elapsedSecs / 60;
  const kcal = Math.max(0, (met * 3.5 * weightKg / 200) * minutes);
  const ringPct = Math.max(5, intensity);

  const stats = hr.getStats();

  return (
    <div style={{
      borderRadius: 28,
      border: 'none',
      background: 'transparent',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
      padding: 18,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      height: '100%',
      minHeight: 0,
      boxSizing: 'border-box',
      width: '100%',
      flex: 1,
    }}>
      {hr.status !== 'connected' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>

          <div style={{ textAlign: 'center', padding: '20px 0 10px' }}>
            <div style={{ fontSize: 13, color: 'rgba(100,116,139,0.9)', marginBottom: 12 }}>
              心率带未连接
            </div>
            <button
              onClick={hr.connect}
              disabled={hr.status === 'connecting'}
              style={{
                padding: '8px 20px', borderRadius: 10,
                background: 'rgba(91,99,215,0.12)',
                border: '1px solid rgba(91,99,215,0.28)',
                color: '#4f46e5', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {hr.status === 'connecting' ? '连接中...' : '连接心率带'}
            </button>
          </div>

          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 56, fontWeight: 900, fontFamily: 'monospace', color: '#0f172a', letterSpacing: '0.05em' }}>
              {fmt(elapsedSecs)}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.85)', letterSpacing: '.14em', marginTop: 4 }}>
              训练时长
            </div>
          </div>

          <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(203,213,225,0.9)' }}>
            <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.88)', letterSpacing: '.1em', marginBottom: 8 }}>完成进度</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a' }}>
              {doneSets} <span style={{ fontSize: 14, color: 'rgba(100,116,139,0.9)', fontWeight: 400 }}>/ {totalSets} 组</span>
            </div>
            <div style={{ marginTop: 8, height: 4, background: 'rgba(203,213,225,0.7)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${totalSets ? (doneSets / totalSets * 100) : 0}%`, background: '#FF6B35', borderRadius: 2, transition: 'width 0.5s' }} />
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 10, color: 'rgba(100,116,139,0.88)', letterSpacing: '.1em', marginBottom: 6 }}>快速备注</div>
            <textarea
              placeholder="记录客户今日状态、动作问题..."
              rows={4}
              style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, resize: 'none',
                background: 'rgba(255,255,255,0.62)',
                border: '1px solid rgba(203,213,225,0.9)',
                color: '#0f172a', fontSize: 12,
                fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div
              style={{
                width: 300,
                height: 300,
                borderRadius: '50%',
                background: `conic-gradient(${zoneColor} ${ringPct}%, #e2e6ef ${ringPct}% 100%)`,
                display: 'grid',
                placeItems: 'center',
                transition: 'all .3s ease',
                boxShadow: 'inset 0 0 0 1px rgba(143,153,181,.12)',
              }}
            >
              <div
                style={{
                  width: 228,
                  height: 228,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle at 30% 22%, #ffffff 0%, #f4f6fc 92%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  boxShadow: '0 14px 36px rgba(113,123,156,.12)',
                }}
              >
                <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                  {hasBpm ? bpm : '--'}
                </div>
                <div style={{ marginTop: 6, fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: '#636d84', fontWeight: 700 }}>
                  当前心率 / Current BPM
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{
              borderRadius: 14,
              border: '1px solid rgba(218,223,236,0.8)',
              background: 'rgba(255,255,255,0.56)',
              padding: '12px 14px',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 900, color: '#4f56c8', fontVariantNumeric: 'tabular-nums' }}>{intensity}%</div>
              <div style={{ marginTop: 4, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6a7288', fontWeight: 700 }}>强度 / Intensity</div>
            </div>
            <div style={{
              borderRadius: 14,
              border: '1px solid rgba(218,223,236,0.8)',
              background: 'rgba(255,255,255,0.56)',
              padding: '12px 14px',
              backdropFilter: 'blur(8px)',
            }}>
              <div style={{ fontSize: 28, lineHeight: 1, fontWeight: 900, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{kcal.toFixed(1)}</div>
              <div style={{ marginTop: 4, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6a7288', fontWeight: 700 }}>实时消耗 / kcal</div>
            </div>
          </div>

          <div style={{ borderRadius: 14, border: '1px solid rgba(218,223,236,0.8)', background: 'rgba(255,255,255,0.56)', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: zone ? zoneColor : '#4f56c8' }}>
                {zone ? `Z${zone.zone} · ${zone.labelEn}` : '恢复 / Rest'}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>时长 {fmt(elapsedSecs)}</div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
              平均 {stats?.avgBpm ?? '--'} · 最高 {stats?.maxBpm ?? '--'} · 最低 {stats?.minBpm ?? '--'}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={hr.disconnect} style={{
              fontSize: 12, padding: '7px 12px', borderRadius: 8,
              border: '1px solid rgba(148,163,184,.42)',
              background: 'rgba(255,255,255,.72)',
              color: '#475569', cursor: 'pointer',
            }}>断开心率带</button>
          </div>
        </>
      )}
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
  const bg = state === 'done' ? 'rgba(34,197,94,0.08)' : state === 'current' ? 'rgba(91,99,215,0.14)' : 'rgba(255,255,255,0.68)';
  const border = state === 'done' ? 'rgba(34,197,94,0.26)' : state === 'current' ? 'rgba(91,99,215,0.45)' : 'rgba(203,213,225,0.9)';
  const numColor = state === 'done' ? '#16a34a' : state === 'current' ? '#4f46e5' : 'rgba(100,116,139,0.9)';

  return (
    <>
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
            background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(203,213,225,0.92)',
            borderRadius: 7, color: set.done ? 'rgba(148,163,184,0.9)' : '#0f172a',
            outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(91,99,215,0.7)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(203,213,225,0.92)')}
        />
        <span style={{ fontSize: 10, color: 'rgba(100,116,139,0.72)', flexShrink: 0 }}>kg ×</span>

        {/* 次数输入 */}
        <input
          type="text"
          value={set.reps}
          disabled={set.done}
          onChange={e => onUpdateReps(e.target.value)}
          style={{
            width: 58, height: 32, textAlign: 'center', fontSize: 13,
            fontFamily: 'monospace', fontWeight: 600,
            background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(203,213,225,0.92)',
            borderRadius: 7, color: set.done ? 'rgba(148,163,184,0.9)' : '#0f172a',
            outline: 'none', transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.target.style.borderColor = 'rgba(91,99,215,0.7)')}
          onBlur={e => (e.target.style.borderColor = 'rgba(203,213,225,0.92)')}
        />
        <span style={{ fontSize: 10, color: 'rgba(100,116,139,0.72)', flexShrink: 0 }}>次</span>
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
        background: set.done ? 'rgba(34,197,94,0.18)' : isCurrent ? '#5b63d7' : 'rgba(226,232,240,0.9)',
        border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700,
        color: set.done ? '#16a34a' : isCurrent ? '#fff' : 'rgba(100,116,139,0.9)',
        transition: 'all 0.15s',
      }}>✓</button>
      </div>
    </>
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
      <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="200" height="200" viewBox="0 0 200 200" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(167,139,250,0.1)" strokeWidth="6" />
          <circle cx="100" cy="100" r="88" fill="none" stroke="#FF6B35" strokeWidth="6"
            strokeDasharray={`${2 * Math.PI * 88}`}
            strokeDashoffset={`${2 * Math.PI * 88 * (1 - pct / 100)}`}
            strokeLinecap="round"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '100px 100px', transition: 'stroke-dashoffset 0.9s linear' }}
          />
        </svg>
        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ fontSize: 64, fontWeight: 900, fontFamily: 'monospace', color: '#FF8C42', lineHeight: 1 }}>
            {left}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,140,80,0.5)', letterSpacing: '.2em', marginTop: 4 }}>
            组间休息
          </div>
        </div>
      </div>
      <button onClick={onSkip} style={{
        marginTop: 20, padding: '10px 28px', borderRadius: 14,
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
  onSave: (rpe: number, perf: string, note: string, coachNotes: string, postAssessment?: { weight?: number; body_fat_pct?: number; rhr?: number }) => void;
  onCancel: () => void;
}) {
  const [rpe, setRpe] = useState(7);
  const [perf, setPerf] = useState('良好');
  const [note, setNote] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [rhr, setRhr] = useState('');

  const RPE_HINTS: Record<number, string> = {
    5: '很轻松，下次大幅加量', 6: '比较轻松，下次可加量',
    7: '适中，正常推进', 8: '有点累，注意恢复',
    9: '很累，下次需降载', 10: '力竭，必须降载',
  };

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(148,163,184,0.42)', backdropFilter: 'blur(14px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 460,
        maxHeight: '82vh',
        background: 'rgba(248,250,252,0.96)', borderRadius: 20,
        border: '1px solid rgba(203,213,225,0.9)', overflow: 'hidden',
        boxShadow: '0 20px 50px rgba(71,85,105,0.28)',
      }}>
        <div style={{ width: 36, height: 3, background: 'rgba(148,163,184,0.6)', borderRadius: 2, margin: '10px auto 0' }} />

        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(203,213,225,0.9)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>训练总结</div>
          <div style={{ fontSize: 12, color: 'rgba(100,116,139,0.9)', marginTop: 2 }}>
            时长 {Math.round(duration / 60)} 分钟
          </div>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* 心率总结 */}
          {hrStats && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(91,99,215,0.08)', border: '1px solid rgba(91,99,215,0.2)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(79,70,229,0.65)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>
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
                    background: 'rgba(255,255,255,0.8)', border: '1px solid rgba(203,213,225,0.75)', borderRadius: 9,
                  }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#4f46e5', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                    <div style={{ fontSize: 9, color: 'rgba(100,116,139,0.88)', marginTop: 2 }}>{s.label} BPM</div>
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
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(100,116,139,0.92)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>RPE 强度感知</div>
            <div style={{ display: 'flex', gap: 5 }}>
              {[5, 6, 7, 8, 9, 10].map(v => (
                <button key={v} onClick={() => setRpe(v)} style={{
                  flex: 1, height: 42, borderRadius: 10,
                  background: rpe === v ? '#5b63d7' : 'rgba(241,245,249,0.95)',
                  color: rpe === v ? '#fff' : 'rgba(71,85,105,0.9)',
                  fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s',
                  border: rpe === v ? '1px solid rgba(79,70,229,0.7)' : '1px solid rgba(203,213,225,0.9)',
                }}>{v}</button>
              ))}
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(71,85,105,0.88)', marginTop: 6 }}>
              {RPE_HINTS[rpe] || ''}
            </div>
          </div>

          {/* 整体表现 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(100,116,139,0.92)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>整体表现</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['良好', '一般', '较差'].map(p => (
                <button key={p} onClick={() => setPerf(p)} style={{
                  flex: 1, height: 38, borderRadius: 10,
                  background: perf === p ? '#5b63d7' : 'rgba(241,245,249,0.95)',
                  color: perf === p ? '#fff' : 'rgba(71,85,105,0.9)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                  border: perf === p ? '1px solid rgba(79,70,229,0.7)' : '1px solid rgba(203,213,225,0.9)',
                }}>{p}</button>
              ))}
            </div>
          </div>

          {/* 笔记 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(100,116,139,0.92)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>教练笔记（选填）</div>
            <textarea
              value={note} onChange={e => setNote(e.target.value)}
              rows={2} placeholder="下次注意离心控制..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'none',
                background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(203,213,225,0.9)',
                color: '#0f172a', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>

          {/* 课后教练笔记 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(100,116,139,0.92)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>课后总结（选填）</div>
            <textarea
              value={coachNotes} onChange={e => setCoachNotes(e.target.value)}
              rows={2} placeholder="记录客户今日表现、需要改进的地方..."
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 10, resize: 'none',
                background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(203,213,225,0.9)',
                color: '#0f172a', fontSize: 12, fontFamily: 'inherit', outline: 'none',
              }}
            />
          </div>

          {/* 身体数据更新 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(100,116,139,0.92)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>体测数据（选填）</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <input
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="体重"
                  style={{
                    width: '100%', padding: '10px 10px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(203,213,225,0.9)',
                    color: '#0f172a', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 8, color: 'rgba(100,116,139,0.8)', marginTop: 3, textAlign: 'center' }}>kg</div>
              </div>
              <div>
                <input
                  type="number"
                  step="0.1"
                  value={bodyFatPct}
                  onChange={e => setBodyFatPct(e.target.value)}
                  placeholder="体脂率"
                  style={{
                    width: '100%', padding: '10px 10px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(203,213,225,0.9)',
                    color: '#0f172a', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 8, color: 'rgba(100,116,139,0.8)', marginTop: 3, textAlign: 'center' }}>%</div>
              </div>
              <div>
                <input
                  type="number"
                  value={rhr}
                  onChange={e => setRhr(e.target.value)}
                  placeholder="静息心率"
                  style={{
                    width: '100%', padding: '10px 10px', borderRadius: 8, fontSize: 12,
                    background: 'rgba(255,255,255,0.95)', border: '1px solid rgba(203,213,225,0.9)',
                    color: '#0f172a', outline: 'none', boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 8, color: 'rgba(100,116,139,0.8)', marginTop: 3, textAlign: 'center' }}>bpm</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: '10px 20px 18px', display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 44, borderRadius: 12,
            background: 'rgba(241,245,249,0.95)', border: '1px solid rgba(203,213,225,0.9)',
            color: 'rgba(71,85,105,0.92)', fontSize: 13, cursor: 'pointer',
          }}>取消</button>
          <button onClick={() => {
            const postAssessment = {
              weight: weight ? parseFloat(weight) : undefined,
              body_fat_pct: bodyFatPct ? parseFloat(bodyFatPct) : undefined,
              rhr: rhr ? parseInt(rhr) : undefined,
            };
            onSave(rpe, perf, note, coachNotes, postAssessment);
          }} style={{
            flex: 2, height: 44, borderRadius: 12,
            background: '#5b63d7', border: 'none',
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
  const [notesOpen, setNotesOpen] = useState<number | null>(null);
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

  // 更新动作笔记
  const updateExerciseNotes = (notes: string) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : { ...ex, notes }
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
  const handleSave = async (rpe: number, perf: string, note: string, coachNotes: string, postAssessment?: { weight?: number; body_fat_pct?: number; rhr?: number }) => {
    const hrStats = hr.getStats();
    // 根据客户档位决定费用
    const tier = client.tier || 'standard';
    const price = tier === 'pro' ? 388 : 328;

    // 收集所有完成的组的重量作为 actual_weights 数组
    const actual_weights: number[] = [];
    exercises.forEach(ex => {
      ex.sets.forEach(set => {
        if (set.done && set.weight) {
          actual_weights.push(parseFloat(set.weight));
        }
      });
    });

    const latestZone = hr.currentZone?.zone;
    const met = latestZone ? ({ 1: 3.5, 2: 5.5, 3: 7.5, 4: 9.5, 5: 11.5 }[latestZone]) : 3.0;
    const weightForCalc = Number.isFinite(liveWeight) && liveWeight > 0 ? liveWeight : 65;
    const sessionKcal = Math.max(0, (met * 3.5 * weightForCalc / 200) * (elapsed / 60));

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
      kcal: Number(sessionKcal.toFixed(1)),
      actual_weights: actual_weights.length > 0 ? actual_weights : undefined,
      coach_notes: coachNotes,
      post_assessment: (postAssessment?.weight || postAssessment?.body_fat_pct || postAssessment?.rhr) ? postAssessment : undefined,
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
  const mainBtnStateClass = phase === 'rest' ? 'state-rest' : (curSetIdx === -1 ? 'state-done' : 'state-start');

  const nextEx = exercises[curIdx + 1];
  const liveWeight = Number((client as any)?.profile?.weight ?? (client as any)?.weight ?? 65);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: '#eef1f7', color: '#111827',
      display: 'flex', flexDirection: 'column',
      fontFamily: "-apple-system, 'PingFang SC', sans-serif",
    }}>

      {/* ── 进度条（最顶部 3px）── */}
      <div style={{ height: 3, background: 'rgba(214,220,233,0.9)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${progPct}%`, background: '#5b63d7', transition: 'width 0.5s' }} />
      </div>

      {/* ── 主体：左栏 + 右主区 ── */}
      {/* iPad 11寸：1180px 宽，左栏 220px，右侧 960px */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── 左栏：动作列表 ── */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid rgba(188,198,218,0.65)',
          background: '#f7f9fd',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* 客户名 + 进度 */}
          <div style={{
            padding: '10px 14px', flexShrink: 0,
            borderBottom: '1px solid rgba(188,198,218,0.65)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{client.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(99,109,132,0.78)', marginTop: 2, fontFamily: 'monospace' }}>
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
                  textTransform: 'uppercase', color: 'rgba(99,109,132,0.68)',
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
                        background: isActive ? 'rgba(91,99,215,0.14)' : 'transparent',
                        cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 7,
                        position: 'relative', transition: 'background 0.1s',
                        opacity: isDone ? 0.62 : 1,
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                          width: 2, height: '55%', background: '#5b63d7',
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
                          background: isActive ? 'rgba(91,99,215,0.85)' : 'rgba(148,163,184,0.72)',
                        }} />
                      )}
                      {/* 动作名 + 进度 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 11, fontWeight: 500,
                          color: isActive ? '#111827' : 'rgba(75,85,109,0.8)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{ex.name}</div>
                        <div style={{ fontSize: 9, color: 'rgba(100,116,139,0.72)', marginTop: 1, fontFamily: 'monospace' }}>
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
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.18)', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: 'rgba(185,28,28,0.8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              flexShrink: 0,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(185,28,28,0.8)">
              <rect x="3" y="3" width="18" height="18" rx="2" />
            </svg>
            结束训练
          </button>
        </div>

        {/* ── 中间主区 ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, borderRight: '1px solid rgba(188,198,218,0.65)' }}>

          {/* 模块信息栏 */}
          <div style={{
            padding: '9px 20px', flexShrink: 0,
            borderBottom: '1px solid rgba(188,198,218,0.65)',
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
                fontSize: 11, color: 'rgba(75,85,109,0.78)', fontWeight: 500,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{curEx?.sectionTitle}</span>
              {curEx?.sectionFormat && (
                <span style={{
                  fontSize: 9, color: 'rgba(100,116,139,0.82)',
                  border: '1px solid rgba(203,213,225,0.9)', borderRadius: 4, padding: '1px 5px',
                }}>
                  {curEx.sectionFormat}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, color: 'rgba(100,116,139,0.82)', fontFamily: 'monospace', flexShrink: 0 }}>
              {fmt(elapsed)}
            </span>
          </div>

          {/* 动作信息 + 组数：改为上下结构 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* 上：动作信息区 */}
            <div style={{
              width: '100%', flexShrink: 0, padding: '18px 20px',
              borderBottom: '1px solid rgba(188,198,218,0.65)',
              display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto',
              maxHeight: '52%',
              background: 'rgba(255,255,255,0.68)',
            }}>
              {curEx ? (
                <>
                  {/* 笔记按钮 */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                    <button
                      onClick={() => setNotesOpen(notesOpen === curIdx ? null : curIdx)}
                      style={{
                        padding: '6px 10px', borderRadius: 8,
                        background: curEx.notes ? 'rgba(34,197,94,0.14)' : 'rgba(241,245,249,0.95)',
                        border: curEx.notes ? '1px solid rgba(34,197,94,0.34)' : '1px solid rgba(203,213,225,0.9)',
                        color: curEx.notes ? '#15803d' : 'rgba(71,85,105,0.9)',
                        fontSize: 10, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      📝 {curEx.notes ? '已记录' : '备注'}
                    </button>
                  </div>

                  {/* 笔记输入框 */}
                  {notesOpen === curIdx && (
                    <div style={{
                      padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                      background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                    }}>
                      <textarea
                        value={curEx.notes || ''}
                        onChange={e => updateExerciseNotes(e.target.value)}
                        placeholder="记录此动作的表现、难点或注意事项..."
                        rows={2}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: 8, resize: 'none',
                          background: 'rgba(255,255,255,0.92)', border: '1px solid rgba(34,197,94,0.22)',
                          color: '#0f172a', fontSize: 11, fontFamily: 'inherit', outline: 'none',
                        }}
                      />
                    </div>
                  )}

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
                      fontWeight: 900, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-.02em',
                    }}>{curEx.name}</div>
                    {curEx.nameEn && (
                      <div style={{ fontSize: 12, color: 'rgba(55,65,81,0.8)', marginTop: 4, fontWeight: 300 }}>
                        {curEx.nameEn}
                      </div>
                    )}
                  </div>

                  {/* CUE */}
                  {curEx.cue && (
                    <div style={{
                      padding: '11px 14px', borderRadius: 12,
                      background: 'rgba(91,99,215,0.1)', border: '1px solid rgba(91,99,215,0.22)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, color: 'rgba(79,70,229,0.62)', letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 5 }}>CUE</div>
                      <div style={{ fontSize: 13, color: '#4338ca', fontWeight: 600, lineHeight: 1.45 }}>{curEx.cue}</div>
                    </div>
                  )}

                  {/* 动力线（可展开） */}
                  {curEx.dyline && (
                    <div>
                      <button
                        onClick={() => setDyOpen(v => !v)}
                        style={{
                          fontSize: 10, color: 'rgba(71,85,105,0.82)',
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
                <div style={{ color: 'rgba(148,163,184,0.78)', fontSize: 14, marginTop: 40, textAlign: 'center' }}>
                  从左侧选择动作
                </div>
              )}
            </div>

            {/* 下：组数区 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
              {/* 组数列头 */}
              <div style={{
                padding: '10px 16px 6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
              }}>
                <div style={{ display: 'flex', gap: 8, fontSize: 9, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(99,109,132,0.72)' }}>
                  <span style={{ width: 20 }}>#</span>
                  <span style={{ width: 58, textAlign: 'center' }}>重量</span>
                  <span style={{ width: 14 }} />
                  <span style={{ width: 58, textAlign: 'center' }}>次数</span>
                </div>
                <button
                  onClick={addSet}
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#4f46e5',
                    background: 'rgba(91,99,215,0.12)',
                    border: '1px solid rgba(91,99,215,0.28)',
                    borderRadius: 8,
                    padding: '5px 10px',
                    cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
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
            borderTop: '1px solid rgba(188,198,218,0.65)',
            background: 'rgba(255,255,255,0.72)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* 上一个 */}
              <button
                onClick={() => { if (curIdx > 0) { setCurIdx(i => i - 1); setDyOpen(false); } }}
                disabled={curIdx === 0}
                style={{
                  width: 42, height: 50, borderRadius: 12,
                  background: 'rgba(226,232,240,0.9)', border: 'none',
                  color: curIdx === 0 ? 'rgba(148,163,184,0.7)' : 'rgba(75,85,109,0.9)',
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
                className={`sess-main-b ${mainBtnStateClass}`}
                style={{
                  background: curSetIdx === -1
                    ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                    : 'linear-gradient(135deg, #FF6B35, #FF8C42)',
                  boxShadow: curSetIdx === -1
                    ? '0 4px 20px rgba(34,197,94,0.3)'
                    : '0 4px 20px rgba(255,107,53,0.4)',
                  border: 'none', cursor: 'pointer',
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
                  background: 'rgba(226,232,240,0.9)', border: 'none',
                  color: curIdx >= exercises.length - 1 ? 'rgba(148,163,184,0.7)' : 'rgba(75,85,109,0.9)',
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
                textAlign: 'center', marginTop: 5, fontSize: 10, color: 'rgba(100,116,139,0.82)',
              }}>
                下一个：<span style={{ color: 'rgba(75,85,109,0.9)' }}>{nextEx.name}</span>
                {nextEx.groupTag && (
                  <span style={{ color: `${tagColor(nextEx.groupTag)}80`, fontWeight: 700, marginLeft: 4 }}>
                    {nextEx.groupTag}
                  </span>
                )}
              </div>
            )}

            {/* 取消课程按钮 */}
            <div style={{ textAlign: 'center', marginTop: 4 }}>
              <button
                onClick={handleCancelSession}
                style={{
                  width: 'auto', height: 28, padding: '0 12px',
                  background: 'transparent', border: 'none',
                  color: 'rgba(248,113,113,0.35)', fontSize: 10, fontWeight: 500,
                  marginTop: 6, alignSelf: 'center',
                  cursor: 'pointer',
                }}
              >
                取消课程
              </button>
            </div>
          </div>
        </div>

        {/* ── 右侧：心率实时面板 ── */}
        <div style={{
          width: 430,
          flexShrink: 0,
          padding: '14px 14px 12px',
          overflow: 'hidden',
          background: 'rgba(255,255,255,0.34)',
          display: 'flex',
        }}>
          <HRTopBar
            hr={hr}
            elapsedSecs={elapsed}
            weightKg={Number.isFinite(liveWeight) && liveWeight > 0 ? liveWeight : 65}
            doneSets={doneSets}
            totalSets={totalSets}
          />
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
