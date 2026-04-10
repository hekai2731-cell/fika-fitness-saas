import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import type { Client } from '@/lib/db';
import { calcBodyAssetScore } from '@/lib/bodyAssetScore';
import { loadClients, saveClient as saveClientAsync, saveClients } from '@/lib/store';

type MembershipLevel = 'standard' | 'advanced' | 'professional' | 'elite';

type GoalType = NonNullable<Client['goal_type']>;
type InjuryLevel = NonNullable<NonNullable<Client['injury_detail']>['level']>;

function initials(name: string) {
  const s = (name || '').trim();
  if (!s) return 'FI';
  return s.slice(0, 2).toUpperCase();
}

const tierMeta: Record<MembershipLevel, { label: string; cn: string; accent: string; soft: string; ring: string; storeTier: NonNullable<Client['tier']> }> = {
  standard: {
    label: 'Standard',
    cn: '基础会员',
    accent: '#24262D',
    soft: 'rgba(36,38,45,.14)',
    ring: 'rgba(36,38,45,.3)',
    storeTier: 'standard',
  },
  advanced: {
    label: 'Advanced',
    cn: '进阶会员',
    accent: '#2F8A56',
    soft: 'rgba(47,138,86,.16)',
    ring: 'rgba(47,138,86,.3)',
    storeTier: 'pro',
  },
  professional: {
    label: 'Professional',
    cn: '专业会员',
    accent: '#CF7A25',
    soft: 'rgba(207,122,37,.16)',
    ring: 'rgba(207,122,37,.3)',
    storeTier: 'pro',
  },
  elite: {
    label: 'Elite',
    cn: '至尊会员',
    accent: '#C33B3B',
    soft: 'rgba(195,59,59,.16)',
    ring: 'rgba(195,59,59,.3)',
    storeTier: 'ultra',
  },
};

const goalTypeOptions: Array<{ value: GoalType; label: string }> = [
  { value: 'muscle_gain', label: '增肌' },
  { value: 'fat_loss', label: '减脂' },
  { value: 'performance', label: '提升运动表现' },
  { value: 'rehabilitation', label: '功能性康复' },
];

const injuryLevelOptions: Array<{ value: InjuryLevel; label: string }> = [
  { value: 'mild', label: '轻度' },
  { value: 'moderate', label: '中度' },
  { value: 'avoid', label: '需回避' },
];

const tierStandardMap: Record<MembershipLevel, { bf: string; rhr: string; strength: string }> = {
  standard: { bf: '男 15-22% / 女 23-30%', rhr: '男 ≤ 68 / 女 ≤ 72', strength: '深蹲≥0.8xBW, 硬拉≥1.0xBW' },
  advanced: { bf: '男 12-19% / 女 20-27%', rhr: '男 ≤ 65 / 女 ≤ 70', strength: '深蹲≥1.0xBW, 硬拉≥1.2xBW' },
  professional: { bf: '男 10-18% / 女 18-26%', rhr: '男 ≤ 62 / 女 ≤ 68', strength: '深蹲≥1.2xBW, 硬拉≥1.5xBW' },
  elite: { bf: '男 8-15% / 女 16-24%', rhr: '男 ≤ 58 / 女 ≤ 64', strength: '深蹲≥1.4xBW, 硬拉≥1.8xBW' },
};

const dimLabelMap = {
  bodyComp: '体成分',
  performance: '运动表现',
  nutrition: '营养合规',
  recovery: '恢复质量',
  execution: '执行率',
} as const;

const dimMaxMap = {
  bodyComp: 20,
  performance: 25,
  nutrition: 20,
  recovery: 20,
  execution: 15,
} as const;

function toNum(input: string): number | undefined {
  const n = Number(input);
  return Number.isFinite(n) ? n : undefined;
}

