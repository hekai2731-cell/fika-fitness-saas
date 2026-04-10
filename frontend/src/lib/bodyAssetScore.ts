import type { Client } from '@/lib/db';

type Breakdown = {
  bodyComp: number;
  performance: number;
  nutrition: number;
  recovery: number;
  execution: number;
};

type Available = {
  bodyComp: boolean;
  performance: boolean;
  nutrition: boolean;
  recovery: boolean;
  execution: boolean;
};

const MAX: Breakdown = {
  bodyComp: 20,
  performance: 25,
  nutrition: 20,
  recovery: 20,
  execution: 15,
};

const DIM_LABEL: Record<keyof Breakdown, string> = {
  bodyComp: '体成分',
  performance: '运动表现',
  nutrition: '营养合规',
  recovery: '恢复质量',
  execution: '执行率',
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function parseDateSafe(input?: string): number {
  if (!input) return 0;
  const t = new Date(input).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function calcBodyAssetScore(client: Client): {
  total: number;
  breakdown: Breakdown;
  available: Available;
  tier: 'standard' | 'pro' | 'ultra';
  weakest: string;
  gap_to_next: number;
} {
  const body = client.bodyMetrics || {};
  const sessions = Array.isArray(client.sessions) ? client.sessions : [];
  const now = Date.now();

  const breakdown: Breakdown = {
    bodyComp: 0,
    performance: 0,
    nutrition: 0,
    recovery: 0,
    execution: 0,
  };

  const available: Available = {
    bodyComp: false,
    performance: false,
    nutrition: false,
    recovery: false,
    execution: false,
  };

  if (typeof body.bf_pct === 'number' && Number.isFinite(body.bf_pct)) {
    const inRange = client.gender === 'male' ? [10, 18] : [18, 26];
    const target = clamp(body.bf_pct, inRange[0], inRange[1]);
    const delta = Math.abs(body.bf_pct - target);
    breakdown.bodyComp = clamp(MAX.bodyComp - delta * 2, 0, MAX.bodyComp);
    available.bodyComp = true;
  }

  const hasRhr = typeof body.rhr === 'number' && Number.isFinite(body.rhr);
  if (sessions.length > 0 || hasRhr) {
    const countScore = clamp((sessions.length / 12) * 10, 0, 10);
    let rhrScore = 0;
    if (hasRhr) {
      const target = client.gender === 'male' ? 60 : 65;
      const above = Math.max(0, body.rhr! - target);
      rhrScore = clamp(15 - Math.floor(above / 5) * 3, 0, 15);
    }
    breakdown.performance = clamp(countScore + rhrScore, 0, MAX.performance);
    available.performance = sessions.length > 0 && hasRhr;
  }

  const dailyLogs: Array<{ date?: string; totalProtein?: number }> = Array.isArray((client as any).dailyLogs)
    ? (client as any).dailyLogs
    : [];
  const recentLogs = dailyLogs
    .filter((d) => now - parseDateSafe(d.date) <= 7 * 24 * 60 * 60 * 1000)
    .slice(-7);
  if (recentLogs.length > 0 && typeof client.weight === 'number' && client.weight > 0) {
    const avgProtein =
      recentLogs.reduce((sum, l) => sum + Number(l.totalProtein || 0), 0) / recentLogs.length;
    const targetProtein = client.weight * 1.6;
    const compliance = targetProtein > 0 ? clamp(avgProtein / targetProtein, 0, 1) : 0;
    breakdown.nutrition = clamp(compliance * MAX.nutrition, 0, MAX.nutrition);
    available.nutrition = true;
  }

  const recentRpe = sessions.slice(-5).map((s) => Number((s as any).rpe || 0)).filter((n) => n > 0);
  const hasSleep = typeof body.sleep_hours === 'number' && Number.isFinite(body.sleep_hours);
  if (hasSleep || recentRpe.length > 0) {
    let sleepScore = 0;
    if (hasSleep) {
      const sleep = Number(body.sleep_hours || 0);
      if (sleep >= 7 && sleep <= 9) sleepScore = 10;
      else if ((sleep >= 6 && sleep < 7) || (sleep > 9 && sleep <= 10)) sleepScore = 7;
      else if (sleep >= 5) sleepScore = 4;
      else sleepScore = 1;
    }
    let rpeScore = 0;
    if (recentRpe.length > 0) {
      const avgRpe = recentRpe.reduce((a, b) => a + b, 0) / recentRpe.length;
      rpeScore = avgRpe <= 7 ? 10 : avgRpe <= 8 ? 7 : avgRpe <= 9 ? 4 : 1;
    }
    breakdown.recovery = clamp(sleepScore + rpeScore, 0, MAX.recovery);
    available.recovery = hasSleep && recentRpe.length > 0;
  }

  const plannedDays = (client.blocks || []).reduce((sum, block) => {
    const weeks = Array.isArray(block.training_weeks) ? block.training_weeks : [];
    return sum + weeks.reduce((wSum, w) => wSum + (Array.isArray(w.days) ? w.days.length : 0), 0);
  }, 0);
  if (plannedDays > 0) {
    const ratio = clamp(sessions.length / plannedDays, 0, 1);
    breakdown.execution = clamp(ratio * MAX.execution, 0, MAX.execution);
  }
  available.execution = plannedDays > 0;

  const keys = Object.keys(breakdown) as Array<keyof Breakdown>;
  const activeKeys = keys.filter((k) => available[k]);
  const rawTotal = activeKeys.reduce((sum, k) => sum + breakdown[k], 0);
  const rawMax = activeKeys.reduce((sum, k) => sum + MAX[k], 0);
  const scaled = rawMax > 0 ? (rawTotal / rawMax) * 100 : 0;
  const total = Math.round(clamp(scaled, 0, 100));

  const percs = activeKeys.map((k) => ({ k, p: MAX[k] > 0 ? breakdown[k] / MAX[k] : 1 }));
  const weakest = percs.length
    ? DIM_LABEL[percs.sort((a, b) => a.p - b.p)[0].k]
    : '数据不足';

  const tier: 'standard' | 'pro' | 'ultra' = total >= 85 ? 'ultra' : total >= 70 ? 'pro' : 'standard';
  const nextThreshold = tier === 'standard' ? 70 : tier === 'pro' ? 85 : 100;
  const gap_to_next = tier === 'ultra' ? 0 : Math.max(0, nextThreshold - total);

  return { total, breakdown, available, tier, weakest, gap_to_next };
}
