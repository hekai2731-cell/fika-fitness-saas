/**
 * planNaming.js
 * 训练周期命名系统 — 按会员档位 × 训练目标/训练方向映射
 */

export const blockNames = {
  standard: {
    fat_loss: '基础减脂入门期', muscle_gain: '基础增肌入门期',
    performance: '基础体能入门期', posture: '姿态入门矫正期',
    rehabilitation: '基础功能入门期', cardio: '有氧入门建立期',
  },
  advanced: {
    fat_loss: '基础体成分改善期', muscle_gain: '肌肉感知建立期',
    performance: '基础体能激活期', posture: '姿态感知矫正期',
    rehabilitation: '基础功能恢复期', cardio: '有氧底座建立期',
  },
  professional: {
    fat_loss: '体成分渐进优化期', muscle_gain: '力量渐进增肌期',
    performance: '动力链建立期', posture: '功能性体态强化期',
    rehabilitation: '功能重建渐进期', cardio: '心肺综合提升期',
  },
  elite: {
    fat_loss: 'X-Sling代谢整合期', muscle_gain: '动力链增肌专项期',
    performance: '功能链爆发提升期', posture: '全链体态整合期',
    rehabilitation: '动力链功能整合期', cardio: '心肺爆发专项期',
  },
};

export const weekThemes = {
  standard: {
    performance: ['动作入门熟悉', '基础动作适应', '初步强度提升', '卸载恢复'],
    muscle_gain: ['肌肉入门感知', '基础收缩熟悉', '初步负荷适应', '卸载恢复'],
    fat_loss: ['代谢入门激活', '基础有氧熟悉', '初步强度适应', '卸载恢复'],
    cardio: ['有氧入门建立', '基础心肺熟悉', '初步耐力适应', '卸载恢复'],
    posture: ['姿态入门感知', '基础核心熟悉', '初步整合适应', '卸载恢复'],
    rehabilitation: ['关节入门活动', '基础稳定熟悉', '初步功能适应', '卸载恢复'],
  },
  advanced: {
    performance: ['动作模式感知', '基础负荷适应', '强度小幅提升', '卸载恢复'],
    muscle_gain: ['肌肉感知建立', '基础收缩强化', '动作质量冲击', '卸载恢复'],
    fat_loss: ['代谢激活', '有氧基础强化', '强度适应', '卸载恢复'],
    cardio: ['有氧底座建立', '心肺基础强化', '耐力适应', '卸载恢复'],
    posture: ['姿态感知建立', '核心激活强化', '整合适应', '卸载恢复'],
    rehabilitation: ['关节活动建立', '基础稳定强化', '功能适应', '卸载恢复'],
  },
  professional: {
    performance: ['垂直链地基建立', '推拉平衡强化', '动力链激活冲击', '卸载恢复'],
    muscle_gain: ['力量渐进建立', '超级组强化', '大重量冲击', '卸载恢复'],
    fat_loss: ['代谢渐进强化', '有氧力量结合', '高强度循环冲击', '卸载恢复'],
    cardio: ['有氧渐进强化', '心肺混合训练', '高强度间歇冲击', '卸载恢复'],
    posture: ['功能激活建立', '姿态力量强化', '整合动作冲击', '卸载恢复'],
    rehabilitation: ['功能渐进建立', '力量整合强化', '全链适应冲击', '卸载恢复'],
  },
  elite: {
    performance: ['X-Sling对角线激活', '动力链主训强化', '功能链爆发冲击', '神经卸载恢复'],
    muscle_gain: ['动力链增肌激活', '超级组主训强化', '极限重量爆发冲击', '神经卸载恢复'],
    fat_loss: ['功能代谢激活', '动力链循环强化', '高功率爆发输出冲击', '神经卸载恢复'],
    cardio: ['功能心肺激活', '动力链有氧强化', '心肺爆发极限冲击', '神经卸载恢复'],
    posture: ['全链激活建立', '动力链矫正强化', '整合爆发冲击', '神经卸载恢复'],
    rehabilitation: ['功能链激活', '动力链重建强化', '整合适应爆发冲击', '神经卸载恢复'],
  },
};

export const dayStyles = {
  standard: {
    strength: ['下肢入门动作', '上肢入门动作', '全身基础熟悉', '核心入门', '恢复拉伸'],
    cardio: ['有氧入门', '全身基础循环', '心肺入门', '低强度活动', '恢复拉伸'],
    technique: ['基础动作入门', '简单技术熟悉', '全身基础整合', '功能入门', '恢复拉伸'],
    balanced: ['下肢入门', '上肢入门', '全身入门', '核心入门', '恢复激活'],
    recovery: ['低强度恢复', '全身活动', '拉伸松动', '核心激活', '恢复整合'],
  },
  advanced: {
    strength: ['下肢感知建立', '上肢推拉感知', '全身基础整合', '核心稳定感知', '恢复激活'],
    cardio: ['有氧基础', '全身循环', '心肺激活', '低强度恢复', '全身整合'],
    technique: ['动作模式建立', '基础技术练习', '全身感知整合', '功能基础', '恢复拉伸'],
    balanced: ['下肢基础', '上肢基础', '全身基础', '核心基础', '恢复激活'],
    recovery: ['低强度恢复', '全身活动', '拉伸松动', '核心激活', '恢复整合'],
  },
  professional: {
    strength: ['下肢力量主导', '上肢推拉平衡', '全身动力链整合', '单侧稳定强化', '爆发力入门'],
    cardio: ['心肺渐进训练', '有氧力量结合', '高强度间歇', '全身循环代谢', '低强度有氧'],
    technique: ['动作渐进强化', '技术专项练习', '全身整合训练', '功能性强化', '恢复激活'],
    balanced: ['下肢力量', '上肢推拉', '心肺提升', '全身整合', '核心稳定'],
    recovery: ['低强度恢复', '全身活动', '拉伸松动', '核心激活', '恢复整合'],
  },
  elite: {
    strength: ['垂直链下肢主导', 'X-Sling上肢推拉', '动力链全身整合', '单侧爆发专项', '旋转链核心'],
    cardio: ['功能心肺主导', '动力链有氧', '高功率间歇冲击', '代谢循环训练', '恢复激活'],
    technique: ['动力链技术主导', '专项功能练习', '全链整合训练', '爆发技术专项', '恢复激活'],
    balanced: ['垂直链下肢', '水平拉力链', '旋转链核心', '动力链整合', '爆发力专项'],
    recovery: ['低强度恢复', '全身活动', '拉伸松动', '核心激活', '恢复整合'],
  },
};

