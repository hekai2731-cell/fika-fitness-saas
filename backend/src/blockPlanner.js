/**
 * blockPlanner.js
 * 纯规则推断，不调用 AI。
 * - recommendBlock  : 根据身体资产评分推荐 Block 目标
 * - generateWeekFramework : 自动生成 Week 节奏框架
 */
import { calcBodyAssetScore } from './bodyAssetScore.js';

// 会员包 → 默认周数映射
const MEMBERSHIP_WEEKS = {
  elite:        26,
  professional: 15,
  advanced:     6,
  standard:     8,
};

const GOAL_MAP = {
  bodyComp:    '体成分优化 · 减脂增肌并重',
  performance: '运动表现提升 · 力量动力链建立',
  nutrition:   '营养合规配合训练 · 蛋白摄入达标',
  recovery:    '恢复质量改善 · 训练频率优化',
  execution:   '执行率提升 · 建立训练习惯',
};

/**
 * 根据客户数据推荐 Block 配置（不调用 AI）
 * @param {Object} client - 客户对象（含 sessions, weeklyData, membershipLevel, blocks 等）
 * @returns {Object} block_title, block_goal, weeks, weakest_dimension, membership_level
 */
export function recommendBlock(client = {}) {
  const membershipLevel = String(client.membershipLevel || 'standard');
  const weeks = MEMBERSHIP_WEEKS[membershipLevel] || 8;

  let weakest = 'execution';
  try {
    const score = calcBodyAssetScore(client);
    const breakdown = score.breakdown || {};
    // 找得分最低的维度
    weakest = Object.keys(breakdown).reduce(
      (min, k) => (breakdown[k] < (breakdown[min] ?? Infinity) ? k : min),
      Object.keys(breakdown)[0] || 'execution'
    );
  } catch {
    weakest = 'execution';
  }

  const blockNum = (Array.isArray(client.blocks) ? client.blocks.length : 0) + 1;

  return {
    block_title: `Block ${blockNum}`,
    block_goal: GOAL_MAP[weakest] || '综合体能提升',
    weeks,
    weakest_dimension: weakest,
    membership_level: membershipLevel,
  };
}

/**
 * 自动生成 Week 节奏框架（不调用 AI）
 * 周期模式：每4周一个小周期，第4周固定 deload
 * @param {string} blockGoal  - Block 训练目标文字
 * @param {number} totalWeeks - 总周数
 * @returns {TrainingWeek[]}
 */
export function generateWeekFramework(blockGoal = '', totalWeeks = 8) {
  const weeks = [];
  const count = Math.max(1, Math.min(Number(totalWeeks) || 8, 52));

  for (let i = 0; i < count; i++) {
    const pos = i % 4;                                   // 0,1,2 = build；3 = deload
    const phase = pos === 3 ? 'deload' : pos === 2 ? 'peak' : 'build';

    const week_theme =
      phase === 'deload' ? '卸载恢复周' :
      phase === 'peak'   ? '峰值冲击周' :
                           '渐进加载周';

    const week_brief =
      phase === 'deload'
        ? `第${i + 1}周卸载恢复，训练量降低30%，${week_theme}，动作质量优先，不追求强度`
        : phase === 'peak'
        ? `第${i + 1}周峰值冲击，${week_theme}，在前几周积累基础上全力冲击极限`
        : `第${i + 1}周渐进加载，${week_theme}，循序渐进提升训练负荷和动作质量` +
          (blockGoal ? `，服务于目标：${blockGoal}` : '');

    weeks.push({
      week_num: i + 1,
      intensity_phase: phase,
      week_theme,
      week_brief,
      days: [],
    });
  }
  return weeks;
}
