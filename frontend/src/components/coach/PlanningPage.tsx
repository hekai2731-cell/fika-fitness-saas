import { useEffect, useMemo, useState, useRef, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Block, Client, TrainingDay, TrainingWeek } from '@/lib/db';
import { getClient, loadClients, saveClients } from '@/lib/store';

// ─── 工具 ──────────────────────────────────────────────────────────────────────
function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
function getTagColor(tag?: string) {
  if (!tag) return '#6B7280';
  const m: Record<string, string> = { A: '#7C3AED', B: '#0D9488', C: '#D97706', D: '#DC2626', E: '#2563EB', F: '#9333EA' };
  return m[tag[0]] || '#6B7280';
}

const WEEKDAY_OPTIONS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const;

// ─── 类型补充 ───────────────────────────────────────────────────────────────────
interface ExerciseItem {
  id: string;
  name: string;
  name_en?: string;
  group_tag?: string;
  sets: number;
  reps: string;
  weight: string;      // 建议重量（可编辑）
  rest_seconds?: number;
  rhythm?: string;
  cue?: string;
  dyline?: string;
  target_muscles?: string;
  notes?: string;
}

interface PlanModule {
  id: string;
  module_name: string;
  module_duration?: string;
  format?: string;
  exercises: ExerciseItem[];
}

type LongPressDeleteMenu = {
  x: number;
  y: number;
  type: 'block' | 'week' | 'day';
  blockId?: string;
  weekId?: string;
  dayId?: string;
};

interface AiSettings {
  training_session?: boolean;
  training_week?: boolean;
  training_ultra?: boolean;
  nutrition_phase?: boolean;
  nutrition_daily?: boolean;
}

type AiConfirmMode = 'full' | 'week' | 'day';

interface PlanConfirmForm {
  clientNeeds: string;
  priorityGoals: string[];
  weeklyFrequency: string;
  coachAnalysis: string;
  selectedTier: 'standard' | 'pro' | 'ultra';
  weekDirection: string;
  weekFocusAreas: string[];
  weekNote: string;
  recoveryStatus: string;
  todayStatus: string;
  discomfortAreas: string[];
  sessionGoal: string;
  preSessionNote: string;
}

const PLAN_PRIORITY_OPTIONS = ['减脂塑形', '增肌力量', '体态矫正', '运动表现', '康复训练', '心肺耐力'] as const;

const PLAN_FREQUENCY_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: '2', label: '2次/周', desc: '基础维持' },
  { value: '3', label: '3次/周', desc: '稳步提升' },
  { value: '4', label: '4次/周', desc: '进阶训练' },
  { value: '5', label: '5+次/周', desc: '高频冲刺' },
];

const WEEK_DIRECTION_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: 'strength', label: '力量为主', desc: '大量复合动作' },
  { value: 'conditioning', label: '体能为主', desc: '心肺+循环训练' },
  { value: 'technique', label: '技术为主', desc: '动作质量优先' },
  { value: 'recovery', label: '恢复为主', desc: 'Deload / 恢复周' },
  { value: 'balanced', label: '综合均衡', desc: '力量+体能 平衡' },
];

const WEEK_FOCUS_OPTIONS = ['上肢推', '上肢拉', '下肢', '核心', '心肺', '全身', '灵活性', '爆发力'] as const;

const RECOVERY_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: '1-2天:还酸痛', label: '1-2天:还酸痛', desc: '肌肉酸痛明显' },
  { value: '2-3天:基本好', label: '2-3天:基本好', desc: '轻微酸痛可训练' },
  { value: '3天+:感觉好', label: '3天+:感觉好', desc: '完全恢复' },
];

const TODAY_STATUS_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: '状态差', label: '状态差', desc: '精神不佳/睡眠差/压力大' },
  { value: '正常', label: '正常', desc: '一切正常' },
  { value: '状态好', label: '状态好，想冲', desc: '精力充沛想挑战' },
];

const DISCOMFORT_OPTIONS = ['无不适', '腰椎', '膝关节', '肩关节', '其他'] as const;

const SESSION_GOAL_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: 'technique', label: '技术打磨', desc: '注重动作质量和控制' },
  { value: 'strength', label: '力量积累', desc: '渐进超负荷为主' },
  { value: 'power', label: '爆发冲刺', desc: '高强度速度训练' },
  { value: 'recovery', label: '恢复激活', desc: '低强度恢复为主' },
];

const defaultPlanConfirmForm: PlanConfirmForm = {
  clientNeeds: '',
  priorityGoals: [],
  weeklyFrequency: '3',
  coachAnalysis: '',
  selectedTier: 'pro',
  weekDirection: 'balanced',
  weekFocusAreas: ['核心'],
  weekNote: '',
  recoveryStatus: '2-3天:基本好',
  todayStatus: '正常',
  discomfortAreas: ['无不适'],
  sessionGoal: 'strength',
  preSessionNote: '',
};

function readAiSettings(): AiSettings {
  try {
    return JSON.parse(localStorage.getItem('fika_ai_settings') || '{}') || {};
  } catch {
    return {};
  }
}

