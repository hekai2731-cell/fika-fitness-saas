export async function generateWeekPlan(input = {}) {
  const sessionTier = input.sessionTier || 'standard';
  const days = Array.isArray(input.days) ? input.days : [];
  const recentSessions = Array.isArray(input.recentSessions) ? input.recentSessions : [];
  const lastWeekBrief = String(input.lastWeekBrief || '').trim();

  const tierLabel =
    sessionTier === 'ultra'
      ? 'Ultra 高级档（筋膜神经视角）'
      : sessionTier === 'pro'
        ? 'Pro 进阶档（动力链视角）'
        : 'Standard 基础档（肌肉解剖视角）';

  const intensityPhase = String(input.intensityPhase || '').trim() || 'build';

  let systemPrompt = `你是 FiKA Fitness 的训练规划总设计师。
你将为一个训练周生成「周结构规划」，用于指导后续每天的单次课程细化。

【输出必须是 JSON】并严格符合 schema。

【当前客户与周信息】
- 档位：${tierLabel}
- 强度阶段：${intensityPhase}（必须遵守此阶段的训练特点）
- Block：${input.blockTitle || ''}
- 训练周：${input.weekLabel || ''}

【生成目标】
- 只输出本周训练频次（weekly_sessions）与周简介（week_brief）
- 周简介需体现本周节奏、恢复安排、风险规避（如伤病/不适）
- 不输出每天单次训练细节与动作（不写 modules/exercises）
- days 字段仅作可选的极简摘要（可为空数组）
`;

  if (String(input.blockGoal || '').trim()) {
    systemPrompt += `\n【当前 Block 训练目标】\n${input.blockGoal}\n`;
  }

  // 注入近期训练走势分析 - 根据 RPE 数据动态调整本周强度
  if (recentSessions.length > 0) {
    const rpeAnalysis = recentSessions.map(s => `${s.date || '未知日期'}: RPE ${s.rpe || 0}/10`).join('，');
    const avgRpe = recentSessions.reduce((sum, s) => sum + (s.rpe || 0), 0) / recentSessions.length;
    const rpeStatus = avgRpe >= 8 ? '疲劳' : avgRpe >= 6 ? '中等负荷' : '恢复中';
    const strengthAdjustment = avgRpe >= 8
      ? '客户处于疲劳状态，本周应降低难度，增加恢复类训练日，避免过度训练'
      : avgRpe >= 6
        ? '客户处于中等负荷，本周可正常推进，维持当前强度'
        : '客户处于恢复状态，本周可逐步增加强度，准备进入更高负荷';
    systemPrompt += `\n【近期训练走势分析（近${recentSessions.length}次）】
训练记录：${rpeAnalysis}
平均RPE：${avgRpe.toFixed(1)}/10（${rpeStatus}）
强度调整建议：${strengthAdjustment}
`;
  }

  // 注入上周摘要 - 作为本周优化的依据
  if (lastWeekBrief) {
    systemPrompt += `\n【上周执行总结与优化建议】
${lastWeekBrief}

基于上周反馈，本周应：
- 如果上周训练质量不足，本周应简化动作难度，提高完成质量
- 如果上周疲劳积累，本周应增加恢复训练，避免连续高强度
- 延续上周的有效训练模式，同时改进遇到的问题
`;
  }

  if (Array.isArray(input.coachRules) && input.coachRules.length) {
    systemPrompt += `\n【教练偏好规则（必须遵守）】\n${input.coachRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`;
  }

  const parts = [];
  parts.push('## 客户信息');
  parts.push(`- 姓名：${input.clientName || '未知'}`);
  parts.push(`- 性别：${input.gender === 'female' ? '女' : '男'}`);
  parts.push(`- 年龄：${input.age || '未知'}`);
  parts.push(`- 身高：${input.height || '未知'} cm`);
  parts.push(`- 体重：${input.weight || '未知'} kg`);

  if (input.surveyData) {
    const s = input.surveyData;
    parts.push('\n## 身体档案');
    if (s.injury_history) parts.push(`- 伤病史：${s.injury_history}`);
    if (s.discomfort_areas?.length) parts.push(`- 身体不适区域：${s.discomfort_areas.join('、')}`);
    if (s.fitness_goal) parts.push(`- 训练目标：${s.fitness_goal}`);
  }

  parts.push('\n## 本周训练日列表');
  if (days.length) {
    for (const d of days) {
      parts.push(`- ${d.dayName || d.day || ''}${d.dayFocus ? `：${d.dayFocus}` : ''}`);
    }
  } else {
    parts.push('- 未提供训练日列表，请按一周 3-5 次训练的常规节奏生成。');
  }

  const daySchema = {
    type: 'object',
    properties: {
      day_key: { type: 'string', description: '用于前端匹配的 key（例如 Mon/周一/day1 等）' },
      day_focus: { type: 'string', description: '当天训练重点（只写重点，不写动作）' },
      session_name: { type: 'string', description: '当天课程名称（体现重点）' },
    },
    required: ['day_key', 'day_focus', 'session_name'],
    additionalProperties: false,
  };

  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: parts.join('\n') },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'fika_week_plan',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              week_title: { type: 'string' },
              week_theme: { type: 'string' },
              weekly_sessions: { type: 'number', description: '本周训练次数，建议 2-6 次' },
              week_brief: { type: 'string', description: '本周训练简介（2-4句）' },
              days: {
                type: 'array',
                items: daySchema,
                description: '可选：极简日摘要；如果不需要可返回空数组',
              },
            },
            required: ['week_title', 'week_theme', 'weekly_sessions', 'week_brief', 'days'],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = extractLLMContent(result);
    if (!rawContent) return { error: 'AI 返回内容为空' };

    let jsonStr = String(rawContent).trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const weekPlanRaw = JSON.parse(jsonStr);

    const rawDays =
      (Array.isArray(weekPlanRaw?.days) && weekPlanRaw.days) ||
      (Array.isArray(weekPlanRaw?.week_structure) && weekPlanRaw.week_structure) ||
      (Array.isArray(weekPlanRaw?.training_days) && weekPlanRaw.training_days) ||
      [];

    const normalizedDays = (days.length ? days : rawDays).map((d, i) => {
      const key = String(d?.dayKey || d?.day_key || d?.dayName || d?.day_of_week || d?.day || `day${i + 1}`);
      const fromAI = rawDays.find((x) => String(x.day_key || x.dayKey || x.day_of_week || x.day) === key) || rawDays[i];
      return {
        day_key: key,
        day_focus: String(fromAI?.day_focus || fromAI?.focus || d?.dayFocus || d?.focus || d?.name || ''),
        session_name: String(fromAI?.session_name || fromAI?.name || fromAI?.sessionName || ''),
      };
    });

    const weekPlan = {
      week_title: String(weekPlanRaw?.week_title || weekPlanRaw?.weekTitle || input.weekLabel || 'Week Plan'),
      week_theme: String(weekPlanRaw?.week_theme || weekPlanRaw?.weekTheme || weekPlanRaw?.week_focus || weekPlanRaw?.weekFocus || ''),
      weekly_sessions: Number(weekPlanRaw?.weekly_sessions || weekPlanRaw?.sessions_per_week || Math.max(2, Math.min(6, days.length || 3))),
      week_brief: String(weekPlanRaw?.week_brief || weekPlanRaw?.week_summary || weekPlanRaw?.week_theme || weekPlanRaw?.weekTheme || ''),
      days: normalizedDays,
      tier: sessionTier,
      intensity_phase: intensityPhase,
    };

    return weekPlan;
  } catch (err) {
    return { error: 'AI 生成失败，请稍后重试', details: String(err) };
  }
}

