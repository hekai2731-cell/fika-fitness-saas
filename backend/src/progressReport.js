export async function generateProgressReport(input = {}) {
  const apiKey = process.env.OPENAI_API_KEY
    || process.env.DeepSeek_API_key
    || process.env.DEEPSEEK_API_KEY;
  const model = process.env.OPENAI_MODEL
    || process.env.DEEPSEEK_MODEL
    || 'deepseek-chat';
  const baseUrl = process.env.OPENAI_BASE_URL
    || process.env.DEEPSEEK_BASE_URL
    || 'https://api.deepseek.com/v1';

  const {
    membershipLevel,
    totalSessions,
    blockTitle,
    avgRpe,
    rpeTrend,
    weightDelta,
    bfDelta,
    fitnessGoal,
  } = input;

  const memberLabel =
    membershipLevel === 'elite' ? 'Elite 至尊会员' :
    membershipLevel === 'professional' ? 'Professional 专业会员' :
    membershipLevel === 'advanced' ? 'Advanced 进阶会员' :
    'Standard 基础会员';

  const prompt = `你是FiKA Fitness的教练助手。请根据以下客户训练数据，用简洁温暖的中文写一段个性化进度报告（150字以内），告诉客户：这段时间练了什么、哪里进步了、下一步的重点是什么。语气要鼓励但专业，像教练在课后跟客户说话一样自然。

训练方式：${memberLabel}
总训练节数：${totalSessions}
当前训练阶段：${blockTitle || '训练中'}
平均RPE：${avgRpe || '暂无数据'}
近期RPE趋势：${rpeTrend > 1 ? '疲劳积累' : rpeTrend < -1 ? '恢复良好' : '相对稳定'}
体重变化：${weightDelta !== null && weightDelta !== undefined ? `${weightDelta > 0 ? '+' : ''}${weightDelta}kg` : '暂无数据'}
体脂变化：${bfDelta !== null && bfDelta !== undefined ? `${bfDelta > 0 ? '+' : ''}${bfDelta}%` : '暂无数据'}
训练目标：${fitnessGoal || '综合体能提升'}

只输出报告正文，不要标题，不要前缀。`;

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
      temperature: 0.8,
    }),
  });

  const json = await resp.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('AI 返回内容为空');
  return { report: text.trim() };
}
