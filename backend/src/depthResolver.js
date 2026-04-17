/**
 * depthResolver.js
 * 四道限制过滤，统一计算训练深度参数。
 * 优先级：① Deload强制 > ② membershipLevel×tier不匹配警告 > ③ 状态差降档
 *
 * @param {Object} opts
 * @param {string} opts.membershipLevel  - 会员包档位: standard | advanced | professional | elite
 * @param {string} opts.tier             - 课单价档位: standard | pro
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
    mismatchWarning = `${membershipLevel === 'elite' ? 'Elite' : 'Professional'}档会员使用standard课程单价，训练深度与会员档位不匹配，建议升级课程单价至pro`;
  }

  // ── 限制三：状态差降一级（statusScore ≤ 2）────────────────────────
  let adjustedTier = tier;
  let adjustReason = '';
  if (statusScore <= 2) {
    adjustedTier = 'standard';
    adjustReason = `客户今日状态差(${statusScore}/5)，课程深度自动降档保护身体（${tier} → ${adjustedTier}）`;
  }

  // ── 深度参数表 ────────────────────────────────────────────────────
  const depthMap = {
    standard: {
      moduleCount: 3,
      exPerMod: 3,
      supersetMax: 1,
      noteDepth: 'basic',
      duration: '60min',
      restSeconds: '90-120秒',
      moduleStructure: [
        { name: '热身激活',     format: '独立单体', exercises: 3, sets: 2, rest: 45  },
        { name: '多关节主力量', format: '独立单体', exercises: 3, sets: 4, rest: 110 },
        { name: '单关节辅助',   format: '独立单体', exercises: 3, sets: 3, rest: 70  },
      ],
      statusBonus: {
        normal: { moduleIndex: 1, extraEx: 1 },
        good:   { moduleIndex: 1, extraEx: 1 },
      },
    },
    pro: {
      moduleCount: 4,
      exPerMod: 3,
      supersetMax: 3,
      noteDepth: 'standard',
      duration: '70min',
      restSeconds: '60-90秒',
      moduleStructure: [
        { name: '神经重置热身', format: '独立单体',    exercises: 3, sets: 2, rest: 40 },
        { name: '主力量',       format: '超级组A1+A2', exercises: 3, sets: 4, rest: 90 },
        { name: '动力链整合',   format: '功能链三联组', exercises: 3, sets: 3, rest: 75 },
        { name: '收尾减压',     format: '独立单体',    exercises: 2, sets: 1, rest: 0  },
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

  if (adjustReason)    params.adjustReason    = adjustReason;
  if (mismatchWarning) params.mismatchWarning = mismatchWarning;

  return params;
}