export async function generateFullPlan(input = {}) {
  const sessionTier = input.sessionTier || 'standard';
  const weeksTotal = Number(input.weeksTotal || input.weeks || 4);
  const recentSessions = Array.isArray(input.recentSessions) ? input.recentSessions : [];
  const clientHistory = input.clientHistory || {};
  const clientGoal = String(input.clientGoal || '').trim();
  const clientInjury = String(input.clientInjury || '').trim();

  const tierLabel =
    sessionTier === 'ultra'
      ? 'Ultra 高级档（筋膜神经视角）'
      : sessionTier === 'pro'
        ? 'Pro 进阶档（动力链视角）'
        : 'Standard 基础档（肌肉解剖视角）';

  // 强制应用 intensity_phase 节奏：build → build → peak → deload
  const buildIntensityPhaseSequence = (weekIndex) => {
    const mod = weekIndex % 4;
    if (mod === 3) return 'deload';
    if (mod === 2) return 'peak';
    return 'build'; // mod === 0, 1
  };

  let systemPrompt = `你是 FiKA Fitness 的训练周期规划总设计师。
你将为一个 Block 生成完整的「周期结构规划」，用于指导教练的周规划与每天细化。

【输出必须是 JSON】并严格符合 schema。

【规划目标】
- 给出 Block 的总目标与每周主题
- 每周输出 3-5 个训练日，每日给出 day_focus 与 session_name
- 不输出具体 modules/exercises（那是 /api/session-plan 的职责）

【强度节奏（必须严格遵守，不可更改）】
强度阶段必须按照以下节奏循环：
  Week 1-2: 加载期(Build) - 增加训练强度和体积
  Week 3:    峰值期(Peak)  - 达到最高强度，验证新能力
  Week 4:    卸载期(Deload)- 降低强度恢复，为下一周期准备

这个4周循环结构确保：
- 线性进步：两周加载逐步积累负荷
- 峰值测试：第三周检验能力提升
- 主动恢复：第四周卸载避免过度训练
- 神经恢复：为下一个周期的更高强度做准备

【当前客户与 Block 信息】
- 档位：${tierLabel}
- 周数：${weeksTotal}
- Block：${input.blockTitle || ''}
`;

  if (String(input.blockGoal || '').trim()) {
    systemPrompt += `\n【当前 Block 训练目标】\n${input.blockGoal}\n`;
  }

  // 注入近期训练走势数据到完整规划中
  if (recentSessions.length > 0) {
    const avgRpe = recentSessions.reduce((sum, s) => sum + (s.rpe || 0), 0) / recentSessions.length;
    const trend = recentSessions.length >= 2
      ? (recentSessions[recentSessions.length - 1].rpe || 0) - (recentSessions[0].rpe || 0)
      : 0;
    const trendText = trend > 0 ? '上升（客户适应能力强，可增加难度）' : trend < 0 ? '下降（客户疲劳积累，需注意恢复）' : '稳定';
    systemPrompt += `\n【客户近期训练状态】
平均RPE: ${avgRpe.toFixed(1)}/10
趋势: ${trendText}
建议: 根据客户的疲劳状态和进步趋势，Block 规划应该${trend > 0 ? '逐周提升难度' : '注重恢复和基础巩固'}
`;
  }

  // 注入客户历史和目标
  if (clientGoal || clientInjury) {
    systemPrompt += `\n【客户历史与约束】`;
    if (clientGoal) systemPrompt += `\n长期目标：${clientGoal}`;
    if (clientInjury) systemPrompt += `\n伤病记录：${clientInjury}（所有周的所有动作必须全面规避相关风险）`;
    systemPrompt += `\n`;
  }

  if (Array.isArray(input.coachRules) && input.coachRules.length) {
    systemPrompt += `\n【教练偏好规则（必须遵守）】\n${input.coachRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`;
  }

  const parts = [];
  parts.push('## 客户信息');
  parts.push(`- 姓名：${input.clientName || '未知'}`);
  parts.push(`- 性别：${input.gender === 'female' ? '女' : '男'}`);
  parts.push(`- 年龄：${input.age || '未知'}`);

  if (input.surveyData) {
    const s = input.surveyData;
    parts.push('\n## 身体档案');
    if (s.injury_history) parts.push(`- 伤病史：${s.injury_history}`);
    if (s.discomfort_areas?.length) parts.push(`- 身体不适区域：${s.discomfort_areas.join('、')}`);
    if (s.fitness_goal) parts.push(`- 训练目标：${s.fitness_goal}`);
  }

  const daySchema = {
    type: 'object',
    properties: {
      day_key: { type: 'string' },
      day_focus: { type: 'string' },
      session_name: { type: 'string' },
    },
    required: ['day_key', 'day_focus', 'session_name'],
    additionalProperties: false,
  };

  const weekSchema = {
    type: 'object',
    properties: {
      week_num: { type: 'number' },
      week_theme: { type: 'string' },
      intensity_phase: { type: 'string', description: 'build/peak/deload 或你自定义阶段标签' },
      days: { type: 'array', items: daySchema },
    },
    required: ['week_num', 'week_theme', 'intensity_phase', 'days'],
    additionalProperties: false,
  };

  // 添加强制指令到 user prompt 中，确保 intensity_phase 严格遵守
  const userContent = parts.join('\n') + `

【强制规则：intensity_phase 节奏必须严格遵守】
你必须在生成的每一周的 intensity_phase 字段中填写以下值：
${Array.from({ length: weeksTotal }, (_, i) => {
    const phase = buildIntensityPhaseSequence(i);
    return `- Week ${i + 1}: "${phase}"`;
  }).join('\n')}

这是不可更改的客户训练周期安排，你生成的 AI 建议必须服从这个节奏。
不允许更改或忽略这个约束。`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'fika_full_plan',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              block_title: { type: 'string' },
              block_goal: { type: 'string' },
              weeks: {
                type: 'array',
                description: `必须输出 ${weeksTotal} 周，每周的 intensity_phase 必须严格遵守分配值`,
                items: weekSchema,
              },
            },
            required: ['block_title', 'block_goal', 'weeks'],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = extractLLMContent(result);
    if (!rawContent) return { error: 'AI 返回内容为空' };

    let jsonStr = String(rawContent).trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const fullPlanRaw = JSON.parse(jsonStr);

    const rawWeeks =
      (Array.isArray(fullPlanRaw?.weeks) && fullPlanRaw.weeks) ||
      (Array.isArray(fullPlanRaw?.weekly_plans) && fullPlanRaw.weekly_plans) ||
      (Array.isArray(fullPlanRaw?.weeklyPlans) && fullPlanRaw.weeklyPlans) ||
      [];

    const normalizedWeeks = rawWeeks
      .slice(0, Math.max(1, weeksTotal))
      .map((w, i) => {
        const rawDays =
          (Array.isArray(w?.days) && w.days) ||
          (Array.isArray(w?.training_days) && w.training_days) ||
          (Array.isArray(w?.trainingDays) && w.trainingDays) ||
          [];
        const days = rawDays.map((d, di) => ({
          day_key: String(d?.day_key || d?.dayKey || d?.day_of_week || d?.day || d?.dayName || `day${di + 1}`),
          day_focus: String(d?.day_focus || d?.dayFocus || d?.focus || ''),
          session_name: String(d?.session_name || d?.sessionName || d?.name || ''),
        }));

        // 强制应用 intensity_phase 节奏，覆盖 AI 生成的值
        const forcedIntensityPhase = buildIntensityPhaseSequence(i);

        return {
          week_num: Number(w?.week_num || w?.week_number || w?.weekNumber || i + 1),
          week_theme: String(w?.week_theme || w?.weekTheme || ''),
          intensity_phase: forcedIntensityPhase,
          days,
        };
      });

    const fallbackDaysTemplate = [
      { dayKey: '周一', dayName: '周一', dayFocus: '下肢主导' },
      { dayKey: '周二', dayName: '周二', dayFocus: '上肢推拉' },
      { dayKey: '周四', dayName: '周四', dayFocus: '全身整合' },
      { dayKey: '周六', dayName: '周六', dayFocus: '恢复激活' },
    ];

    const intensityForWeek = (wi) => {
      const mod = wi % 3;
      if (mod === 2) return 'deload';
      if (mod === 1) return 'peak';
      return 'build';
    };

    let weeks = normalizedWeeks;
    if (!Array.isArray(weeks) || weeks.length === 0) {
      weeks = [];
      for (let wi = 0; wi < Math.max(1, weeksTotal); wi++) {
        // 使用强制节奏生成回退周计划
        const forcedPhase = buildIntensityPhaseSequence(wi);
        const outline = await generateWeekPlan({
          ...input,
          weekLabel: `Week ${wi + 1}`,
          intensityPhase: forcedPhase,
          days: fallbackDaysTemplate,
        });
        const days = Array.isArray(outline?.days) && outline.days.length
          ? outline.days
          : fallbackDaysTemplate.map((d) => ({ day_key: d.dayKey, day_focus: d.dayFocus, session_name: '' }));

        weeks.push({
          week_num: wi + 1,
          week_theme: String(outline?.week_theme || ''),
          intensity_phase: forcedPhase,
          days: days.map((d) => ({
            day_key: String(d?.day_key || d?.dayKey || d?.day || ''),
            day_focus: String(d?.day_focus || ''),
            session_name: String(d?.session_name || ''),
          })),
        });
      }
    }

    const blockOverview = fullPlanRaw?.block_overview || fullPlanRaw?.blockOverview || {};

    const fullPlan = {
      block_title: String(fullPlanRaw?.block_title || fullPlanRaw?.blockTitle || blockOverview?.block_name || input.blockTitle || 'Block 1'),
      block_goal: String(fullPlanRaw?.block_goal || fullPlanRaw?.blockGoal || blockOverview?.overall_goal || input.blockGoal || ''),
      weeks,
      tier: sessionTier,
    };

    return fullPlan;
  } catch (err) {
    return { error: 'AI 生成失败，请稍后重试', details: String(err) };
  }
}

