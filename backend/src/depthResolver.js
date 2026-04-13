/**
 * depthResolver.js
 * 四道限制过滤，统一计算训练深度参数。
 * 优先级：① Deload强制 > ② membershipLevel×tier不匹配警告 > ③ 状态差降档 > ④ standard×ultra质量警告
 *
 * @param {Object} opts
 * @param {string} opts.membershipLevel  - 会员包档位: standard | advanced | professional | elite
 * @param {string} opts.tier             - 课单价档位: standard | pro | ultra
 * @param {number} opts.statusScore      - 课前状态分 1-5
 * @param {string} opts.intensityPhase   - 周期阶段: build | peak | deload
 * @returns {Object} 深度参数 + 可选警告字段
 */
export function resolveDepthParams({ membershipLevel = 'standard', tier = 'standard', statusScore = 3, intensityPhase = 'build' } = {}) {

  // ── 限制一：Deload 强制覆盖（最高优先级）─────────────────────────
  if (intensityPhase === 'deload') {
    return {
      moduleCount: 2,
      exPerMod: 2,
      supersetMax: 0,
      noteDepth: 'basic',
      duration: '45-50min',
      totalExercises: '4-6个动作',
      setCount: 2,
      restSeconds: '120秒',
      statusLevel: 'normal',
      moduleStructure: [
        { name: '低强度全身激活', format: '独立单体', exercises: 2, sets: 2, rest: 120 },
        { name: '恢复拉伸',       format: '独立单体', exercises: 2, sets: 2, rest: 120 },
      ],
      forceReason: 'Deload周强制降量，动作质量优先，不追求数量',
    };
  }

  // ── 限制二：elite/professional × standard单价不匹配警告 ───────────
  let mismatchWarning = '';
  if ((membershipLevel === 'elite' || membershipLevel === 'professional') && tier === 'standard') {
    mismatchWarning = `${membershipLevel === 'elite' ? 'Elite' : 'Professional'}档会员使用standard课程单价，训练深度与会员档位不匹配，建议升级课程单价至pro或ultra`;
  }

  // ── 限制三：状态差降一级（statusScore ≤ 2）────────────────────────
  let adjustedTier = tier;
  let adjustReason = '';
  if (statusScore <= 2) {
    adjustedTier = tier === 'ultra' ? 'pro' : 'standard';
    adjustReason = `客户今日状态差(${statusScore}/5)，课程深度自动降档保护身体（${tier} → ${adjustedTier}）`;
  }

  // ── 深度参数表 ────────────────────────────────────────────────────
  const depthMap = {
    standard: {
      moduleCount: 2,
      exPerMod: 2,
      supersetMax: 0,
      noteDepth: 'basic',
      duration: '60min',
      restSeconds: '90-120秒',
      moduleStructure: [
        { name: '基础复合', format: '独立单体', exercises: 2, sets: 3, rest: 120 },
        { name: '辅助强化', format: '独立单体', exercises: 2, sets: 3, rest: 90 },
      ],
      statusBonus: {
        normal: { moduleIndex: 1, extraEx: 1 },
        good:   { moduleIndex: 1, extraEx: 1 },
      },
    },
    pro: {
      moduleCount: 3,
      exPerMod: 3,
      supersetMax: 2,
      noteDepth: 'standard',
      duration: '60min',
      restSeconds: '60-90秒',
      moduleStructure: [
        { name: '地基力量',   format: '超级组A1+A2', exercises: 2, sets: 4, rest: 90 },
        { name: '动力链主训', format: '超级组B1+B2', exercises: 2, sets: 3, rest: 75 },
        { name: '单侧稳定',   format: '独立单体',    exercises: 2, sets: 3, rest: 60 },
      ],
      statusBonus: {
        normal: { moduleIndex: 1, extraEx: 1 },
        good:   { moduleIndex: 2, extraEx: 1 },
      },
    },
    ultra: {
      moduleCount: 4,
      exPerMod: 3,
      supersetMax: 4,
      noteDepth: 'deep',
      duration: '70min',
      restSeconds: '45-60秒',
      moduleStructure: [
        { name: '最大力量爆发', format: '独立单体',     exercises: 2, sets: 4, rest: 120 },
        { name: '动力链主训',   format: '功能链三联组', exercises: 3, sets: 3, rest: 75 },
        { name: '单侧专项',     format: '超级组',       exercises: 2, sets: 3, rest: 60 },
        { name: '代谢强化',     format: '循环',         exercises: 2, sets: 3, rest: 45 },
      ],
      statusBonus: {
        normal: { moduleIndex: 1, extraEx: 1 },
        good:   { moduleIndex: 2, extraEx: 1 },
      },
    },
  };

  // ── 根据 statusScore 计算状态等级 ────────────────────────────────
  const statusLevel = statusScore >= 4 ? 'good' : statusScore >= 3 ? 'normal' : 'poor';

  // ── 应用状态加成 ──────────────────────────────────────────────────
  const params = { ...(depthMap[adjustedTier] || depthMap['pro']) };
  params.moduleStructure = params.moduleStructure.map(m => ({ ...m })); // 深拷贝
  if (statusLevel !== 'poor' && params.statusBonus?.[statusLevel]) {
    const bonus = params.statusBonus[statusLevel];
    params.moduleStructure = params.moduleStructure.map((m, i) =>
      i === bonus.moduleIndex
        ? { ...m, exercises: m.exercises + bonus.extraEx }
        : m
    );
  }
  params.statusLevel = statusLevel;

  // 保留兼容字段
  params.setCount     = params.moduleStructure[0]?.sets ?? 3;
  params.totalExercises = `${params.moduleStructure.reduce((s, m) => s + m.exercises, 0)}个主训动作`;

  // ── 限制四：standard会员 × ultra单价质量警告 ─────────────────────
  if (membershipLevel === 'standard' && tier === 'ultra') {
    params.qualityWarning = 'standard档客户处于基础建立阶段，动作数取下限，优先动作质量而非数量，避免认知超载';
  }

  if (adjustReason)    params.adjustReason    = adjustReason;
  if (mismatchWarning) params.mismatchWarning = mismatchWarning;

  return params;
}
