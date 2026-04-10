/**
 * bodyAssetScore.js
 * 身体资产评分系统 - 根据体成分、运动表现、营养、恢复、规划执行等维度计算客户得分
 */

/**
 * 计算身体资产总分和各维度得分
 * @param {Object} client - 客户对象，包含 sessions, weeklyData, dietPlans, rhr, body 等数据
 * @returns {Object} { total, breakdown: {...}, tier, weakest, gap_to_next }
 */
export function calcBodyAssetScore(client = {}) {
  const breakdown = {};

  // 维度 1: 体成分（20分）
  breakdown.bodyComp = calcBodyComposition(client);

  // 维度 2: 运动表现（25分）
  breakdown.performance = calcPerformance(client);

  // 维度 3: 营养合规（20分）
  breakdown.nutrition = calcNutrition(client);

  // 维度 4: 恢复质量（20分）
  breakdown.recovery = calcRecovery(client);

  // 维度 5: 规划执行（15分）
  breakdown.execution = calcExecution(client);

  // 计算总分
  const total = Math.round(
    breakdown.bodyComp +
    breakdown.performance +
    breakdown.nutrition +
    breakdown.recovery +
    breakdown.execution
  );

  // 确定档位（标准档：≤70，进阶档：71-85，高级档：>85）
  let tier = 'standard';
  if (total > 85) tier = 'ultra';
  else if (total > 70) tier = 'pro';

  // 找最弱维度
  const dims = { bodyComp: breakdown.bodyComp, performance: breakdown.performance, nutrition: breakdown.nutrition, recovery: breakdown.recovery, execution: breakdown.execution };
  let weakest = 'bodyComp';
  let minScore = breakdown.bodyComp;
  for (const [key, val] of Object.entries(dims)) {
    if (val < minScore) {
      minScore = val;
      weakest = key;
    }
  }

  // 计算距离下一档的差距
  let gap_to_next = 0;
  if (tier === 'standard') {
    gap_to_next = Math.max(0, 71 - total);
  } else if (tier === 'pro') {
    gap_to_next = Math.max(0, 86 - total);
  }

  return {
    total,
    breakdown,
    tier,
    weakest,
    gap_to_next,
  };
}

/**
 * 体成分评分（20分）
 */
function calcBodyComposition(client = {}) {
  const bodyFat = parseFloat(client.bodyFat) || null;
  const height = parseFloat(client.height) || 0;
  const weight = parseFloat(client.weight) || 0;
  const gender = client.gender || 'male';

  if (bodyFat !== null && !isNaN(bodyFat)) {
    // 有体脂率数据
    const ideal = gender === 'female' ? 18 : 15; // 男性目标15%，女性18%
    const range = gender === 'female' ? 3 : 3; // ±3%

    if (bodyFat >= ideal - range && bodyFat <= ideal + range) {
      return 20; // 满分
    }

    const deviation = Math.abs(bodyFat - ideal);
    return Math.max(0, 20 - deviation * 2); // 每偏离1%扣2分
  }

  // 无体脂率数据，用BMI估算
  if (height > 0 && weight > 0) {
    const bmi = weight / ((height / 100) ** 2);
    if (bmi >= 18.5 && bmi <= 24) {
      return 12; // BMI 健康范围给12分
    }
    if (bmi < 18.5) {
      return 8 + Math.abs(bmi - 18.5) * 2;
    }
    if (bmi > 24) {
      return 12 - Math.abs(bmi - 24) * 1;
    }
  }

  return 0;
}

/**
 * 运动表现评分（25分）
 */
function calcPerformance(client = {}) {
  let score = 0;

  // 基础打卡分（≥12次得10分）
  const sessions = Array.isArray(client.sessions) ? client.sessions : [];
  const sessionCount = sessions.length;
  if (sessionCount >= 12) {
    score += 10;
  } else {
    score += (sessionCount / 12) * 10;
  }

  // 力量数据分（最多8分）
  const maxSquat = parseFloat(client.maxSquat) || 0;
  const weight = parseFloat(client.weight) || 1;
  if (maxSquat > 0) {
    const squatRatio = maxSquat / weight;
    if (squatRatio >= 1.5) {
      score += 8;
    } else {
      score += (squatRatio / 1.5) * 8;
    }
  }

  // 静息心率分（≤60得7分）
  const rhr = parseInt(client.rhr) || 0;
  const gender = client.gender || 'male';
  const rhkTarget = gender === 'female' ? 65 : 60;
  if (rhr <= rhkTarget) {
    score += 7;
  } else if (rhr <= rhkTarget + 10) {
    score += Math.max(0, 7 - (rhr - rhkTarget) / 5 * 3);
  }

  return Math.min(25, Math.round(score * 10) / 10);
}

