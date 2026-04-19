import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

import { Button } from '@/components/ui/button';
import type { Client } from '@/lib/db';
import { calcBodyAssetScore } from '@/lib/bodyAssetScore';
import { getClientsFromCache, saveClient as saveClientAsync } from '@/lib/store';

type MembershipLevel = 'standard' | 'advanced' | 'professional' | 'elite';

type GoalType = NonNullable<Client['goal_type']>;

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

const isKineticChain = (level?: string) => level === 'professional' || level === 'elite';

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
  onSelect: _onSelect,
  selectedClientId,
  coachCode,
}: {
  onSelect: (clientId: string) => void;
  selectedClientId: string | null;
  coachCode?: string | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAssessmentForm, setShowAssessmentForm] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [qrError, setQrError] = useState<string | null>(null);
  const [assessmentDraft, setAssessmentDraft] = useState({
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
  const [showTrainingHistory, setShowTrainingHistory] = useState(true);

  // 招募码和待审核问卷
  const [pendingSurveys, setPendingSurveys] = useState<any[]>([]);
  const [expandedSurveyId, setExpandedSurveyId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalForm, setApprovalForm] = useState({
    weight: '',
    height: '',
    bf_pct: '',
    rhr: '',
    tier: 'standard',
  });
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [approvalSuccess, setApprovalSuccess] = useState<string | null>(null);
  const [tierSwitchingId, setTierSwitchingId] = useState<string | null>(null);

  const tierOrder: MembershipLevel[] = ['standard', 'advanced', 'professional', 'elite'];

  const resolveMembershipLevel = (c: Client | null): MembershipLevel => {
    if (!c) return 'standard';
    const stored = c.membershipLevel as MembershipLevel | undefined;
    if (stored && tierOrder.includes(stored)) return stored;
    return 'standard';
  };

  useEffect(() => {
    const reload = () => {
      const list = getClientsFromCache().filter((c) => c.name !== '示例客户');
      setClients(list);
      if (list.length > 0) {
        if (selectedClientId && list.some((c) => c.id === selectedClientId)) setActiveId(selectedClientId);
        else setActiveId(list[0].id);
      }
    };
    reload();
    window.addEventListener('storage', reload);
    return () => window.removeEventListener('storage', reload);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    if (clients.some((c) => c.id === selectedClientId)) {
      setActiveId(selectedClientId);
    }
  }, [clients, selectedClientId]);

  const persistClient = (next: Client) => {
    const updatedClients = clients.map((c) => (c.id === next.id ? next : c));
    setClients(updatedClients);
    void saveClientAsync(next).catch((err) => {
      console.error('[ClientsPage] Failed to save client:', err);
    });
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

  // Load pending surveys for coach
  useEffect(() => {
    if (!coachCode) return;
    const loadPendingSurveys = async () => {
      try {
        const res = await fetch(`/api/survey/pending?coachCode=${encodeURIComponent(coachCode)}`);
        if (!res.ok) {
          console.error('[clients] load pending surveys failed:', res.status);
          return;
        }
        const surveys = (await res.json()) as any[];
        setPendingSurveys(surveys);
      } catch (e) {
        console.error('[clients] load pending surveys error:', e);
      }
    };
    loadPendingSurveys();
  }, [coachCode]);

  const activeTier = resolveMembershipLevel(activeClient);
  const tier = tierMeta[activeTier];

  const switchTier = async (nextTier: MembershipLevel) => {
    if (!activeClient) return;

    try {
      setTierSwitchingId(activeClient.id);
      const updatedClient = { ...activeClient, membershipLevel: nextTier } as Client;

      // 同步更新本地状态
      const updatedClients = clients.map((c) => (c.id === updatedClient.id ? updatedClient : c));
      setClients(updatedClients);

      // 等待异步保存完成
      await saveClientAsync(updatedClient);
      console.log('[ClientsPage] 档位已保存:', updatedClient.id, nextTier);
    } catch (e: any) {
      console.error('[ClientsPage] 档位切换失败:', e);
    } finally {
      setTierSwitchingId(null);
    }
  };

  const updateGoalType = (goalType: GoalType) => {
    if (!activeClient) return;
    const label = goalTypeOptions.find((g) => g.value === goalType)?.label || '';
    persistClient({ ...activeClient, goal_type: goalType, goal: label || activeClient.goal } as Client);
  };

  const updateClientField = (patch: Partial<Client>) => {
    if (!activeClient) return;
    persistClient({ ...activeClient, ...patch } as Client);
  };

  const addAssessmentRecord = () => {
    if (!activeClient) return;
    try {
      const w = toNum(assessmentDraft.weight) ?? activeClient.weight ?? 0;
      const h = toNum(assessmentDraft.height) ?? activeClient.height ?? 0;
      const age = activeClient.age ?? 25;
      const isMale = (activeClient.gender || 'male') !== 'female';
      const bf = toNum(assessmentDraft.bf_pct);
      const smm_kg = toNum(assessmentDraft.smm_kg);
      const waist = toNum(assessmentDraft.waist_cm);
      const hip = toNum(assessmentDraft.hip_cm);
      const rhr = toNum(assessmentDraft.rhr);
      const sleep = toNum(assessmentDraft.sleep_hours);
      const trainAge = toNum(assessmentDraft.training_age_months);

      const fat_kg = (w && bf) ? +((w * bf / 100).toFixed(2)) : undefined;
      const lean_kg = (w && fat_kg != null) ? +((w - fat_kg).toFixed(2)) : undefined;
      const smm_pct = (smm_kg && w) ? +((smm_kg / w * 100).toFixed(1)) : undefined;
      const bmi = (w && h) ? +(w / ((h / 100) ** 2)).toFixed(1) : undefined;
      const whr = (waist && hip) ? +(waist / hip).toFixed(2) : undefined;
      const bmr = (w && h) ? Math.round(
        isMale
          ? 10 * w + 6.25 * h - 5 * age + 5
          : 10 * w + 6.25 * h - 5 * age - 161
      ) : undefined;

      const bodyMetrics = {
        ...(activeClient.bodyMetrics || {}),
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

      const previewScore = (() => {
        try {
          return calcBodyAssetScore({
            ...activeClient,
            weight: w || activeClient.weight,
            height: h || activeClient.height,
            bodyMetrics,
          } as Client).total;
        } catch {
          return 0;
        }
      })();

      const record = {
        date: new Date().toISOString().slice(0, 10),
        weight: w || undefined,
        height: h || undefined,
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
        notes: assessmentDraft.notes || '',
        score_snapshot: previewScore,
      };

      persistClient({
        ...activeClient,
        ...(w ? { weight: w } : {}),
        ...(h ? { height: h } : {}),
        bodyMetrics,
        assessments: [...activeAssessments, record],
      } as Client);

      setShowAssessmentForm(false);
      setAssessmentDraft({
        weight: '', height: '', bf_pct: '', smm_kg: '',
        waist_cm: '', hip_cm: '', rhr: '', sleep_hours: '',
        training_age_months: '', notes: '',
      });
    } catch (e) {
      console.error('[ClientsPage] addAssessmentRecord error:', e);
      alert('保存体测记录失败');
    }
  };

  const handleApproveSurvey = async (surveyId: string) => {
    if (!coachCode) return;
    setApprovalError(null);
    setApprovalSuccess(null);

    try {
      const weight = approvalForm.weight ? parseFloat(approvalForm.weight) : undefined;
      const height = approvalForm.height ? parseFloat(approvalForm.height) : undefined;
      const bf_pct = approvalForm.bf_pct ? parseFloat(approvalForm.bf_pct) : undefined;
      const rhr = approvalForm.rhr ? parseFloat(approvalForm.rhr) : undefined;

      const res = await fetch(`/api/survey/approve/${surveyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight,
          height,
          bf_pct,
          rhr,
          tier: approvalForm.tier,
          coachCode,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const result = (await res.json()) as { clientId: string; roadCode: string; name: string; tier: string };

      // Remove approved survey from list
      setPendingSurveys((prev) => prev.filter((s) => s._id !== surveyId));
      setApprovingId(null);

      // Reset form
      setApprovalForm({
        weight: '',
        height: '',
        bf_pct: '',
        rhr: '',
        tier: 'standard',
      });

      setApprovalSuccess(`建档成功，路书码：${result.roadCode}`);
      setTimeout(() => setApprovalSuccess(null), 3000);
    } catch (e) {
      console.error('[clients] approve survey failed', e);
      setApprovalError('审核失败，请稍后重试');
    }
  };

  if (!activeClient) {
    return <div style={{ fontSize: 13, color: 'var(--s500)' }}>暂无客户数据</div>;
  }

  const activeSessions = Array.isArray(activeClient.sessions) ? activeClient.sessions : [];
  const activeAssessments = Array.isArray(activeClient.assessments) ? activeClient.assessments : [];
  const activeBlocks = Array.isArray(activeClient.blocks) ? activeClient.blocks : [];

  const score = (() => {
    try {
      return calcBodyAssetScore(activeClient);
    } catch (e) {
      console.error('[ClientsPage] calcBodyAssetScore error:', e);
      return { total: 0, breakdown: { bodyComp: 0, performance: 0, nutrition: 0, recovery: 0, execution: 0 }, tier: 'standard', weakest: 'bodyComp', gap_to_next: 0, available: { bodyComp: false, performance: false, nutrition: false, recovery: false, execution: false } };
    }
  })();
  const liftRatios = (() => {
    try {
      return extractLiftRatios(activeClient);
    } catch (e) {
      console.error('[ClientsPage] extractLiftRatios error:', e);
      return { squat: 0, deadlift: 0 };
    }
  })();
  const standards = tierStandardMap[activeTier];

  const latestAssessments = [...activeAssessments]
    .filter(a => a?.date) // 添加日期有效性检查
    .sort((a, b) => {
      const timeA = new Date(b.date).getTime();
      const timeB = new Date(a.date).getTime();
      return Number.isFinite(timeA) && Number.isFinite(timeB) ? timeA - timeB : 0;
    })
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

  // 取最新一条体测记录
  const latestA = [...activeAssessments]
    .filter(a => a?.date)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || {};

  const metricCards = [
    {
      label: '体重 / WEIGHT',
      v: latestA.weight ?? activeClient.weight ?? '--',
      unit: 'kg',
      tone: '#4F5BDF',
      sub: latestA.date ? `更新 ${latestA.date}` : '待体测',
    },
    {
      label: '体脂率 / BODY FAT',
      v: latestA.bf_pct != null ? latestA.bf_pct : '--',
      unit: '%',
      tone: '#D14A63',
      sub: latestA.fat_kg != null ? `脂肪 ${latestA.fat_kg}kg` : '待体测',
    },
    {
      label: '脂肪重量 / FAT MASS',
      v: latestA.fat_kg != null ? latestA.fat_kg : '--',
      unit: 'kg',
      tone: '#D97706',
      sub: latestA.lean_kg != null ? `去脂 ${latestA.lean_kg}kg` : '待体测',
    },
    {
      label: '骨骼肌 / MUSCLE',
      v: latestA.smm_kg != null ? latestA.smm_kg : '--',
      unit: 'kg',
      tone: '#0D9488',
      sub: latestA.smm_pct != null ? `占比 ${latestA.smm_pct}%` : '待体测',
    },
    {
      label: '腰臀比 / WHR',
      v: latestA.whr != null ? latestA.whr : '--',
      unit: '',
      tone: '#2563EB',
      sub: latestA.waist_cm != null ? `腰围 ${latestA.waist_cm}cm` : '待体测',
    },
    {
      label: '基础代谢 / BMR',
      v: latestA.bmr != null ? latestA.bmr : '--',
      unit: 'kcal',
      tone: '#5E6579',
      sub: latestA.bmi != null ? `BMI ${latestA.bmi}` : '待体测',
    },
    {
      label: '训练周期 / BLOCKS',
      v: activeBlocks.length,
      unit: '',
      tone: '#5662E6',
      sub: '',
    },
    {
      label: '训练课次 / SESSIONS',
      v: activeSessions.length,
      unit: '',
      tone: '#7A7F90',
      sub: '',
    },
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
      {/* Recruitment Code and Pending Surveys Section */}
      {coachCode && (
        <div style={{ display: 'grid', gap: 16, marginBottom: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {/* 待审核问卷 Count Badge */}
          {pendingSurveys.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setExpandedSurveyId(expandedSurveyId ? null : 'list')}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 12,
                  border: '1px solid rgba(239,68,68,.45)',
                  background: 'rgba(239,68,68,.08)',
                  color: '#dc2626',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'rgba(239,68,68,.14)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLButtonElement).style.background = 'rgba(239,68,68,.08)';
                }}
              >
                待审核问卷 ({pendingSurveys.length})
                <span
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    background: '#dc2626',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {pendingSurveys.length}
                </span>
              </button>

              {expandedSurveyId === 'list' && (
                <div
                  style={{
                    marginTop: 8,
                    border: '1px solid rgba(239,68,68,.3)',
                    borderRadius: 8,
                    background: 'rgba(239,68,68,.04)',
                    maxHeight: 400,
                    overflowY: 'auto',
                  }}
                >
                  {pendingSurveys.map((survey) => (
                    <div
                      key={survey._id}
                      style={{
                        padding: 12,
                        borderBottom: '1px solid rgba(239,68,68,.2)',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'rgba(239,68,68,.1)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
                      }}
                    >
                      {approvingId === survey._id ? (
                        <div style={{ display: 'grid', gap: 8 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>建档表单</div>
                          <div style={{ fontSize: 11, color: '#666' }}>姓名：{survey.name}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>电话：{survey.phone}</div>

                          <input
                            type="number"
                            placeholder="体重 (kg)"
                            value={approvalForm.weight}
                            onChange={(e) => setApprovalForm((p) => ({ ...p, weight: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(109,84,234,.3)',
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          />
                          <input
                            type="number"
                            placeholder="身高 (cm)"
                            value={approvalForm.height}
                            onChange={(e) => setApprovalForm((p) => ({ ...p, height: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(109,84,234,.3)',
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          />
                          <input
                            type="number"
                            placeholder="体脂率 (%)"
                            value={approvalForm.bf_pct}
                            onChange={(e) => setApprovalForm((p) => ({ ...p, bf_pct: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(109,84,234,.3)',
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          />
                          <input
                            type="number"
                            placeholder="静息心率 (bpm)"
                            value={approvalForm.rhr}
                            onChange={(e) => setApprovalForm((p) => ({ ...p, rhr: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(109,84,234,.3)',
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          />
                          <select
                            value={approvalForm.tier}
                            onChange={(e) => setApprovalForm((p) => ({ ...p, tier: e.target.value }))}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              borderRadius: 4,
                              border: '1px solid rgba(109,84,234,.3)',
                              fontSize: 12,
                              boxSizing: 'border-box',
                            }}
                          >
                            <option value="standard">基础会员</option>
                            <option value="pro">进阶会员</option>
                            <option value="ultra">至尊会员</option>
                          </select>

                          {approvalError && (
                            <div style={{ fontSize: 12, color: '#dc2626' }}>{approvalError}</div>
                          )}
                          {approvalSuccess && (
                            <div style={{ fontSize: 12, color: '#15803d' }}>{approvalSuccess}</div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => setApprovingId(null)}
                              style={{
                                padding: '6px 8px',
                                borderRadius: 4,
                                border: '1px solid rgba(109,84,234,.3)',
                                background: '#fff',
                                color: '#5a41d6',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveSurvey(survey._id)}
                              style={{
                                padding: '6px 8px',
                                borderRadius: 4,
                                border: 'none',
                                background: '#15803d',
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              确认建档
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div onClick={() => setApprovingId(survey._id)}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{survey.name}</div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>电话：{survey.phone}</div>
                          <div style={{ fontSize: 11, color: '#999' }}>
                            提交时间：{new Date(survey.submittedAt).toLocaleString('zh-CN')}
                          </div>
                          {survey.profile && (
                            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                              目标：{survey.profile.goal_type || '未选择'} | 预算：{survey.profile.budget_level || '未选择'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="clients-layout">
        <div>
          <div className="head-profile" style={{ borderColor: tier.ring }}>
            <div className="avatar-orb" style={{ boxShadow: `0 0 0 2px ${tier.ring}` }}>{initials(activeClient.name)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="head-name">{activeClient.name}</div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="tier-pill" style={{ color: tier.accent, background: tier.soft }}>{tier.cn} / {tier.label} MEMBER</span>
                <span className="head-loc">上海 / Shanghai, CN</span>
              </div>
            </div>
            <div className="head-week">第 {activeClient.current_week || 1} 周 / Week {activeClient.current_week || 1}</div>
          </div>

  
          <div className="section-cap">• BODY COMPOSITION METRICS（身体成分指标）</div>
          <div className="metrics-grid">
            {metricCards.map((m, idx) => (
              <div key={idx} className="metric-card">
                <div className="metric-k">{m.label}</div>
                <div className="metric-v" style={{ color: m.tone }}>
                  {m.v}
                  {m.unit && (
                    <span style={{ fontSize: 13, color: '#7B8194', marginLeft: 4 }}>
                      {m.unit}
                    </span>
                  )}
                </div>
                {m.sub && (
                  <div style={{
                    fontSize: 10, color: '#94a3b8',
                    marginTop: 4, fontWeight: 500,
                  }}>
                    {m.sub}
                  </div>
                )}
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
              <div style={{ marginTop: 10 }}>

                {/* 基础数据 */}
                <div style={{ fontSize: 9, fontWeight: 800, color: '#8a90a6', letterSpacing: '.14em', padding: '6px 0 8px', borderBottom: '1px solid rgba(216,221,236,.4)', marginBottom: 8 }}>
                  基础数据
                </div>
                <div className="assessment-form-grid" style={{ marginBottom: 12 }}>
                  {[
                    { key: 'weight', label: '体重 (kg)', placeholder: '如：65.5' },
                    { key: 'height', label: '身高 (cm)', placeholder: '如：170' },
                    { key: 'bf_pct', label: '体脂率 (%)', placeholder: '如：18.5' },
                    { key: 'smm_kg', label: '骨骼肌 (kg)', placeholder: '如：28.5' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: 10, color: '#8a90a6', marginBottom: 3 }}>{f.label}</div>
                      <input
                        className="assessment-input"
                        type="number"
                        placeholder={f.placeholder}
                        value={(assessmentDraft as any)[f.key]}
                        onChange={(e) => setAssessmentDraft(p => ({ ...p, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                {/* 围度数据 */}
                <div style={{ fontSize: 9, fontWeight: 800, color: '#8a90a6', letterSpacing: '.14em', padding: '6px 0 8px', borderBottom: '1px solid rgba(216,221,236,.4)', marginBottom: 8 }}>
                  围度数据
                </div>
                <div className="assessment-form-grid" style={{ marginBottom: 12 }}>
                  {[
                    { key: 'waist_cm', label: '腰围 (cm)', placeholder: '如：76' },
                    { key: 'hip_cm', label: '髋围 (cm)', placeholder: '如：92' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: 10, color: '#8a90a6', marginBottom: 3 }}>{f.label}</div>
                      <input
                        className="assessment-input"
                        type="number"
                        placeholder={f.placeholder}
                        value={(assessmentDraft as any)[f.key]}
                        onChange={(e) => setAssessmentDraft(p => ({ ...p, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                {/* 生理指标 */}
                <div style={{ fontSize: 9, fontWeight: 800, color: '#8a90a6', letterSpacing: '.14em', padding: '6px 0 8px', borderBottom: '1px solid rgba(216,221,236,.4)', marginBottom: 8 }}>
                  生理指标
                </div>
                <div className="assessment-form-grid" style={{ marginBottom: 12 }}>
                  {[
                    { key: 'rhr', label: '静息心率 (bpm)', placeholder: '如：62' },
                    { key: 'sleep_hours', label: '睡眠时长 (h/晚)', placeholder: '如：7.5' },
                    { key: 'training_age_months', label: '训练年限 (月)', placeholder: '如：24' },
                  ].map(f => (
                    <div key={f.key}>
                      <div style={{ fontSize: 10, color: '#8a90a6', marginBottom: 3 }}>{f.label}</div>
                      <input
                        className="assessment-input"
                        type="number"
                        placeholder={f.placeholder}
                        value={(assessmentDraft as any)[f.key]}
                        onChange={(e) => setAssessmentDraft(p => ({ ...p, [f.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>

                {/* 备注 */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#8a90a6', marginBottom: 3 }}>教练备注（选填）</div>
                  <input
                    className="assessment-input"
                    placeholder="本次体测情况备注..."
                    value={assessmentDraft.notes}
                    onChange={(e) => setAssessmentDraft(p => ({ ...p, notes: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>

                {/* 自动计算预览 */}
                {assessmentDraft.weight && assessmentDraft.bf_pct && (
                  <div style={{
                    marginBottom: 12, padding: '10px 12px',
                    borderRadius: 10,
                    background: 'rgba(93,100,214,.06)',
                    border: '1px solid rgba(93,100,214,.15)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#8a90a6', marginBottom: 2 }}>脂肪重量</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#D97706' }}>
                        {(+assessmentDraft.weight * +assessmentDraft.bf_pct / 100).toFixed(1)} kg
                      </div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: '#8a90a6', marginBottom: 2 }}>去脂体重</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0D9488' }}>
                        {(+assessmentDraft.weight - +assessmentDraft.weight * +assessmentDraft.bf_pct / 100).toFixed(1)} kg
                      </div>
                    </div>
                    {assessmentDraft.waist_cm && assessmentDraft.hip_cm && (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#8a90a6', marginBottom: 2 }}>腰臀比</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB' }}>
                          {(+assessmentDraft.waist_cm / +assessmentDraft.hip_cm).toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <Button type="button" variant="outline"
                    onClick={() => setShowAssessmentForm(false)}>
                    取消
                  </Button>
                  <Button type="button" onClick={addAssessmentRecord}>
                    保存记录
                  </Button>
                </div>
              </div>
            )}

            <div className="assessment-history-list">
              {activeAssessments.slice().reverse().map((a, idx) => (
                <div key={`${a.date}-${idx}`} style={{
                  borderRadius: 12,
                  border: '1px solid rgba(216,221,236,.6)',
                  background: 'rgba(255,255,255,.7)',
                  padding: '10px 14px',
                  borderLeft: '3px solid rgba(93,102,237,.35)',
                }}>
                  {/* 日期行 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#1f2435' }}>{a.date}</span>
                    {typeof a.score_snapshot === 'number' && (
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 20,
                        background: 'rgba(93,102,237,.1)',
                        color: '#5d66ed',
                      }}>
                        评分 {a.score_snapshot}
                      </span>
                    )}
                  </div>
                  {/* 数据网格 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {[
                      { label: '体重', value: a.weight != null ? `${a.weight}kg` : '--' },
                      { label: '体脂率', value: a.bf_pct != null ? `${a.bf_pct}%` : '--' },
                      { label: '脂肪', value: a.fat_kg != null ? `${a.fat_kg}kg` : '--' },
                      { label: '骨骼肌', value: a.smm_kg != null ? `${a.smm_kg}kg` : '--' },
                      { label: '腰围', value: a.waist_cm != null ? `${a.waist_cm}cm` : '--' },
                      { label: '髋围', value: a.hip_cm != null ? `${a.hip_cm}cm` : '--' },
                      { label: '腰臀比', value: a.whr != null ? a.whr : '--' },
                      { label: '静息心率', value: a.rhr != null ? `${a.rhr}bpm` : '--' },
                      { label: 'BMR', value: a.bmr != null ? `${a.bmr}kcal` : '--' },
                      { label: 'BMI', value: a.bmi != null ? a.bmi : '--' },
                    ].map(item => (
                      <div key={item.label} style={{
                        background: 'rgba(248,249,252,.8)',
                        borderRadius: 8,
                        padding: '5px 8px',
                      }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 600 }}>{item.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2435', marginTop: 1 }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                  {a.notes && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                      {a.notes}
                    </div>
                  )}
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
              {isKineticChain(activeClient.membershipLevel) ? (
                <>
                  <div style={{
                    gridColumn: '1 / -1',
                    fontSize: 9,
                    fontWeight: 800,
                    color: '#8a90a6',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    padding: '10px 0 4px',
                    borderBottom: '1px solid rgba(216,221,236,.4)',
                    marginBottom: 2,
                  }}>
                    骨盆与代偿
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>当前训练阶段</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).trainingPhase || ''}
                      onChange={(e) => updateClientField({ trainingPhase: e.target.value as Client['trainingPhase'] })}
                    >
                      <option value="">未设置</option>
                      <option value="neural_reset">神经重置期</option>
                      <option value="activation">激活建立期</option>
                      <option value="loading">力量加载期</option>
                      <option value="integration">整合期</option>
                    </select>
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>主要代偿模式</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).compensationPattern || ''}
                      onChange={(e) => updateClientField({ compensationPattern: e.target.value })}
                      placeholder="如：骨盆前倾、肩胛前引"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>代偿侧别</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).compensationSide || ''}
                      onChange={(e) => updateClientField({ compensationSide: e.target.value as Client['compensationSide'] })}
                    >
                      <option value="">未设置</option>
                      <option value="left">左侧</option>
                      <option value="right">右侧</option>
                      <option value="bilateral">双侧</option>
                    </select>
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>过度激活肌群</span>
                    <input
                      className="assessment-input"
                      value={((activeClient as any).overactiveMuscles || []).join('、')}
                      onChange={(e) => updateClientField({ overactiveMuscles: e.target.value.split(/[、,，]/).map((s: string) => s.trim()).filter(Boolean) })}
                      placeholder="如：髂腰肌、竖脊肌（逗号分隔）"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>薄弱抑制肌群</span>
                    <input
                      className="assessment-input"
                      value={((activeClient as any).underactiveMuscles || []).join('、')}
                      onChange={(e) => updateClientField({ underactiveMuscles: e.target.value.split(/[、,，]/).map((s: string) => s.trim()).filter(Boolean) })}
                      placeholder="如：臀大肌、深层核心（逗号分隔）"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>主要问题力线</span>
                    <input
                      className="assessment-input"
                      value={((activeClient as any).problemChains || []).join('、')}
                      onChange={(e) => updateClientField({ problemChains: e.target.value.split(/[、,，]/).map((s: string) => s.trim()).filter(Boolean) })}
                      placeholder="前斜线/后斜线/侧线/深前线"
                    />
                  </div>

                  <div style={{
                    gridColumn: '1 / -1',
                    fontSize: 9,
                    fontWeight: 800,
                    color: '#8a90a6',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    padding: '10px 0 4px',
                    borderBottom: '1px solid rgba(216,221,236,.4)',
                    marginBottom: 2,
                  }}>
                    关节评估
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>骨盆控制能力</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).pelvisControl || ''}
                      onChange={(e) => updateClientField({ pelvisControl: e.target.value as Client['pelvisControl'] })}
                    >
                      <option value="">未设置</option>
                      <option value="none">无法控制</option>
                      <option value="static">能静态控制</option>
                      <option value="dynamic">能动态控制</option>
                      <option value="loaded">能负重控制</option>
                    </select>
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>单腿稳定性</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).singleLegStability || ''}
                      onChange={(e) => updateClientField({ singleLegStability: e.target.value as Client['singleLegStability'] })}
                    >
                      <option value="">未设置</option>
                      <option value="cannot">无法站立</option>
                      <option value="unstable">能站立不稳</option>
                      <option value="stable">能稳定站立</option>
                      <option value="loaded">能负重站立</option>
                    </select>
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>胸椎活动度</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).thoracicMobility || ''}
                      onChange={(e) => updateClientField({ thoracicMobility: e.target.value as Client['thoracicMobility'] })}
                    >
                      <option value="">未设置</option>
                      <option value="severe">严重受限</option>
                      <option value="mild">轻度受限</option>
                      <option value="normal">正常</option>
                    </select>
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>髋屈肌状态</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).hipFlexorStatus || ''}
                      onChange={(e) => updateClientField({ hipFlexorStatus: e.target.value as Client['hipFlexorStatus'] })}
                    >
                      <option value="">未设置</option>
                      <option value="severe">严重紧张</option>
                      <option value="mild">轻度紧张</option>
                      <option value="normal">正常</option>
                    </select>
                  </div>

                  <div style={{
                    gridColumn: '1 / -1',
                    fontSize: 9,
                    fontWeight: 800,
                    color: '#8a90a6',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    padding: '10px 0 4px',
                    borderBottom: '1px solid rgba(216,221,236,.4)',
                    marginBottom: 2,
                  }}>
                    禁忌与备注
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>禁忌动作模式</span>
                    <input
                      className="assessment-input"
                      value={((activeClient as any).contraindicatedPatterns || []).join('、')}
                      onChange={(e) => updateClientField({ contraindicatedPatterns: e.target.value.split(/[、,，]/).map((s: string) => s.trim()).filter(Boolean) })}
                      placeholder="如：腰椎过伸、高冲击落地"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gridColumn: '1 / -1' }}>
                    <span>教练备注</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).kineticChainNote || ''}
                      onChange={(e) => updateClientField({ kineticChainNote: e.target.value })}
                      placeholder="其他动力链评估备注"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div style={{
                    gridColumn: '1 / -1',
                    fontSize: 9,
                    fontWeight: 800,
                    color: '#8a90a6',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    padding: '10px 0 4px',
                    borderBottom: '1px solid rgba(216,221,236,.4)',
                    marginBottom: 2,
                  }}>
                    训练背景
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>训练年限</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).trainingYears || ''}
                      onChange={(e) => updateClientField({ trainingYears: e.target.value })}
                      placeholder="如：1年、3年以上"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>主要目标</span>
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
                    <span>分化方式</span>
                    <select
                      className="assessment-input"
                      value={(activeClient as any).splitType || ''}
                      onChange={(e) => updateClientField({ splitType: e.target.value })}
                    >
                      <option value="">未设置</option>
                      <option value="全身">全身</option>
                      <option value="上下肢">上下肢</option>
                      <option value="推拉腿">推拉腿</option>
                      <option value="四分化">四分化</option>
                    </select>
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>每周训练天数</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).weeklyDays || ''}
                      onChange={(e) => updateClientField({ weeklyDays: e.target.value })}
                      placeholder="如：3天、4-5天"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>单次训练时长</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).sessionDuration || ''}
                      onChange={(e) => updateClientField({ sessionDuration: e.target.value })}
                      placeholder="如：60分钟"
                    />
                  </div>

                  <div style={{
                    gridColumn: '1 / -1',
                    fontSize: 9,
                    fontWeight: 800,
                    color: '#8a90a6',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    padding: '10px 0 4px',
                    borderBottom: '1px solid rgba(216,221,236,.4)',
                    marginBottom: 2,
                  }}>
                    伤病限制
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>受伤史</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).injuryHistory || ''}
                      onChange={(e) => updateClientField({ injuryHistory: e.target.value })}
                      placeholder="如：腰椎间盘突出（2022）"
                    />
                  </div>

                  <div className="habit-item" style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                    <span>禁忌动作</span>
                    <input
                      className="assessment-input"
                      value={(activeClient as any).contraindicatedMoves || ''}
                      onChange={(e) => updateClientField({ contraindicatedMoves: e.target.value })}
                      placeholder="如：过顶推举、深度屈髋"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="section-cap">• MEMBERSHIP TIERS（会员等级）</div>
            {/* 档位分段选择器 */}
            <div style={{
              background: 'rgba(241,243,248,.9)',
              borderRadius: 14,
              padding: 4,
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 3,
              marginTop: 10,
            }}>
              {tierOrder.map((key) => {
                const item = tierMeta[key];
                const on = key === activeTier;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => switchTier(key)}
                    disabled={tierSwitchingId === activeClient?.id}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 10,
                      border: on ? `1.5px solid ${item.ring}` : '1.5px solid transparent',
                      background: on ? '#fff' : 'transparent',
                      cursor: tierSwitchingId === activeClient?.id ? 'not-allowed' : 'pointer',
                      transition: 'all .2s cubic-bezier(.25,.46,.45,.94)',
                      boxShadow: on ? '0 2px 10px rgba(0,0,0,.08), inset 0 1px 0 rgba(255,255,255,.9)' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                      opacity: tierSwitchingId === activeClient?.id ? 0.6 : 1,
                    }}
                  >
                    {/* 档位图标小圆点 */}
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: on ? item.accent : 'rgba(148,163,184,.5)',
                      transition: 'background .2s',
                      boxShadow: on ? `0 0 6px ${item.accent}60` : 'none',
                    }} />
                    <div style={{
                      fontSize: 10,
                      fontWeight: on ? 800 : 600,
                      color: on ? item.accent : '#94a3b8',
                      letterSpacing: '.02em',
                      transition: 'color .2s',
                      textAlign: 'center',
                      lineHeight: 1.2,
                    }}>
                      {item.label}
                    </div>
                    <div style={{
                      fontSize: 9,
                      color: on ? item.accent : '#b0bec5',
                      fontWeight: 600,
                      opacity: on ? 0.8 : 0.6,
                    }}>
                      {item.cn}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 当前档位详情展开卡 */}
            <div style={{
              marginTop: 10,
              borderRadius: 14,
              border: `1px solid ${tier.ring}`,
              background: tier.soft,
              padding: '14px 16px',
              animation: 'fadeSlideUp .22s cubic-bezier(.25,.46,.45,.94) both',
            }}>
              {/* 档位标题行 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}>
                <div>
                  <div style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: tier.accent,
                    letterSpacing: '.02em',
                  }}>
                    {tierMeta[activeTier].cn}
                    <span style={{ fontSize: 12, fontWeight: 600, marginLeft: 6, opacity: .7 }}>
                      / {tierMeta[activeTier].label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {activeTier === 'professional' || activeTier === 'elite'
                      ? '动力链训练体系'
                      : '传统分化训练体系'}
                  </div>
                </div>
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: tier.soft,
                  border: `1px solid ${tier.ring}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  color: tier.accent,
                }}>◆</div>
              </div>

              {/* 标准对比三行 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {[
                  { label: '体脂率标准', standard: standards.bf, current: bfText },
                  { label: '心率目标', standard: standards.rhr, current: rhrText },
                  { label: '力量基准', standard: standards.strength, current: strengthText },
                ].map(row => (
                  <div key={row.label} style={{
                    background: 'rgba(255,255,255,.65)',
                    borderRadius: 10,
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}>
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, flexShrink: 0 }}>
                      {row.label}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ fontSize: 11, color: '#94a3b8' }}>{row.standard}</span>
                      <span style={{ fontSize: 10, color: '#cbd5e1' }}>｜</span>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: row.current === '待录入' ? '#cbd5e1' : tier.accent,
                      }}>
                        {row.current}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 距下一档提示 */}
              <div style={{
                fontSize: 11,
                color: '#64748b',
                marginBottom: 12,
                padding: '6px 10px',
                background: 'rgba(255,255,255,.5)',
                borderRadius: 8,
                lineHeight: 1.5,
              }}>
                {score.tier === 'ultra'
                  ? '✓ 已达到最高档位，继续保持训练质量。'
                  : `距 ${score.tier === 'standard' ? 'Pro' : 'Elite'} 档差 ${score.gap_to_next} 分，优先提升：${dimLabelMap[score.weakest as keyof typeof dimLabelMap] || score.weakest}`}
              </div>

              {/* 升级按钮 */}
              {tierOrder.indexOf(activeTier) < tierOrder.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = tierOrder.indexOf(activeTier);
                    if (currentIndex < tierOrder.length - 1) {
                      switchTier(tierOrder[currentIndex + 1]);
                    }
                  }}
                  disabled={tierSwitchingId === activeClient?.id}
                  style={{
                    width: '100%',
                    height: 40,
                    borderRadius: 10,
                    border: `1px solid ${tier.ring}`,
                    background: tier.accent,
                    color: '#fff',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: tierSwitchingId === activeClient?.id ? 'not-allowed' : 'pointer',
                    opacity: tierSwitchingId === activeClient?.id ? 0.6 : 1,
                    transition: 'all .2s cubic-bezier(.25,.46,.45,.94)',
                    letterSpacing: '.02em',
                  }}
                >
                  {tierSwitchingId === activeClient?.id
                    ? '保存中...'
                    : `升级至 ${tierMeta[tierOrder[tierOrder.indexOf(activeTier) + 1]].cn}`}
                </button>
              )}
            </div>
          </div>

          {/* 训练历史区块 */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
          <button
            type="button"
            onClick={() => setShowTrainingHistory(!showTrainingHistory)}
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
              marginTop: 0,
            }}
          >
            <span>{showTrainingHistory ? '▾' : '▸'}</span>
            • TRAINING HISTORY（训练历史）
          </button>

          {showTrainingHistory && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!activeClient.sessions || activeClient.sessions.length === 0 ? (
                <div style={{
                  padding: 16,
                  borderRadius: 10,
                  border: '1px solid rgba(216,221,236,.75)',
                  background: 'rgba(255,255,255,.55)',
                  textAlign: 'center',
                  color: '#94a3b8',
                  fontSize: 12,
                }}>
                  暂无训练记录
                </div>
              ) : (
                [...activeSessions].filter(s => s?.date).reverse().map((session, idx, arr) => {
                  const sessionDate = (() => {
                    try {
                      return new Date(session.date).toLocaleDateString('zh-CN');
                    } catch {
                      return '日期无效';
                    }
                  })();
                  const rpe = session.rpe || 0;
                  let rpeBgColor = '#e8f5e9';
                  let rpeTextColor = '#2e7d32';
                  if (rpe >= 8) {
                    rpeBgColor = '#ffebee';
                    rpeTextColor = '#c62828';
                  } else if (rpe >= 6) {
                    rpeBgColor = '#e3f2fd';
                    rpeTextColor = '#1565c0';
                  }

                  // 查找上一个同名 session
                  const prevSessionIndex = arr.findIndex((s, sIdx) => sIdx > idx && s.day === session.day);
                  const prevSession = prevSessionIndex >= 0 ? arr[prevSessionIndex] : null;

                  return (
                    <div
                      key={session.date}
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
                      {/* 日期 + session 名称 + RPE */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#1f2435' }}>
                          {sessionDate} · {session.day}
                        </div>
                        <div
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: rpeBgColor,
                            color: rpeTextColor,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          RPE {rpe}
                        </div>
                      </div>

                      {/* 教练备注 */}
                      {session.note && (
                        <div
                          style={{
                            fontSize: 12,
                            fontStyle: 'italic',
                            color: '#94a3b8',
                            paddingLeft: 8,
                            borderLeft: '2px solid #cbd5e1',
                          }}
                        >
                          {session.note}
                        </div>
                      )}

                      {/* actual_weights 列表 */}
                      {(session as any).actual_weights && (session as any).actual_weights.length > 0 && (
                        <div style={{ fontSize: 12, color: '#475569' }}>
                          {((session as any).actual_weights || []).map((weight: number, wIdx: number) => (
                            <div key={wIdx} style={{ marginTop: wIdx > 0 ? 4 : 0 }}>
                              实际重量 {wIdx + 1}：{weight}kg
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 重量对比 */}
                      {prevSession && (session as any).actual_weights && (session as any).actual_weights.length > 0 && (prevSession as any).actual_weights && (prevSession as any).actual_weights.length > 0 && (
                        <div style={{ fontSize: 12, marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(226,232,240,.5)' }}>
                          <div style={{ color: '#64748b', marginBottom: 4, fontWeight: 600 }}>重量对比（vs 上次 {prevSession.day}）</div>
                          {((session as any).actual_weights || []).map((currentWeight: number, wIdx: number) => {
                            const prevWeight = ((prevSession as any).actual_weights || [])[wIdx];
                            if (prevWeight === undefined) return null;
                            const diff = currentWeight - prevWeight;
                            const color = diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#64748b';
                            const sign = diff > 0 ? '+' : '';
                            return (
                              <div key={wIdx} style={{ color, fontSize: 11, marginTop: 2, fontWeight: 600 }}>
                                {wIdx + 1}# {sign}{diff}kg ({prevWeight}kg → {currentWeight}kg)
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
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
                已填写时间：{(() => {
                  const completedAt = activeClient.profile?.survey_completed_at;
                  if (!completedAt) return '时间无效';
                  try {
                    return new Date(completedAt).toLocaleString('zh-CN');
                  } catch {
                    return '时间无效';
                  }
                })()}
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
          border-radius: 14px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          margin-bottom: 14px;
        }

        .clients-premium .avatar-orb {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(140deg, rgba(31,37,56,.95), rgba(59,67,95,.92));
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          letter-spacing: .03em;
          flex-shrink: 0;
          font-size: 15px;
        }

        .clients-premium .head-name {
          font-size: 22px;
          line-height: 1.1;
          font-weight: 800;
          color: #1f2435;
          letter-spacing: -.01em;
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
          gap: 8px;
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
          padding: 10px 12px;
          font-size: 12px;
          color: #4e5873;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
          gap: 10px;
          align-items: center;
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
