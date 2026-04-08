function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function roundTo5(n) {
  return Math.round(n / 5) * 5;
}

function estimateCalories({ weight, goal, tier }) {
  const w = Number(weight) || 65;
  const maintenance = w * 32;
  const g = String(goal || '').toLowerCase();
  const t = String(tier || 'standard').toLowerCase();

  let cal = maintenance;
  if (g.includes('减脂') || g.includes('fat') || g.includes('lose')) cal = maintenance - 350;
  else if (g.includes('增肌') || g.includes('gain') || g.includes('muscle')) cal = maintenance + 250;

  if (t === 'ultra') cal += 120;
  else if (t === 'pro') cal += 60;

  return clamp(roundTo5(cal), 1400, 3600);
}

function estimateMacros({ calories, weight, goal }) {
  const w = Number(weight) || 65;
  const g = String(goal || '').toLowerCase();

  const proteinPerKg = g.includes('增肌') || g.includes('muscle') ? 2.1 : 1.8;
  const protein = roundTo5(clamp(w * proteinPerKg, 90, 220));

  const fatCalories = calories * 0.28;
  const fat = roundTo5(clamp(fatCalories / 9, 40, 110));

  const carbsCalories = calories - protein * 4 - fat * 9;
  const carbs = roundTo5(clamp(carbsCalories / 4, 80, 420));

  return { protein, carbs, fat };
}

function mealTemplate(name, time, items) {
  return { name, time, items };
}

export async function generateDietPlan(input = {}) {
  const calories = estimateCalories(input);
  const { protein, carbs, fat } = estimateMacros({
    calories,
    weight: input.weight,
    goal: input.goal,
  });

  const title =
    String(input.goal || '').includes('减脂')
      ? 'AI 减脂营养阶段'
      : String(input.goal || '').includes('增肌')
        ? 'AI 增肌营养阶段'
        : 'AI 体能表现营养阶段';

  const period = 'Week 1–4';
  const notes = [
    '优先天然食材，减少精制糖与油炸食品。',
    '每餐保证优质蛋白，训练后 1-2 小时完成补给。',
    '每日饮水 30-35 ml/kg，并关注睡眠恢复。',
  ].join(' ');

  const meals = [
    mealTemplate('早餐', '08:00', [
      { name: '燕麦', amount: '60g', calories: 230, protein: 8 },
      { name: '鸡蛋', amount: '2个', calories: 140, protein: 12 },
      { name: '希腊酸奶', amount: '150g', calories: 120, protein: 12 },
    ]),
    mealTemplate('午餐', '12:30', [
      { name: '鸡胸肉', amount: '180g', calories: 280, protein: 38 },
      { name: '米饭', amount: '180g', calories: 230, protein: 4 },
      { name: '时蔬', amount: '250g', calories: 90, protein: 4 },
    ]),
    mealTemplate('晚餐', '18:30', [
      { name: '三文鱼/牛肉', amount: '160g', calories: 320, protein: 34 },
      { name: '土豆/全麦面', amount: '180g', calories: 210, protein: 5 },
      { name: '蔬菜沙拉', amount: '250g', calories: 100, protein: 3 },
    ]),
    mealTemplate('加餐', '16:30', [
      { name: '乳清蛋白', amount: '1份', calories: 130, protein: 24 },
      { name: '香蕉', amount: '1根', calories: 100, protein: 1 },
    ]),
  ];

  return {
    title,
    period,
    notes,
    calories,
    protein,
    carbs,
    fat,
    meals,
  };
}