// ─── 单个动作编辑行 ─────────────────────────────────────────────────────────────
function ExerciseRow({
  ex,
  onChange,
  onDelete,
}: {
  ex: ExerciseItem;
  onChange: (updated: ExerciseItem) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const tc = getTagColor(ex.group_tag);

  return (
    <div style={{
      border: '1px solid rgba(216,221,236,.75)', borderRadius: 10, overflow: 'hidden',
      marginBottom: 6, background: 'rgba(255,255,255,.55)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>
      {/* 主行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        {/* 超级组标签 */}
        {ex.group_tag ? (
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 5px', borderRadius: 4,
            background: `${tc}20`, color: tc, flexShrink: 0,
          }}>{ex.group_tag}</span>
        ) : <div style={{ width: 4, flexShrink: 0 }} />}

        {/* 动作名（可编辑） */}
        <input
          value={ex.name}
          onChange={e => onChange({ ...ex, name: e.target.value })}
          style={{
            flex: 2, minWidth: 0, fontSize: 13, fontWeight: 600,
            border: 'none', outline: 'none', background: 'transparent',
            color: 'var(--s800)',
          }}
          placeholder="动作名称"
        />

        {/* 组数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <input
            type="number"
            value={ex.sets}
            min={1} max={10}
            onChange={e => onChange({ ...ex, sets: Math.max(1, +e.target.value) })}
            style={{
              width: 38, height: 28, textAlign: 'center', fontSize: 12,
              border: '1px solid var(--s200)', borderRadius: 6,
              background: 'var(--s50)', color: 'var(--s900)',
            }}
          />
          <span style={{ fontSize: 11, color: 'var(--s400)' }}>组</span>
        </div>

        {/* 次数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <input
            value={ex.reps}
            onChange={e => onChange({ ...ex, reps: e.target.value })}
            style={{
              width: 52, height: 28, textAlign: 'center', fontSize: 12,
              border: '1px solid var(--s200)', borderRadius: 6,
              background: 'var(--s50)', color: 'var(--s900)',
            }}
            placeholder="10次"
          />
        </div>

        {/* 重量 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <input
            value={ex.weight}
            onChange={e => onChange({ ...ex, weight: e.target.value })}
            style={{
              width: 52, height: 28, textAlign: 'center', fontSize: 12,
              border: '1px solid var(--s200)', borderRadius: 6,
              background: 'var(--s50)', color: 'var(--s900)',
            }}
            placeholder="kg"
          />
          <span style={{ fontSize: 11, color: 'var(--s400)' }}>kg</span>
        </div>

        {/* 节奏 */}
        {ex.rhythm && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(245,158,11,.1)', color: '#b45309', border: '1px solid rgba(245,158,11,.2)',
            fontFamily: 'monospace', flexShrink: 0,
          }}>{ex.rhythm}</span>
        )}

        {/* 展开 Cue */}
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{
            width: 24, height: 24, borderRadius: 6, border: 'none',
            background: expanded ? 'var(--p2)' : 'var(--s100)',
            color: expanded ? 'var(--p)' : 'var(--s400)',
            cursor: 'pointer', flexShrink: 0, fontSize: 11,
          }}
          title="查看/隐藏 Cue & 动力线"
        >{expanded ? '▲' : '▼'}</button>

        {/* 删除 */}
        <button
          type="button"
          onClick={onDelete}
          style={{
            width: 24, height: 24, borderRadius: 6, border: 'none',
            background: 'rgba(239,68,68,.08)', color: 'rgba(239,68,68,.7)',
            cursor: 'pointer', flexShrink: 0, fontSize: 13, fontWeight: 700,
          }}
          title="删除动作"
        >×</button>
      </div>

      {/* 展开区：Cue + 动力线 + 备注 */}
      {expanded && (
        <div style={{
          padding: '8px 14px 10px',
          borderTop: '1px solid rgba(216,221,236,.75)',
          background: 'rgba(255,255,255,.5)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {ex.cue && (
            <div style={{
              fontSize: 11, color: 'var(--p)', fontWeight: 500,
              padding: '5px 8px', background: 'var(--p2)',
              borderRadius: 6, borderLeft: '2px solid var(--p)',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .6 }}>CUE  </span>
              {ex.cue}
            </div>
          )}
          {ex.dyline && (
            <div style={{
              fontSize: 11, color: 'var(--s600)', fontStyle: 'italic',
              paddingLeft: 8, borderLeft: '2px solid var(--s300)',
            }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', opacity: .5, fontStyle: 'normal' }}>动力线  </span>
              {ex.dyline}
            </div>
          )}
          {ex.target_muscles && (
            <div style={{ fontSize: 11, color: 'var(--s500)' }}>
              <span style={{ fontWeight: 600 }}>目标肌群：</span>{ex.target_muscles}
            </div>
          )}
          {ex.rest_seconds && ex.rest_seconds > 0 && (
            <div style={{ fontSize: 11, color: 'var(--s500)' }}>
              <span style={{ fontWeight: 600 }}>组间休息：</span>{ex.rest_seconds}s
            </div>
          )}
          {/* 备注可编辑 */}
          <input
            value={ex.notes || ''}
            onChange={e => onChange({ ...ex, notes: e.target.value })}
            placeholder="备注（可选）"
            style={{
              fontSize: 11, border: '1px solid var(--s200)', borderRadius: 6,
              padding: '4px 8px', background: 'rgba(255,255,255,.62)', color: 'var(--s700)',
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── 单个模块编辑区 ─────────────────────────────────────────────────────────────
function ModuleEditor({
  mod,
  moduleIndex,
  onChange,
  onDelete,
}: {
  mod: PlanModule;
  moduleIndex: number;
  onChange: (m: PlanModule) => void;
  onDelete: () => void;
}) {
  const themes = [
    {
      tag: 'ROSE CORE',
      headerBg: 'linear-gradient(120deg, rgba(249,229,240,.86), rgba(243,216,232,.84))',
      shellBg: 'rgba(244,233,239,.76)',
      shellBorder: '1px solid rgba(223,160,196,.42)',
      titleColor: 'rgba(122,52,92,.9)',
      subColor: 'rgba(162,85,129,.84)',
      formatBorder: '1px solid rgba(223,160,196,.42)',
      deleteColor: 'rgba(186,87,128,.9)',
      shadow: '0 8px 14px rgba(110, 62, 88, .1)',
      headBorder: '1px solid rgba(223,160,196,.36)',
    },
    {
      tag: 'CYAN DRIVE',
      headerBg: 'linear-gradient(120deg, rgba(222,241,250,.86), rgba(208,231,244,.84))',
      shellBg: 'rgba(228,239,246,.76)',
      shellBorder: '1px solid rgba(150,198,220,.42)',
      titleColor: 'rgba(43,95,124,.9)',
      subColor: 'rgba(69,132,164,.84)',
      formatBorder: '1px solid rgba(150,198,220,.42)',
      deleteColor: 'rgba(61,130,171,.9)',
      shadow: '0 8px 14px rgba(54, 97, 120, .1)',
      headBorder: '1px solid rgba(150,198,220,.36)',
    },
    {
      tag: 'VIOLET PULSE',
      headerBg: 'linear-gradient(120deg, rgba(234,230,249,.86), rgba(224,218,243,.84))',
      shellBg: 'rgba(234,230,246,.76)',
      shellBorder: '1px solid rgba(176,166,218,.42)',
      titleColor: 'rgba(84,67,150,.9)',
      subColor: 'rgba(116,98,178,.84)',
      formatBorder: '1px solid rgba(176,166,218,.42)',
      deleteColor: 'rgba(108,89,177,.9)',
      shadow: '0 8px 14px rgba(84, 72, 122, .1)',
      headBorder: '1px solid rgba(176,166,218,.36)',
    },
    {
      tag: 'AURORA MINT',
      headerBg: 'linear-gradient(120deg, rgba(223,244,238,.86), rgba(210,236,229,.84))',
      shellBg: 'rgba(228,241,236,.76)',
      shellBorder: '1px solid rgba(150,197,186,.42)',
      titleColor: 'rgba(45,107,96,.9)',
      subColor: 'rgba(70,136,124,.84)',
      formatBorder: '1px solid rgba(150,197,186,.42)',
      deleteColor: 'rgba(60,132,120,.9)',
      shadow: '0 8px 14px rgba(52, 99, 90, .1)',
      headBorder: '1px solid rgba(150,197,186,.36)',
    },
  ] as const;
  const theme = themes[moduleIndex % themes.length];
  const headerBg = theme.headerBg;
  const shellBg = theme.shellBg;
  const shellBorder = theme.shellBorder;

  const addExercise = () => {
    const newEx: ExerciseItem = {
      id: genId('ex'), name: '', sets: 3, reps: '10次', weight: '', rest_seconds: 60,
    };
    onChange({ ...mod, exercises: [...mod.exercises, newEx] });
  };

  const updateEx = (idx: number, updated: ExerciseItem) => {
    const exs = [...mod.exercises];
    exs[idx] = updated;
    onChange({ ...mod, exercises: exs });
  };

  const deleteEx = (idx: number) => {
    onChange({ ...mod, exercises: mod.exercises.filter((_, i) => i !== idx) });
  };

  return (
    <div style={{
      border: shellBorder, borderRadius: 14, overflow: 'hidden',
      marginBottom: 10,
      background: shellBg,
      boxShadow: theme.shadow,
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
    }}>
      {/* 模块头 */}
      <div style={{
        padding: '10px 14px', background: headerBg,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: theme.headBorder,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '.1em',
            color: theme.subColor,
          }}>
            {theme.tag}
          </span>
          <input
            value={mod.module_name}
            onChange={e => onChange({ ...mod, module_name: e.target.value })}
            style={{
              fontSize: 13, fontWeight: 700, border: 'none', outline: 'none',
              background: 'transparent', color: theme.titleColor, minWidth: 120,
            }}
          />
          {mod.format && (
            <span style={{
              fontSize: 10, color: theme.subColor, border: theme.formatBorder,
              borderRadius: 4, padding: '1px 6px',
            }}>{mod.format}</span>
          )}
          {mod.module_duration && (
            <span style={{ fontSize: 10, color: theme.subColor }}>{mod.module_duration}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: theme.subColor }}>{mod.exercises.length} 个动作</span>
          <button
            type="button"
            onClick={onDelete}
            style={{
              fontSize: 11, color: theme.deleteColor, background: 'none',
              border: 'none', cursor: 'pointer', padding: '2px 6px',
            }}
          >删除模块</button>
        </div>
      </div>

      {/* 动作列表 */}
      <div style={{ padding: '8px 12px 4px' }}>
        {/* 列标题 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '0 12px 6px',
          fontSize: 9, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase',
          color: 'var(--s400)',
        }}>
          <div style={{ width: 4, flexShrink: 0 }} />
          <div style={{ flex: 2, minWidth: 0 }}>动作名称</div>
          <div style={{ width: 58, textAlign: 'center' }}>组数</div>
          <div style={{ width: 62, textAlign: 'center' }}>次数</div>
          <div style={{ width: 62, textAlign: 'center' }}>重量</div>
          <div style={{ width: 62 }} />
        </div>

        {mod.exercises.length === 0 && (
          <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--s400)', textAlign: 'center' }}>
            暂无动作，点击下方添加
          </div>
        )}

        {mod.exercises.map((ex, ei) => (
          <ExerciseRow
            key={ex.id || ei}
            ex={ex}
            onChange={updated => updateEx(ei, updated)}
            onDelete={() => deleteEx(ei)}
          />
        ))}

        <button
          type="button"
          onClick={addExercise}
          style={{
            width: '100%', height: 32, border: '1px dashed var(--s300)',
            borderRadius: 8, background: 'transparent', cursor: 'pointer',
            fontSize: 12, color: 'var(--s400)', marginBottom: 8,
            transition: 'all .12s',
          }}
          onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--p)'; (e.target as HTMLElement).style.color = 'var(--p)'; }}
          onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--s300)'; (e.target as HTMLElement).style.color = 'var(--s400)'; }}
        >
          + 添加动作
        </button>
      </div>
    </div>
  );
}

// ─── 计划编辑器（Day 级别）─────────────────────────────────────────────────────
function DayPlanEditor({
  day,
  onSave,
}: {
  day: TrainingDay;
  onSave: (modules: PlanModule[]) => void;
}) {
  const modules: PlanModule[] = useMemo(() => {
    const raw = (day as any).modules || [];
    // 确保每个 exercise 都有 id 和 weight 字段
    return raw.map((m: any) => ({
      ...m,
      id: m.id || genId('mod'),
      exercises: (m.exercises || []).map((ex: any) => ({
        ...ex,
        id: ex.id || genId('ex'),
        weight: ex.weight || '',
      })),
    }));
  }, [day.id]);  // eslint-disable-line

  const [localModules, setLocalModules] = useState<PlanModule[]>(modules);
  const [dirty, setDirty] = useState(false);

  // 当 day 切换时重置
  useEffect(() => {
    const raw = (day as any).modules || [];
    const parsed: PlanModule[] = raw.map((m: any) => ({
      ...m,
      id: m.id || genId('mod'),
      exercises: (m.exercises || []).map((ex: any) => ({
        ...ex,
        id: ex.id || genId('ex'),
        weight: ex.weight || '',
      })),
    }));
    setLocalModules(parsed);
    setDirty(false);
  }, [day.id]);

  const updateMod = (idx: number, updated: PlanModule) => {
    const next = [...localModules];
    next[idx] = updated;
    setLocalModules(next);
    setDirty(true);
  };

  const deleteMod = (idx: number) => {
    setLocalModules(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const addModule = () => {
    setLocalModules(prev => [
      ...prev,
      { id: genId('mod'), module_name: '新模块', format: '', module_duration: '', exercises: [] },
    ]);
    setDirty(true);
  };

  const handleSave = () => {
    onSave(localModules);
    setDirty(false);
  };

  if (localModules.length === 0) {
    return (
      <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--s400)', fontSize: 13 }}>
        还没有生成计划
        <br />
        <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>点击上方「生成今日计划」或「手动添加模块」</span>
        <button
          type="button"
          onClick={addModule}
          style={{
            marginTop: 12, height: 34, padding: '0 16px', borderRadius: 8,
            border: '1px dashed var(--s300)', background: 'transparent',
            fontSize: 12, color: 'var(--s500)', cursor: 'pointer',
          }}
        >+ 手动添加模块</button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--s400)', marginTop: 6 }}>
          {localModules.length} 个模块 · {localModules.reduce((n, m) => n + m.exercises.length, 0)} 个动作
        </div>
      </div>

      {localModules.map((mod, idx) => (
        <ModuleEditor
          key={mod.id}
          mod={mod}
          moduleIndex={idx}
          onChange={updated => updateMod(idx, updated)}
          onDelete={() => deleteMod(idx)}
        />
      ))}

      <button
        type="button"
        onClick={addModule}
        style={{
          width: '100%', height: 36, border: '1px dashed var(--s300)',
          borderRadius: 10, background: 'transparent', cursor: 'pointer',
          fontSize: 12, color: 'var(--s400)', marginTop: 4,
        }}
      >+ 添加模块</button>

      {dirty && (
        <button
          type="button"
          onClick={handleSave}
          style={{
            width: '100%', height: 40, marginTop: 10, borderRadius: 10,
            background: 'var(--p)', color: '#fff', border: 'none',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >💾 保存修改</button>
      )}
    </div>
  );
}

// ─── 主组件 ─────────────────────────────────────────────────────────────────────
export function PlanningPage({
  selectedClientId,
  onSelectClient,
  onOpenSession,
}: {
  selectedClientId: string | null;
  onSelectClient: (clientId: string) => void;
  onOpenSession: (client: Client) => void;
}) {
  const [client, setClient] = useState<Client | null>(null);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const [loadingDay, setLoadingDay] = useState(false);
  const [loadingWeek, setLoadingWeek] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState<LongPressDeleteMenu | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [aiConfirmMode, setAiConfirmMode] = useState<AiConfirmMode | null>(null);
  const [planConfirmForm, setPlanConfirmForm] = useState<PlanConfirmForm>(defaultPlanConfirmForm);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => readAiSettings());

  // ── 选中的 tier（可临时覆盖客户默认档位）──
  const [tierOverride, setTierOverride] = useState<string>('');

  useEffect(() => {
    const list = loadClients();
    const visible = list.filter(c => c.name !== '示例客户');
    if (!selectedClientId && visible.length > 0) onSelectClient(visible[0].id);
  }, [onSelectClient, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) { setClient(null); return; }
    const c = getClient(selectedClientId);
    setClient(c);
    setTierOverride(c?.tier || 'standard');
    const blk = c?.blocks?.[0];
    const wk = blk?.training_weeks?.[0];
    setSelectedBlockId(blk?.id || null);
    setSelectedWeekId(wk?.id || null);
    setSelectedDayId(wk?.days?.[0]?.id || null);
  }, [selectedClientId]);

  useEffect(() => {
    const syncAiSettings = () => setAiSettings(readAiSettings());
    window.addEventListener('storage', syncAiSettings);
    window.addEventListener('focus', syncAiSettings);
    return () => {
      window.removeEventListener('storage', syncAiSettings);
      window.removeEventListener('focus', syncAiSettings);
    };
  }, []);

  
  // ── 派生选中项 ──────────────────────────────────────────────
  const selectedBlock = useMemo<Block | null>(() => {
    if (!client?.blocks || !selectedBlockId) return null;
    return client.blocks.find(b => b.id === selectedBlockId) || null;
  }, [client?.blocks, selectedBlockId]);

  const selectedWeek = useMemo<TrainingWeek | null>(() => {
    if (!selectedBlock?.training_weeks || !selectedWeekId) return null;
    return selectedBlock.training_weeks.find(w => w.id === selectedWeekId) || null;
  }, [selectedBlock?.training_weeks, selectedWeekId]);

  const selectedDay = useMemo<TrainingDay | null>(() => {
    if (!selectedWeek?.days || !selectedDayId) return null;
    return selectedWeek.days.find(d => d.id === selectedDayId) || null;
  }, [selectedWeek?.days, selectedDayId]);

  // ── 持久化 ──────────────────────────────────────────────────
  const persistClient = (next: Client) => {
    const all = loadClients();
    const idx = all.findIndex(c => c.id === next.id);
    const prev = idx >= 0 ? all[idx] : null;
    const blocksChanged = JSON.stringify(prev?.blocks || []) !== JSON.stringify(next.blocks || []);
    const merged: Client = { ...(prev || ({} as Client)), ...next };

    if (blocksChanged) {
      const prevDraft = Number(prev?.plan_draft_version || 0);
      const nextDraft = Number(merged.plan_draft_version || 0);
      merged.plan_draft_version = Math.max(prevDraft + 1, nextDraft || 1);
      merged.plan_updated_at = new Date().toISOString();
      if (merged.plan_published_version == null) merged.plan_published_version = Number(prev?.plan_published_version || 0);
      if (merged.published_blocks == null && prev?.published_blocks) merged.published_blocks = prev.published_blocks;
      if (merged.plan_published_at == null && prev?.plan_published_at) merged.plan_published_at = prev.plan_published_at;
    } else {
      if (merged.plan_draft_version == null) merged.plan_draft_version = Number(prev?.plan_draft_version || 1);
      if (merged.plan_published_version == null) merged.plan_published_version = Number(prev?.plan_published_version || 0);
      if (merged.plan_updated_at == null && prev?.plan_updated_at) merged.plan_updated_at = prev.plan_updated_at;
      if (merged.plan_published_at == null && prev?.plan_published_at) merged.plan_published_at = prev.plan_published_at;
      if (merged.published_blocks == null && prev?.published_blocks) merged.published_blocks = prev.published_blocks;
    }

    if (idx >= 0) all[idx] = merged;
    else all.push(merged);
    saveClients(all);
    setClient(merged);
  };

  const publishPlanToStudent = () => {
    if (!client) return;
    const draftVersion = Number(client.plan_draft_version || 1);
    const publishedBlocks = JSON.parse(JSON.stringify(client.blocks || [])) as Block[];
    const publishedAt = new Date().toISOString();
    const next: Client = {
      ...client,
      published_blocks: publishedBlocks,
      plan_published_version: draftVersion,
      plan_published_at: publishedAt,
    };
    persistClient(next);

    try {
      const studentClients: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
      const matchIdx = studentClients.findIndex(
        (c) => c.id === next.id || (c.roadCode && next.roadCode && c.roadCode === next.roadCode)
      );

      if (matchIdx >= 0) {
        studentClients[matchIdx] = {
          ...studentClients[matchIdx],
          published_blocks: publishedBlocks,
          plan_published_version: draftVersion,
          plan_published_at: publishedAt,
        };
      } else {
        studentClients.push({
          ...next,
          published_blocks: publishedBlocks,
          plan_published_version: draftVersion,
          plan_published_at: publishedAt,
        });
      }

      localStorage.setItem('fika_clients', JSON.stringify(studentClients));
      localStorage.setItem('fika_current_client', JSON.stringify(next));
      window.dispatchEvent(new Event('storage'));
    } catch {
      // ignore sync errors to avoid blocking coach-side publish action
    }
  };

  // 生产环境使用相对路径，开发环境使用环境变量
  const isProduction = import.meta.env.PROD;
  const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '');
  const apiUrl = (path: string) => (apiBase ? String(apiBase).replace(/\/$/, '') + path : path);

  const fetchJsonOrThrow = async (input: RequestInfo | URL, init?: RequestInit) => {
    const resp = await fetch(input, init);
    const ct = resp.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    if (isJson) {
      const json = await resp.json();
      if (!resp.ok || (json as any)?.error) throw new Error((json as any)?.error || 'request failed');
      return json as any;
    }
    const text = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}${text ? `: ${text.slice(0, 200)}` : ''}`);
  };

  // ── 保存计划编辑结果 ─────────────────────────────────────────
  const saveDayModules = (modules: PlanModule[]) => {
    if (!client || !selectedBlock || !selectedWeek || !selectedDay) return;
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id ? b : {
          ...b,
          training_weeks: (b.training_weeks || []).map(w =>
            w.id !== selectedWeek.id ? w : {
              ...w,
              days: (w.days || []).map(d =>
                d.id !== selectedDay.id ? d : { ...d, modules }
              ),
            }
          ),
        }
      ),
    };
    persistClient(next);
  };

  const savePlanNow = () => {
    if (!client) return;
    persistClient(client);
  };

  const startTrainingNow = () => {
    if (!client) return;
    onOpenSession(client);
  };

  const addModuleToSelectedDay = () => {
    if (!client || !selectedBlock || !selectedWeek || !selectedDay) return;
    const dayModules = Array.isArray((selectedDay as any).modules) ? (selectedDay as any).modules : [];
    const nextModules = [
      ...dayModules,
      { id: genId('mod'), module_name: '新模块', format: '', module_duration: '', exercises: [] },
    ];
    saveDayModules(nextModules as PlanModule[]);
  };

  const deleteBlockById = (blockId: string) => {
    if (!client) return;
    const blocks = (client.blocks || []).filter(b => b.id !== blockId);
    const next: Client = { ...client, blocks };
    persistClient(next);
    if (selectedBlockId === blockId) {
      const nb = blocks[0];
      setSelectedBlockId(nb?.id || null);
      const wk = nb?.training_weeks?.[0];
      setSelectedWeekId(wk?.id || null);
      setSelectedDayId(wk?.days?.[0]?.id || null);
    }
  };

  const openAiConfirm = (mode: AiConfirmMode) => {
    const currentTier = String(tierOverride || client?.tier || 'standard') as 'standard' | 'pro' | 'ultra';
    const nextTier = currentTier === 'ultra' && aiSettings.training_ultra === false ? 'pro' : currentTier;
    setPlanConfirmForm({ ...defaultPlanConfirmForm, selectedTier: nextTier });
    setAiConfirmMode(mode);
  };

  const openDayTierPicker = () => {
    if (!selectedDay || anyLoading) return;
    openAiConfirm('day');
  };

  const handleGenerateDayWithTier = (tier: 'standard' | 'pro' | 'ultra') => {
    if (tier === 'ultra' && aiSettings.training_ultra === false) {
      setError('Ultra 档位当前为待解锁状态，请在管理端 AI 开关中开启。');
      return;
    }
    setTierOverride(tier);
    setAiConfirmMode(null);
    void onGenerateDayPlan(tier);
  };

  const toggleWeekFocusArea = (area: string) => {
    setPlanConfirmForm((prev) => ({
      ...prev,
      weekFocusAreas: prev.weekFocusAreas.includes(area)
        ? prev.weekFocusAreas.filter((g) => g !== area)
        : [...prev.weekFocusAreas, area],
    }));
  };

  const togglePriorityGoal = (goal: string) => {
    setPlanConfirmForm((prev) => ({
      ...prev,
      priorityGoals: prev.priorityGoals.includes(goal)
        ? prev.priorityGoals.filter((g) => g !== goal)
        : [...prev.priorityGoals, goal],
    }));
  };

  const toggleDiscomfortArea = (area: string) => {
    setPlanConfirmForm((prev) => {
      if (area === '无不适') {
        return { ...prev, discomfortAreas: ['无不适'] };
      }
      const base = prev.discomfortAreas.filter((item) => item !== '无不适');
      const nextList = base.includes(area) ? base.filter((item) => item !== area) : [...base, area];
      return { ...prev, discomfortAreas: nextList.length ? nextList : ['无不适'] };
    });
  };

  const buildAiConfirmPayload = () => ({
    clientNeeds: planConfirmForm.weekNote.trim() || planConfirmForm.clientNeeds.trim(),
    priorityGoals: planConfirmForm.priorityGoals.length ? planConfirmForm.priorityGoals : planConfirmForm.weekFocusAreas,
    weeklyFrequency: planConfirmForm.weeklyFrequency,
    coachAnalysis: [
      planConfirmForm.coachAnalysis.trim(),
      planConfirmForm.weekDirection ? `周训练方向：${planConfirmForm.weekDirection}` : '',
      planConfirmForm.sessionGoal ? `单次目标导向：${planConfirmForm.sessionGoal}` : '',
      planConfirmForm.preSessionNote.trim(),
    ]
      .filter(Boolean)
      .join('；'),
    weekDirection: planConfirmForm.weekDirection,
    weekFocusAreas: planConfirmForm.weekFocusAreas,
    weekNote: planConfirmForm.weekNote.trim(),
    preSessionData: {
      recoveryStatus: planConfirmForm.recoveryStatus,
      todayStatus: planConfirmForm.todayStatus,
      discomfortAreas: planConfirmForm.discomfortAreas,
      sessionGoal: planConfirmForm.sessionGoal,
      coachNote: planConfirmForm.preSessionNote.trim(),
    },
  });

  const handleConfirmGenerate = () => {
    if (aiConfirmMode === 'full') {
      setAiConfirmMode(null);
      void onGenerateFullPlan();
      return;
    }
    if (aiConfirmMode === 'week') {
      setAiConfirmMode(null);
      void onGenerateWeekPlan();
      return;
    }
    if (aiConfirmMode === 'day') {
      handleGenerateDayWithTier(planConfirmForm.selectedTier);
    }
  };

  const deleteWeekById = (weekId: string) => {
    if (!client || !selectedBlock) return;
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id
          ? b
          : { ...b, training_weeks: (b.training_weeks || []).filter(w => w.id !== weekId) },
      ),
    };
    persistClient(next);

    if (selectedWeekId === weekId) {
      const updatedBlock = (next.blocks || []).find(b => b.id === selectedBlock.id);
      const wk = updatedBlock?.training_weeks?.[0];
      setSelectedWeekId(wk?.id || null);
      setSelectedDayId(wk?.days?.[0]?.id || null);
    }
  };

  const deleteDayById = (dayId: string) => {
    if (!client || !selectedBlock || !selectedWeek) return;
    const currentDays = selectedWeek.days || [];
    const dayIndex = currentDays.findIndex(d => d.id === dayId);
    if (dayIndex < 0) return;

    const fallbackDayId =
      currentDays[dayIndex - 1]?.id ||
      currentDays[dayIndex + 1]?.id ||
      null;

    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id
          ? b
          : {
              ...b,
              training_weeks: (b.training_weeks || []).map(w =>
                w.id !== selectedWeek.id
                  ? w
                  : {
                      ...w,
                      days: (w.days || []).filter(d => d.id !== dayId),
                    },
              ),
            },
      ),
    };
    persistClient(next);

    if (selectedDayId === dayId) {
      setSelectedDayId(fallbackDayId);
    }
  };

  const renameBlockById = (blockId: string) => {
    if (!client) return;
    const current = (client.blocks || []).find(b => b.id === blockId);
    const nextTitle = window.prompt('修改 Block 名称', current?.title || '');
    if (!nextTitle || !nextTitle.trim()) return;
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b => (b.id === blockId ? { ...b, title: nextTitle.trim() } : b)),
    };
    persistClient(next);
  };

  const editWeekById = (weekId: string) => {
    if (!client || !selectedBlock) return;
    const current = (selectedBlock.training_weeks || []).find(w => w.id === weekId) as any;
    const theme = window.prompt('修改 Week 介绍内容', current?.week_theme || '');
    if (theme == null) return;
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id
          ? b
          : {
              ...b,
              training_weeks: (b.training_weeks || []).map(w =>
                w.id === weekId ? ({ ...(w as any), week_theme: theme.trim() } as any) : w,
              ),
            },
      ),
    };
    persistClient(next);
  };

  const editDayById = (dayId: string) => {
    if (!client || !selectedBlock || !selectedWeek) return;
    const current = (selectedWeek.days || []).find(d => d.id === dayId);
    if (!current) return;
    const nextName = window.prompt('修改单次训练标题', current.name || '');
    if (nextName == null) return;
    const nextFocus = window.prompt('修改训练重点', current.focus || '');
    if (nextFocus == null) return;
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id
          ? b
          : {
              ...b,
              training_weeks: (b.training_weeks || []).map(w =>
                w.id !== selectedWeek.id
                  ? w
                  : {
                      ...w,
                      days: (w.days || []).map(d =>
                        d.id === dayId ? { ...d, name: nextName.trim(), focus: nextFocus.trim() } : d,
                      ),
                    },
              ),
            },
      ),
    };
    persistClient(next);
  };

  const cancelLongPress = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const startLongPress = (
    e: ReactMouseEvent<HTMLElement> | ReactTouchEvent<HTMLElement>,
    payload: Omit<LongPressDeleteMenu, 'x' | 'y'>,
  ) => {
    cancelLongPress();
    const touch = 'touches' in e ? e.touches[0] : null;
    const x = touch?.clientX ?? ('clientX' in e ? e.clientX : 0);
    const y = touch?.clientY ?? ('clientY' in e ? e.clientY : 0);
    pressTimerRef.current = window.setTimeout(() => {
      setDeleteMenu({ ...payload, x, y });
      pressTimerRef.current = null;
    }, 520);
  };

  const applyDeleteFromMenu = () => {
    if (!deleteMenu) return;
    if (deleteMenu.type === 'block' && deleteMenu.blockId) deleteBlockById(deleteMenu.blockId);
    if (deleteMenu.type === 'week' && deleteMenu.weekId) deleteWeekById(deleteMenu.weekId);
    if (deleteMenu.type === 'day' && deleteMenu.dayId) deleteDayById(deleteMenu.dayId);
    setDeleteMenu(null);
  };

  useEffect(() => {
    if (!deleteMenu) return;
    const onPointerDown = (ev: PointerEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(ev.target as Node)) return;
      setDeleteMenu(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [deleteMenu]);

  useEffect(() => () => cancelLongPress(), []);

  // ── 新建 Block ────────────────────────────────────────────────
  const addBlock = () => {
    if (!client) return;
    const num = (client.blocks || []).length + 1;
    const days: TrainingDay[] = ['周一', '周三', '周五'].map(day => ({
      id: genId('day'), day, name: '', focus: '', modules: [],
    }));
    const week1: TrainingWeek = { id: genId('week'), week_num: 1, days };
    const block: Block = { id: genId('block'), title: `Block ${num}`, training_weeks: [week1] };
    const next = { ...client, blocks: [...(client.blocks || []), block] };
    persistClient(next);
    setSelectedBlockId(block.id);
    setSelectedWeekId(week1.id);
    setSelectedDayId(days[0].id);
  };

  // ── 新建 Week ─────────────────────────────────────────────────
  const addWeek = () => {
    if (!client || !selectedBlock) return;
    const num = (selectedBlock.training_weeks || []).length + 1;
    const days: TrainingDay[] = ['周一', '周三', '周五'].map(day => ({
      id: genId('day'), day, name: '', focus: '', modules: [],
    }));
    const week: TrainingWeek = { id: genId('week'), week_num: num, days };
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id ? b : {
          ...b, training_weeks: [...(b.training_weeks || []), week],
        }
      ),
    };
    persistClient(next);
    setSelectedWeekId(week.id);
    setSelectedDayId(days[0].id);
  };

  // ── 新建训练日 ────────────────────────────────────────────────
  const addDay = (dayLabel: string) => {
    if (!client || !selectedBlock || !selectedWeek) return;
    const used = new Set((selectedWeek.days || []).map(d => d.day));
    if (used.has(dayLabel)) {
      window.alert(`${dayLabel} 已存在，不能重复添加`);
      return;
    }
    const day: TrainingDay = { id: genId('day'), day: dayLabel, name: '', focus: '', modules: [] };
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map(b =>
        b.id !== selectedBlock.id ? b : {
          ...b,
          training_weeks: (b.training_weeks || []).map(w =>
            w.id !== selectedWeek.id ? w : { ...w, days: [...(w.days || []), day] }
          ),
        }
      ),
    };
    persistClient(next);
    setSelectedDayId(day.id);
    setDayPickerOpen(false);
  };

  // ── AI 生成今日计划 ───────────────────────────────────────────
  const onGenerateDayPlan = async (forcedTier?: 'standard' | 'pro' | 'ultra') => {
    if (!client || !selectedDay || !selectedWeek || !selectedBlock) return;
    const clientIdentifier = String((client as any).roadCode || client.id || 'unknown');
    setLoadingDay(true);
    setError(null);
    try {
      const json = await fetchJsonOrThrow(apiUrl('/api/session-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientIdentifier,
          clientName: client.name,
          gender: client.gender,
          age: client.age,
          height: client.height,
          weight: client.weight,
          surveyData: (client as any).survey_data,
          weeklyData: client.weeklyData ?? (client as any).weekly_data,
          dayName: selectedDay.day,
          dayFocus: selectedDay.focus || selectedDay.name,
          ...buildAiConfirmPayload(),
          sessionTier: forcedTier || (tierOverride as any) || client.tier || 'standard',
          lastSessionRpe: (client.sessions || []).slice(-1)[0]?.rpe || undefined,
          blockTitle: selectedBlock.title,
          weekLabel: `Week ${selectedWeek.week_num}`,
          blockIndex: Math.max(0, (client.blocks || []).findIndex(b => b.id === selectedBlock.id)),
        }),
      });

      // 注入 id 和 weight 字段
      const modules: PlanModule[] = (json.modules || []).map((m: any) => ({
        ...m,
        id: genId('mod'),
        exercises: (m.exercises || []).map((ex: any) => ({
          ...ex,
          id: genId('ex'),
          weight: ex.weight || '',
        })),
      }));

      const next: Client = {
        ...client,
        blocks: (client.blocks || []).map(b =>
          b.id !== selectedBlock.id ? b : {
            ...b,
            training_weeks: (b.training_weeks || []).map(w =>
              w.id !== selectedWeek.id ? w : {
                ...w,
                days: (w.days || []).map(d =>
                  d.id !== selectedDay.id ? d : {
                    ...d,
                    name: json.session_name || d.name,
                    session_name: json.session_name,
                    modules,
                  }
                ),
              }
            ),
          }
        ),
      };
      persistClient(next);
    } catch (e: any) {
      // 如果是数据库保存错误，仍然显示AI生成的计划
      const errorMessage = e?.message || String(e);
      console.error('[AI] Error saving plan to database:', errorMessage);
      
      // 尝试从错误中提取AI生成的数据
      if (errorMessage.includes('AI generation failed')) {
        setError('AI生成失败: ' + errorMessage);
      } else {
        // 数据库保存失败，但AI生成成功
        setError('计划已生成，但保存到数据库失败。计划已显示在界面上，请手动保存。');
        // 不阻止计划显示，让用户看到AI生成的内容
      }
    } finally {
      setLoadingDay(false);
    }
  };

  // ── AI 生成周计划 ─────────────────────────────────────────────
  const onGenerateWeekPlan = async () => {
    if (!client || !selectedWeek || !selectedBlock) return;
    const clientIdentifier = String((client as any).roadCode || client.id || 'unknown');
    setLoadingWeek(true);
    setError(null);
    try {
      let outlineByDayKey: Record<string, { day_focus: string; session_name: string }> = {};
      try {
        const outline = await fetchJsonOrThrow(apiUrl('/api/week-plan'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientIdentifier,
            clientName: client.name,
            gender: client.gender,
            age: client.age,
            height: client.height,
            weight: client.weight,
            surveyData: (client as any).survey_data,
            weeklyData: client.weeklyData ?? (client as any).weekly_data,
            ...buildAiConfirmPayload(),
            sessionTier: tierOverride || client.tier || 'standard',
            blockTitle: selectedBlock.title,
            weekLabel: `Week ${selectedWeek.week_num}`,
            weeksTotal: (client as any).weeks_total ?? (client as any).weeksTotal ?? (client as any).weeks,
            blockGoal: (selectedBlock as any).goal,
            coachRules: (client as any).coachRules,
            intensityPhase: (selectedBlock as any).intensity_phase,
            days: (selectedWeek.days || []).map((d: any, i: number) => ({
              dayKey: d.day || `day${i + 1}`,
              dayName: d.day,
              dayFocus: d.focus || d.name,
            })),
          }),
        });

        const list = (outline as any)?.days || [];
        outlineByDayKey = (Array.isArray(list) ? list : []).reduce((acc: any, d: any) => {
          const k = String(d?.day_key || d?.dayKey || d?.day || d?.day_of_week || '');
          if (k) acc[k] = { day_focus: String(d?.day_focus || ''), session_name: String(d?.session_name || '') };
          return acc;
        }, {});
      } catch {
        outlineByDayKey = {};
      }

      const dayPlans: Record<string, any> = {};
      for (let di = 0; di < (selectedWeek.days || []).length; di++) {
        const d = selectedWeek.days[di];
        const outline = outlineByDayKey[String(d.day)] || outlineByDayKey[`day${di + 1}`];
        const json = await fetchJsonOrThrow(apiUrl('/api/session-plan'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientIdentifier,
            clientName: client.name,
            gender: client.gender,
            age: client.age,
            height: client.height,
            weight: client.weight,
            surveyData: (client as any).survey_data,
            weeklyData: client.weeklyData ?? (client as any).weekly_data,
            ...buildAiConfirmPayload(),
            dayName: d.day,
            dayFocus: outline?.day_focus || d.focus || d.name,
            sessionTier: tierOverride || client.tier || 'standard',
            lastSessionRpe: (client.sessions || []).slice(-1)[0]?.rpe || undefined,
            blockTitle: selectedBlock.title,
            weekLabel: `Week ${selectedWeek.week_num}`,
            blockIndex: Math.max(0, (client.blocks || []).findIndex(b => b.id === selectedBlock.id)),
          }),
        });
        dayPlans[d.day] = json;
        dayPlans[`day${di + 1}`] = json;
      }

      const next: Client = {
        ...client,
        blocks: (client.blocks || []).map(b =>
          b.id !== selectedBlock.id ? b : {
            ...b,
            training_weeks: (b.training_weeks || []).map(w =>
              w.id !== selectedWeek.id ? w : {
                ...w,
                days: (w.days || []).map((d, di) => {
                  const plan = dayPlans[d.day] || dayPlans[`day${di + 1}`] || null;
                  if (!plan) return d;
                  return {
                    ...d,
                    name: plan.session_name || outlineByDayKey[String(d.day)]?.session_name || d.name,
                    focus: outlineByDayKey[String(d.day)]?.day_focus || d.focus,
                    modules: (plan.modules || []).map((m: any) => ({
                      ...m, id: genId('mod'),
                      exercises: (m.exercises || []).map((ex: any) => ({ ...ex, id: genId('ex'), weight: '' })),
                    })),
                  };
                }),
              }
            ),
          }
        ),
      };
      persistClient(next);
    } catch (e: any) {
      setError('周计划生成失败：' + (e?.message || String(e)));
    } finally {
      setLoadingWeek(false);
    }
  };

  // ── AI 生成完整规划 ───────────────────────────────────────────
  const buildBlocksByTier = (allWeeks: TrainingWeek[], tier: string) => {
    const weeks = Array.isArray(allWeeks) ? allWeeks : [];
    if (weeks.length === 0) return [] as Block[];

    const desiredCount = tier === 'ultra' ? 4 : tier === 'pro' ? 3 : 2;
    const blockCount = Math.max(1, Math.min(desiredCount, weeks.length));

    const titlePool =
      tier === 'ultra'
        ? ['Block 1 · Neural Base 神经基建', 'Block 2 · Power Flow 动力爆发', 'Block 3 · Density Peak 密度峰值', 'Block 4 · Control Deload 控制回收']
        : tier === 'pro'
          ? ['Block 1 · Pattern Build 模式建立', 'Block 2 · Chain Upgrade 动力链进阶', 'Block 3 · Performance Sync 功能整合']
          : ['Block 1 · Foundation 基础激活', 'Block 2 · Strength Flow 力量推进'];

    const base = Math.floor(weeks.length / blockCount);
    let remainder = weeks.length % blockCount;
    let cursor = 0;

    return Array.from({ length: blockCount }).map((_, bi) => {
      const size = base + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      const segment = weeks.slice(cursor, cursor + size);
      cursor += size;

      const normalizedWeeks: TrainingWeek[] = segment.map((w, wi) => ({
        ...w,
        id: genId('week'),
        week_num: wi + 1,
      }));

      return {
        id: genId('block'),
        title: titlePool[bi] || `Block ${bi + 1}`,
        training_weeks: normalizedWeeks,
      };
    });
  };

  const onGenerateFullPlan = async () => {
    if (!client) return;
    const clientIdentifier = String((client as any).roadCode || client.id || 'unknown');
    setLoadingFull(true);
    setError(null);
    try {
      const weeksTotal = (client as any).weeks_total ?? (client as any).weeksTotal ?? (client as any).weeks ?? 12;
      const activeTier = tierOverride || client.tier || 'standard';

      let blocks: Block[] | null = null;
      try {
        const full = await fetchJsonOrThrow(apiUrl('/api/full-plan'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientIdentifier,
            clientName: client.name,
            gender: client.gender,
            age: client.age,
            height: client.height,
            weight: client.weight,
            surveyData: (client as any).survey_data,
            weeklyData: client.weeklyData ?? (client as any).weekly_data,
            ...buildAiConfirmPayload(),
            sessionTier: activeTier,
            blockTitle: (client.blocks || [])[0]?.title || 'Block 1',
            blockGoal: (client.blocks || [])[0] ? ((client.blocks || [])[0] as any)?.goal : undefined,
            coachRules: (client as any).coachRules,
            weeksTotal,
          }),
        });

        const weeks: TrainingWeek[] = (Array.isArray((full as any)?.weeks) ? (full as any).weeks : []).map((w: any, wi: number) => ({
          id: genId('week'),
          week_num: Number(w?.week_num || wi + 1),
          days: (Array.isArray(w?.days) ? w.days : []).map((d: any, di: number) => ({
            id: genId('day'),
            day: String(d?.day_key || d?.day || `day${di + 1}`),
            name: String(d?.session_name || d?.name || ''),
            focus: String(d?.day_focus || d?.focus || ''),
            modules: [],
          })),
        }));

        blocks = buildBlocksByTier(weeks, String(activeTier));
      } catch {
        blocks = null;
      }

      if (!blocks) {
        const daysTemplate: Array<Pick<TrainingDay, 'day' | 'name' | 'focus'>> = [
          { day: '周一', name: '下肢力量', focus: '下肢力量' },
          { day: '周三', name: '上肢推拉', focus: '上肢推拉' },
          { day: '周五', name: '全身整合', focus: '全身整合' },
        ];
        const training_weeks: TrainingWeek[] = Array.from({ length: Number(weeksTotal) || 12 }).map((_, wi) => ({
          id: genId('week'),
          week_num: wi + 1,
          days: daysTemplate.map((d) => ({
            id: genId('day'),
            day: d.day,
            name: d.name,
            focus: d.focus,
            modules: [],
          })),
        }));
        blocks = buildBlocksByTier(training_weeks, String(activeTier));
      }

      const next: Client = { ...client, blocks };
      persistClient(next);
      if (blocks.length > 0) {
        setSelectedBlockId(blocks[0].id);
        const wk = blocks[0].training_weeks?.[0];
        setSelectedWeekId(wk?.id || null);
        setSelectedDayId(wk?.days?.[0]?.id || null);
      }
    } catch (e: any) {
      setError('完整规划生成失败：' + (e?.message || String(e)));
    } finally {
      setLoadingFull(false);
    }
  };

  const anyLoading = loadingDay || loadingWeek || loadingFull;
  const draftVersion = Number(client?.plan_draft_version || 1);
  const publishedVersion = Number(client?.plan_published_version || 0);
  const publishedAtText = client?.plan_published_at
    ? new Date(client.plan_published_at).toLocaleString('zh-CN', { hour12: false })
    : '未发布';

  return (
    <div
      className="planning-premium"
      style={{
        maxWidth: 1120,
        minHeight: 760,
        margin: '0 auto',
        padding: 0,
        borderRadius: 0,
        background: 'transparent',
        border: 'none',
        backdropFilter: 'none',
        WebkitBackdropFilter: 'none',
        boxShadow: 'none',
      }}
    >
      <div className="phase-strip">
        <div className="phase-top-row">
          <div>
            <CardTitle>大周期阶段管理 / Macrocycle Phases</CardTitle>
            <CardDescription>Design and oversee the long-term athletic development path.</CardDescription>
          </div>
          <Button
            type="button"
            className="plan-cta plan-cta-primary"
            onClick={() => openAiConfirm('full')}
            disabled={anyLoading}
            title="AI 生成完整 Block / Week / Day 框架"
            style={{ marginLeft: 'auto' }}
          >
            {loadingFull ? (
              <><span className="spin" style={{ width: 14, height: 14, marginRight: 6 }} />生成中...</>
            ) : '✨ AI block'}
          </Button>
        </div>
        {error && (
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--r)', padding: '6px 10px', background: 'var(--r2)', borderRadius: 6 }}>
            {error}
            <button type="button" onClick={() => setError(null)} style={{ marginLeft: 8, fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none', color: 'var(--r)' }}>✕</button>
          </div>
        )}

        <div className="phase-strip-head">
          <div className="phase-strip-title">MACROCYCLE · 周期阶段</div>
        </div>
        <div className="phase-grid">
          {(client?.blocks || []).map((b, bi) => (
            <div
              key={b.id}
              className={cn('phase-card', selectedBlockId === b.id && 'on')}
              onClick={() => {
                setSelectedBlockId(b.id);
                const wk = b.training_weeks?.[0];
                setSelectedWeekId(wk?.id || null);
                setSelectedDayId(wk?.days?.[0]?.id || null);
              }}
              onDoubleClick={(e) => { e.stopPropagation(); renameBlockById(b.id); }}
              onMouseDown={(e) => startLongPress(e, { type: 'block', blockId: b.id })}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}
              onTouchStart={(e) => startLongPress(e, { type: 'block', blockId: b.id })}
              onTouchEnd={cancelLongPress}
              onContextMenu={(e) => e.preventDefault()}
              role="button"
              tabIndex={0}
            >
              <div className="phase-mini">BLOCK {bi + 1}</div>
              <div className="phase-name">{b.title}</div>
              <div className="phase-meta">{(b.training_weeks || []).length} Weeks</div>
            </div>
          ))}
          
          {(client?.blocks || []).length === 0 && (
            <div style={{ padding: 12, fontSize: 12, color: 'var(--s400)' }}>暂无 Block</div>
          )}
          
          <div className="phase-add-card" onClick={addBlock} role="button" tabIndex={0}>
            <div className="phase-add-plus">＋</div>
            <div className="phase-add-text">添加下个阶段 Add Next Block</div>
          </div>
        </div>
      </div>

      <div className="plan-main" style={{ marginTop: 12 }}>
        <div className="plan-sidebar">
          <div className="plan-panel-head">
            <div className="plan-panel-title">WEEKLY FOCUS</div>
            <Button
              type="button"
              variant="outline"
              className="plan-cta plan-cta-secondary"
              onClick={() => openAiConfirm('week')}
              disabled={anyLoading || !selectedWeek}
              title="AI 生成当前周所有训练日名称和重点"
              style={{ width: 168, minWidth: 168 }}
            >
              {loadingWeek ? (
                <><span className="spin" style={{ width: 14, height: 14, marginRight: 6 }} />生成中...</>
              ) : '✨ AI 生成周规划'}
            </Button>
          </div>

          <div className="week-picker-wrap">
            <div className="week-picker-head">
              <button
                type="button"
                className="week-picker-toggle"
                onClick={() => setWeekPickerOpen(v => !v)}
              >
                <span>{selectedWeek ? `Week ${selectedWeek.week_num} · 当前选择` : '选择 Week'}</span>
                <span className={cn('week-picker-chevron', weekPickerOpen && 'on')} aria-hidden="true">⌄</span>
              </button>
              <button type="button" className="phase-link week-add-btn mini-ctrl-btn" onClick={addWeek}>+ 新建 Week</button>
            </div>
            {weekPickerOpen && (
              <div className="week-picker-panel">
                {(selectedBlock?.training_weeks || []).length === 0 ? (
                  <div style={{ padding: 12, fontSize: 12, color: 'var(--s400)', textAlign: 'center' }}>
                    暂无 Week，点击上方"+ 新建 Week"创建
                  </div>
                ) : (
                  (selectedBlock?.training_weeks || []).map((w) => (
                  <button
                    type="button"
                    key={w.id}
                    className={cn('week-picker-item', selectedWeekId === w.id && 'on')}
                    onClick={() => {
                      setSelectedWeekId(w.id);
                      setSelectedDayId(w.days?.[0]?.id || null);
                      setWeekPickerOpen(false);
                    }}
                    onDoubleClick={(e) => { e.stopPropagation(); editWeekById(w.id); }}
                    onMouseDown={(e) => startLongPress(e, { type: 'week', weekId: w.id })}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={(e) => startLongPress(e, { type: 'week', weekId: w.id })}
                    onTouchEnd={cancelLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <div className="wt">Week {w.week_num}</div>
                    <div style={{ marginTop: 4, fontSize: 12 }}>{(w.days || []).map(d => d.day).join(' · ')}</div>
                  </button>
                ))
                )}
              </div>
            )}
          </div>

          {!selectedBlock && <div style={{ fontSize: 12, color: 'var(--s400)', padding: 10 }}>先选择 Block</div>}

          {selectedWeek && (
            <>
              <div className="week-intro-card">
                <div className="week-intro-top">
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--p)', letterSpacing: '.08em' }}>WEEK {selectedWeek.week_num} / 第四周</div>
                  <button type="button" onClick={() => setDayPickerOpen(v => !v)} className="phase-link mini-ctrl-btn">+ 新建 Day</button>
                </div>

                {dayPickerOpen && (
                  <div className="week-day-picker-panel">
                    {WEEKDAY_OPTIONS.map((dayLabel) => {
                      const occupied = (selectedWeek.days || []).some(d => d.day === dayLabel);
                      return (
                        <button
                          key={dayLabel}
                          type="button"
                          className={cn('week-day-option', occupied && 'occupied')}
                          disabled={occupied}
                          onClick={() => addDay(dayLabel)}
                        >
                          {dayLabel}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="week-intro-row">
                  <div className="week-intro-main">
                    <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--s900)', marginTop: 4 }}>本周重点介绍</div>
                    <div style={{ fontSize: 11, color: 'var(--s500)', fontWeight: 700, letterSpacing: '.08em', marginTop: 4 }}>WEEKLY FOCUS OVERVIEW</div>
                    <div style={{ fontSize: 13, color: 'var(--s700)', marginTop: 10, lineHeight: 1.65 }}>
                      {(selectedWeek as any)?.week_theme || '本周重点聚焦动作质量与强度推进，保持恢复节奏。'}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                      <span className="badge bp">VOLUME: MODERATE</span>
                      <span className="badge bp">INTENSITY: HIGH</span>
                    </div>
                  </div>

                  <div className="week-timeline week-timeline-side">
                    {(() => {
                      const selectedDayIndex = Math.max(0, (selectedWeek.days || []).findIndex(d => d.id === selectedDayId));
                      return (selectedWeek.days || []).map((d, idx) => {
                        const state = selectedDayId === d.id ? 'today' : idx < selectedDayIndex ? 'done' : 'idle';
                        return (
                          <div
                            key={d.id}
                            className={cn('week-timeline-item', state === 'today' && 'on', state === 'done' && 'done')}
                            onClick={() => setSelectedDayId(d.id)}
                            onMouseDown={(e) => startLongPress(e, { type: 'day', dayId: d.id })}
                            onMouseUp={cancelLongPress}
                            onMouseLeave={cancelLongPress}
                            onTouchStart={(e) => startLongPress(e, { type: 'day', dayId: d.id })}
                            onTouchEnd={cancelLongPress}
                            onContextMenu={(e) => e.preventDefault()}
                            role="button"
                            tabIndex={0}
                          >
                            <div className={cn('week-timeline-dot', state === 'today' && 'on', state === 'done' && 'done')} />
                            <div style={{ minWidth: 0 }}>
                              <div className="week-timeline-title">{d.name || `${d.day} 训练`}</div>
                              <div className="week-timeline-sub">Focus: {d.focus || '待生成训练重点'}</div>
                            </div>
                            <div className="week-status-wrap">
                              {state !== 'idle' && (
                                <span className={cn('week-status', state)}>{state === 'today' ? 'TODAY' : 'COMPLETED'}</span>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>

        <div className="plan-workbench">
          <div className="plan-panel-head" style={{ marginBottom: 10 }}>
            <div>
              <div className="plan-panel-title">编辑训练内容 Session Details</div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--s500)', letterSpacing: '.03em' }}>
                草稿 v{draftVersion} · 已发布 v{publishedVersion} · 发布时间 {publishedAtText}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  className="h-10 rounded-md border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
                  onClick={savePlanNow}
                  disabled={!client}
                >
                  保存计划
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-md border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
                  onClick={publishPlanToStudent}
                  disabled={!client || !(client.blocks || []).length}
                >
                  发布到学员端
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  onClick={startTrainingNow}
                  disabled={!client || anyLoading}
                >
                  开始训练
                </Button>
                <Button
                  type="button"
                  className="plan-cta plan-cta-primary"
                  onClick={openDayTierPicker}
                  disabled={anyLoading || !selectedDay}
                  title="AI 生成当前训练日计划"
                >
                  {loadingDay ? (
                    <><span className="spin" style={{ width: 14, height: 14, marginRight: 6 }} />生成中...</>
                  ) : '⚡ AI 生成单次训练'}
                </Button>
              </div>
            </div>
          </div>

          {!selectedWeek ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--s400)' }}>先选择 Week</div>
          ) : !selectedDay ? (
            <div style={{ padding: 10, fontSize: 12, color: 'var(--s400)' }}>先选择训练日</div>
          ) : (
            <>
              {(() => {
                const d = selectedDay;
                const hasPlan = Array.isArray((d as any).modules) && (d as any).modules.length > 0;
                return (
                  <div
                    className={cn('day-card', 'sel-day', 'session-hero', hasPlan && 'done-day')}
                    onDoubleClick={() => editDayById(d.id)}
                    onMouseDown={(e) => startLongPress(e, { type: 'day', dayId: d.id })}
                    onMouseUp={cancelLongPress}
                    onMouseLeave={cancelLongPress}
                    onTouchStart={(e) => startLongPress(e, { type: 'day', dayId: d.id })}
                    onTouchEnd={cancelLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: 'rgba(24,31,45,.92)', whiteSpace: 'nowrap' }}>{d.day}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: 'rgba(24,31,45,.92)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {d.name || '单次训练 Session Details'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={addModuleToSelectedDay}
                        style={{
                          height: 24,
                          padding: '0 10px',
                          borderRadius: 7,
                          border: '1px solid var(--s200)',
                          background: '#fff',
                          fontSize: 11,
                          color: 'var(--s600)',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        + 添加模块
                      </button>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'rgba(82,92,122,.82)' }}>{(d as any).name_en || (d as any).focus_en || 'Session Focus'}</div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span className="session-chip">TARGET: HYPERTROPHY</span>
                      <span className="session-chip">RPE TRACKING</span>
                    </div>
                  </div>
                );
              })()}
              <Separator className="my-3" />
              <DayPlanEditor day={selectedDay} onSave={saveDayModules} />
            </>
          )}
        </div>
      </div>
      {deleteMenu && (
        <div
          ref={menuRef}
          className="press-delete-menu"
          style={{ left: deleteMenu.x, top: deleteMenu.y }}
        >
          <button type="button" className="press-delete-item danger" onClick={applyDeleteFromMenu}>
            {deleteMenu.type === 'block' ? '删除 Block' : deleteMenu.type === 'week' ? '删除 Week' : '删除单次训练'}
          </button>
          <button type="button" className="press-delete-item" onClick={() => setDeleteMenu(null)}>
            取消
          </button>
        </div>
      )}
      {aiConfirmMode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(19,24,40,.34)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setAiConfirmMode(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              maxHeight: '78vh',
              borderRadius: 16,
              border: '1px solid rgba(202,208,224,.9)',
              background: 'linear-gradient(165deg, #f5f6fb, #f0f2f8)',
              boxShadow: '0 18px 38px rgba(31,41,74,.22)',
              padding: 14,
              overflowY: 'auto',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#202737', marginBottom: 4 }}>
              {aiConfirmMode === 'full'
                ? '确认 AI Block 生成信息'
                : aiConfirmMode === 'day'
                  ? '课前状态评估'
                  : '周规划 — 信息收集'}
            </div>
            <div style={{ fontSize: 12, color: '#7B8498', marginBottom: 10 }}>
              {aiConfirmMode === 'full'
                ? '补充需求后可直接生成完整规划'
                : aiConfirmMode === 'day'
                ? `${selectedDay?.day || '周一'} · ${planConfirmForm.selectedTier === 'ultra' ? 'Ultra 高级训练' : planConfirmForm.selectedTier === 'pro' ? 'Pro 进阶训练' : 'Standard 基础训练'}`
                : `${selectedBlock?.title || 'Block'} · Week ${selectedWeek?.week_num || 1}`}
            </div>

            {aiConfirmMode === 'full' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>1. 客户具体需求</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>客户的主诉、期望目标、时间要求等</div>
                  <textarea
                    value={planConfirmForm.clientNeeds}
                    onChange={(e) => setPlanConfirmForm((prev) => ({ ...prev, clientNeeds: e.target.value }))}
                    placeholder="例：客户希望 3 个月内减脂 5kg，同时改善圆肩驼背，每周可训练 3 次..."
                    style={{
                      marginTop: 8,
                      width: '100%',
                      minHeight: 64,
                      borderRadius: 12,
                      border: '2px solid #B6B9FF',
                      background: '#FFFFFF',
                      padding: '9px 10px',
                      fontSize: 13,
                      color: '#25304A',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>2. 优先目标</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>可多选，按重要性排列</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {PLAN_PRIORITY_OPTIONS.map((goal) => {
                      const on = planConfirmForm.priorityGoals.includes(goal);
                      return (
                        <button
                          key={goal}
                          type="button"
                          onClick={() => togglePriorityGoal(goal)}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '7px 11px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#202737',
                            cursor: 'pointer',
                          }}
                        >
                          {goal}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>3. 每周训练频率</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {PLAN_FREQUENCY_OPTIONS.map((opt) => {
                      const on = planConfirmForm.weeklyFrequency === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, weeklyFrequency: opt.value }))}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '8px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#202737' }}>{opt.value}次/周</div>
                          <div style={{ fontSize: 11, marginTop: 2, color: '#7B8498' }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>4. 教练分析与规划思路</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>你的专业判断：训练分期思路、重点关注、风险评估等</div>
                  <textarea
                    value={planConfirmForm.coachAnalysis}
                    onChange={(e) => setPlanConfirmForm((prev) => ({ ...prev, coachAnalysis: e.target.value }))}
                    placeholder="例：客户核心力量薄弱，先安排 4 周基础稳定期，再进入力量发展期。注意膝关节旧伤，避免大重量深蹲..."
                    style={{
                      marginTop: 8,
                      width: '100%',
                      minHeight: 64,
                      borderRadius: 12,
                      border: '1px solid #D9DCE6',
                      background: '#FFFFFF',
                      padding: '9px 10px',
                      fontSize: 13,
                      color: '#25304A',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            ) : aiConfirmMode === 'week' ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>1. 本周几节课?</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {PLAN_FREQUENCY_OPTIONS.map((opt) => {
                      const on = planConfirmForm.weeklyFrequency === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, weeklyFrequency: opt.value }))}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '8px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#202737' }}>{opt.value} 节</div>
                          <div style={{ fontSize: 11, marginTop: 2, color: '#7B8498' }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>2. 训练大致方向</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {WEEK_DIRECTION_OPTIONS.map((opt) => {
                      const on = planConfirmForm.weekDirection === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, weekDirection: opt.value }))}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '8px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#202737' }}>{opt.label}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: '#7B8498' }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>3. 重点训练部位</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>可多选</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {WEEK_FOCUS_OPTIONS.map((area) => {
                      const on = planConfirmForm.weekFocusAreas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => toggleWeekFocusArea(area)}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '7px 11px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#202737',
                            cursor: 'pointer',
                          }}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>4. 特殊备注（可选）</div>
                  <textarea
                    value={planConfirmForm.weekNote}
                    onChange={(e) => setPlanConfirmForm((prev) => ({ ...prev, weekNote: e.target.value }))}
                    placeholder="例：客户本周膝盖有轻微不适，避免跳跃动作..."
                    style={{
                      marginTop: 8,
                      width: '100%',
                      minHeight: 64,
                      borderRadius: 12,
                      border: '1px solid #D9DCE6',
                      background: '#FFFFFF',
                      padding: '9px 10px',
                      fontSize: 13,
                      color: '#25304A',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>1. 恢复状态</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>上次训练距今多久？身体感觉如何？</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {RECOVERY_OPTIONS.map((opt) => {
                      const on = planConfirmForm.recoveryStatus === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, recoveryStatus: opt.value }))}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '8px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#202737' }}>{opt.label}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: '#7B8498' }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>2. 今日状态</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>精神、睡眠、压力</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {TODAY_STATUS_OPTIONS.map((opt) => {
                      const on = planConfirmForm.todayStatus === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, todayStatus: opt.value }))}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '8px 6px',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#202737' }}>{opt.label}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: '#7B8498' }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>3. 今日身体不适区域</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>可多选</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                    {DISCOMFORT_OPTIONS.map((area) => {
                      const on = planConfirmForm.discomfortAreas.includes(area);
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => toggleDiscomfortArea(area)}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '7px 11px',
                            fontSize: 13,
                            fontWeight: 600,
                            color: '#202737',
                            cursor: 'pointer',
                          }}
                        >
                          {area}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>4. 本节课目标偏向</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {SESSION_GOAL_OPTIONS.map((opt) => {
                      const on = planConfirmForm.sessionGoal === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, sessionGoal: opt.value }))}
                          style={{
                            borderRadius: 12,
                            border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF',
                            padding: '8px 8px',
                            textAlign: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#202737' }}>{opt.label}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: '#7B8498' }}>{opt.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>5. 教练备注（可选）</div>
                  <textarea
                    value={planConfirmForm.preSessionNote}
                    onChange={(e) => setPlanConfirmForm((prev) => ({ ...prev, preSessionNote: e.target.value }))}
                    placeholder="例如：客户昨晚失眠，注意控制强度..."
                    style={{
                      marginTop: 8,
                      width: '100%',
                      minHeight: 64,
                      borderRadius: 12,
                      border: '1px solid #D9DCE6',
                      background: '#FFFFFF',
                      padding: '9px 10px',
                      fontSize: 13,
                      color: '#25304A',
                      outline: 'none',
                    }}
                  />
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>6. 确认课程档位</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {[
                      {
                        key: 'standard' as const,
                        title: 'STANDARD',
                        desc: '基础稳定推进',
                        border: 'rgba(102,186,128,.46)',
                        bg: 'linear-gradient(145deg, rgba(214,246,223,.96), rgba(184,232,200,.9))',
                        color: 'rgba(26,88,49,.94)',
                      },
                      {
                        key: 'pro' as const,
                        title: 'PRO',
                        desc: '进阶强度与密度',
                        border: 'rgba(154,127,232,.46)',
                        bg: 'linear-gradient(145deg, rgba(226,216,255,.96), rgba(204,188,249,.9))',
                        color: 'rgba(74,51,146,.94)',
                      },
                      {
                        key: 'ultra' as const,
                        title: 'ULTRA',
                        desc: aiSettings.training_ultra === false ? '待解锁（管理端开启）' : '高阶爆发与挑战',
                        border: 'rgba(236,163,89,.5)',
                        bg: aiSettings.training_ultra === false
                          ? 'linear-gradient(145deg, rgba(239,239,242,.94), rgba(220,223,232,.9))'
                          : 'linear-gradient(145deg, rgba(255,226,193,.96), rgba(248,199,142,.9))',
                        color: aiSettings.training_ultra === false ? 'rgba(96,103,123,.9)' : 'rgba(136,78,24,.94)',
                        locked: aiSettings.training_ultra === false,
                      },
                    ].map((tier) => {
                      const active = planConfirmForm.selectedTier === tier.key;
                      const locked = Boolean((tier as any).locked);
                      return (
                        <button
                          key={tier.key}
                          type="button"
                          className={locked ? 'ultra-lock-card is-locked' : 'ultra-lock-card'}
                          disabled={locked}
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, selectedTier: tier.key }))}
                          style={{
                            border: active ? '2px solid rgba(81,98,238,.82)' : `1px solid ${tier.border}`,
                            borderRadius: 10,
                            padding: '8px 8px',
                            textAlign: 'left',
                            background: tier.bg,
                            color: tier.color,
                            cursor: locked ? 'not-allowed' : 'pointer',
                            opacity: locked ? 0.82 : 1,
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          {locked && (
                            <div
                              style={{
                                position: 'absolute',
                                top: 6,
                                right: 6,
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: '.08em',
                                borderRadius: 999,
                                padding: '2px 6px',
                                color: 'rgba(70,79,104,.95)',
                                background: 'rgba(255,255,255,.72)',
                                border: '1px solid rgba(164,173,198,.72)',
                              }}
                            >
                              🔒 LOCKED
                            </div>
                          )}
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
                            {tier.title}
                          </div>
                          <div style={{ fontSize: 10, marginTop: 3, opacity: .84 }}>{tier.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <button
                type="button"
                onClick={handleConfirmGenerate}
                style={{
                  height: 30,
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(120deg, rgba(124,132,244,.92), rgba(112,121,236,.88))',
                  color: '#fff',
                  padding: '0 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                  marginRight: 6,
                }}
              >
                {aiConfirmMode === 'full' ? '生成完整规划' : aiConfirmMode === 'week' ? '生成周训练计划' : '生成单次训练计划'}
              </button>
              <button
                type="button"
                onClick={() => setAiConfirmMode(null)}
                style={{
                  height: 30,
                  borderRadius: 8,
                  border: '1px solid rgba(167,178,211,.58)',
                  background: 'rgba(242,246,255,.86)',
                  color: 'rgba(56,66,96,.88)',
                  padding: '0 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        .planning-premium {
          --panel-bg: rgba(255,255,255,.55);
          --panel-bg-soft: rgba(255,255,255,.5);
          --panel-bg-strong: rgba(255,255,255,.62);
          --panel-border: rgba(216,221,236,.75);
          --panel-border-soft: rgba(216,221,236,.62);
          --panel-shadow: 0 14px 28px rgba(78,88,120,.12);
          -webkit-tap-highlight-color: transparent;
        }

        .planning-premium .ultra-lock-card.is-locked {
          filter: saturate(.7) grayscale(.08);
          box-shadow: inset 0 0 0 1px rgba(145,154,176,.28);
          animation: ultra-lock-pulse 1.8s ease-in-out infinite;
        }

        .planning-premium .ultra-lock-card.is-locked::after {
          content: '';
          position: absolute;
          top: -20%;
          left: -40%;
          width: 46%;
          height: 140%;
          transform: rotate(18deg);
          background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.42), rgba(255,255,255,0));
          animation: ultra-lock-shimmer 2.2s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes ultra-lock-pulse {
          0%,
          100% {
            transform: translateY(0);
            box-shadow: inset 0 0 0 1px rgba(145,154,176,.28), 0 6px 14px rgba(90,99,126,.12);
          }
          50% {
            transform: translateY(-1px);
            box-shadow: inset 0 0 0 1px rgba(145,154,176,.34), 0 10px 18px rgba(90,99,126,.18);
          }
        }

        @keyframes ultra-lock-shimmer {
          0% {
            left: -46%;
            opacity: 0;
          }
          25% {
            opacity: .7;
          }
          60% {
            opacity: .2;
          }
          100% {
            left: 118%;
            opacity: 0;
          }
        }

        .planning-premium .phase-strip {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          border-radius: 22px;
          padding: 16px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--panel-shadow);
        }

        .planning-premium .phase-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .planning-premium .phase-strip-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .planning-premium .phase-strip-title {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: .1em;
          color: var(--s500);
        }

        .planning-premium .phase-grid {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 8px;
          scrollbar-width: thin;
          scrollbar-color: var(--s300) transparent;
        }
        .planning-premium .phase-grid::-webkit-scrollbar {
          height: 6px;
        }
        .planning-premium .phase-grid::-webkit-scrollbar-track {
          background: transparent;
        }
        .planning-premium .phase-grid::-webkit-scrollbar-thumb {
          background: var(--s300);
          border-radius: 3px;
        }
        .planning-premium .phase-grid > * {
          flex: 0 0 auto;
          min-width: 267px;
          max-width: 373px;
        }

        .planning-premium .phase-card {
          border-radius: 18px;
          padding: 16px 16px 14px;
          min-height: 187.5px;
          border: 1px solid rgba(255,255,255,.92);
          background: linear-gradient(160deg, rgba(248,250,255,.9), rgba(232,236,255,.76));
          display: flex;
          flex-direction: column;
          cursor: pointer;
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background .24s ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .planning-premium .phase-card.on {
          border-color: rgba(81, 98, 238, .9);
          box-shadow: 0 16px 30px rgba(72, 88, 221, .32);
          background: radial-gradient(circle at 86% 12%, rgba(138,152,255,.72), transparent 42%), linear-gradient(160deg, rgba(219,228,255,.98), rgba(188,203,248,.94));
        }

        .planning-premium .phase-add-card {
          min-height: 150px;
          border-radius: 18px;
          border: 1.6px dashed var(--panel-border-soft);
          background: var(--panel-bg-soft);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          cursor: pointer;
          transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
        }

        .planning-premium .phase-add-card:hover {
          transform: translateY(-1px);
          border-color: rgba(102, 116, 228, .7);
          box-shadow: 0 10px 24px rgba(102, 116, 228, .18);
        }

        .planning-premium .phase-add-plus {
          width: 34px;
          height: 34px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 700;
          color: #fff;
          background: linear-gradient(160deg, #6e79ff, #5d66ed);
          box-shadow: 0 8px 16px rgba(94, 103, 237, .3);
        }

        .planning-premium .phase-add-text {
          font-size: 13px;
          font-weight: 700;
          color: var(--s700);
          text-align: center;
          padding: 0 8px;
        }

        .planning-premium .phase-mini {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .08em;
          color: var(--s500);
        }

        .planning-premium .phase-name {
          margin-top: 8px;
          font-size: 21px;
          font-weight: 800;
          color: var(--s900);
          line-height: 1.15;
        }

        .planning-premium .phase-meta {
          margin-top: auto;
          padding-top: 12px;
          font-size: 13px;
          color: var(--s600);
        }

        .planning-premium .phase-link {
          font-size: 12px;
          font-weight: 700;
          color: var(--p);
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 4px;
        }

        .planning-premium .plan-main {
          display: grid;
          grid-template-columns: 390px minmax(0, 1fr);
          gap: 12px;
          align-items: stretch;
        }

        .planning-premium .plan-sidebar,
        .planning-premium .plan-workbench {
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          border-radius: 18px;
          padding: 12px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          box-shadow: var(--panel-shadow);
          height: min(640px, calc(100vh - 248px));
          max-height: min(640px, calc(100vh - 248px));
          overflow-y: auto;
        }

        .planning-premium .plan-workbench {
          max-width: 690px;
          width: 100%;
          justify-self: end;
        }

        .planning-premium .plan-sidebar {
          display: flex;
          flex-direction: column;
        }

        .planning-premium .plan-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          flex-wrap: wrap;
        }

        .planning-premium .plan-sidebar .plan-panel-head,
        .planning-premium .plan-workbench .plan-panel-head {
          position: sticky;
          top: 0;
          z-index: 8;
          background: var(--panel-bg-strong);
          padding-bottom: 8px;
          margin-bottom: 8px;
        }

        .planning-premium .plan-sidebar .plan-panel-head {
          background: transparent;
          padding-bottom: 0;
        }

        .planning-premium .plan-panel-title {
          font-size: 18px;
          font-weight: 800;
          color: var(--s900);
          letter-spacing: .01em;
        }

        .planning-premium .week-intro-card {
          margin-top: 10px;
          border-radius: 14px;
          border: 1px solid rgba(182,194,236,.58);
          background: linear-gradient(160deg, rgba(232,238,255,.52), rgba(219,228,251,.42));
          padding: 12px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .planning-premium .week-intro-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .planning-premium .week-day-picker-panel {
          margin-top: 8px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
        }

        .planning-premium .week-day-option {
          height: 28px;
          border-radius: 8px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          font-size: 11px;
          font-weight: 700;
          color: var(--s700);
          cursor: pointer;
        }

        .planning-premium .week-day-option.occupied {
          background: rgba(148, 157, 186, .2);
          border-color: rgba(148, 157, 186, .38);
          color: rgba(90, 98, 124, .65);
          cursor: not-allowed;
        }

        .planning-premium .week-intro-row {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          flex-direction: column;
          margin-top: 4px;
        }

        .planning-premium .week-intro-main {
          min-width: 0;
          width: 100%;
        }

        .planning-premium .week-timeline {
          margin-top: 14px;
          border-left: 2px solid rgba(121, 129, 238, .16);
          padding-left: 12px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .planning-premium .week-timeline-side {
          margin-top: 0;
          width: 100%;
          flex: 1 1 auto;
          min-width: 0;
          max-height: 270px;
          overflow: auto;
          padding-right: 4px;
        }

        .planning-premium .week-timeline-item {
          display: grid;
          grid-template-columns: 14px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: start;
          padding: 4px 0;
          border-radius: 10px;
          cursor: pointer;
        }

        .planning-premium .week-picker-chevron {
          display: inline-flex;
          width: 16px;
          justify-content: center;
          font-size: 16px;
          color: rgba(65, 72, 102, .86);
          transition: transform .22s ease;
          transform: rotate(0deg);
        }

        .planning-premium .week-picker-chevron.on {
          transform: rotate(180deg);
        }

        .planning-premium .week-timeline-item.on {
          background: transparent;
        }

        .planning-premium .week-timeline-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          margin-top: 6px;
          background: rgba(38, 43, 55, .9);
          box-shadow: 0 0 0 3px rgba(38, 43, 55, .08);
        }

        .planning-premium .week-timeline-dot.on {
          background: #5d66ed;
          box-shadow: 0 0 0 3px rgba(93, 102, 237, .18);
        }

        .planning-premium .week-timeline-dot.done {
          background: rgba(30, 35, 48, .88);
          box-shadow: 0 0 0 3px rgba(30, 35, 48, .12);
        }

        .planning-premium .week-timeline-title {
          font-size: 15px;
          font-weight: 800;
          line-height: 1.2;
          color: rgba(32, 38, 54, .88);
        }

        .planning-premium .week-timeline-item.on .week-timeline-title {
          color: #4e57de;
        }

        .planning-premium .week-timeline-item.done .week-timeline-title {
          color: rgba(31, 36, 48, .92);
        }

        .planning-premium .week-timeline-item:not(.on):not(.done) .week-timeline-title {
          color: rgba(138, 144, 172, .78);
        }

        .planning-premium .week-timeline-sub {
          margin-top: 6px;
          font-size: 12px;
          font-weight: 600;
          color: rgba(88, 95, 120, .86);
        }

        .planning-premium .week-status-wrap {
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          min-width: 96px;
        }

        .planning-premium .week-status {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .06em;
          border-radius: 8px;
          padding: 4px 8px;
          color: #fff;
        }

        .planning-premium .week-status.today {
          background: rgba(92, 102, 238, .2);
          color: #4f58df;
        }

        .planning-premium .week-status.done {
          background: rgba(31, 35, 48, .12);
          color: rgba(31, 35, 48, .88);
        }

        .planning-premium .week-picker-wrap {
          margin-top: 8px;
          margin-bottom: 10px;
          position: sticky;
          top: 52px;
          z-index: 7;
          background: transparent;
          padding-bottom: 8px;
        }

        .planning-premium .week-picker-head {
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .planning-premium .week-add-btn {
          flex-shrink: 0;
          border-radius: 8px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          height: 20px;
          padding: 0 8px;
          font-size: 11px;
          line-height: 20px;
        }

        .planning-premium .week-picker-toggle {
          width: 100%;
          height: 20px;
          border-radius: 8px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 8px;
          font-size: 11px;
          font-weight: 700;
          color: var(--s700);
          cursor: pointer;
        }

        .planning-premium .mini-ctrl-btn {
          height: 20px;
          line-height: 20px;
          border-radius: 8px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          padding: 0 8px;
          font-size: 11px;
          color: var(--s700);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .planning-premium .week-picker-panel {
          margin-top: 8px;
          max-height: 220px;
          overflow: auto;
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding-right: 2px;
        }

        .planning-premium .week-picker-item {
          width: 100%;
          text-align: left;
          border-radius: 12px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          padding: 10px;
          cursor: pointer;
          color: var(--s700);
        }

        .planning-premium .week-picker-item.on {
          background: var(--panel-bg-strong);
          border-color: rgba(93,100,214,.55);
          color: var(--s800);
        }

        .planning-premium .week-picker-item.on .wt,
        .planning-premium .week-picker-item.on div {
          color: var(--s800) !important;
        }

        .planning-premium .week-bottom-cta {
          width: 50%;
          min-width: 168px;
          margin-top: auto;
          margin-left: auto;
          position: sticky;
          bottom: 0;
          z-index: 8;
        }

        .planning-premium .session-hero {
          position: relative;
          overflow: hidden;
          background: transparent;
          border: none;
          border-radius: 22px;
          padding: 10px 8px;
          box-shadow: none;
        }

        .planning-premium .session-hero::before {
          content: none;
          position: absolute;
          width: 210px;
          height: 120px;
          left: -20px;
          top: -30px;
          background: radial-gradient(circle, rgba(255,94,182,.2) 0%, rgba(255,94,182,0) 72%);
          filter: blur(16px);
          pointer-events: none;
        }

        .planning-premium .session-hero::after {
          content: none;
          position: absolute;
          width: 220px;
          height: 140px;
          right: -40px;
          bottom: -50px;
          background: radial-gradient(circle, rgba(83,67,254,.28) 0%, rgba(83,67,254,0) 72%);
          filter: blur(18px);
          pointer-events: none;
        }

        .planning-premium .session-chip {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .08em;
          color: rgba(40, 50, 72, .9);
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border-radius: 999px;
          padding: 1px 7px;
        }

        .planning-premium .press-delete-menu {
          position: fixed;
          z-index: 50;
          min-width: 140px;
          transform: translate(-12px, -8px);
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,.78);
          background: rgba(27, 31, 44, .92);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 14px 26px rgba(12, 14, 24, .28);
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          transform-origin: 16px -6px;
          animation: ipad-pop .16s cubic-bezier(.2,.9,.3,1);
        }

        .planning-premium .press-delete-menu::before {
          content: '';
          position: absolute;
          top: -7px;
          left: 14px;
          width: 12px;
          height: 12px;
          background: rgba(27, 31, 44, .94);
          border-left: 1px solid rgba(255,255,255,.62);
          border-top: 1px solid rgba(255,255,255,.62);
          transform: rotate(45deg);
          border-top-left-radius: 2px;
        }

        .planning-premium .press-delete-item {
          width: 100%;
          height: 32px;
          border: none;
          border-radius: 8px;
          background: rgba(255,255,255,.06);
          color: rgba(236, 241, 255, .92);
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .planning-premium .press-delete-item.danger {
          background: rgba(239, 68, 68, .16);
          color: rgba(255, 186, 186, .95);
        }

        @keyframes ipad-pop {
          0% {
            opacity: 0;
            transform: translate(-12px, -4px) scale(.94);
          }
          100% {
            opacity: 1;
            transform: translate(-12px, -8px) scale(1);
          }
        }

        .planning-premium button {
          transition:
            transform .22s cubic-bezier(.22, .8, .3, 1),
            box-shadow .28s cubic-bezier(.22, .8, .3, 1),
            background-color .24s ease,
            border-color .24s ease,
            color .2s ease,
            opacity .2s ease;
          will-change: transform, box-shadow;
          touch-action: manipulation;
          backface-visibility: hidden;
          transform: translateZ(0);
        }

        .planning-premium button:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 24px rgba(80, 91, 140, .16);
        }

        .planning-premium button:not(:disabled):active {
          transform: translateY(0) scale(.982);
          box-shadow: 0 4px 12px rgba(80, 91, 140, .14);
        }

        .planning-premium button:disabled {
          opacity: .62;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .planning-premium .plan-cta {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          transform-origin: center;
          height: 44px;
          border-radius: 999px;
          padding: 0 22px;
          border: 1px solid rgba(230, 235, 255, .66);
          color: rgba(236, 241, 255, .92);
          background:
            radial-gradient(circle at 22% 24%, rgba(125,233,255,.4), rgba(125,233,255,0) 40%),
            radial-gradient(circle at 80% 18%, rgba(220,165,255,.32), rgba(220,165,255,0) 42%),
            linear-gradient(118deg, rgba(120,183,230,.58), rgba(124,116,212,.58) 48%, rgba(156,128,215,.56));
          box-shadow:
            inset 0 4px 12px rgba(255,255,255,.16),
            inset 0 -6px 10px rgba(37,46,92,.2),
            0 6px 12px rgba(63,66,128,.14);
        }

        .planning-premium .plan-cta::before {
          content: '';
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: radial-gradient(circle at 50% 34%, rgba(255,255,255,.62), transparent 58%);
          opacity: 0;
          transition: opacity .22s ease;
          pointer-events: none;
        }

        .planning-premium .plan-cta::after {
          content: '';
          position: absolute;
          inset: -1px;
          background: linear-gradient(110deg, transparent 38%, rgba(255,255,255,.45) 50%, transparent 62%);
          transform: translateX(-120%);
          transition: transform .7s cubic-bezier(.2, .8, .2, 1);
          pointer-events: none;
          z-index: -1;
        }

        .planning-premium .plan-cta > * {
          position: relative;
          z-index: 1;
        }

        .planning-premium .plan-cta:not(:disabled):hover::after {
          transform: translateX(120%);
        }

        .planning-premium .plan-cta:not(:disabled):active::before {
          opacity: .32;
        }

        .planning-premium .plan-cta-primary:not(:disabled):hover {
          transform: translateY(-1px) scale(1.008);
          box-shadow:
            inset 0 6px 14px rgba(255,255,255,.2),
            inset 0 -8px 12px rgba(34,45,95,.24),
            0 8px 16px rgba(75, 82, 152, .18);
        }

        .planning-premium .plan-cta-primary {
          min-width: 168px;
          width: 168px;
          height: 44px;
          border-radius: 999px;
          padding: 0 22px;
          justify-content: center;
        }

        .planning-premium .plan-cta-primary:not(:disabled):active {
          transform: translateY(0) scale(.975);
          box-shadow:
            inset 0 4px 10px rgba(255,255,255,.18),
            inset 0 -6px 9px rgba(34,45,95,.2),
            0 4px 8px rgba(75, 82, 152, .14);
        }

        .planning-premium .plan-cta-secondary:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow:
            inset 0 6px 14px rgba(255,255,255,.2),
            inset 0 -8px 11px rgba(33,43,90,.22),
            0 8px 14px rgba(71, 78, 146, .16);
        }

        .planning-premium .plan-cta-secondary {
          width: 100%;
          justify-content: center;
        }

        .planning-premium .plan-cta-secondary:not(:disabled):active {
          transform: scale(.982);
        }

        .planning-premium .plan-cta-danger:not(:disabled):hover {
          box-shadow: 0 10px 20px rgba(239, 68, 68, .18);
        }

        @media (pointer: coarse) {
          .planning-premium button:not(:disabled):hover {
            transform: none;
            box-shadow: none;
          }

          .planning-premium .plan-cta:not(:disabled):active {
            transform: scale(.97);
            box-shadow: 0 6px 16px rgba(80, 91, 140, .2);
          }

          .planning-premium .plan-cta:not(:disabled):active::before {
            opacity: .4;
          }
        }

        .planning-premium .block-item,
        .planning-premium .week-item,
        .planning-premium .day-card {
          transition: transform .2s cubic-bezier(.22, .8, .3, 1), box-shadow .24s ease, border-color .24s ease, background-color .24s ease;
        }

        .planning-premium .block-item:hover,
        .planning-premium .week-item:hover,
        .planning-premium .day-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(85, 92, 134, .12);
        }

        @media (max-width: 980px) {
          .planning-premium .phase-grid > * {
            min-width: 240px;
            max-width: 320px;
          }

          .planning-premium .plan-main {
            grid-template-columns: 1fr;
          }

          .planning-premium .plan-workbench {
            max-width: 100%;
            justify-self: stretch;
          }
        }

          .planning-premium .plan-sidebar,
          .planning-premium .plan-workbench {
            height: auto;
            max-height: none;
            overflow: visible;
          }

          .planning-premium .plan-sidebar .plan-panel-head,
          .planning-premium .plan-workbench .plan-panel-head,
          .planning-premium .week-picker-wrap,
          .planning-premium .week-bottom-cta {
            position: static;
          }

          .planning-premium .week-intro-row {
            flex-direction: column;
          }

          .planning-premium .week-day-picker-panel {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .planning-premium .week-timeline-side {
            width: 100%;
            flex: 1 1 auto;
            min-width: 0;
            max-height: none;
            overflow: visible;
          }
        }
      `}</style>
    </div>
  );
}