function parseLiftWeight(raw: any): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const n = Number(String(raw || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function extractLiftRatios(client: Client): { squat: number; deadlift: number } {
  const sessions = Array.isArray(client.sessions) ? client.sessions : [];
  const bw = Number(client.weight || 0);
  if (bw <= 0) return { squat: 0, deadlift: 0 };

  let maxSquat = 0;
  let maxDeadlift = 0;

  sessions.forEach((s: any) => {
    const modules = Array.isArray(s?.modules) ? s.modules : [];
    modules.forEach((m: any) => {
      const exs = Array.isArray(m?.exercises) ? m.exercises : [];
      exs.forEach((ex: any) => {
        const name = String(ex?.name || '').toLowerCase();
        const w = parseLiftWeight(ex?.weight);
        if (!w) return;
        if (name.includes('squat') || name.includes('深蹲')) maxSquat = Math.max(maxSquat, w);
        if (name.includes('deadlift') || name.includes('硬拉')) maxDeadlift = Math.max(maxDeadlift, w);
      });
    });
  });

  return {
    squat: maxSquat > 0 ? Number((maxSquat / bw).toFixed(2)) : 0,
    deadlift: maxDeadlift > 0 ? Number((maxDeadlift / bw).toFixed(2)) : 0,
  };
}

export function ClientsPage({
  onSelect,
  selectedClientId,
}: {
  onSelect: (clientId: string) => void;
  selectedClientId: string | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [metricLabels, setMetricLabels] = useState<string[]>(['体重 / WEIGHT', '身高 / HEIGHT', '年龄 / AGE', '体脂指数 / BMI', '肌肉量 / MUSCLE', '基础代谢 / BMR', '训练周期 / BLOCKS', '训练课次 / SESSIONS']);
  const [editingMetric, setEditingMetric] = useState<number | null>(null);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [assessmentDraft, setAssessmentDraft] = useState({
    bf_pct: '',
    smm_pct: '',
    waist_cm: '',
    rhr: '',
    sleep_hours: '',
    training_age_months: '',
  });

  const tierOrder: MembershipLevel[] = ['standard', 'advanced', 'professional', 'elite'];

  const metricLabelMap: Record<string, string> = {
    WEIGHT: '体重 / WEIGHT',
    HEIGHT: '身高 / HEIGHT',
    AGE: '年龄 / AGE',
    BMI: '体脂指数 / BMI',
    MUSCLE: '肌肉量 / MUSCLE',
    BMR: '基础代谢 / BMR',
    BLOCKS: '训练周期 / BLOCKS',
    SESSIONS: '训练课次 / SESSIONS',
  };

  const resolveMembershipLevel = (c: Client | null): MembershipLevel => {
    if (!c) return 'standard';
    const stored = (c as any).membershipLevel as MembershipLevel | undefined;
    if (stored && tierOrder.includes(stored)) return stored;
    if (c.tier === 'ultra') return 'elite';
    if (c.tier === 'pro') return 'professional';
    return 'standard';
  };

  useEffect(() => {
    const list = loadClients().filter((c) => c.name !== '示例客户');
    setClients(list);
    if (list.length > 0) {
      if (selectedClientId && list.some((c) => c.id === selectedClientId)) setActiveId(selectedClientId);
      else setActiveId(list[0].id);
    }
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    if (clients.some((c) => c.id === selectedClientId)) {
      setActiveId(selectedClientId);
    }
  }, [clients, selectedClientId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('fika_clients_copy');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        metricLabels?: string[];
      };
      if (Array.isArray(parsed.metricLabels) && parsed.metricLabels.length >= 8) setMetricLabels(parsed.metricLabels.slice(0, 8));
    } catch {
      // ignore
    }
  }, []);

  const handleMetricValueEdit = (idx: number, value: string) => {
    if (!activeClient) return;
    
    const numericValue = value.replace(/[^0-9.]/g, '');
    
    const updatedClient = { ...activeClient };
    
    // Direct update client data based on metric index
    if (idx === 0) updatedClient.weight = numericValue ? parseFloat(numericValue) : undefined;
    if (idx === 1) updatedClient.height = numericValue ? parseFloat(numericValue) : undefined;
    if (idx === 2) updatedClient.age = numericValue ? parseInt(numericValue) : undefined;
    
    persistClient(updatedClient);
  };

  const persistClient = (next: Client) => {
    const updatedClients = clients.map((c) => (c.id === next.id ? next : c));
    setClients(updatedClients);
    saveClients(updatedClients);
    void saveClientAsync(next);
  };

  const activeClient = useMemo(() => clients.find((c) => c.id === activeId) || clients[0] || null, [clients, activeId]);

  useEffect(() => {
    if (!showQrModal || !activeClient?.roadCode) {
      setQrDataUrl('');
      return;
    }
    const link = `https://saas.fikafitness.com/survey?code=${activeClient.roadCode}`;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((data: string) => {
        setQrDataUrl(data);
        setQrError(null);
      })
      .catch((e: unknown) => {
        console.error('[clients] qrcode generate failed', e);
        setQrError('二维码生成失败，请稍后重试');
      });
  }, [showQrModal, activeClient?.roadCode]);

  const activeTier = resolveMembershipLevel(activeClient);
  const tier = tierMeta[activeTier];

  const switchTier = (nextTier: MembershipLevel) => {
    if (!activeClient) return;
    persistClient({ ...activeClient, tier: tierMeta[nextTier].storeTier, membershipLevel: nextTier } as Client);
  };

  const updateGoalType = (goalType: GoalType) => {
    if (!activeClient) return;
    const label = goalTypeOptions.find((g) => g.value === goalType)?.label || '';
    persistClient({ ...activeClient, goal_type: goalType, goal: label || activeClient.goal } as Client);
  };

  const updateInjuryField = (patch: Partial<NonNullable<Client['injury_detail']>>) => {
    if (!activeClient) return;
    const nextInjury = { ...(activeClient.injury_detail || {}), ...patch };
    const text = [nextInjury.area || '', nextInjury.level || '', nextInjury.forbidden_moves || ''].filter(Boolean).join(' / ');
    persistClient({ ...activeClient, injury_detail: nextInjury, injury: text || activeClient.injury } as Client);
  };

  const addAssessmentRecord = () => {
    if (!activeClient) return;

    const bodyMetrics = {
      ...(activeClient.bodyMetrics || {}),
      bf_pct: toNum(assessmentDraft.bf_pct),
      smm_pct: toNum(assessmentDraft.smm_pct),
      waist_cm: toNum(assessmentDraft.waist_cm),
      rhr: toNum(assessmentDraft.rhr),
      sleep_hours: toNum(assessmentDraft.sleep_hours),
      training_age_months: toNum(assessmentDraft.training_age_months),
    };

    const previewScore = calcBodyAssetScore({ ...activeClient, bodyMetrics } as Client).total;
    const record = {
      date: new Date().toISOString().slice(0, 10),
      weight: activeClient.weight,
      bf_pct: bodyMetrics.bf_pct,
      smm_pct: bodyMetrics.smm_pct,
      rhr: bodyMetrics.rhr,
      score_snapshot: previewScore,
    };

    persistClient({
      ...activeClient,
      bodyMetrics,
      assessments: [...(activeClient.assessments || []), record],
    } as Client);

    setShowAssessmentForm(false);
    setAssessmentDraft({
      bf_pct: '',
      smm_pct: '',
      waist_cm: '',
      rhr: '',
      sleep_hours: '',
      training_age_months: '',
    });
  };

  if (!activeClient) {
    return <div style={{ fontSize: 13, color: 'var(--s500)' }}>暂无客户数据</div>;
  }

  const score = calcBodyAssetScore(activeClient);
  const liftRatios = extractLiftRatios(activeClient);
  const standards = tierStandardMap[activeTier];

  const latestAssessments = [...(activeClient.assessments || [])]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)
    .reverse();

  const trendPoints = latestAssessments
    .map((a) => Number(a.score_snapshot || 0))
    .filter((n) => Number.isFinite(n) && n >= 0);

  const bfText = typeof activeClient.bodyMetrics?.bf_pct === 'number' ? `${activeClient.bodyMetrics.bf_pct}%` : '待录入';
  const rhrText = typeof activeClient.bodyMetrics?.rhr === 'number' ? `${activeClient.bodyMetrics.rhr} bpm` : '待录入';
  const strengthText = liftRatios.squat > 0 || liftRatios.deadlift > 0
    ? `深蹲 ${liftRatios.squat || '--'}x / 硬拉 ${liftRatios.deadlift || '--'}x`
    : '待录入';

  const metricCards = [
    { v: activeClient.weight ?? '--', unit: 'kg', tone: '#4F5BDF' },
    { v: activeClient.height ?? '--', unit: 'cm', tone: '#5E6579' },
    { v: activeClient.age ?? '--', unit: '岁', tone: '#D14A63' },
    { v: activeClient.height && activeClient.weight ? (activeClient.weight / ((activeClient.height / 100) * (activeClient.height / 100))).toFixed(1) : '--', unit: '', tone: '#59637B' },
    { v: activeClient.weight ? Math.max(20, activeClient.weight * 0.45).toFixed(1) : '--', unit: 'kg', tone: '#4D5EDB' },
    { v: activeClient.weight && activeClient.height && activeClient.age ? Math.round(10 * activeClient.weight + 6.25 * activeClient.height - 5 * activeClient.age + 5) : '--', unit: 'kcal', tone: '#5E6579' },
    { v: (activeClient.blocks || []).length, unit: '', tone: '#5662E6' },
    { v: (activeClient.sessions || []).length, unit: '', tone: '#7A7F90' },
  ];

  const scoreDims = [
    { key: 'bodyComp', value: score.breakdown.bodyComp, max: dimMaxMap.bodyComp, available: score.available.bodyComp },
    { key: 'performance', value: score.breakdown.performance, max: dimMaxMap.performance, available: score.available.performance },
    { key: 'nutrition', value: score.breakdown.nutrition, max: dimMaxMap.nutrition, available: score.available.nutrition },
    { key: 'recovery', value: score.breakdown.recovery, max: dimMaxMap.recovery, available: score.available.recovery },
    { key: 'execution', value: score.breakdown.execution, max: dimMaxMap.execution, available: score.available.execution },
  ] as const;

  return (
    <div className="clients-premium">
      <div className="clients-layout">
        <div>
          <div className="head-profile" style={{ borderColor: tier.ring }}>
            <div className="avatar-orb" style={{ boxShadow: `0 0 0 2px ${tier.ring}` }}>{initials(activeClient.name)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="head-name">{activeClient.name}</div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="tier-pill" style={{ color: tier.accent, background: tier.soft }}>{tier.cn} / {tier.label} MEMBER</span>
                <span className="head-loc">上海 / Shanghai, CN</span>
                <button
                  type="button"
                  onClick={() => setShowQrModal(true)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${activeClient.profile?.survey_completed_at ? 'rgba(34,197,94,.45)' : 'rgba(109,84,234,.45)'}`,
                    background: activeClient.profile?.survey_completed_at ? 'rgba(34,197,94,.12)' : 'rgba(109,84,234,.12)',
                    color: activeClient.profile?.survey_completed_at ? '#15803d' : '#5a41d6',
                    fontSize: 12,
                    fontWeight: 800,
                    padding: '5px 10px',
                    cursor: 'pointer',
                  }}
                >
                  {activeClient.profile?.survey_completed_at ? '已填写 ✓' : '问卷二维码'}
                </button>
              </div>
            </div>
            <div className="head-week">第 {activeClient.current_week || 1} 周 / Week {activeClient.current_week || 1}</div>
          </div>

  
          <div className="section-cap">• BODY COMPOSITION METRICS（身体成分指标）</div>
          <div className="metrics-grid">
            {metricCards.map((m, idx) => (
              <div key={`${idx}-${metricLabels[idx]}`} className="metric-card">
                <div className="metric-k">{metricLabelMap[metricLabels[idx]] || metricLabels[idx]}</div>
                <div 
                  className="metric-v" 
                  style={{ 
                    color: m.tone,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'baseline'
                  }}
                  onDoubleClick={() => {
                    if (idx < 6) { // 只允许前6个指标编辑数值
                      setEditingMetric(idx);
                    }
                  }}
                >
                  {editingMetric === idx ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end' }}>
                      <input
                        className="metric-input"
                        type="number"
                        value={m.v}
                        onChange={(e) => handleMetricValueEdit(idx, e.target.value)}
                        onBlur={() => setEditingMetric(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingMetric(null);
                          }
                        }}
                        autoFocus
                        style={{
                          width: '100px',
                          fontSize: '30px',
                          fontWeight: 900,
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          outline: 'none',
                          textAlign: 'right'
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#7B8194', marginLeft: 4 }}>{m.unit}</span>
                    </div>
                  ) : (
                    <>
                      {m.v}
                      <span style={{ fontSize: 13, color: '#7B8194', marginLeft: 4 }}>{m.unit}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="section-cap" style={{ marginTop: 18 }}>• BODY ASSET SCORE（身体资产评分）</div>
          <div className="assessment-card">
            <div className="assessment-title" style={{ fontSize: 22 }}>
              {Object.values(score.available).some(Boolean) ? `${score.total} 分` : '评分待完善'}
            </div>
            <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
              {scoreDims.map((dim) => {
                const pct = dim.available ? Math.round((dim.value / dim.max) * 100) : 0;
                return (
                  <div key={dim.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#55607a', fontWeight: 700 }}>
                      <span>{dimLabelMap[dim.key]}</span>
                      <span>{dim.available ? `${dim.value.toFixed(1)} / ${dim.max}` : '待录入'}</span>
                    </div>
                    <div className="score-bar-wrap">
                      <div className={`score-bar-fill ${dim.available ? '' : 'muted'}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="score-gap-tip">
              {score.tier === 'ultra'
                ? '已达到 Ultra 档标准，继续保持训练质量与恢复节奏。'
                : `距 ${score.tier === 'standard' ? 'Pro' : 'Ultra'} 档差 ${score.gap_to_next} 分，优先提升：${score.weakest}`}
            </div>

            {score.tier === 'pro' && (
              <div className="tier-compare-list" style={{ marginTop: 10 }}>
                <div>体脂率：当前 {bfText}，标准 {standards.bf}</div>
                <div>静息心率：当前 {rhrText}，标准 {standards.rhr}</div>
                <div>力量基准：当前 {strengthText}，标准 {standards.strength}</div>
              </div>
            )}

            {score.tier === 'ultra' && (
              <div className="tier-compare-list" style={{ marginTop: 10 }}>
                <div>深蹲 / 体重：{liftRatios.squat > 0 ? `${liftRatios.squat}x` : '待录入'}</div>
                <div>硬拉 / 体重：{liftRatios.deadlift > 0 ? `${liftRatios.deadlift}x` : '待录入'}</div>
              </div>
            )}
          </div>

          <div className="section-cap" style={{ marginTop: 18 }}>• ASSESSMENTS（体测记录）</div>
          <div className="assessment-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, color: '#1f2435' }}>体测记录</div>
              <Button type="button" className="copy-edit-btn" onClick={() => setShowAssessmentForm((v) => !v)}>
                + 添加体测记录
              </Button>
            </div>

            {showAssessmentForm && (
              <div className="assessment-form-grid">
                <input className="assessment-input" placeholder="体脂率 %" value={assessmentDraft.bf_pct} onChange={(e) => setAssessmentDraft((p) => ({ ...p, bf_pct: e.target.value }))} />
                <input className="assessment-input" placeholder="骨骼肌率 %" value={assessmentDraft.smm_pct} onChange={(e) => setAssessmentDraft((p) => ({ ...p, smm_pct: e.target.value }))} />
                <input className="assessment-input" placeholder="腰围 cm" value={assessmentDraft.waist_cm} onChange={(e) => setAssessmentDraft((p) => ({ ...p, waist_cm: e.target.value }))} />
                <input className="assessment-input" placeholder="静息心率 bpm" value={assessmentDraft.rhr} onChange={(e) => setAssessmentDraft((p) => ({ ...p, rhr: e.target.value }))} />
                <input className="assessment-input" placeholder="睡眠时长 h/晚" value={assessmentDraft.sleep_hours} onChange={(e) => setAssessmentDraft((p) => ({ ...p, sleep_hours: e.target.value }))} />
                <input className="assessment-input" placeholder="训练年限（月）" value={assessmentDraft.training_age_months} onChange={(e) => setAssessmentDraft((p) => ({ ...p, training_age_months: e.target.value }))} />
                <div style={{ gridColumn: '1/-1', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button type="button" variant="outline" onClick={() => setShowAssessmentForm(false)}>取消</Button>
                  <Button type="button" onClick={addAssessmentRecord}>保存记录</Button>
                </div>
              </div>
            )}

            <div className="assessment-history-list">
              {(activeClient.assessments || []).slice().reverse().map((a, idx) => (
                <div className="assessment-item-row" key={`${a.date}-${idx}`}>
                  <span>{a.date}</span>
                  <span>体脂 {typeof a.bf_pct === 'number' ? `${a.bf_pct}%` : '--'}</span>
                  <span>骨骼肌 {typeof a.smm_pct === 'number' ? `${a.smm_pct}%` : '--'}</span>
                  <span>RHR {typeof a.rhr === 'number' ? `${a.rhr}` : '--'}</span>
                  <span>评分 {typeof a.score_snapshot === 'number' ? a.score_snapshot : '--'}</span>
                </div>
              ))}
              {(!activeClient.assessments || activeClient.assessments.length === 0) && (
                <div style={{ color: '#7a839c', fontSize: 12 }}>暂无体测记录</div>
              )}
            </div>

            {(activeTier === 'professional' || activeTier === 'elite') && trendPoints.length > 1 && (
              <div className="trend-chart-box">
                <div style={{ fontSize: 12, fontWeight: 700, color: '#55607a' }}>近 8 周评分趋势</div>
                <svg viewBox="0 0 260 80" style={{ width: '100%', height: 90 }}>
                  {trendPoints.map((p, i) => {
                    if (i === 0) return null;
                    const prev = trendPoints[i - 1];
                    const x1 = ((i - 1) / (trendPoints.length - 1)) * 250 + 5;
                    const x2 = (i / (trendPoints.length - 1)) * 250 + 5;
                    const y1 = 75 - (prev / 100) * 65;
                    const y2 = 75 - (p / 100) * 65;
                    return <line key={`line-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#5d66ed" strokeWidth="2" />;
                  })}
                  {trendPoints.map((p, i) => {
                    const x = (i / (trendPoints.length - 1)) * 250 + 5;
                    const y = 75 - (p / 100) * 65;
                    return <circle key={`dot-${i}`} cx={x} cy={y} r="3" fill="#5d66ed" />;
                  })}
                </svg>
              </div>
            )}
          </div>

          <div className="section-cap" style={{ marginTop: 18 }}>• ASSESSMENT & QUESTIONNAIRE（问卷筛查）</div>
          <div className="assessment-card">
            <div className="assessment-grid">
              <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <span>目标 / Goal</span>
                <select
                  className="assessment-input"
                  value={activeClient.goal_type || 'muscle_gain'}
                  onChange={(e) => updateGoalType(e.target.value as GoalType)}
                >
                  {goalTypeOptions.map((g) => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>

              <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <span>受伤部位</span>
                <input
                  className="assessment-input"
                  value={activeClient.injury_detail?.area || ''}
                  onChange={(e) => updateInjuryField({ area: e.target.value })}
                  placeholder="如：腰椎、肩峰"
                />
              </div>

              <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <span>程度</span>
                <select
                  className="assessment-input"
                  value={activeClient.injury_detail?.level || 'mild'}
                  onChange={(e) => updateInjuryField({ level: e.target.value as InjuryLevel })}
                >
                  {injuryLevelOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <span>禁忌动作</span>
                <input
                  className="assessment-input"
                  value={activeClient.injury_detail?.forbidden_moves || ''}
                  onChange={(e) => updateInjuryField({ forbidden_moves: e.target.value })}
                  placeholder="如：过顶推举、深度屈髋"
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-cap">• MEMBERSHIP TIERS（会员等级）</div>
          <div className="tiers-stack">
            {tierOrder.map((key) => {
              const item = tierMeta[key];
              const on = key === activeTier;
              return (
                <div key={key} className="tier-item">
                  <button
                    type="button"
                    className={`tier-card tone-${key} ${on ? 'on' : ''}`}
                    onClick={() => switchTier(key)}
                  >
                    <div className="tier-icon">◆</div>
                    <div>
                      <div className="tier-name">{item.cn} / {item.label}</div>
                      <div className="tier-sub">{item.cn}</div>
                    </div>
                  </button>

                  {on && (
                    <div className={`tier-feature tier-feature-inline tone-${key}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="tier-feature-title">{item.cn} / {item.label} ●</div>
                        <div style={{ fontSize: 30 }}>◈</div>
                      </div>
                      <div className="tier-compare-list">
                        <div>体脂率标准：{standards.bf} ｜ 当前：{bfText}</div>
                        <div>心率目标：{standards.rhr} ｜ 当前：{rhrText}</div>
                        <div>力量基准：{standards.strength} ｜ 当前：{strengthText}</div>
                        <div>{score.tier === 'ultra' ? '已达 Ultra 档。' : `距下一档差 ${score.gap_to_next} 分，建议优先提升 ${score.weakest}`}</div>
                      </div>
                      <Button
                        type="button"
                        className="w-full tier-open-btn"
                        onClick={() => onSelect(activeClient.id)}
                        style={{ marginTop: 14 }}
                      >
                        打开客户训练规划
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {showQrModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(15,23,42,.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => setShowQrModal(false)}
        >
          <div
            style={{
              width: 'min(420px, 100%)',
              borderRadius: 14,
              border: '1px solid rgba(226,232,240,.88)',
              background: '#fff',
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>发送给客户扫码填写</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>路书码：{activeClient.roadCode || '未设置'}</div>
            {activeClient.profile?.survey_completed_at && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#15803d', fontWeight: 700 }}>
                已填写时间：{new Date(activeClient.profile.survey_completed_at).toLocaleString('zh-CN')}
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="survey-qrcode" style={{ width: 240, height: 240, borderRadius: 10, border: '1px solid #e2e8f0' }} />
              ) : (
                <div style={{ width: 240, height: 240, borderRadius: 10, border: '1px solid #e2e8f0', display: 'grid', placeItems: 'center', color: '#64748b', fontSize: 12 }}>
                  {qrError || '二维码生成中...'}
                </div>
              )}
            </div>

            <div style={{ marginTop: 12, fontSize: 12, color: '#475569', wordBreak: 'break-all' }}>
              {`https://saas.fikafitness.com/survey?code=${activeClient.roadCode || ''}`}
            </div>

            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="button" variant="outline" onClick={() => setShowQrModal(false)}>关闭</Button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .clients-premium {
          --panel-bg: rgba(255,255,255,.55);
          --panel-bg-soft: rgba(255,255,255,.5);
          --panel-bg-strong: rgba(255,255,255,.62);
          --panel-border: rgba(216,221,236,.75);
          --panel-border-soft: rgba(216,221,236,.62);
          --panel-shadow: 0 14px 28px rgba(78,88,120,.12);
          border-radius: 22px;
          padding: 16px;
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          box-shadow: var(--panel-shadow);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .copy-edit-btn {
          border: 1px solid rgba(182, 190, 219, .62);
          background: rgba(218,224,251,.46);
          border-radius: 999px;
          height: 30px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 700;
          color: #546083;
        }

        .clients-premium .clients-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr);
          gap: 18px;
        }

        .clients-premium .head-profile {
          border-radius: 16px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .avatar-orb {
          width: 56px;
          height: 56px;
          border-radius: 999px;
          background: linear-gradient(140deg, rgba(31,37,56,.95), rgba(59,67,95,.92));
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          letter-spacing: .03em;
          flex-shrink: 0;
        }

        .clients-premium .head-name {
          font-size: 34px;
          line-height: 1;
          font-weight: 900;
          color: #1f2435;
        }

        .clients-premium .tier-pill {
          font-size: 11px;
          font-weight: 800;
          border-radius: 999px;
          padding: 5px 10px;
          letter-spacing: .06em;
        }

        .clients-premium .head-loc {
          font-size: 12px;
          color: #6b7286;
        }

        .clients-premium .head-week {
          font-size: 12px;
          font-weight: 700;
          color: #59607a;
          border: 1px solid rgba(156, 164, 196, .42);
          padding: 6px 10px;
          border-radius: 999px;
        }

        .clients-premium .section-cap {
          margin-top: 14px;
          font-size: 11px;
          letter-spacing: .18em;
          font-weight: 800;
          color: #545d79;
        }

        .clients-premium .metrics-grid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .clients-premium .metric-card {
          border-radius: 14px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          padding: 10px;
          min-height: 86px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .metric-k {
          font-size: 10px;
          letter-spacing: .08em;
          font-weight: 800;
          color: #8a90a6;
        }

        .clients-premium .metric-input,
        .clients-premium .assessment-input,
        .clients-premium .habit-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(182,190,219,.58);
          background: rgba(228,233,255,.82);
          color: #2a3146;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 8px;
        }

        .clients-premium .metric-v {
          margin-top: 10px;
          font-size: 30px;
          font-weight: 900;
          line-height: 1;
        }

        .clients-premium .assessment-card {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          padding: 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .assessment-title {
          font-size: 28px;
          font-weight: 900;
          color: #1f2435;
          line-height: 1;
        }

        .clients-premium .assessment-input {
          font-size: 16px;
          font-weight: 800;
          height: 36px;
        }

        .clients-premium .score-bar-wrap {
          margin-top: 6px;
          height: 8px;
          border-radius: 999px;
          background: rgba(157, 167, 194, .26);
          overflow: hidden;
        }

        .clients-premium .score-bar-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #5d66ed, #7f8bff);
          transition: width .24s ease;
        }

        .clients-premium .score-bar-fill.muted {
          background: rgba(148, 163, 184, .45);
        }

        .clients-premium .score-gap-tip {
          margin-top: 12px;
          font-size: 12px;
          color: #55607a;
          font-weight: 700;
        }

        .clients-premium .assessment-form-grid {
          margin-top: 10px;
          display: grid;
          gap: 8px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .clients-premium .assessment-history-list {
          margin-top: 10px;
          display: grid;
          gap: 6px;
        }

        .clients-premium .assessment-item-row {
          border-radius: 10px;
          border: 1px solid rgba(216,221,236,.6);
          background: rgba(255,255,255,.6);
          padding: 8px 10px;
          font-size: 12px;
          color: #4e5873;
          display: grid;
          grid-template-columns: 1.1fr repeat(4, minmax(0, 1fr));
          gap: 8px;
        }

        .clients-premium .trend-chart-box {
          margin-top: 12px;
          border-radius: 12px;
          border: 1px solid rgba(216,221,236,.64);
          background: rgba(255,255,255,.68);
          padding: 10px;
        }

        .clients-premium .assessment-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .clients-premium .habit-item {
          border-radius: 12px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          padding: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #59607a;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .habit-input {
          width: 48%;
        }

        .clients-premium .habit-item b {
          color: #252b3d;
          font-weight: 800;
        }

        .clients-premium .tiers-stack {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }

        .clients-premium .tier-item {
          width: 100%;
        }

        .clients-premium .tier-card {
          width: 100%;
          border-radius: 14px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          padding: 14px;
          min-height: 70px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          color: #2f3850;
          position: relative;
          overflow: hidden;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.74),
            inset 0 -16px 22px rgba(148,160,199,.12),
            var(--panel-shadow);
          transition: transform .26s cubic-bezier(.2,.9,.2,1), border-color .24s ease, box-shadow .24s ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .tier-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 1px 1px, rgba(104,116,154,.22) 1px, transparent 1.2px);
          background-size: 12px 12px;
          opacity: .22;
          -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.24) 62%, transparent 88%);
          mask-image: linear-gradient(180deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.24) 62%, transparent 88%);
          pointer-events: none;
        }

        .clients-premium .tier-card::after {
          content: '';
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 8px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(var(--tone-rgb), .66), rgba(var(--tone-rgb), .08));
          filter: blur(10px);
          opacity: .56;
          pointer-events: none;
        }

        .clients-premium .tier-card.on {
          border-color: rgba(var(--tone-rgb), .56);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.8),
            inset 0 -14px 20px rgba(var(--tone-rgb), .12),
            0 0 0 1px rgba(var(--tone-rgb), .34),
            0 12px 22px rgba(41,54,88,.22),
            0 0 20px rgba(var(--tone-rgb), .24);
          transform: translateY(-1px);
        }

        .clients-premium .tier-card:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--tone-rgb), .42);
        }

        .clients-premium .tier-card.tone-standard,
        .clients-premium .tier-feature.tone-standard {
          --tone-rgb: 142, 150, 170;
        }

        .clients-premium .tier-card.tone-advanced,
        .clients-premium .tier-feature.tone-advanced {
          --tone-rgb: 101, 216, 146;
        }

        .clients-premium .tier-card.tone-professional,
        .clients-premium .tier-feature.tone-professional {
          --tone-rgb: 255, 166, 84;
        }

        .clients-premium .tier-card.tone-elite,
        .clients-premium .tier-feature.tone-elite {
          --tone-rgb: 255, 106, 106;
        }

        .clients-premium .tier-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: rgba(var(--tone-rgb), .14);
          color: rgba(var(--tone-rgb), .95);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          box-shadow: inset 0 0 0 1px rgba(var(--tone-rgb), .34);
        }

        .clients-premium .tier-name {
          font-size: 15px;
          font-weight: 800;
          line-height: 1.1;
          color: rgba(var(--tone-rgb), .96);
          text-shadow: 0 0 12px rgba(var(--tone-rgb), .3);
        }

        .clients-premium .tier-sub {
          margin-top: 4px;
          font-size: 11px;
          color: rgba(63, 72, 96, .72);
        }

        .clients-premium .tier-feature {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg-strong);
          padding: 16px;
          min-height: 250px;
          color: rgba(46, 56, 79, .92);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.88),
            inset 0 -16px 20px rgba(var(--tone-rgb), .08),
            0 14px 24px rgba(52, 64, 96, .14),
            0 0 20px rgba(var(--tone-rgb), .18);
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .tier-feature::after {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 10px;
          height: 14px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(var(--tone-rgb), .76), rgba(var(--tone-rgb), .12));
          filter: blur(11px);
          opacity: .66;
          pointer-events: none;
        }

        .clients-premium .tier-feature-inline {
          animation: tierReveal .28s cubic-bezier(.22,.86,.32,1);
          transform-origin: top center;
        }

        .clients-premium .tier-feature-title {
          font-size: 28px;
          font-weight: 900;
          line-height: 1;
          color: rgba(var(--tone-rgb), .98);
          text-shadow: 0 0 14px rgba(var(--tone-rgb), .34);
        }

        .clients-premium .tier-compare-list {
          margin-top: 10px;
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: rgba(53, 62, 86, .9);
        }

        .clients-premium .tier-open-btn {
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(var(--tone-rgb), .46);
          background: linear-gradient(135deg, rgba(var(--tone-rgb), .92), rgba(var(--tone-rgb), .72)) !important;
          color: #fff !important;
          font-weight: 800;
          letter-spacing: .02em;
          position: relative;
          overflow: hidden;
          box-shadow:
            0 12px 22px rgba(var(--tone-rgb), .34),
            0 0 18px rgba(var(--tone-rgb), .28),
            inset 0 1px 0 rgba(255,255,255,.34);
          transition: transform .2s ease, box-shadow .24s ease, filter .24s ease;
          animation: tierBtnPulse 2.4s ease-in-out infinite;
        }

        .clients-premium .tier-open-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -42%;
          width: 36%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.36), transparent);
          transform: skewX(-16deg);
          transition: left .46s ease;
        }

        .clients-premium .tier-open-btn:hover {
          transform: translateY(-1px);
          box-shadow:
            0 16px 28px rgba(var(--tone-rgb), .38),
            0 0 22px rgba(var(--tone-rgb), .34),
            inset 0 1px 0 rgba(255,255,255,.4);
          filter: saturate(1.06);
        }

        .clients-premium .tier-open-btn:hover::before {
          left: 112%;
        }

        .clients-premium .tier-open-btn:active {
          transform: translateY(0) scale(.985);
          box-shadow:
            0 8px 16px rgba(var(--tone-rgb), .28),
            0 0 14px rgba(var(--tone-rgb), .24),
            inset 0 1px 0 rgba(255,255,255,.32);
        }

        @keyframes tierBtnPulse {
          0%,
          100% {
            box-shadow:
              0 12px 22px rgba(var(--tone-rgb), .34),
              0 0 18px rgba(var(--tone-rgb), .28),
              inset 0 1px 0 rgba(255,255,255,.34);
          }
          50% {
            box-shadow:
              0 14px 24px rgba(var(--tone-rgb), .4),
              0 0 24px rgba(var(--tone-rgb), .34),
              inset 0 1px 0 rgba(255,255,255,.38);
          }
        }

        @keyframes tierReveal {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 1120px) {
          .clients-premium .clients-layout {
            grid-template-columns: 1fr;
          }

          .clients-premium .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
