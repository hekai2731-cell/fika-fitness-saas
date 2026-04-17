import { useEffect, useMemo, useState, useRef, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { Button } from '@/components/ui/button';
import { CardDescription, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { Block, Client, TrainingDay, TrainingWeek } from '@/lib/db';
import { getClientsFromCache, saveClient, updateClientsCache } from '@/lib/store';
import { usePlans } from '@/features/plans/usePlans';

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

type AiConfirmMode = 'full' | 'week' | 'day';

interface PlanConfirmForm {
  clientNeeds: string;
  priorityGoals: string[];
  weeklyFrequency: string;
  coachAnalysis: string;
  selectedTier: 'standard' | 'pro';
  weekDirection: string;
  weekFocusAreas: string[];
  weekNote: string;
  recoveryStatus: string;
  todayStatus: string;
  discomfortAreas: string[];
  sessionGoal: string;
  preSessionNote: string;
  // 周规划——训练日选择（不调 AI）
  weekSelectedDays: string[];           // e.g. ['周一', '周三', '周五']
  weekDayFocus: Record<string, string>; // day -> focus text
  weekIntensityPhase: 'build' | 'peak' | 'deload';
}


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


const getAutoTier = (membershipLevel?: string): 'standard' | 'pro' => {
  return (membershipLevel === 'professional' || membershipLevel === 'elite') ? 'pro' : 'standard';
};

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
  weekSelectedDays: ['周一', '周三', '周五'],
  weekDayFocus: {},
  weekIntensityPhase: 'build',
};


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

  // 当 day 切换或 AI 写入新 modules 时重置
  const modulesLength = ((day as any).modules || []).length;
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
  }, [day.id, modulesLength]);  // eslint-disable-line

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
  const { plan: activePlan, saveDraft: planSaveDraft, publish: planPublish } = usePlans(selectedClientId);
  const activePlanRef = useRef(activePlan);
  useEffect(() => { activePlanRef.current = activePlan; }, [activePlan]);

  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const [loadingDay, setLoadingDay] = useState(false);
  const [loadingWeek] = useState(false);
  const [loadingFull, _setLoadingFull] = useState(false);

  // ── AI 生成分步提示词 ────────────────────────────────
  const AI_STEPS_DAY  = ['分析客户历史数据...', '生成训练模块框架...', '优化动作细节...', '即将完成...'] as const;
  const AI_STEPS_WEEK = ['读取近期训练记录...', '规划本周训练节奏...', '生成训练日大纲...', '即将完成...'] as const;
  const AI_STEPS_FULL = ['分析客户身体资产...', '规划 Block 周期节奏...', '生成每周训练主题...', '即将完成...'] as const;
  const [aiStepDay,  setAiStepDay]  = useState(0);
  const [aiStepWeek, setAiStepWeek] = useState(0);
  const [aiStepFull, setAiStepFull] = useState(0);
  const aiStepDayRef  = useRef<number | null>(null);
  const aiStepWeekRef = useRef<number | null>(null);
  const aiStepFullRef = useRef<number | null>(null);
  const startAiSteps = (kind: 'day' | 'week' | 'full') => {
    const [setStep, ref, len] =
      kind === 'day'  ? [setAiStepDay,  aiStepDayRef,  AI_STEPS_DAY.length]  :
      kind === 'week' ? [setAiStepWeek, aiStepWeekRef, AI_STEPS_WEEK.length] :
                        [setAiStepFull, aiStepFullRef, AI_STEPS_FULL.length];
    setStep(0);
    let i = 0;
    (ref as React.MutableRefObject<number | null>).current = window.setInterval(() => {
      i = Math.min(i + 1, len - 1);
      setStep(i);
    }, 2000);
  };
  const stopAiSteps = (kind: 'day' | 'week' | 'full') => {
    const [setStep, ref] =
      kind === 'day'  ? [setAiStepDay,  aiStepDayRef]  :
      kind === 'week' ? [setAiStepWeek, aiStepWeekRef] :
                        [setAiStepFull, aiStepFullRef];
    if ((ref as React.MutableRefObject<number | null>).current !== null) {
      clearInterval((ref as React.MutableRefObject<number | null>).current!);
      (ref as React.MutableRefObject<number | null>).current = null;
    }
    setStep(0);
  };
  const [loadingPublish, setLoadingPublish] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const [deleteMenu, setDeleteMenu] = useState<LongPressDeleteMenu | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [aiConfirmMode, setAiConfirmMode] = useState<AiConfirmMode | null>(null);
  const [dayPlanStep, setDayPlanStep] = useState<'tier' | 'detail'>('tier');
  const [planConfirmForm, setPlanConfirmForm] = useState<PlanConfirmForm>(defaultPlanConfirmForm);

  // ── AI 生成预览状态 ──
  const [aiPreviewMode, setAiPreviewMode] = useState<'day' | 'week' | 'full' | null>(null);
  const [aiPreviewData, setAiPreviewData] = useState<any>(null);

  // ── 课前速览面板状态 ──
  const [preSessionPreviewOpen, setPreSessionPreviewOpen] = useState(false);

  useEffect(() => {
    const list = getClientsFromCache();
    const visible = list.filter(c => c.name !== '示例客户');
    if (!selectedClientId && visible.length > 0) onSelectClient(visible[0].id);
  }, [onSelectClient, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) { setClient(null); return; }
    const list = getClientsFromCache();
    const c = list.find(cl => cl.id === selectedClientId);
    setClient(c || null);
    const blk = c?.blocks?.[0];
    const wk = blk?.training_weeks?.[0];
    setSelectedBlockId(blk?.id || null);
    setSelectedWeekId(wk?.id || null);
    setSelectedDayId(wk?.days?.[0]?.id || null);
  }, [selectedClientId]);

  // storage 事件：更新 client 的 sessions 等字段，不重置 block/week/day 选中状态
  useEffect(() => {
    const onStorage = () => {
      if (!selectedClientId) return;
      const fresh = getClientsFromCache().find(c => c.id === selectedClientId);
      if (fresh) setClient(prev => prev ? { ...prev, sessions: fresh.sessions, weeklyData: fresh.weeklyData } : fresh);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [selectedClientId]);

  
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

  // ── 计算距上次上课天数 ──
  const daysSinceLastSession = useMemo(() => {
    if (!client?.sessions || client.sessions.length === 0) return null;
    const lastSession = client.sessions[client.sessions.length - 1];
    if (!lastSession.date) return null;
    const lastDate = new Date(lastSession.date);
    const today = new Date();
    const diffTime = today.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [client?.sessions]);

  // ── 获取上次RPE和教练备注 ──
  const lastSessionInfo = useMemo(() => {
    if (!client?.sessions || client.sessions.length === 0) return { rpe: null, notes: null };
    const lastSession = client.sessions[client.sessions.length - 1];
    return {
      rpe: lastSession.rpe || null,
      notes: lastSession.note || null,
    };
  }, [client?.sessions]);

  const publishDiffSummary = useMemo(() => {
    const draftBlocks = Array.isArray(client?.blocks) ? client.blocks : [];
    const publishedBlocks = Array.isArray(client?.published_blocks) ? client.published_blocks : [];

    const countWeeks = (blocks: Block[]) => blocks.reduce((sum, b) => sum + (Array.isArray(b.training_weeks) ? b.training_weeks.length : 0), 0);
    const countDays = (blocks: Block[]) =>
      blocks.reduce(
        (sum, b) =>
          sum +
          (Array.isArray(b.training_weeks)
            ? b.training_weeks.reduce((inner, w) => inner + (Array.isArray(w.days) ? w.days.length : 0), 0)
            : 0),
        0,
      );

    const mapDays = (blocks: Block[]) => {
      const m = new Map<string, string>();
      blocks.forEach((b, bi) => {
        (b.training_weeks || []).forEach((w, wi) => {
          (w.days || []).forEach((d, di) => {
            const key = `${b.title || `Block${bi + 1}`}::${w.week_num || wi + 1}::${d.day || `Day${di + 1}`}`;
            const value = `${d.name || ''}|${d.focus || ''}|${Array.isArray((d as any).modules) ? (d as any).modules.length : 0}`;
            m.set(key, value);
          });
        });
      });
      return m;
    };

    const draftMap = mapDays(draftBlocks);
    const publishedMap = mapDays(publishedBlocks);
    const allKeys = new Set([...draftMap.keys(), ...publishedMap.keys()]);
    let changedDays = 0;
    for (const key of allKeys) {
      if (draftMap.get(key) !== publishedMap.get(key)) changedDays += 1;
    }

    return [
      `Block：草稿 ${draftBlocks.length} / 已发布 ${publishedBlocks.length}`,
      `Week：草稿 ${countWeeks(draftBlocks)} / 已发布 ${countWeeks(publishedBlocks)}`,
      `Day：草稿 ${countDays(draftBlocks)} / 已发布 ${countDays(publishedBlocks)}`,
      `预计受影响训练日：${changedDays}`,
    ];
  }, [client?.blocks, client?.published_blocks]);


  // ── 持久化 ──────────────────────────────────────────────────
  const persistClient = (next: Client) => {
    const all = getClientsFromCache();
    const idx = all.findIndex(c => c.id === next.id);
    const prev = idx >= 0 ? all[idx] : null;
    const blocksChanged = JSON.stringify(prev?.blocks || []) !== JSON.stringify(next.blocks || []);
    const merged: Client = { ...(prev || ({} as Client)), ...next };

    if (blocksChanged) {
      const prevDraft = Number(prev?.plan_draft_version || 0);
      const nextDraft = Number(merged.plan_draft_version || 0);
      merged.plan_draft_version = Math.max(prevDraft + 1, nextDraft || 1);
      merged.plan_draft_status = 'draft';
      merged.plan_updated_at = new Date().toISOString();
      if (merged.plan_published_version == null) merged.plan_published_version = Number(prev?.plan_published_version || 0);
      if (merged.published_blocks == null && prev?.published_blocks) merged.published_blocks = prev.published_blocks;
      if (merged.plan_published_at == null && prev?.plan_published_at) merged.plan_published_at = prev.plan_published_at;
      // 双写到 /api/plans（fire-and-forget）
      void planSaveDraft(merged.blocks || []).catch((e: unknown) => console.warn('[PlanningPage] plan dual-write failed:', e));
    } else {
      if (merged.plan_draft_version == null) merged.plan_draft_version = Number(prev?.plan_draft_version || 1);
      if (merged.plan_draft_status == null) merged.plan_draft_status = (prev as any)?.plan_draft_status || 'draft';
      if (merged.plan_published_version == null) merged.plan_published_version = Number(prev?.plan_published_version || 0);
      if (merged.plan_updated_at == null && prev?.plan_updated_at) merged.plan_updated_at = prev.plan_updated_at;
      if (merged.plan_published_at == null && prev?.plan_published_at) merged.plan_published_at = prev.plan_published_at;
      if (merged.published_blocks == null && prev?.published_blocks) merged.published_blocks = prev.published_blocks;
    }

    if (idx >= 0) all[idx] = merged;
    else all.push(merged);
    updateClientsCache(all);
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current !== null) clearTimeout(autoSaveTimerRef.current);
    void saveClient(merged)
      .then(() => {
        setAutoSaveStatus('saved');
        autoSaveTimerRef.current = window.setTimeout(() => setAutoSaveStatus('idle'), 2500);
      })
      .catch((err) => {
        console.error('[PlanningPage] Failed to save client:', err);
        setAutoSaveStatus('idle');
      });
    setClient(merged);
  };

  const syncClientMirrorToLocal = (next: Client) => {
    try {
      const publishPayload = {
        published_blocks: next.published_blocks,
        plan_draft_status: next.plan_draft_status,
        plan_published_version: next.plan_published_version,
        plan_published_at: next.plan_published_at,
        current_week: next.current_week,
        current_day: (next as any).current_day,
        current_day_id: (next as any).current_day_id,
        current_block_id: (next as any).current_block_id,
      };

      // Update fika_clients (read by student portal's syncLatestClient)
      const studentClients: Client[] = JSON.parse(localStorage.getItem('fika_clients') || '[]');
      const matchIdx = studentClients.findIndex(
        (c) => c.id === next.id || (c.roadCode && next.roadCode && c.roadCode === next.roadCode)
      );
      if (matchIdx >= 0) {
        studentClients[matchIdx] = { ...studentClients[matchIdx], ...publishPayload };
      } else {
        studentClients.push(next);
      }
      localStorage.setItem('fika_clients', JSON.stringify(studentClients));
      localStorage.setItem('fika_current_client', JSON.stringify(next));

      // Also update fika_coach_clients_v1 so student portal's TodayTab syncCoachData
      // reads the new published_blocks and does not overwrite with stale data
      const coachClients: Client[] = JSON.parse(localStorage.getItem('fika_coach_clients_v1') || '[]');
      const coachIdx = coachClients.findIndex(
        (c: any) => c.id === next.id || (c.roadCode && next.roadCode && c.roadCode === next.roadCode)
      );
      if (coachIdx >= 0) {
        coachClients[coachIdx] = { ...coachClients[coachIdx], ...publishPayload };
      } else {
        coachClients.push(next);
      }
      localStorage.setItem('fika_coach_clients_v1', JSON.stringify(coachClients));

      window.dispatchEvent(new Event('storage'));
    } catch {
      // ignore sync errors to avoid blocking coach-side publish action
    }
  };


  const publishPlanToStudent = async () => {
    if (!client) return;
    setLoadingPublish(true);
    setError(null);
    try {
      const json = await fetchJsonOrThrow(apiUrl(`/api/clients/${encodeURIComponent(client.id)}/plan/publish`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publishedByCoachCode: (client as any).coachCode || '',
          publishedByCoachName: (client as any).coachName || '',
          selectedWeekNum: Number((selectedWeek as any)?.week_num || 1),
          selectedDay: String((selectedDay as any)?.day || ''),
          selectedDayId: String((selectedDay as any)?.id || ''),
          selectedBlockId: String((selectedBlock as any)?.id || ''),
        }),
      });
      const updated = (json as any)?.client as Client | undefined;
      if (updated) {
        persistClient(updated);
        syncClientMirrorToLocal(updated);
        setPublishConfirmOpen(false);
        // 双写到 /api/plans
        void planPublish((client as any).coachCode || '', (client as any).coachName || '').catch((e: unknown) => console.warn('[PlanningPage] plan publish dual-write failed:', e));
      }
    } catch (e: any) {
      setError('发布失败：' + (e?.message || String(e)));
    } finally {
      setLoadingPublish(false);
    }
  };


  // 生产环境使用相对路径，开发环境使用环境变量
  const isProduction = import.meta.env.PROD;
  const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '');
  const apiUrl = (path: string) => {
    if (!apiBase) return path;
    const base = String(apiBase).replace(/\/$/, '');
    if (base.endsWith('/api') && path.startsWith('/api/')) return path;
    return base + path;
  };

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

  // ── AI 草稿存储（fire-and-forget，失败不影响主流程）────────────
  const saveDraftToApi = (planType: string, result: any, inputPayload?: any) => {
    try {
      const clientId = String(client?.id || (client as any)?.roadCode || 'unknown');
      const coachCode = String((client as any)?.coachCode || '');
      void fetch(apiUrl('/api/ai/drafts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, coachCode, planType, output_result: result, input_payload: inputPayload || {} }),
      }).catch((e: unknown) => console.warn('[AI] draft save failed:', e));
    } catch (e: unknown) {
      console.warn('[AI] draft save failed:', e);
    }
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

  // ── Block 两步表单 state ──────────────────────────────────────────
  const TRAINING_FOCUS_OPTIONS = [
    { value: 'muscle_gain',    emoji: '🏋️', label: '力量增肌',  desc: '复合动作为主，渐进超负荷建立肌肉' },
    { value: 'performance',    emoji: '⚡',  label: '运动表现',  desc: '动力链整合，爆发力和功能性提升' },
    { value: 'fat_loss',       emoji: '🔥',  label: '减脂塑形',  desc: '代谢训练为主，有氧力量结合' },
    { value: 'posture',        emoji: '🧘',  label: '体态矫正',  desc: '功能性动作，姿态纠正和核心稳定' },
    { value: 'cardio',         emoji: '❤️',  label: '心肺耐力',  desc: '有氧底座建立，心肺功能提升' },
    { value: 'rehabilitation', emoji: '🩹',  label: '功能康复',  desc: '关节活动和基础功能重建' },
  ];
  const [blockStep,             setBlockStep]             = useState<'form' | 'preview'>('form');
  const [blockFocus,            setBlockFocus]            = useState<string>('muscle_gain');
  const [blockFreq,             setBlockFreq]             = useState(3);
  const [blockWeeks,            setBlockWeeks]            = useState(8);
  const [blockNote,             setBlockNote]             = useState('');
  const [blockFramework,        setBlockFramework]        = useState<any>(null);
  const [blockFrameworkLoading, setBlockFrameworkLoading] = useState(false);

  // ── Week 变动调整 state ───────────────────────────────────────────
  const [weekHasChange,   setWeekHasChange]   = useState(false);
  const [weekEditDays,    setWeekEditDays]    = useState<any[]>([]);
  const [weekChangeNote,  setWeekChangeNote]  = useState('');
  const [weekPhaseOverride, setWeekPhaseOverride] = useState<string | null>(null);

  // ── statusScore 辅助计算 ──────────────────────────────────────────
  const computeStatusScore = (recoveryStatus: string, todayStatus: string): number => {
    if (String(todayStatus).includes('状态好')) return 5;
    if (String(todayStatus).includes('状态差') || String(recoveryStatus).includes('酸痛')) return 1;
    return 3;
  };

  // ── Block 第一步：调 /api/plan/generate-framework 生成预览框架 ──────
  const generateBlockFramework = async () => {
    if (!client) return;
    setBlockFrameworkLoading(true);
    try {
      const fw = await fetchJsonOrThrow(apiUrl('/api/plan/generate-framework'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals: [blockFocus],
          direction: 'balanced',
          weeklyFreq: blockFreq,
          membershipLevel: String((client as any).membershipLevel || 'standard'),
          totalWeeks: blockWeeks,
        }),
      });
      setBlockFramework(fw);
      setBlockStep('preview');
    } catch (e: any) {
      setError('框架生成失败：' + (e?.message || String(e)));
    } finally {
      setBlockFrameworkLoading(false);
    }
  };

  // ── Block 第二步：创建 Block 并持久化 ──────────────────────────────
  const confirmCreateBlock = () => {
    if (!client || !blockFramework) return;
    const newBlock: Block = {
      id: `block-${Date.now()}`,
      title: blockFramework.block_name,
      goal: blockFramework.block_goal,
      training_weeks: (blockFramework.weeks || []).map((w: any) => ({
        id: `week-${Date.now()}-${w.week_num}`,
        week_num: Number(w.week_num),
        week_title: String(w.week_title || ''),
        week_theme: String(w.week_theme || ''),
        week_brief: String(w.week_brief || ''),
        intensity_phase: String(w.intensity_phase || 'build'),
        days: (w.days || []).map((d: any) => ({
          id: `day-${Date.now()}-${d.day}`,
          day: String(d.day || ''),
          name: String(d.name || ''),
          focus: String(d.focus || ''),
          modules: [],
        })),
      })),
    };
    const next: Client = { ...client, blocks: [...(client.blocks || []), newBlock] };
    persistClient(next);
    setAiConfirmMode(null);
    setBlockStep('form');
    setBlockFramework(null);
    setSelectedBlockId(newBlock.id);
    setSelectedWeekId(newBlock.training_weeks[0]?.id || null);
    setSelectedDayId(null);
  };

  // ── Week 确认应用（支持变动调整）────────────────────────────────────
  const applyWeekEdit = () => {
    if (!client || !selectedBlock || !selectedWeek) return;
    const activeDays = weekEditDays
      .filter((d: any) => d.checked)
      .map(({ checked, editingFocus, ...d }: any) => d);
    const updatedWeek = {
      ...selectedWeek,
      days: weekHasChange ? activeDays : selectedWeek.days,
      intensity_phase: weekPhaseOverride || (selectedWeek as any).intensity_phase,
      change_note: weekChangeNote || undefined,
    };
    const next: Client = {
      ...client,
      blocks: (client.blocks || []).map((b: any) =>
        b.id !== selectedBlockId ? b : {
          ...b,
          training_weeks: (b.training_weeks || []).map((w: any) =>
            w.id !== selectedWeek.id ? w : updatedWeek
          ),
        }
      ),
    };
    persistClient(next);
  };

  const openAiConfirm = (mode: AiConfirmMode) => {
    const autoTier = getAutoTier((client as any)?.membershipLevel);
    const intensityPhase = (selectedWeek as any)?.intensity_phase || 'build';
    setPlanConfirmForm({
      ...defaultPlanConfirmForm,
      selectedTier: autoTier,
      weekIntensityPhase: intensityPhase as 'build' | 'peak' | 'deload',
      weekSelectedDays: (selectedWeek?.days || []).map((d: any) => String(d.day || '')).filter(Boolean),
    });
    if (mode === 'week') {
      setWeekHasChange(false);
      setWeekChangeNote('');
      setWeekPhaseOverride(null);
      setWeekEditDays((selectedWeek?.days || []).map((d: any) => ({ ...d, checked: true, editingFocus: false })));
    }
    if (mode === 'full') {
      setBlockStep('form');
      setBlockFocus('muscle_gain');
      setBlockFreq(3);
      setBlockWeeks(8);
      setBlockNote('');
      setBlockFramework(null);
    }
    if (mode === 'day') {
      setDayPlanStep('tier');
    }
    setAiConfirmMode(mode);
  };

  const openDayTierPicker = () => {
    if (!selectedDay || anyLoading) return;
    openAiConfirm('day');
  };

  const handleGenerateDayWithTier = (tier: 'standard' | 'pro') => {
    setAiConfirmMode(null);
    void onGenerateDayPlan(tier);
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
      if (blockStep === 'form') {
        void generateBlockFramework();
      } else {
        confirmCreateBlock();
      }
      return;
    }
    if (aiConfirmMode === 'week') {
      setAiConfirmMode(null);
      applyWeekEdit();
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

  // ── 数据提取辅助函数 ──────────────────────────────────────────
  /**
   * 提取最近5次训练数据：格式 { date, rpe }
   */
  const extractRecentSessions = (sessions: any[] | undefined) => {
    return (sessions || []).slice(-5).map(s => ({
      date: s.date ? new Date(s.date).toLocaleDateString('zh-CN') : '未知',
      rpe: s.rpe || 0,
    }));
  };

  /**
   * 提取上一次同名训练的动作列表
   */
  const extractLastSessionExercises = (dayName: string) => {
    if (!client || !selectedBlock) return [];

    const blocks = client.blocks || [];
    const currentBlockIdx = blocks.findIndex(b => b.id === selectedBlock.id);

    for (let bi = currentBlockIdx; bi >= 0; bi--) {
      const weeks = (blocks[bi].training_weeks || []);
      for (let wi = weeks.length - 1; wi >= 0; wi--) {
        if (bi === currentBlockIdx && selectedWeek && wi >= (selectedWeek.week_num || 0)) break;
        const dayMatch = (weeks[wi].days || []).find(d => d.day === dayName);
        if (dayMatch?.modules?.length) {
          const exList: any[] = [];
          dayMatch.modules.forEach((mod: any) => {
            (mod.exercises || []).forEach((ex: any) => {
              exList.push({
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps,
                rest_seconds: ex.rest_seconds,
                notes: ex.notes || '',
              });
            });
          });
          return exList;
        }
      }
    }
    return [];
  };

  /**
   * 状态包装函数：setGeneratedPreview（与 aiPreviewMode/aiPreviewData 兼容）
   */
  const setGeneratedPreview = (preview: { type: 'day' | 'week' | 'full' | null; data: any; loading?: boolean; error?: string | null }) => {
    if (preview.type) {
      setAiPreviewMode(preview.type);
    } else {
      setAiPreviewMode(null);
    }
    setAiPreviewData(preview.data);
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
  const onGenerateDayPlan = async (forcedTier?: 'standard' | 'pro') => {
    if (!client || !selectedDay || !selectedWeek || !selectedBlock) return;
    const clientId = String(client?.id || (client as any)?.roadCode || 'unknown');
    setLoadingDay(true);
    startAiSteps('day');
    setError(null);
    try {
      // 提取最近5次数据
      const recentSessions = extractRecentSessions(client.sessions);

      // 提取上一次同名训练的动作列表
      const lastSessionExercises = extractLastSessionExercises(selectedDay.day);

      const json = await fetchJsonOrThrow(apiUrl('/api/session-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId,
          clientName: client.name,
          gender: client.gender,
          age: client.age,
          height: client.height,
          weight: Number(client.weight || (client as any).bodyWeight || 65),
          surveyData: (client as any).survey_data,
          weeklyData: client.weeklyData ?? (client as any).weekly_data,
          dayName: String((selectedDay as any)?.name || selectedDay?.day || ''),
          dayFocus: String((selectedDay as any)?.focus || ''),
          ...buildAiConfirmPayload(),
          membershipLevel: String((client as any).membershipLevel || 'standard'),
          statusScore: computeStatusScore(planConfirmForm.recoveryStatus, planConfirmForm.todayStatus),
          intensityPhase: String((selectedWeek as any)?.intensity_phase || 'build'),
          sessionTier: forcedTier || getAutoTier((client as any)?.membershipLevel),
          lastSessionRpe: (client.sessions || []).slice(-1)[0]?.rpe || undefined,
          blockTitle: selectedBlock.title,
          weekLabel: `Week ${selectedWeek.week_num}`,
          blockIndex: Math.max(0, (client.blocks || []).findIndex(b => b.id === selectedBlock.id)),
          // 传给后端的新数据
          recentSessions,
          lastSessionExercises,
          lastSessionDate: lastSessionExercises.length > 0 ? '上一次该日训练' : undefined,
          lastWeekBrief: (selectedWeek as any)?.week_brief || '',
          blockGoal:  String((selectedBlock as any)?.block_goal || (selectedBlock as any)?.goal || ''),
          weekTheme:  String((selectedWeek as any)?.week_theme || ''),
          weekBrief:  String((selectedWeek as any)?.week_brief || ''),
          sessionGoal: planConfirmForm.sessionGoal,
        }),
      });

      // 存草稿（fire-and-forget）
      saveDraftToApi('session', json);
      // 显示预览弹窗，不直接保存
      setGeneratedPreview({
        type: 'day',
        data: json,
        loading: false,
        error: null,
      });
    } catch (e: any) {
      const errorMessage = e?.message || String(e);
      console.error('[AI] Error generating day plan:', errorMessage);
      setGeneratedPreview({
        type: 'day',
        data: null,
        loading: false,
        error: errorMessage,
      });
      setError('生成失败：' + errorMessage);
    } finally {
      stopAiSteps('day');
      setLoadingDay(false);
    }
  };

  // 确认应用日计划预览数据
  const confirmSaveDayPlanFromPreview = () => {
    if (!aiPreviewData || !client || !selectedDay || !selectedWeek || !selectedBlock) return;

    try {
      // 注入 id 和 weight 字段
      const previewModules = Array.isArray(aiPreviewData?.modules) ? aiPreviewData.modules : [];
      const modules: PlanModule[] = previewModules.map((m: any) => ({
        ...m,
        id: genId('mod'),
        exercises: (Array.isArray(m?.exercises) ? m.exercises : []).map((ex: any) => ({
          ...ex,
          id: genId('ex'),
          weight: ex?.weight || '',
        })),
      }));

      const next: Client = {
        ...client,
        blocks: (Array.isArray(client.blocks) ? client.blocks : []).map(b =>
          b?.id !== selectedBlock?.id ? b : {
            ...b,
            training_weeks: (Array.isArray(b?.training_weeks) ? b.training_weeks : []).map(w =>
              w?.id !== selectedWeek?.id ? w : {
                ...w,
                days: (Array.isArray(w?.days) ? w.days : []).map(d =>
                  d?.id !== selectedDay?.id ? d : {
                    ...d,
                    name: aiPreviewData?.session_name || d?.name,
                    session_name: aiPreviewData?.session_name,
                    modules,
                  }
                ),
              }
            ),
          }
        ),
      };
      persistClient(next);
      setGeneratedPreview({ type: null, data: null });
    } catch (e: any) {
      console.error('[PlanningPage] 保存日计划失败:', e);
      setError('保存失败：' + (e?.message || String(e)));
    }
  };

  // 确认应用完整规划预览
  const confirmSaveFullPlanFromPreview = () => {
    if (!client) return;

    try {
      const previewBlocks = Array.isArray(aiPreviewData?.blocks) ? aiPreviewData.blocks : [];
      if (previewBlocks.length === 0) return;

      const next: Client = { ...client, blocks: previewBlocks };
      persistClient(next);

      const firstBlock = previewBlocks[0];
      if (firstBlock?.id) {
        setSelectedBlockId(firstBlock.id);
        const wk = Array.isArray(firstBlock?.training_weeks) ? firstBlock.training_weeks[0] : null;
        setSelectedWeekId(wk?.id || null);
        const day = Array.isArray(wk?.days) ? wk.days[0] : null;
        setSelectedDayId(day?.id || null);
      }

      setGeneratedPreview({ type: null, data: null });
    } catch (e: any) {
      console.error('[PlanningPage] 完整规划保存失败:', e);
      setError('保存失败：' + (e?.message || String(e)));
    }
  };

  // ── 应用周计划预览数据（确认后执行）───────────────────────────
  const applyWeekPlanPreview = (previewData: any) => {
    if (!client || !selectedWeek || !selectedBlock) return;

    try {
      // 解析 week_theme，可能是 JSON 字符串或对象
      let parsedWeekTheme = previewData?.week_theme;
      if (typeof parsedWeekTheme === 'string') {
        try {
          parsedWeekTheme = JSON.parse(parsedWeekTheme);
        } catch {
          parsedWeekTheme = {};
        }
      }

      // 构建日计划映射
      const dayPlans: Record<string, any> = {};
      const previewDays = Array.isArray(previewData?.days) ? previewData.days : [];
      previewDays.forEach((d: any, idx: number) => {
        if (d) {
          const dayKey = d?.day_key || d?.dayKey || d?.day || `day${idx + 1}`;
          dayPlans[dayKey] = d;
          dayPlans[`day${idx + 1}`] = d;
        }
      });

      // 更新 client 数据，完整保护每一层
      const next: Client = {
        ...client,
        blocks: (Array.isArray(client.blocks) ? client.blocks : []).map(b =>
          b?.id !== selectedBlock?.id ? b : {
            ...b,
            training_weeks: (Array.isArray(b?.training_weeks) ? b.training_weeks : []).map(w =>
              w?.id !== selectedWeek?.id ? w : {
                ...w,
                // 保存 week_theme 和 week_brief（允许覆盖）
                ...(parsedWeekTheme && Object.keys(parsedWeekTheme).length > 0 ? { week_theme: parsedWeekTheme } : {}),
                ...(previewData?.week_brief ? { week_brief: previewData.week_brief } : {}),
                // 更新 days，使用用户提供的匹配逻辑
                days: (Array.isArray(w?.days) ? w.days : []).map((day) => {
                  const match = previewDays.find((d: any) =>
                    d?.day_key === day?.day || d?.dayKey === day?.day || d?.day_key === day?.id || d?.day === day?.day
                  );

                  if (!match) return day;

                  return {
                    ...day,
                    name: match?.session_name || day?.name || '',
                    focus: match?.day_focus || day?.focus || '',
                    modules: (Array.isArray(match?.modules) ? match.modules : []).map((m: any) => ({
                      ...m,
                      id: genId('mod'),
                      exercises: (Array.isArray(m?.exercises) ? m.exercises : []).map((ex: any) => ({
                        ...ex,
                        id: genId('ex'),
                        weight: '',
                      })),
                    })),
                  };
                }),
              }
            ),
          }
        ),
      };

      persistClient(next);
      setGeneratedPreview({ type: null, data: null });
    } catch (e: any) {
      console.error('[PlanningPage] 应用周计划预览失败:', e);
      setError('应用周计划失败：' + (e?.message || String(e)));
      setGeneratedPreview({ type: null, data: null });
    }
  };


  const anyLoading = loadingDay || loadingWeek || loadingFull || loadingPublish;
  const draftVersion = Number(client?.plan_draft_version || 1);
  const publishedVersion = Number(client?.plan_published_version || 0);
  const draftStatusText = client?.plan_draft_status === 'published'
    ? '已发布'
    : client?.plan_draft_status === 'review_ready'
      ? '待发布'
      : client?.plan_draft_status === 'archived'
        ? '已归档'
        : '草稿中';
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
            onClick={() => {
              setBlockStep('form');
              setBlockFocus('muscle_gain');
              setBlockFreq(3);
              setBlockWeeks(8);
              setBlockNote('');
              setBlockFramework(null);
              setAiConfirmMode('full');
            }}
            disabled={anyLoading}
            title="新建训练 Block（规则生成框架，不调用 AI）"
            style={{ marginLeft: 'auto' }}
          >
            {loadingFull ? (
              <><span className="spin" style={{ width: 14, height: 14, marginRight: 6 }} />生成中...</>
            ) : '✨ AI block'}
          </Button>
        </div>
        {loadingFull && (
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--s400)', textAlign: 'right', minHeight: 16, transition: 'opacity .3s' }}>
            {AI_STEPS_FULL[aiStepFull]}
          </div>
        )}
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
              <div className="phase-name">{b.title || `Block ${bi + 1}`}</div>
              <div className="phase-meta">{(b as any).block_goal || (b as any).goal || '综合体能提升'}</div>
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
          {loadingWeek && (
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--s400)', textAlign: 'right', minHeight: 16, transition: 'opacity .3s' }}>
              {AI_STEPS_WEEK[aiStepWeek]}
            </div>
          )}

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
                    <div className="wt">{(w as any).week_title || `Week ${w.week_num}`}</div>
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      {(w as any).week_theme
                        ? String((w as any).week_theme).slice(0, 12)
                        : (w.days || []).map(d => d.day).join(' · ') || '暂无训练日'}
                    </div>
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
                      {(() => {
                        const theme = (selectedWeek as any)?.week_theme;
                        if (!theme) return '本周重点聚焦动作质量与强度推进，保持恢复节奏。';
                        if (typeof theme === 'object' && theme !== null) {
                          return Object.values(theme).map((v: any) => v?.day_focus || '').filter(Boolean).join(' · ') || '本周重点聚焦动作质量与强度推进，保持恢复节奏。';
                        }
                        return String(theme);
                      })()}
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
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--s500)', letterSpacing: '.03em', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                <span>状态 {draftStatusText} · 草稿 v{draftVersion} · 已发布 v{publishedVersion} · 发布时间 {publishedAtText}</span>
                {autoSaveStatus !== 'idle' && (
                  <span style={{ color: autoSaveStatus === 'saved' ? '#22c55e' : '#94a3b8', fontWeight: 600 }}>
                    {autoSaveStatus === 'saving' ? '· 保存中...' : '· 已自动保存 ✓'}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginLeft: 'auto', justifyContent: 'flex-end' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <Button
                  type="button"
                  className="h-10 rounded-md border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
                  onClick={() => setPublishConfirmOpen(true)}
                  disabled={!client || !(client.blocks || []).length || loadingPublish}
                >
                  {loadingPublish ? '发布中...' : '发布到学员端'}
                </Button>
                <Button
                  type="button"
                  className="h-10 rounded-md border border-input bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
                  onClick={() => setPreSessionPreviewOpen(!preSessionPreviewOpen)}
                  disabled={!client}
                  title="查看课前信息"
                >
                  📋 课前速览
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
              {loadingDay && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--s400)', textAlign: 'right', minHeight: 16, transition: 'opacity .3s' }}>
                  {AI_STEPS_DAY[aiStepDay]}
                </div>
              )}
            </div>

            {/* 课前速览面板 */}
            {preSessionPreviewOpen && client && (
              <div style={{
                marginTop: 12,
                padding: 12,
                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                borderRadius: 12,
                fontSize: 12,
                borderLeft: '3px solid #94a3b8',
              }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: 'var(--s700)', marginBottom: 8 }}>课前信息</div>

                  {/* 距上次上课天数 */}
                  <div style={{ marginBottom: 6, color: 'var(--s600)' }}>
                    📅 距上次上课：
                    {daysSinceLastSession !== null ? (
                      <span style={{ fontWeight: 600, color: 'var(--s800)' }}>
                        {daysSinceLastSession} 天前
                      </span>
                    ) : (
                      <span style={{ fontStyle: 'italic', opacity: 0.7 }}>无上课记录</span>
                    )}
                  </div>

                  {/* 上次RPE + 教练备注 */}
                  {daysSinceLastSession !== null && (
                    <div style={{ marginBottom: 6, color: 'var(--s600)' }}>
                      <div style={{ marginBottom: 4 }}>
                        💪 上次RPE：
                        {lastSessionInfo.rpe !== null ? (
                          <span style={{ fontWeight: 600, color: 'var(--s800)' }}>{lastSessionInfo.rpe}</span>
                        ) : (
                          <span style={{ fontStyle: 'italic', opacity: 0.7 }}>未记录</span>
                        )}
                      </div>
                      {lastSessionInfo.notes && (
                        <div style={{
                          padding: '6px 8px',
                          backgroundColor: 'rgba(255, 255, 255, 0.3)',
                          borderRadius: 6,
                          marginLeft: 20,
                          fontStyle: 'italic',
                          color: 'var(--s700)',
                          borderLeft: '2px solid var(--s400)',
                        }}>
                          {lastSessionInfo.notes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 伤病预警 */}
                  {(client as any).injury_detail && (
                    <div style={{
                      marginBottom: 6,
                      padding: '8px 10px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: 6,
                      borderLeft: '3px solid #ef4444',
                      color: '#dc2626',
                      fontWeight: 600,
                    }}>
                      ⚠️ 注意：{(client as any).injury_detail}
                    </div>
                  )}

                  {/* 今日训练重点 */}
                  {selectedWeek && (
                    <div style={{ marginBottom: 10, color: 'var(--s600)' }}>
                      <div style={{ marginBottom: 4, fontWeight: 600, color: 'var(--s700)' }}>
                        🎯 今日训练重点
                      </div>
                      <div style={{
                        padding: '6px 8px',
                        backgroundColor: 'rgba(168, 85, 247, 0.1)',
                        borderRadius: 6,
                        borderLeft: '2px solid #a855f7',
                        color: 'var(--s700)',
                      }}>
                        {(() => {
                          const brief = (selectedWeek as any).week_brief;
                          if (!brief) {
                            const phase = (selectedWeek as any).intensity_phase;
                            return phase === 'deload' ? '卸载恢复' : phase === 'peak' ? '峰值冲击' : '渐进加载';
                          }
                          if (typeof brief === 'object' && brief !== null) {
                            return Object.values(brief).map((v: any) => typeof v === 'string' ? v : (v?.brief || v?.focus || '')).filter(Boolean).join(' · ') || '本周重点聚焦动作质量与强度推进，保持恢复节奏。';
                          }
                          return String(brief);
                        })()}
                      </div>
                    </div>
                  )}

                  {/* ── 快速课前评估 ── */}
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(148,163,184,.25)' }}>
                    <div style={{ fontWeight: 700, color: 'var(--s700)', marginBottom: 8, fontSize: 12 }}>⚡ 快速课前评估</div>

                    {/* 恢复状态 */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--s500)', marginBottom: 4 }}>距上次训练恢复情况</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {RECOVERY_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPlanConfirmForm(prev => ({ ...prev, recoveryStatus: opt.value }))}
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              border: planConfirmForm.recoveryStatus === opt.value ? '1.5px solid var(--p)' : '1px solid var(--s200)',
                              background: planConfirmForm.recoveryStatus === opt.value ? 'var(--p2)' : '#fff',
                              color: planConfirmForm.recoveryStatus === opt.value ? 'var(--p)' : 'var(--s600)',
                              transition: 'all .15s',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 今日状态 */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--s500)', marginBottom: 4 }}>今日状态</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {TODAY_STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setPlanConfirmForm(prev => ({ ...prev, todayStatus: opt.value }))}
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              border: planConfirmForm.todayStatus === opt.value ? '1.5px solid var(--p)' : '1px solid var(--s200)',
                              background: planConfirmForm.todayStatus === opt.value ? 'var(--p2)' : '#fff',
                              color: planConfirmForm.todayStatus === opt.value ? 'var(--p)' : 'var(--s600)',
                              transition: 'all .15s',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 不适区域 */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'var(--s500)', marginBottom: 4 }}>不适区域（可多选）</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {DISCOMFORT_OPTIONS.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setPlanConfirmForm(prev => {
                                const cur = prev.discomfortAreas || [];
                                if (opt === '无不适') return { ...prev, discomfortAreas: ['无不适'] };
                                const next = cur.includes(opt)
                                  ? cur.filter(x => x !== opt)
                                  : [...cur.filter(x => x !== '无不适'), opt];
                                return { ...prev, discomfortAreas: next.length ? next : ['无不适'] };
                              });
                            }}
                            style={{
                              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              border: (planConfirmForm.discomfortAreas || []).includes(opt) ? '1.5px solid #ef4444' : '1px solid var(--s200)',
                              background: (planConfirmForm.discomfortAreas || []).includes(opt) ? '#fee2e2' : '#fff',
                              color: (planConfirmForm.discomfortAreas || []).includes(opt) ? '#b91c1c' : 'var(--s600)',
                              transition: 'all .15s',
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Pro/Elite 动力链提醒 */}
                    {(client?.membershipLevel === 'professional' || client?.membershipLevel === 'elite') && (
                      <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(207,122,37,.08)', border: '1px solid rgba(207,122,37,.3)', marginBottom: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(207,122,37,.9)', marginBottom: 4 }}>⚡ 动力链客户提醒</div>
                        {(client as any).trainingPhase && (
                          <div style={{ fontSize: 11, color: '#4B5563', marginBottom: 2 }}>
                            <span style={{ color: '#6B7280' }}>当前阶段：</span>
                            {(client as any).trainingPhase === 'neural_reset' ? '神经重置期' : (client as any).trainingPhase === 'activation' ? '激活建立期' : (client as any).trainingPhase === 'loading' ? '力量加载期' : '整合期'}
                          </div>
                        )}
                        {((client as any).problemChains?.length > 0) && (
                          <div style={{ fontSize: 11, color: '#4B5563', marginBottom: 2 }}>
                            <span style={{ color: '#6B7280' }}>问题力线：</span>{(client as any).problemChains.join('、')}
                          </div>
                        )}
                        {(client as any).compensationPattern && (
                          <div style={{ fontSize: 11, color: '#4B5563' }}>
                            <span style={{ color: '#6B7280' }}>代偿提醒：</span>{(client as any).compensationPattern}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 一键生成按钮 */}
                    <button
                      type="button"
                      disabled={anyLoading || !selectedDay}
                      onClick={openDayTierPicker}
                      style={{
                        width: '100%', padding: '8px 0', borderRadius: 8, fontSize: 13, fontWeight: 700,
                        border: 'none', cursor: anyLoading || !selectedDay ? 'not-allowed' : 'pointer',
                        background: anyLoading || !selectedDay ? 'var(--s200)' : 'linear-gradient(135deg, #5d66ed, #7c3aed)',
                        color: anyLoading || !selectedDay ? 'var(--s400)' : '#fff',
                        transition: 'all .2s',
                      }}
                    >
                      {loadingDay ? '生成中...' : '⚡ 根据以上状态生成训练'}
                    </button>
                  </div>
                </div>
              </div>
            )}
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
                ? (blockStep === 'form' ? '新建训练 Block' : `框架预览 · ${blockFramework?.block_name || ''}`)
                : aiConfirmMode === 'day'
                  ? '今日课程设置'
                  : `${selectedBlock?.title || 'Block'} · Week ${selectedWeek?.week_num || 1}`}
            </div>
            <div style={{ fontSize: 12, color: '#7B8498', marginBottom: 10 }}>
              {aiConfirmMode === 'full'
                ? (blockStep === 'form' ? '填写目标和参数，点击预览生成框架（不调用 AI）' : '确认后将直接创建 Block 和所有训练周')
                : aiConfirmMode === 'day'
                ? (dayPlanStep === 'tier'
                    ? `${selectedDay?.day || '周一'} · 第一步：选择今日课程档位`
                    : (<><div>{selectedDay?.day || '周一'} · {(selectedDay as any)?.name || (selectedDay as any)?.focus || '今日训练'}</div><div style={{ marginTop: 2 }}>{planConfirmForm.selectedTier === 'pro' ? '¥388 · 动力链' : '¥328 · 传统分化'}</div></>))

                : `${(selectedWeek as any)?.week_theme || ((selectedWeek as any)?.intensity_phase === 'deload' ? '卸载恢复' : (selectedWeek as any)?.intensity_phase === 'peak' ? '峰值冲击' : '渐进加载')} · 调整本周训练安排`}
            </div>

            {aiConfirmMode === 'full' ? (
              blockStep === 'form' ? (
                <div style={{ display: 'grid', gap: 11 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2638' }}>1. 本期训练重心（单选）</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginTop: 7 }}>
                      {TRAINING_FOCUS_OPTIONS.map(opt => (
                        <button key={opt.value} type="button"
                          onClick={() => setBlockFocus(opt.value)}
                          style={{
                            borderRadius: 10, padding: '10px 10px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2,
                            border: blockFocus === opt.value ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: blockFocus === opt.value ? '#F4F5FF' : '#FFF',
                            color: blockFocus === opt.value ? '#5A5EFF' : '#374151',
                          }}
                        >
                          <span style={{ fontSize: 16 }}>{opt.emoji} {opt.label}</span>
                          <span style={{ fontSize: 10, color: blockFocus === opt.value ? '#8A8DFF' : '#9CA3AF', fontWeight: 400 }}>{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2638' }}>2. 每周频率</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 7 }}>
                      {[2, 3, 4, 5].map(n => (
                        <button key={n} type="button"
                          onClick={() => setBlockFreq(n)}
                          style={{
                            borderRadius: 8, padding: '6px 2px', fontSize: 12, fontWeight: 700,
                            textAlign: 'center', cursor: 'pointer',
                            border: blockFreq === n ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: blockFreq === n ? '#F4F5FF' : '#FFF',
                            color: blockFreq === n ? '#5A5EFF' : '#7B8498',
                          }}
                        >{n}次</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2638' }}>3. 周期长度</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginTop: 7 }}>
                      {[2, 4, 6, 8, 12].map(n => (
                        <button key={n} type="button"
                          onClick={() => setBlockWeeks(n)}
                          style={{
                            borderRadius: 8, padding: '6px 2px', fontSize: 12, fontWeight: 700,
                            textAlign: 'center', cursor: 'pointer',
                            border: blockWeeks === n ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: blockWeeks === n ? '#F4F5FF' : '#FFF',
                            color: blockWeeks === n ? '#5A5EFF' : '#7B8498',
                          }}
                        >{n}周</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2638' }}>4. 教练备注（选填）</div>
                    <textarea
                      value={blockNote}
                      onChange={e => setBlockNote(e.target.value)}
                      placeholder="例：客户核心薄弱，先以稳定训练为主..."
                      style={{
                        marginTop: 6, width: '100%', minHeight: 48, borderRadius: 8,
                        border: '1px solid #D9DCE6', background: '#FFF',
                        padding: '7px 10px', fontSize: 12, color: '#25304A', outline: 'none',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#3D3F9F', marginBottom: 8 }}>
                    {blockFramework?.block_name}
                  </div>
                  <div style={{ display: 'grid', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
                    {(blockFramework?.weeks || []).map((w: any) => (
                      <div key={w.week_num} style={{
                        borderRadius: 8, padding: '7px 10px',
                        background: 'rgba(255,255,255,.75)', border: '1px solid #E4E7F0',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>Week {w.week_num}</span>
                          <span style={{ fontSize: 11, color: '#6B7280' }}>{w.week_title || w.week_theme || `Week ${w.week_num}`}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '1px 6px',
                            background: w.intensity_phase === 'deload' ? '#E0E2EA' : w.intensity_phase === 'peak' ? '#FDE9C8' : '#DBEAFE',
                            color: w.intensity_phase === 'deload' ? '#6B7280' : w.intensity_phase === 'peak' ? '#B45309' : '#1D4ED8',
                          }}>{w.intensity_phase}</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                          {(w.days || []).map((d: any) => (
                            <span key={d.day} style={{
                              fontSize: 10, color: '#5A5EFF', background: '#EEF0FF',
                              borderRadius: 4, padding: '1px 7px',
                            }}>{d.day} · {d.name}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : aiConfirmMode === 'week' ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {/* 只读训练日列表 */}
                <div style={{ background: 'rgba(255,255,255,.65)', borderRadius: 8, padding: '8px 10px', border: '1px solid #E4E7F0' }}>
                  {(selectedWeek?.days || []).length === 0 ? (
                    <div style={{ fontSize: 12, color: '#9CA3AF', textAlign: 'center', padding: '4px 0' }}>本周暂无训练日</div>
                  ) : (selectedWeek?.days || []).map((d: any) => (
                    <div key={d.id} style={{ fontSize: 12, color: '#374151', padding: '2px 0' }}>
                      {d.day} · {d.name || d.focus || ''}
                    </div>
                  ))}
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 5 }}>
                    系统已根据Block目标自动安排本周训练日
                  </div>
                </div>

                {/* 变动 Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>本周有变动</span>
                  <button
                    type="button"
                    onClick={() => setWeekHasChange(v => !v)}
                    style={{
                      width: 38, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
                      background: weekHasChange ? '#8A8DFF' : '#D1D5DB',
                      position: 'relative', transition: 'background .2s', flexShrink: 0,
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: 3,
                      left: weekHasChange ? 19 : 3, width: 16, height: 16,
                      borderRadius: '50%', background: '#FFF', transition: 'left .2s',
                    }} />
                  </button>
                </div>

                {/* 变动调整区域 */}
                {weekHasChange && (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {weekEditDays.map((d: any, i: number) => (
                      <div key={d.id || d.day} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={!!d.checked}
                          onChange={() => setWeekEditDays(prev => prev.map((x: any, xi: number) =>
                            xi === i ? { ...x, checked: !x.checked } : x
                          ))}
                          style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151', minWidth: 30 }}>{d.day}</span>
                        {d.editingFocus ? (
                          <input
                            type="text"
                            value={d.focus || ''}
                            autoFocus
                            onChange={e => setWeekEditDays(prev => prev.map((x: any, xi: number) =>
                              xi === i ? { ...x, focus: e.target.value, name: e.target.value } : x
                            ))}
                            onBlur={() => setWeekEditDays(prev => prev.map((x: any, xi: number) =>
                              xi === i ? { ...x, editingFocus: false } : x
                            ))}
                            style={{ flex: 1, fontSize: 12, border: '1px solid #D9DCE6', borderRadius: 6, padding: '3px 7px', outline: 'none' }}
                          />
                        ) : (
                          <span
                            onClick={() => setWeekEditDays(prev => prev.map((x: any, xi: number) =>
                              xi === i ? { ...x, editingFocus: true } : x
                            ))}
                            style={{ flex: 1, fontSize: 12, color: '#5A5EFF', cursor: 'text', borderBottom: '1px dashed #C4C8E0', paddingBottom: 1 }}
                          >{d.focus || d.name || '点击编辑训练重点'}</span>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        setWeekPhaseOverride('deload');
                        setWeekEditDays((prev: any[]) => prev.map((x: any, i: number) => ({
                          ...x, checked: i < 3, focus: '低强度恢复', name: '低强度恢复', editingFocus: false,
                        })));
                      }}
                      style={{
                        borderRadius: 8, border: '1px solid #D9DCE6', background: '#F9FAFB',
                        padding: '6px 10px', fontSize: 11, fontWeight: 700, color: '#6B7280',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >一键切换为 Deload 周</button>

                    <textarea
                      value={weekChangeNote}
                      onChange={e => setWeekChangeNote(e.target.value)}
                      placeholder="如：客户出差本周只能2次 / 膝盖不适避开下肢"
                      style={{
                        borderRadius: 8, border: '1px solid #D9DCE6', padding: '7px 10px',
                        fontSize: 12, color: '#25304A', outline: 'none', minHeight: 44, width: '100%',
                      }}
                    />
                  </div>
                )}
              </div>
            ) : dayPlanStep === 'tier' ? (
              /* ── Step 1: 选择档位 ── */
              <div style={{ display: 'grid', gap: 12 }}>
                {(() => {
                  const tierAccess: Record<string, string[]> = {
                    standard:     ['standard'],
                    advanced:     ['standard', 'pro'],
                    professional: ['standard', 'pro'],
                    elite:        ['standard', 'pro'],
                  };
                  const memberLevel = String((client as any)?.membershipLevel || 'standard');
                  const allowedTiers = tierAccess[memberLevel] || ['standard'];
                  return [
                    {
                      key: 'standard' as const,
                      price: '¥328',
                      label: '传统分化课程',
                      desc: '3模块 · 肌群感知 · 60min',
                      border: 'rgba(102,186,128,.46)',
                      bg: 'linear-gradient(145deg, rgba(214,246,223,.96), rgba(184,232,200,.9))',
                      color: 'rgba(26,88,49,.94)',
                    },
                    {
                      key: 'pro' as const,
                      price: '¥388',
                      label: '动力链训练课程',
                      desc: '4模块 · 动力链 · 70min',
                      border: 'rgba(154,127,232,.46)',
                      bg: 'linear-gradient(145deg, rgba(226,216,255,.96), rgba(204,188,249,.9))',
                      color: 'rgba(74,51,146,.94)',
                    },
                  ].map((tier) => {
                    const active = planConfirmForm.selectedTier === tier.key;
                    const locked = !allowedTiers.includes(tier.key);
                    return (
                      <button
                        key={tier.key}
                        type="button"
                        className={locked ? 'ultra-lock-card is-locked' : 'ultra-lock-card'}
                        disabled={locked}
                        onClick={() => !locked && setPlanConfirmForm((prev) => ({ ...prev, selectedTier: tier.key }))}
                        style={{
                          border: active ? '2px solid rgba(81,98,238,.82)' : `1px solid ${locked ? 'rgba(200,203,214,.5)' : tier.border}`,
                          borderRadius: 10,
                          padding: '10px 12px',
                          textAlign: 'left',
                          background: locked ? 'linear-gradient(145deg, rgba(239,239,242,.94), rgba(220,223,232,.9))' : tier.bg,
                          color: locked ? 'rgba(150,156,174,.9)' : tier.color,
                          cursor: locked ? 'not-allowed' : 'pointer',
                          opacity: locked ? 0.78 : 1,
                          position: 'relative',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.04em' }}>
                            {tier.price} · {tier.label}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 3, opacity: .84 }}>{tier.desc}</div>
                        </div>
                        {active && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(81,98,238,.9)' }}>✓ 已选</div>
                        )}
                        {locked && (
                          <div style={{
                            fontSize: 10, fontWeight: 700, borderRadius: 999,
                            padding: '2px 7px', whiteSpace: 'nowrap',
                            color: 'rgba(70,79,104,.9)',
                            background: 'rgba(255,255,255,.7)',
                            border: '1px solid rgba(164,173,198,.6)',
                          }}>🔒 需升级会员</div>
                        )}
                      </button>
                    );
                  });
                })()}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, gap: 8 }}>
                  <button type="button" onClick={() => setAiConfirmMode(null)}
                    style={{ height: 32, borderRadius: 8, border: '1px solid rgba(167,178,211,.58)',
                      background: 'rgba(242,246,255,.86)', color: 'rgba(56,66,96,.88)',
                      padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    取消
                  </button>
                  <button type="button"
                    onClick={() => {
                      if (!planConfirmForm.selectedTier) {
                        setError('请先选择课程档位');
                        return;
                      }
                      setDayPlanStep('detail');
                    }}
                    style={{ height: 32, borderRadius: 8, border: 'none',
                      background: 'linear-gradient(120deg, rgba(124,132,244,.92), rgba(112,121,236,.88))',
                      color: '#fff', padding: '0 16px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    下一步 →
                  </button>
                </div>
              </div>
            ) : (
              /* ── Step 2: 填写详情 ── */
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(138,141,255,.1), rgba(90,94,255,.06))', border: '1px solid rgba(138,141,255,.3)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#5A5EFF', marginBottom: 4 }}>📋 今日训练方向（来自周规划）</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1E2638' }}>{(selectedDay as any)?.name || (selectedDay as any)?.focus || selectedDay?.day || '今日训练'}</div>
                  {(selectedWeek as any)?.week_theme && (
                    <div style={{ fontSize: 11, color: '#7B8498', marginTop: 3 }}>本周主题：{(selectedWeek as any).week_theme}</div>
                  )}
                  {(selectedWeek as any)?.week_brief && (
                    <div style={{ fontSize: 11, color: '#7B8498', marginTop: 2 }}>说明：{(selectedWeek as any).week_brief}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>1. 恢复状态</div>
                  <div style={{ fontSize: 12, color: '#7B8498', marginTop: 2 }}>上次训练距今多久？身体感觉如何？</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8 }}>
                    {RECOVERY_OPTIONS.map((opt) => {
                      const on = planConfirmForm.recoveryStatus === opt.value;
                      return (
                        <button key={opt.value} type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, recoveryStatus: opt.value }))}
                          style={{ borderRadius: 12, border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF', padding: '8px 6px', textAlign: 'center', cursor: 'pointer' }}>
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
                        <button key={opt.value} type="button"
                          onClick={() => setPlanConfirmForm((prev) => ({ ...prev, todayStatus: opt.value }))}
                          style={{ borderRadius: 12, border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF', padding: '8px 6px', textAlign: 'center', cursor: 'pointer' }}>
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
                        <button key={area} type="button" onClick={() => toggleDiscomfortArea(area)}
                          style={{ borderRadius: 12, border: on ? '2px solid #8A8DFF' : '1px solid #D9DCE6',
                            background: on ? '#F4F5FF' : '#FFFFFF', padding: '7px 11px',
                            fontSize: 13, fontWeight: 600, color: '#202737', cursor: 'pointer' }}>
                          {area}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#1E2638' }}>4. 教练备注（可选）</div>
                  <textarea value={planConfirmForm.preSessionNote}
                    onChange={(e) => setPlanConfirmForm((prev) => ({ ...prev, preSessionNote: e.target.value }))}
                    placeholder="例如：客户昨晚失眠，注意控制强度..."
                    style={{ marginTop: 8, width: '100%', minHeight: 64, borderRadius: 12,
                      border: '1px solid #D9DCE6', background: '#FFFFFF', padding: '9px 10px',
                      fontSize: 13, color: '#25304A', outline: 'none' }} />
                </div>

                {/* Pro/Elite 动力链客户信息 */}
                {(client?.membershipLevel === 'professional' || client?.membershipLevel === 'elite') && (
                  <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(207,122,37,.08)', border: '1px solid rgba(207,122,37,.3)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(207,122,37,.9)', marginBottom: 6 }}>⚡ 动力链客户档案</div>
                    {(client as any).trainingPhase && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#7B8498' }}>当前训练阶段</span>
                        <span style={{ fontWeight: 700, color: '#1E2638' }}>
                          {(client as any).trainingPhase === 'neural_reset' ? '神经重置期' : (client as any).trainingPhase === 'activation' ? '激活建立期' : (client as any).trainingPhase === 'loading' ? '力量加载期' : '整合期'}
                        </span>
                      </div>
                    )}
                    {((client as any).problemChains?.length > 0) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#7B8498' }}>主要问题力线</span>
                        <span style={{ fontWeight: 700, color: '#1E2638' }}>{(client as any).problemChains.join('、')}</span>
                      </div>
                    )}
                    {(client as any).compensationPattern && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#7B8498' }}>代偿情况</span>
                        <span style={{ fontWeight: 700, color: '#1E2638' }}>{(client as any).compensationPattern}</span>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <button type="button" onClick={() => setDayPlanStep('tier')}
                    style={{ height: 32, borderRadius: 8, border: '1px solid rgba(167,178,211,.58)',
                      background: 'rgba(242,246,255,.86)', color: 'rgba(56,66,96,.88)',
                      padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    ← 返回
                  </button>
                  <button type="button" onClick={handleConfirmGenerate}
                    style={{ height: 32, borderRadius: 8, border: 'none',
                      background: 'linear-gradient(120deg, rgba(124,132,244,.92), rgba(112,121,236,.88))',
                      color: '#fff', padding: '0 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    生成单次训练计划
                  </button>
                </div>
              </div>
            )}
            {/* full/week 模式的底部按钮 */}
            {aiConfirmMode !== 'day' && (
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
                {aiConfirmMode === 'full'
                  ? (blockFrameworkLoading ? '生成中...' : blockStep === 'form' ? '预览框架' : '确认创建')
                  : '确认应用'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (aiConfirmMode === 'full' && blockStep === 'preview') {
                    setBlockStep('form');
                  } else {
                    setAiConfirmMode(null);
                  }
                }}
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
                {aiConfirmMode === 'full' && blockStep === 'preview' ? '返回修改' : '取消'}
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* AI 课程审核弹窗 */}
      {aiPreviewMode && aiPreviewData && (
        <AiReviewModal
          mode={aiPreviewMode}
          data={aiPreviewData}
          onClose={() => setGeneratedPreview({ type: null, data: null })}
          onConfirm={(updatedData) => {
            try {
              if (aiPreviewMode === 'day') {
                // 把教练修改后的数据写回 aiPreviewData 再保存
                (aiPreviewData as any).modules = updatedData.modules;
                (aiPreviewData as any).session_name = updatedData.session_name;
                confirmSaveDayPlanFromPreview();
              } else if (aiPreviewMode === 'week') applyWeekPlanPreview(aiPreviewData);
              else if (aiPreviewMode === 'full') confirmSaveFullPlanFromPreview();
            } catch (e: any) {
              console.error('[PlanningPage] 确认应用失败:', e);
              setError('应用失败：' + (e?.message || String(e)));
            }
          }}
        />
      )}

      {publishConfirmOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(19,24,40,.34)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setPublishConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(560px, 100%)',
              borderRadius: 14,
              border: '1px solid rgba(202,208,224,.9)',
              background: '#fff',
              boxShadow: '0 18px 38px rgba(31,41,74,.22)',
              padding: 16,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#202737', marginBottom: 4 }}>发布前差异预览</div>
            <div style={{ fontSize: 12, color: '#7B8498', marginBottom: 10 }}>确认后将把当前草稿同步到学员端。</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {publishDiffSummary.map((line) => (
                <div key={line} style={{ padding: '8px 10px', borderRadius: 8, background: '#F8F9FD', fontSize: 13, color: '#25304A' }}>
                  {line}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                type="button"
                onClick={() => setPublishConfirmOpen(false)}
                style={{
                  height: 32, borderRadius: 8, border: '1px solid #D9DCE6', background: '#fff', padding: '0 12px',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#4b5565',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={loadingPublish ? undefined : () => void publishPlanToStudent()}
                style={{
                  height: 32, borderRadius: 8, border: 'none', background: '#5d66ed', padding: '0 12px',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff',
                }}
              >
                {loadingPublish ? '发布中...' : '确认发布'}
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

// ─── AI 课程审核弹窗 ──────────────────────────────────────────────────────────
const MODULE_COLORS = [
  { bg: 'rgba(237,233,254,.6)', border: '#a78bfa', label: '#7c3aed' },
  { bg: 'rgba(209,250,229,.6)', border: '#6ee7b7', label: '#065f46' },
  { bg: 'rgba(255,237,213,.6)', border: '#fcd34d', label: '#92400e' },
  { bg: 'rgba(219,234,254,.6)', border: '#93c5fd', label: '#1e40af' },
  { bg: 'rgba(252,231,243,.6)', border: '#f9a8d4', label: '#9d174d' },
];

function AiReviewModal({
  mode, data, onClose, onConfirm,
}: {
  mode: 'day' | 'week' | 'full';
  data: any;
  onClose: () => void;
  onConfirm: (updated: any) => void;
}) {
  const [modules, setModules] = useState<any[]>(() =>
    Array.isArray(data?.modules) ? data.modules.map((m: any) => ({
      ...m,
      _confirmed: false,
      exercises: (m.exercises || []).map((ex: any) => ({ ...ex })),
    })) : []
  );
  const [sessionName, setSessionName] = useState(data?.session_name || '');
  const confirmed = modules.filter(m => m._confirmed).length;
  const total = modules.length;
  const allDone = total > 0 && confirmed === total;

  const toggleConfirm = (idx: number) => {
    setModules(prev => prev.map((m, i) => i === idx ? { ...m, _confirmed: !m._confirmed } : m));
  };

  const updateExercise = (modIdx: number, exIdx: number, field: string, value: any) => {
    setModules(prev => prev.map((m, i) => i !== modIdx ? m : {
      ...m,
      exercises: m.exercises.map((ex: any, j: number) => j !== exIdx ? ex : { ...ex, [field]: value }),
    }));
  };

  const deleteExercise = (modIdx: number, exIdx: number) => {
    setModules(prev => prev.map((m, i) => i !== modIdx ? m : {
      ...m,
      exercises: m.exercises.filter((_: any, j: number) => j !== exIdx),
    }));
  };

  // 周/全局预览（只读展示，不做动作级编辑）
  if (mode !== 'day') {
    const items = mode === 'week' ? (data?.days || []) : (data?.blocks || []);
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={onClose}>
        <div style={{ background:'#fff', borderRadius:14, padding:24, maxWidth:600, width:'90%', maxHeight:'80vh', overflow:'auto', boxShadow:'0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize:17, fontWeight:700, color:'#202737', marginBottom:16 }}>
            {mode === 'week' ? '周计划预览' : '完整规划预览'}
          </div>
          {items.map((item: any, i: number) => (
            <div key={i} style={{ padding:12, borderRadius:10, border:'1px solid #e2e8f0', marginBottom:8, background:'#f8fafc' }}>
              <div style={{ fontWeight:600, fontSize:13, color:'#202737' }}>{item.session_name || item.title || `项目 ${i+1}`}</div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:3 }}>{item.day_focus || `${(item.training_weeks||[]).length} 周`}</div>
            </div>
          ))}
          <div style={{ display:'flex', gap:10, marginTop:20, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f1f5f9', fontSize:13, fontWeight:600, color:'#64748b', cursor:'pointer' }}>取消</button>
            <button onClick={() => onConfirm(data)} style={{ padding:'8px 18px', borderRadius:8, border:'none', background:'#5d66ed', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>确认应用</button>
          </div>
        </div>
      </div>
    );
  }

  // 日计划审核界面（完整版）
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(15,20,40,.6)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={onClose}>
      <div style={{ background:'#f8fafc', borderRadius:16, width:'min(860px,96vw)', maxHeight:'92vh', overflow:'hidden', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,.35)' }} onClick={e => e.stopPropagation()}>

        {/* 顶部 header */}
        <div style={{ padding:'16px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <input
              value={sessionName}
              onChange={e => setSessionName(e.target.value)}
              style={{ fontSize:16, fontWeight:700, color:'#202737', border:'none', outline:'none', background:'transparent', width:'100%' }}
              placeholder="课程名称"
            />
            <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>AI 课程草稿 · 教练审核中</div>
          </div>
          {/* 进度条 */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:120, height:6, background:'#e2e8f0', borderRadius:3, overflow:'hidden' }}>
              <div style={{ height:'100%', background: allDone ? '#10b981' : '#5d66ed', borderRadius:3, width:`${total ? (confirmed/total)*100 : 0}%`, transition:'width .3s' }} />
            </div>
            <span style={{ fontSize:12, color:'#64748b', whiteSpace:'nowrap' }}>{confirmed}/{total} 已确认</span>
          </div>
        </div>

        {/* 内容区 */}
        <div style={{ flex:1, overflow:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
          {modules.map((mod, modIdx) => {
            const col = MODULE_COLORS[modIdx % MODULE_COLORS.length];
            const isWarning = mod._ai_flag === 'compensation'; // 上节课有代偿时AI可标记
            return (
              <div key={modIdx} style={{
                border: isWarning ? '1.5px solid #f87171' : `1px solid ${col.border}`,
                borderRadius:12, overflow:'hidden',
                background: isWarning ? 'rgba(254,226,226,.4)' : col.bg,
              }}>
                {/* 模块头 */}
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', borderBottom:`1px solid ${col.border}40` }}>
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:13, fontWeight:700, color: col.label }}>{mod.module_name}</span>
                    <span style={{ fontSize:11, color:'#94a3b8', marginLeft:8 }}>{mod.module_duration || ''} · {mod.format || ''}</span>
                  </div>
                  {isWarning && (
                    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:'#fee2e2', color:'#b91c1c', fontWeight:600 }}>⚠ 上次代偿</span>
                  )}
                  <button
                    onClick={() => toggleConfirm(modIdx)}
                    style={{
                      padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, cursor:'pointer',
                      border: mod._confirmed ? '1px solid #10b981' : '1px solid #cbd5e1',
                      background: mod._confirmed ? '#ecfdf5' : '#fff',
                      color: mod._confirmed ? '#065f46' : '#64748b',
                      transition:'all .15s',
                    }}
                  >
                    {mod._confirmed ? '✓ 已确认' : '确认'}
                  </button>
                </div>

                {/* 动作列表 */}
                <div style={{ padding:'8px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                  {(mod.exercises || []).map((ex: any, exIdx: number) => (
                    <div key={exIdx} style={{ background:'rgba(255,255,255,.8)', borderRadius:8, padding:'8px 12px', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                      {ex.group_tag && (
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 5px', borderRadius:4, background:`${col.label}18`, color:col.label, flexShrink:0 }}>{ex.group_tag}</span>
                      )}
                      {/* 动作名 */}
                      <input
                        value={ex.name}
                        onChange={e => updateExercise(modIdx, exIdx, 'name', e.target.value)}
                        style={{ flex:2, minWidth:120, fontSize:13, fontWeight:600, border:'none', outline:'none', background:'transparent', color:'#202737' }}
                      />
                      {/* 组数 */}
                      <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
                        <button onClick={() => updateExercise(modIdx, exIdx, 'sets', Math.max(1, (ex.sets||3)-1))} style={{ width:22, height:22, borderRadius:4, border:'1px solid #e2e8f0', background:'#f1f5f9', cursor:'pointer', fontSize:12 }}>-</button>
                        <span style={{ fontSize:13, fontWeight:600, minWidth:18, textAlign:'center' }}>{ex.sets||3}</span>
                        <button onClick={() => updateExercise(modIdx, exIdx, 'sets', (ex.sets||3)+1)} style={{ width:22, height:22, borderRadius:4, border:'1px solid #e2e8f0', background:'#f1f5f9', cursor:'pointer', fontSize:12 }}>+</button>
                        <span style={{ fontSize:11, color:'#94a3b8' }}>组</span>
                      </div>
                      {/* 次数 */}
                      <input
                        value={ex.reps}
                        onChange={e => updateExercise(modIdx, exIdx, 'reps', e.target.value)}
                        style={{ width:54, fontSize:12, textAlign:'center', border:'1px solid #e2e8f0', borderRadius:6, padding:'3px 4px', background:'#f8fafc', color:'#202737' }}
                        placeholder="10次"
                      />
                      {/* 节奏标签 */}
                      {ex.rhythm && (
                        <span style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background:'#f1f5f9', color:'#5d66ed', fontWeight:700, flexShrink:0 }}>{ex.rhythm}</span>
                      )}
                      {/* Cue提示 */}
                      {ex.cue && (
                        <span style={{ fontSize:11, color:'#7c3aed', flex:3, minWidth:80, fontStyle:'italic' }}>"{ex.cue}"</span>
                      )}
                      {/* 删除 */}
                      <button onClick={() => deleteExercise(modIdx, exIdx)} style={{ width:20, height:20, borderRadius:4, border:'none', background:'transparent', color:'#cbd5e1', cursor:'pointer', fontSize:14, lineHeight:1, flexShrink:0 }}>✕</button>
                    </div>
                  ))}

                  {/* 强制动作提示 */}
                  {mod._forced && (
                    <div style={{ fontSize:11, color:'#92400e', padding:'6px 10px', borderRadius:6, background:'rgba(252,211,77,.2)', border:'1px solid #fcd34d' }}>
                      ⚠ 强制动作：{mod._forced_reason || '此模块不可删除'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部操作栏 */}
        <div style={{ padding:'14px 20px', background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
          <div style={{ fontSize:12, color:'#94a3b8', flex:1 }}>
            {allDone ? '✓ 所有模块已确认，可以保存' : `还有 ${total - confirmed} 个模块待确认`}
          </div>
          <button onClick={onClose} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid #e2e8f0', background:'#f1f5f9', fontSize:13, fontWeight:600, color:'#64748b', cursor:'pointer' }}>取消</button>
          <button
            disabled={!allDone}
            onClick={() => onConfirm({ session_name: sessionName, modules })}
            style={{
              padding:'8px 20px', borderRadius:8, border:'none', fontSize:13, fontWeight:600, cursor: allDone ? 'pointer' : 'not-allowed',
              background: allDone ? '#5d66ed' : '#e2e8f0',
              color: allDone ? '#fff' : '#94a3b8',
              transition:'all .2s',
            }}
          >
            确认保存课程
          </button>
        </div>
      </div>
    </div>
  );
}
