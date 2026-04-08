/**
 * heartRateUtils.ts
 * FiKA 心率系统核心计算 — 卡氏公式 + 五训练区间
 */

export interface HRZone {
  zone: 1 | 2 | 3 | 4 | 5;
  label: string;
  labelEn: string;
  minPct: number;
  maxPct: number;
  minBpm: number;
  maxBpm: number;
  color: string;
  bgColor: string;
  tier: string;
  description: string;
  function: string;
}

export interface HRProfile {
  age: number;
  rhr: number;
  mhr: number;
  hrr: number;
  zones: HRZone[];
}

export interface SessionHRStats {
  avgBpm: number;
  maxBpm: number;
  minBpm: number;
  durationSeconds: number;
  zoneDurations: Record<number, number>;
  dominantZone: number | null;
}

export function calcMHR(age: number): number {
  return Math.round(220 - age);
}

export function karvonen(mhr: number, rhr: number, pct: number): number {
  return Math.round((mhr - rhr) * (pct / 100) + rhr);
}

export function buildHRProfile(age: number, rhr: number): HRProfile {
  const mhr = calcMHR(age);
  const hrr = mhr - rhr;

  const defs = [
    { zone: 1 as const, label: '恢复拔固', labelEn: 'Recovery', minPct: 50, maxPct: 60, color: '#6B7280', bgColor: 'rgba(107,114,128,0.12)', tier: 'Standard', description: '非常轻松，呼吸平稳，能顺畅聊天', function: '促进血液循环，加速代谢废物排出' },
    { zone: 2 as const, label: '有氧燃脂', labelEn: 'Fat Burn', minPct: 60, maxPct: 70, color: '#0D9488', bgColor: 'rgba(13,148,136,0.12)', tier: 'Standard', description: '微微出汗，呼吸稍快，能用短句对话', function: '脂肪供能比例最高，建立心肺底座' },
    { zone: 3 as const, label: '心肺强化', labelEn: 'Aerobic', minPct: 70, maxPct: 80, color: '#7C3AED', bgColor: 'rgba(124,58,237,0.12)', tier: 'Pro', description: '呼吸急促，只能说一两个词', function: '提升血液循环效率与有氧能力' },
    { zone: 4 as const, label: '乳酸阈值', labelEn: 'Threshold', minPct: 80, maxPct: 90, color: '#D97706', bgColor: 'rgba(217,119,6,0.12)', tier: 'Ultra', description: '肌肉酸痛，大口喘气，无法说话', function: 'HIIT 与爆发力，提升无氧耐力' },
    { zone: 5 as const, label: '极限爆发', labelEn: 'Maximum', minPct: 90, maxPct: 100, color: '#DC2626', bgColor: 'rgba(220,38,38,0.12)', tier: 'Ultra', description: '极度痛苦，只能维持数秒到数十秒', function: '仅限高阶运动员竞技挑战' },
  ];

  const zones: HRZone[] = defs.map((z) => ({
    ...z,
    minBpm: karvonen(mhr, rhr, z.minPct),
    maxBpm: karvonen(mhr, rhr, z.maxPct),
  }));

  return { age, rhr, mhr, hrr, zones };
}

export function detectZone(bpm: number, profile: HRProfile): HRZone | null {
  for (let i = profile.zones.length - 1; i >= 0; i--) {
    if (bpm >= profile.zones[i].minBpm) return profile.zones[i];
  }
  return null;
}

export function calcSessionStats(
  samples: Array<{ bpm: number; zone: number | null }>,
): SessionHRStats | null {
  if (!samples.length) return null;
  const bpms = samples.map((s) => s.bpm);
  const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
  const zoneDurations: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  samples.forEach((s) => {
    if (s.zone) zoneDurations[s.zone]++;
  });
  const dominant = Object.entries(zoneDurations)
    .sort(([, a], [, b]) => b - a)
    .find(([, v]) => v > 0)?.[0];

  return {
    avgBpm: avg,
    maxBpm: Math.max(...bpms),
    minBpm: Math.min(...bpms),
    durationSeconds: samples.length,
    zoneDurations,
    dominantZone: dominant ? Number(dominant) : null,
  };
}

export const ZONE_COLORS: Record<number, string> = {
  1: '#6B7280',
  2: '#0D9488',
  3: '#7C3AED',
  4: '#D97706',
  5: '#DC2626',
};

export const ZONE_BG: Record<number, string> = {
  1: 'rgba(107,114,128,0.15)',
  2: 'rgba(13,148,136,0.15)',
  3: 'rgba(124,58,237,0.15)',
  4: 'rgba(217,119,6,0.15)',
  5: 'rgba(220,38,38,0.15)',
};