async function invokeLLM({ messages, response_format }) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DeepSeek_API_key;
  if (!apiKey) {
    throw new Error('Missing OPENAI_API_KEY (or DeepSeek_API_key)');
  }

  const model = process.env.OPENAI_MODEL || process.env.DEEPSEEK_MODEL || 'gpt-4o-mini';
  const baseUrl = process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.openai.com/v1';

  const doRequest = async (payload) => {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: resp.ok, status: resp.status, json };
  };

  const primaryPayload = {
    model,
    messages,
    ...(response_format ? { response_format } : {}),
  };

  const primary = await doRequest(primaryPayload);
  if (primary.ok) return primary.json;

  const msg = primary?.json?.error?.message || '';
  const isResponseFormatUnsupported =
    primary.status === 400 && typeof msg === 'string' && msg.toLowerCase().includes('response_format');

  if (isResponseFormatUnsupported) {
    const fallbackPayload = {
      model,
      messages,
    };
    const fallback = await doRequest(fallbackPayload);
    if (fallback.ok) return fallback.json;
    throw new Error(`LLM error ${fallback.status}: ${JSON.stringify(fallback.json)}`);
  }

  throw new Error(`LLM error ${primary.status}: ${JSON.stringify(primary.json)}`);
}

function extractLLMContent(result) {
  return result?.choices?.[0]?.message?.content || result?.output_text || '';
}