// 中文目标 → 英文 key 映射
export const GOAL_KEY_MAP = {
  '减脂塑形': 'fat_loss', 'fat_loss': 'fat_loss',
  '增肌力量': 'muscle_gain', '增肌': 'muscle_gain', 'muscle_gain': 'muscle_gain',
  '运动表现': 'performance', 'performance': 'performance',
  '体态矫正': 'posture', 'posture': 'posture',
  '康复训练': 'rehabilitation', 'rehabilitation': 'rehabilitation',
  '心肺耐力': 'cardio', 'cardio': 'cardio',
};

// 训练方向 → dayStyles key 映射
export const DIR_KEY_MAP = {
  strength: 'strength', 力量为主: 'strength',
  cardio: 'cardio', 体能为主: 'cardio',
  technique: 'technique', 技术为主: 'technique',
  recovery: 'recovery', 恢复为主: 'recovery',
  balanced: 'balanced', 综合均衡: 'balanced',
};

// 每周频率 → 训练日分布
export function distributeWeekdays(freq) {
  const templates = {
    1: ['周三'],
    2: ['周二', '周五'],
    3: ['周一', '周三', '周五'],
    4: ['周一', '周二', '周四', '周五'],
    5: ['周一', '周二', '周三', '周五', '周六'],
    6: ['周一', '周二', '周三', '周五', '周六', '周日'],
    7: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  };
  return templates[Math.max(1, Math.min(Number(freq) || 3, 7))] || templates[3];
}

/**
 * 训练日名称构建器
 * @param {string} weekTheme  - 本周主题
 * @param {string} dayStyle   - 训练日风格
 * @param {string} phase      - build | peak | deload
 * @returns {string}
 */
export function buildDayName(weekTheme, dayStyle, phase) {
  if (phase === 'deload') return `恢复激活 · ${dayStyle}`;
  if (phase === 'peak')   return `${weekTheme} · ${dayStyle}冲击`;
  return `${weekTheme} · ${dayStyle}`;
}

/**
 * 动态生成整个 Block 的周/日命名
 * @param {Object} opts
 * @param {string}   opts.level        - 会员档位
 * @param {string}   opts.goalKey      - fat_loss | muscle_gain | performance | posture | rehabilitation | cardio
 * @param {string}   opts.dirKey       - strength | cardio | technique | recovery | balanced
 * @param {number}   opts.freq         - 每周训练频次
 * @param {number}   opts.totalWeeks   - 总周数
 * @returns {{ weeks: Array }}
 */
export function generatePlanNames({ level = 'standard', goalKey = 'performance', dirKey = 'balanced', freq = 3, totalWeeks = 8 } = {}) {
  const themePool    = weekThemes[level]?.[goalKey] || weekThemes.advanced.performance;
  const dayStylePool = dayStyles[level]?.[dirKey]   || dayStyles[level]?.balanced || dayStyles.advanced.balanced;

  const count       = Math.max(1, Math.min(Number(totalWeeks) || 8, 52));
  const selectedDays = distributeWeekdays(freq);

  const weeks = [];
  for (let i = 0; i < count; i++) {
    const pos   = i % 4;
    const phase = pos === 3 ? 'deload' : pos === 2 ? 'peak' : 'build';

    const week_theme = themePool[pos] || `第${i + 1}周`;

    // Deload 周减少一天训练
    const weekDayCount   = phase === 'deload'
      ? Math.max(2, selectedDays.length - 1)
      : selectedDays.length;
    const weekSelectedDays = selectedDays.slice(0, weekDayCount);

    const week_brief = phase === 'deload'
      ? `第${i + 1}周卸载恢复，训练量降低30%，${week_theme}，动作质量优先，不追求强度`
      : phase === 'peak'
      ? `第${i + 1}周峰值冲击，${week_theme}，在前几周积累基础上全力冲击极限`
      : `第${i + 1}周渐进加载，${week_theme}，循序渐进提升训练负荷和动作质量`;

    const days = weekSelectedDays.map((dayName, di) => {
      const style = dayStylePool[di % dayStylePool.length] || '综合训练';
      const name  = buildDayName(week_theme, style, phase);
      return { day: dayName, name, focus: style };
    });

    weeks.push({ week_num: i + 1, week_theme, week_brief, intensity_phase: phase, days });
  }

  return { weeks };
}