/**
 * 营养合规评分（20分）
 */
function calcNutrition(client = {}) {
  // 从 client.dailyLogs 或 weeklyData 中读取近7日蛋白质摄入
  const weight = parseFloat(client.weight) || 1;
  const targetProtein = weight * 1.6; // 目标1.6g/kg

  let proteinData = [];

  // 尝试从 dailyLogs 读取
  if (Array.isArray(client.dailyLogs)) {
    const last7Days = client.dailyLogs.slice(-7);
    proteinData = last7Days
      .map(log => parseFloat(log.protein) || 0)
      .filter(p => p > 0);
  }

  // 如果没有日志数据，从 weeklyData 估算
  if (proteinData.length === 0 && Array.isArray(client.weeklyData)) {
    const lastWeek = client.weeklyData.slice(-1)[0] || {};
    const proteinPerDay = parseFloat(lastWeek.protein_avg) || 0;
    if (proteinPerDay > 0) {
      proteinData = [proteinPerDay];
    }
  }

  if (proteinData.length === 0) {
    return 10; // 无数据，给10分
  }

  const avgProtein = proteinData.reduce((a, b) => a + b, 0) / proteinData.length;
  const compliance = Math.min(1, avgProtein / targetProtein);

  return Math.round(compliance * 20 * 10) / 10;
}

/**
 * 恢复质量评分（20分）
 */
function calcRecovery(client = {}) {
  let score = 0;

  // 睡眠评分（最多10分）
  const weeklyData = Array.isArray(client.weeklyData) ? client.weeklyData : [];
  if (weeklyData.length > 0) {
    const recentSleep = weeklyData.slice(-7).map(w => parseFloat(w.sleep) || 0).filter(s => s > 0);
    if (recentSleep.length > 0) {
      const avgSleep = recentSleep.reduce((a, b) => a + b, 0) / recentSleep.length;
      if (avgSleep >= 7 && avgSleep <= 9) {
        score += 10;
      } else if (avgSleep >= 6.5 && avgSleep < 10) {
        score += 8;
      } else {
        score += 4;
      }
    }
  } else {
    score += 5; // 无数据给5分
  }

  // RPE 恢复评分（最多10分）
  const sessions = Array.isArray(client.sessions) ? client.sessions : [];
  if (sessions.length >= 5) {
    const last5RPE = sessions.slice(-5).map(s => parseFloat(s.rpe) || 0).filter(r => r > 0);
    if (last5RPE.length > 0) {
      const avgRPE = last5RPE.reduce((a, b) => a + b, 0) / last5RPE.length;
      if (avgRPE <= 7) {
        score += 10; // 均值≤7得满分
      } else if (avgRPE <= 8) {
        score += 7;
      } else {
        score += 3;
      }
    }
  }

  return Math.min(20, score);
}

/**
 * 规划执行评分（15分）
 */
function calcExecution(client = {}) {
  const sessions = Array.isArray(client.sessions) ? client.sessions : [];
  const blocks = Array.isArray(client.blocks) ? client.blocks : [];

  // 计算计划的总训练日数
  let plannedSessions = 0;
  for (const block of blocks) {
    const weeks = Array.isArray(block.training_weeks) ? block.training_weeks : [];
    for (const week of weeks) {
      const days = Array.isArray(week.days) ? week.days : [];
      plannedSessions += days.filter(d => d.day && d.modules?.length > 0).length;
    }
  }

  if (plannedSessions === 0) {
    return 7.5; // 无计划给7.5分
  }

  // 出勤率 = 实际sessions / 计划sessions
  const attendance = Math.min(1, sessions.length / plannedSessions);

  return attendance * 15;
}

/**
 * 生成评分摘要文本
 */
export function getScoreSummary(score, client = {}) {
  const dimNames = {
    bodyComp: '体成分',
    performance: '运动表现',
    nutrition: '营养合规',
    recovery: '恢复质量',
    execution: '规划执行',
  };

  let summary = `身体资产总分：${score.total}分（${score.tier === 'ultra' ? '高级档 Ultra' : score.tier === 'pro' ? '进阶档 Pro' : '标准档 Standard'}）`;

  if (score.gap_to_next > 0) {
    const nextTier = score.tier === 'standard' ? 'Pro' : 'Ultra';
    summary += `\n距离${nextTier}档还差${score.gap_to_next}分，优先提升：${dimNames[score.weakest]}维度`;
  }

  return summary;
}
