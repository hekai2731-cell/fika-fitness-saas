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
      moduleCount: 3,
      exPerMod: 2,
      supersetMax: 0,
      noteDepth: 'basic',
      duration: '55-65min',
      forceReason: 'Deload周强制降量，固定3模块2动作，无超级组，动作质量优先',
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
    standard: { moduleCount: 3, exPerMod: 2, supersetMax: 1, noteDepth: 'basic',    duration: '60-70min' },
    pro:      { moduleCount: 5, exPerMod: 3, supersetMax: 3, noteDepth: 'standard', duration: '70-80min' },
    ultra:    { moduleCount: 6, exPerMod: 4, supersetMax: 4, noteDepth: 'deep',     duration: '80-90min' },
  };

  const params = { ...(depthMap[adjustedTier] || depthMap['pro']) };

  // ── 限制四：standard会员 × ultra单价质量警告 ─────────────────────
  if (membershipLevel === 'standard' && tier === 'ultra') {
    params.qualityWarning = 'standard档客户处于基础建立阶段，动作数取下限，优先动作质量而非数量，避免认知超载';
  }

  if (adjustReason)    params.adjustReason    = adjustReason;
  if (mismatchWarning) params.mismatchWarning = mismatchWarning;

  return params;
}
