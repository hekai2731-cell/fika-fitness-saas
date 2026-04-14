import { resolveDepthParams } from './depthResolver.js';

export async function generateSessionPlan(input = {}) {
  const sessionTier = input.sessionTier || 'standard';
  const membershipLevel = input.membershipLevel || 'standard';
  const lastRpe = input.lastSessionRpe ?? 0;
  const blockIndex = input.blockIndex ?? 0;
  const lastWeekBrief = String(input.lastWeekBrief || '').trim();
  const recentSessions = Array.isArray(input.recentSessions) ? input.recentSessions : [];

  const blockGoal    = String(input.blockGoal  || '').trim();
  const weekTheme    = String(input.weekTheme  || '').trim();
  const weekBrief    = String(input.weekBrief  || '').trim();
  const dayName      = String(input.dayName    || '').trim();
  const dayFocus     = String(input.dayFocus   || '').trim();
  const clientWeight = Number(input.weight     || 65);

  const intensity = blockIndex % 3 === 2 ? 'deload' : blockIndex % 3 === 1 ? 'peak' : 'build';
  const intensityPhase = String(input.intensityPhase || intensity);
  const intensityLabel = intensityPhase === 'deload' ? '卸载期 Deload' : intensityPhase === 'peak' ? '峰値期 Peak' : '加载期 Build';

  let statusScore = Number(input.statusScore || 3);
  if (input.preSessionData) {
    const { recoveryStatus, todayStatus } = input.preSessionData;
    if (String(recoveryStatus || '').includes('3天+') && String(todayStatus || '').includes('状态好')) statusScore = 5;
    else if (String(recoveryStatus || '').includes('2-3天') && String(todayStatus || '').includes('正常')) statusScore = 3;
    else if (String(recoveryStatus || '').includes('酸痛') || String(todayStatus || '').includes('状态差')) statusScore = 1;
  }
  if (lastRpe >= 8) statusScore = Math.min(statusScore, 2);
  if (lastRpe <= 4 && lastRpe > 0) statusScore = Math.max(statusScore, 4);

  // ── 四道限制过滤 ───────────────────────────────────────
  const depthParams = resolveDepthParams({ membershipLevel, tier: sessionTier, statusScore, intensityPhase });

  let rpeAdjustNote = '';
  let rpeMode = '正常';
  if (lastRpe >= 8) {
    rpeMode = '降载';
    rpeAdjustNote = `上节课 RPE ${lastRpe}/10，本次降载：重量降15-20%，每动作减1组，组间增加15-30秒。`;
  } else if (lastRpe <= 4 && lastRpe > 0) {
    rpeMode = '增载';
    rpeAdjustNote = `上节课 RPE ${lastRpe}/10，本次增载：重量增10-15%，可加1组，适当缩短组间休息。`;
  } else if (lastRpe > 0) {
    rpeAdjustNote = `上节课 RPE ${lastRpe}/10，正常推进，在上次基础上递增5-10%。`;
  }

  const ultraRecoveryMode = sessionTier === 'ultra' && lastRpe > 7;

  // 由 resolveDepthParams 统一决定模块数和每模块动作数（必须在 prompt builder 前定义）
  const moduleCount      = depthParams.moduleCount;          // 主训模块数
  const totalModuleCount = moduleCount + 2;                  // 热身 + 主训 + 放松
  const exPerModOverride = depthParams.exPerMod;

  const GYM_EQUIPMENT_PROMPT = `
【FiKA 场馆可用设备（所有动作必须基于以下设备）】
功能区：药球、地雷管、壶铃（8-48kg）、跳箱、弹力带（各规格）、战绳、风阻单车、雪橇车、TRX
力量区：坐姿推胸机、坐姿划船机、杠铃卧推架、哑铃区（2.5-35kg）、深蹲架、哈克深蹲机、倒蹬机、史密斯机、龙门架、高位下拉机、腿屈伸机、髋外展机、硬拉台、杠铃臀腿器

【严格禁用动作（任何档位均不得出现）】
- 跳绳 → 替换为：风阻单车冲刺 / 战绳波浪 / 跳箱跳跃
- 敏捷梯 → 替换为：药球侧抛 / 壶铃摆 / 跳箱侧跳
`;

  const courseFramework = {
    standard: `
【¥328 感知单体课程框架 - 严格按此结构生成】

模块一：RAMP热身（8分钟）
- Raise：快走或原地高抬腿（2分钟）
- Activate & Mobilize：世界最伟大拉伸 + 动态臂圈 + 猫牛式（每侧6次）
- Potentiate：徒手深蹲 + 俯卧撑（各8次）
- 要求：全程无负重，轻松完成

模块二：多关节主力量（20分钟）
- 3-4个主练动作，每个动作独立执行，组间完整休息90-120秒
- 动作类型：深蹲变式 + 推类 + 拉类
- 组数次数：4组 × 8-12次，RPE 7-8
- 动作之间没有联动，感知目标肌肉收缩

模块三：单关节辅助（12分钟）
- 3个孤立动作，针对弱点肌群
- 组数次数：3组 × 12-15次，RPE 8
- 组间休息60-75秒，追求泵感

模块四：核心代谢收尾（10分钟）
- 2个核心动作 + 1个有氧
- 核心：平板支撑/死虫式/俄罗斯转体
- 有氧：战绳/划船机8-10分钟，心率130-150bpm
`,

    pro: `
【¥388 动力链模块课程框架 - 严格按此结构生成】

模块一：RAMP热身（10分钟）
- Raise：快走或A-Skip（2分钟）
- Activate & Mobilize：90/90髋翻转 + 世界最伟大拉伸 + 半程土耳其起立（每侧5次）
- Potentiate：药球砸地8次 + 低箱跳6次

模块二：下肢髋驱动力量（18分钟）
- 超级组格式：A1做完立刻A2，休息90秒，循环4组
- A1：下肢大重量（杠铃高翻/泽奇深蹲/保加利亚分腿蹲）4组
- A2：单侧控制（垫高后撤步/单腿RDL）每侧8-10次
- 配对逻辑：双侧大重量→单侧控制，检验力量是否能在单侧保持

模块三：核心刚性抗旋（15分钟）
- 超级组格式：B1做完立刻B2，休息60秒，循环3组
- B1：旋转产生扭矩（地雷管旋转推/大回环）每侧8-10次
- B2：抗旋稳定（单臂农夫行走/前置架位行走）每侧20-30米
- 配对逻辑：产生扭矩→抵抗扭矩，建立核心钢梁

模块四：3D动力链复合整合（12分钟）
- EMOM或超级组：把前面力量串成连续输出
- 选项A：双壶铃复合流（Clean+Front Squat+Press）
- 选项B：大猩猩划船 + 叛逆者划船
- 选项C：地雷管RDL接划船 + 壶铃摆

模块五：代谢终结（10分钟）
- 3-4轮复合体能，组间休息60秒
- 选项：推雪橇+战绳+药球砸墙+熊爬的组合
`,

    ultra: `
【¥458 神经运动表现课程框架 - 严格按此结构生成】

模块一：本体感受激活（8分钟）
- 侧向波戈跳 + 滑冰者跳 + 深度跳落稳住 + 180度转体跳
- 目的：唤醒关节位置感和跟腱弹性

模块二：神经点火（8分钟）
- 药球爆发推接住 + 连续低箱跳 + 药球砸地 + A-Skip高抬腿
- 目的：点燃快肌纤维和中枢神经

模块三：对比力量（15分钟）
- 超级组：重力量立刻接爆发力动作，循环4组
- A1大重量：重装保加利亚/死点六角杠铃硬拉（4组6-8次）
- A2爆发力：腾空弓步跳/溜冰者跳远（立刻接做）
- 逻辑：大重量募集运动单位→爆发动作拉爆心率，疲劳下强迫神经高功率输出

模块四：旋转斜向动力链（12分钟）
- 3个动作串联，每侧8-10次，循环3组
- 地雷管转身爆发推 + 药球旋转砸墙 + 半跪姿单臂弹力带劈砍
- 逻辑：打造螺旋发力链，蹬地→转髋→核心传导→末端释放

模块五：3D核心实战移动（15分钟）
- AMRAP或4轮循环
- 叛逆者划船 + 熊爬拖拽 + 单腿RDL接旋转提膝
- 逻辑：模拟失去平衡→快速重置→再爆发

模块六：专项敏捷减速（10分钟）
- 弹力带抗阻横移 + 侧向急停定格2秒 + 折返冲刺
- 逻辑：训练减速制动能力，预防伤病

模块七：专项体能地狱终结（10分钟）
- EMOM或30/30间歇
- 魔鬼推举 + 推雪橇 + 战绳俄式转体
- 逻辑：乳酸耐受，疲劳下动作质量不崩
`,
  };

  const buildStandardPrompt = () => {
    const canSuperset = statusScore >= 3 && intensityPhase !== 'deload';
    const exPerMod = exPerModOverride;

    return `
【Standard 档位 · 肌肉解剖视角 · 感知优先】
════════════════════════════════════════
档位定位：建立正确动作模式与肌肉感知。聚焦「感受目标肌肉收缩」。
训练时长：60-70 分钟
模块数：3 个（热身 + 力量主训 + 关节活动度）
节奏：3030（3秒离心→0停顿→3秒向心→0停顿）
双边对称为主，不引入复杂动力链

【三模块结构】

▌模块一：核心稳定性（15 min）
目的：建立腹横肌和多裂肌的等长控制感知，感受「脊柱像钢管」
动作数：${exPerMod} 个独立单体动作
组间休息：45 秒
典型动作方向：前臂平板支撑、死虫式、侧平板支撑、鸟狗式
视角标注：注明向心/离心/等长类型，标注主动肌/协同肌/拮抗肌角色

▌模块二：肌肉力量（20 min）
目的：建立股四头肌、臀大肌、背阔肌的向心/离心收缩感知
动作数：${exPerMod} 个独立单体动作
${
      canSuperset
        ? `⭐ 状态评分 ${statusScore}/5，可解锁 1 个超级组（推拉拮抗格式，A1做完立刻A2，休息60秒）
   超级组格式：A1（推类/蹲类）+ A2（拉类/抗旋类），互补拮抗关系`
        : '本次状态一般，保持独立单体动作，不加超级组'
    }
组间休息：60 秒
节奏：3030
典型动作方向：哑铃高脚杯深蹲、RDL、分腿蹲、俯身划船、TRX划船

▌模块三：关节活动度（15 min）
目的：主动活动髋关节和胸椎，建立全范围控制感知（不是被动拉伸）
动作数：${exPerMod} 个动作，流动完成
组间休息：无（流动）
典型动作方向：髋关节CARs、四点支撑胸椎旋转、世界最伟大拉伸

【Standard 动作注释规范】
每个动作的 notes 字段必须包含：
- 主动肌（向心）+ 协同肌 + 拮抗稳定肌
- 1句 Cue 口令（感受描述，不超过20字）
示例：「臀大肌向心主导，腘绳肌协同，竖脊肌固定；感受大腿前侧被拉长」

【Standard 禁止】
- 禁止引入动力链/X-Sling等进阶概念
- 禁止超级组超过1个/模块
- 禁止爆发性动作（无 X012 节奏）
- 禁止单腿复合高阶动作

${GYM_EQUIPMENT_PROMPT}
`;
  };

  const buildProPrompt = () => {
    const exPerMod = exPerModOverride;

    const PRO_TEMPLATES = `
【Pro 万能模板库（从中选择最符合今日训练重点的1个）】

模板一：地基力量超级组
  意图：建立垂直动力链稳定地基
  格式：拮抗超级组（A1蹲/髋铰 + A2抗伸展）+ 独立B
  动力链：单腿极限拉伸→核心抗伸展→后链补充

模板二：地雷管斜向推拉
  意图：打通蹬地→转髋→上肢推拉的斜向动力链
  格式：功能链超级组（B1旋转推 + B2RDL接划船）+ 旋转B
  动力链：足底→髋→核心→指尖

模板三：单侧稳定超级组
  意图：不对称负荷下训练核心抗旋能力
  格式：超级组（C1单臂推 + C2哥本哈根）+ 单腿C3
  动力链：推力链→侧稳→X-Sling拉力链

模板四：实战功能循环
  意图：推拉单腿对角线发力，强化身体连贯性
  格式：三联循环（D1借力推 + D2旋转划船 + D3登箱提膝）
  动力链：下肢爆发→后链→单腿交叉

模板五：后链超级组
  意图：后表线整合，腘绳+背阔协同
  格式：拮抗超级组（A1 RDL + A2 划船）+ 独立单腿B
  动力链：腘绳离心→背阔拉力→X-Sling单腿

模板六：推拉平衡超级组
  意图：肩关节健康，胸背拮抗平衡
  格式：超级组（A1 卧推 + A2 TRX划船）+ 肩袖激活B
  动力链：胸大→背阔拮抗→肩袖稳定

模板七：水平旋转爆发
  意图：水平面旋转链最大功率
  格式：循环（A药球侧抛 + B绳索旋转 + C旋转硬拉）
  动力链：髋外旋→腹斜→全链旋转

模板八：离心制动专项
  意图：全程3030慢速控制，强化离心能力
  格式：超级组（3030节奏，比标准慢一倍）
  动力链：单腿离心→背阔离心

模板九：核心抗旋三联
  意图：3D核心全方位覆盖
  格式：三联循环（A1 Pallof推 + A2 农夫走 + A3 哥本哈根）
  动力链：抗旋→抗侧屈→内收肌

模板十：单腿爆发循环
  意图：单腿SSC弹性入门
  格式：循环（保加利亚跳 + 单腿RDL + 侧切步）
  动力链：前链爆发→后链→侧向

模板十一：地面移动功能链
  意图：X-Sling地面激活到站立整合
  格式：循环（熊爬 + T字推 + 单腿RDL划船）
  动力链：X-Sling地面→垂直链

模板十二：AMRAP质量循环
  意图：代谢+技术双压，心率控制下保持动作质量
  格式：AMRAP 12min（壶铃摆 + 单臂推 + 侧平板）
  动力链：后链→推力→侧稳
`;

    return `
【Pro 档位 · 动力链视角 · 对角线发力】
════════════════════════════════════════
档位定位：以 X-Sling 对角线动力链为核心，超级组模式为主。
训练时长：70-80 分钟
模块数：5 个
节奏：3030（主训练）· 超级组内不休息 · 组间60秒

【五模块结构】

▌热身（13 min）
通用热身：高抬腿 + 关节环绕序列（5min）
动力链专项预热（8min）：
  - 婴儿爬→熊爬 × 2组（激活X-Sling对角线，感受右手-左脚连接）
  - 胸椎旋转 × 8次/侧 + 徒手单腿RDL预习 × 6次/侧
  - CUE：「不是做动作，是感受对角线张力的连接」

▌模块一：地基力量（18 min）
动作数：${exPerMod} 个（含超级组）
格式：拮抗超级组（A1+A2）+ 独立A3
休息：A1→A2不休息，组间60秒，共4组

▌模块二：动力链主训（18 min）
动作数：${exPerMod} 个
格式：功能链三联（B1+B2+B3）或 超级组+独立
休息：组间60秒，共3组

▌模块三：单侧稳定（16 min）
动作数：${exPerMod} 个
格式：超级组（C1+C2）+ 独立C3
重点：X-Sling完整链路验证

▌模块四：实战功能循环（15 min）
动作数：${exPerMod} 个
格式：三联循环（D1→D2→D3）
一轮休息90秒，共3-4轮

【Pro 超级组格式规范】
格式一（拮抗超级组）：A1+A2 互补超级组 + 独立B
  适用：地基力量、推拉平衡类模块
  示例：A1 保加利亚蹲 + A2 TRX前倾推出（蹲→抗伸展拮抗）

格式二（功能链三联）：A1+A2+A3 连续完成
  适用：地雷管模块、实战循环
  示例：B1 地雷管旋转推 + B2 RDL接划船 + B3 绳索斜砍

格式三（超级组+独立混合）：超级组 + 独立B + 独立C
  适用：单侧稳定模块
  示例：C1 单臂绳索推 + C2 哥本哈根 + C3独立

⚠️ 格式由今日模板决定，不可混用

${PRO_TEMPLATES}

【Pro 动作注释规范】
每个动作的 notes 字段必须包含：
- 动力线解析（简版）：说明从哪里发力到哪里传导
- 1句 Cue 口令
示例：「足底蹬地→髋→核心→指尖，不是手臂推，是力量传导；感受力量从髋部发出」

【Pro 视角标注关键词】
X-Sling（支撑腿臀大肌→核心对角线→对侧背阔）
垂直链（地面力量→髋→核心→上肢）
水平拉力链（背阔→菱形→后三角）
斜向动力链（旋转推拉）
抗旋传导（核心对抗旋转力矩）

${GYM_EQUIPMENT_PROMPT}
`;
  };

  const buildUltraPrompt = () => {
    const exPerMod = exPerModOverride;

    const ULTRA_TEMPLATES = `
【Ultra 万能模板库（从中选择最符合今日训练重点的组合）】

模板一：非对称大重量
  意图：非对称大负荷下激活最大力量输出
  格式：超级组（A1垫高后撤步蹲X012 + A2 TRX抗伸展X012）+ 单手摆A3 + 登箱提膝A4
  动力链：单腿极限→核心刚性测试→单侧抗旋→交叉爆发

模板二：3D核心旋转链
  意图：高张力对抗旋转，跑动中躯干刚性
  格式：循环（地雷管转体 + 农夫走 + 侧向登阶 + 土耳其起立）
  动力链：旋转力量→全身刚性→额状面→全链整合

模板三：原始移动与抗旋
  意图：地面刚性极限，X-Sling终极测试
  格式：循环（T字推 + 重物拖拽熊爬 + 壶铃高翻）
  动力链：推抗旋→爬行刚性→后链爆发

模板四：多平面急停循环
  意图：对角线爆发制动，离心刹车能力
  格式：EMOM（药球砸地 + 侧向滑步 + 单腿急停定住2秒）
  动力链：螺旋线爆发→额状面位移→单腿离心

模板五：EMOM地狱终结
  意图：全链整合终极测试（终结模块固定）
  格式：EMOM 12min（单手壶铃5动作不落地复合）
  链路：摆→高翻→前架蹲→借力推→过头弓步

模板六：SSC弹性链
  意图：弹性储能爆发，SSC能力测试
  格式：超级组（深跳+跳箱SSC + 壶铃高翻 + 爆发推）
  动力链：落地蓄力→弹射→上肢输出

模板七：对角线全功率
  意图：从脚底到指尖的完整力量传导链
  格式：三联循环X012（单腿蹬地 + 旋转推 + 对角拉）
  动力链：足底→髋→核心→指尖

模板八：变向剪切速度
  意图：关节刚性+神经速度，方向变换能力
  格式：循环最大速度（侧切步 + 单腿跳箱 + 反应硬拉）
  动力链：侧向制动→垂直爆发→后链

模板九：上肢爆发链
  意图：投掷/对抗爆发，上肢推拉SSC
  格式：超级组X012（药球胸推 + 绳索爆发拉 + 推举）
  动力链：胸→背→肩爆发输出

模板十：筋膜流动复合
  意图：多平面流动整合，全筋膜线覆盖
  格式：慢速流动（土耳其起立 + 壶铃风车 + 蜘蛛侠爬）
  动力链：全筋膜线整合

模板十一：单腿神经速度
  意图：单腿SSC+落地刚性，踝膝髋连续弹性
  格式：EMOM距离递增（单腿连跳 + 急停 + 爆发蹬地）
  动力链：踝SSC→膝刚性→髋爆发

模板十二：代谢高负荷EMOM
  意图：心率160+下维持技术，体能冲刺
  格式：EMOM奇偶交替（双哑铃前架走 + 波比跨越跳）
  动力链：抗伸展→爆发→后链

模板十三：本体感受极限
  意图：关节感知+平衡，神经精度训练
  格式：循环感知优先（单腿BOSU + 闭眼变向 + 重物TGU）
  动力链：踝感知→神经定位→全链
`;

    const ULTRA_SOLO_MOVES = `
【Ultra 单体高阶动作（这些动作本身覆盖3+系统，不需要配对）】
可用单体动作（每次选1-2个，次数极少，质量极高）：
- 壶铃土耳其起立（TGU）：2-3次/侧，极慢速，每步停稳再进行
  覆盖：肩袖稳定·核心旋转·单腿支撑·过头控制·全链整合
- 壶铃高翻（KB Clean）：5-8次/侧，X012节奏，感受时机
  覆盖：后链爆发·神经协调·上肢接铃减速·时机感知
- 壶铃抓举（KB Snatch）：4-6次/侧，X012节奏
  覆盖：全链最大功率·SSC爆发·过头锁定·5阶段整合
- 单腿RDL接单臂划船（SL-RDL to Row）：8次/侧，3030节奏
  覆盖：X-Sling完整链·单腿后链·上背拉力·全程抗旋
- 借力推举（Push Press）：6次/侧，X012节奏
  覆盖：下肢蹬力·核心传导·上肢推力·全链垂直输出
- 壶铃风车（KB Windmill）：4次/侧，极慢速
  覆盖：肩袖过头·腰方肌抗侧屈·髋后链·3D整合

⚠️ 单体高阶动作使用规则：
- 动作本身覆盖3个以上系统，强行配对超级组会破坏完整性
- 土耳其起立 → 放模块末尾，作为整合检验
- 高翻/抓举 → 作为循环模块的锚定爆发动作
- 借力推举 → 放循环模块中段
`;

    const moduleStructure = ultraRecoveryMode
      ? `
⚠️ 当前为【恢复模式】（上节课RPE ${lastRpe}/10 > 7）
全程强度降至60-70%，重点动作质量
8模块 → 降为6模块执行：
  热身(神经激活) → 技术训练 → 动力链整合 → 单体精炼 → 低强度节奏 → 神经恢复
`
      : `
✅ 当前为【高强度模式】
【8模块完整执行】

▌热身（15 min）
通用5min：高抬腿 + 关节环绕
神经激活专项10min：
  - 轻壶铃摆×10 → 原地小跳×20（激活踝关节SSC弹性）× 2组
  - 世界最伟大拉伸×4/侧 → 蜘蛛侠爬行×8步 → 熊爬×10步
  CUE：「感受整个身体的筋膜张力，不是分开的孤立动作」

▌模块A：非对称大重量（18 min）
格式：超级组 X012节奏 · A1+A2不休息 · 组间75秒 · 4组
动作数：${exPerMod} 个
重点：在最大负荷下测试单腿→核心→推力的完整链路

▌模块B：3D核心旋转链（16 min）
格式：循环 · 重质量不重速度 · 3轮 · 轮间90秒
动作数：${exPerMod} 个
重点：旋转产生力量同时核心抗旋维持稳定

▌模块C：原始移动与核心抗旋（14 min）
格式：循环 · 3轮 · 轮间90秒
动作数：3-4 个
重点：疲劳中维持核心刚性

▌模块D：多平面急停循环（12 min）
格式：可选EMOM或循环
动作数：3 个
重点：爆发→位移→制动的完整链路

▌模块E：EMOM地狱终结（终结模块，固定格式）
格式：EMOM 12min，单手壶铃5动作不落地
链路：摆×2 → 高翻×2 → 前架蹲×2 → 借力推×2 → 过头弓步×2
CUE：「五个动作是一个动作，壶铃不落地，能量连续传递」

▌模块F：体能冲刺（6-8 min）
格式：EMOM奇偶交替（前架行走 vs 波比跨越哑铃跳）
目标：彻底清空体能储备，锁定高EPOC
`;

    return `
【Ultra 档位 · 筋膜神经视角 · 全链爆发制动】
════════════════════════════════════════
档位定位：SSC超伸缩循环为核心，爆发后制动，动态抗性核心，EMOM高神经负荷
训练时长：80-90 分钟
节奏：X012（X=爆发→0停→1秒离心→2秒定格）
⚠️ 心率160+时维持复杂动作连贯性

${moduleStructure}

【Ultra 三种模块格式（由模板决定使用哪种）】

格式一：单体高阶动作（不配对）
${ULTRA_SOLO_MOVES}

格式二：循环模块（3-5动作）
- 必须含1个锚定爆发动作（壶铃高翻/药球砸/跳箱/抓举）
- 小循环（3动作）= 锚定爆发 + 制动/抗旋 + 辅助
- 标准循环（4-5动作）= 锚定爆发 + 推/拉/旋转/单腿各1
- X012节奏，轮间75-90秒

格式三：EMOM不落地复合（终结模块专用）
- 单手持壶铃不落地，连续5-6动作，35-45秒完成
- 剩余时间休息至下分钟，奇数左手偶数右手
- 壶铃不落地是核心规则，测试全链连贯性

${ULTRA_TEMPLATES}

【Ultra 动作注释规范】
每个动作的 notes 字段必须包含：
- 筋膜线/动力链路：说明哪条筋膜线在工作
- 爆发机制：SSC弹性/神经预激活/最大功率输出
- 1句 Cue 口令（高强度场景）
示例：「后表线最大功率——髋铰蓄力→爆发→高翻→架式缓冲；不靠手臂拉，用髋弹射」

【Ultra 筋膜线视角关键词】
后表线（足底→腘绳→竖脊→枕骨）
前表线（胫骨前→腹直→胸骨）
螺旋线（枕骨→菱形→前锯→腹斜→对侧髂胫束）
功能线（背阔→对侧臀大肌）
X-Sling动态整合
SSC弹性（牵张缩短周期）

${GYM_EQUIPMENT_PROMPT}
`;
  };

  const tierPrompt = (courseFramework[sessionTier] || courseFramework.standard) + '\n' + GYM_EQUIPMENT_PROMPT;

  // ── 训练上下文（最高优先级）──────────────────────────────────────
  let contextPrompt = '';
  if (blockGoal || weekTheme || dayName) {
    contextPrompt = `
[训练上下文（最高优先级，必须严格遵守）]
- Block目标：${blockGoal || '综合体能提升'}
- 本周主题：${weekTheme || '渐进加载'}
- 今日课程名称：${dayName || dayFocus || '综合训练'}
- 核心要求：今天所有模块的动作选择、组合方式必须围绕「${dayName || dayFocus}」展开
- 动作优先级：与今日名称直接相关 > 与本周主题相关 > 通用训练动作
`;
  }

  if (dayName || dayFocus) {
    contextPrompt += `
【今日训练方向（最高优先级，必须严格遵守）】
今日课程名称：${dayName}
今日训练焦点：${dayFocus}
本周主题：${weekTheme}
Block目标：${blockGoal}

以上方向已由教练在周规划中确定，今日所有模块的动作选择必须围绕「${dayFocus || dayName}」展开。
不得偏离今日方向，不得自行改变训练焦点。
`;
  }

  const weightPrompt = `
[重量范围参考（客户体重${clientWeight}kg）]
- 深蹲/前蹲：${Math.round(clientWeight*0.5)}-${Math.round(clientWeight*0.9)}kg
- 硬拉/罗马尼亚：${Math.round(clientWeight*0.6)}-${Math.round(clientWeight*1.1)}kg
- 卧推/肩推：${Math.round(clientWeight*0.25)}-${Math.round(clientWeight*0.55)}kg
- 划船/下拉：${Math.round(clientWeight*0.25)}-${Math.round(clientWeight*0.45)}kg
- 单侧/辅助：${Math.round(clientWeight*0.12)}-${Math.round(clientWeight*0.25)}kg
每个动作必须给出具体重量建议（kg），根据RPE目标在范围内选择
`;

  const tierLabel =
    sessionTier === 'ultra'
      ? 'Ultra 高级档（筋膜神经视角）'
      : sessionTier === 'pro'
        ? 'Pro 进阶档（动力链视角）'
        : 'Standard 基础档（肌肉解剖视角）';

  let systemPrompt = `你是 FiKA Fitness 的训练课程设计师。
根据客户档位、体能数据、评估反馈，生成完整的单次课程训练方案。
${contextPrompt}${weightPrompt}
【当前课程信息】
- 档位：${tierLabel}
- 强度阶段：${intensityLabel}
- Block：Block ${blockIndex + 1}（${input.blockTitle || ''}）
- 训练周：${input.weekLabel || '未知'}
- 训练日：${input.dayName || '未知'}
- 日重点：${input.dayFocus || '无'}
${rpeAdjustNote ? `- 强度调整：${rpeMode}模式（${rpeAdjustNote}）` : ''}
${statusScore >= 4 ? '- 状态评估：状态良好' : statusScore <= 2 ? '- 状态评估：状态较差，保守执行' : '- 状态评估：状态中等，正常执行'}
- 会员档位：${membershipLevel}
- 训练时长：${depthParams.duration}
- 总模块数（强制）：${totalModuleCount} 个（热身1 + 主训${moduleCount} + 放松1）
- 每模块动作数：${depthParams.exPerMod} 个
- 超级组上限：${depthParams.supersetMax} 个${depthParams.forceReason ? `\n⚠️ ${depthParams.forceReason}` : ''}${depthParams.adjustReason ? `\n⚠️ 深度调整：${depthParams.adjustReason}` : ''}${depthParams.mismatchWarning ? `\n⚠️ 档位提示：${depthParams.mismatchWarning}` : ''}${depthParams.qualityWarning ? `\n⚠️ 质量提示：${depthParams.qualityWarning}` : ''}

【模块结构（严格按此生成，不得增减模块）】

热身模块（必须是第一个模块）：
- 时长：8-12分钟
- 动作数：2-3个
- 内容：关节活动串联 + 肌肉激活 + 动作模式预热
- 不计入主训模块数量

主训模块（共${depthParams.moduleCount}个）：
${(depthParams.moduleStructure || []).map((m, i) => `
模块${i + 1}「${m.name}」：
- 格式：${m.format}
- 动作数：${m.exercises}个
- 组数：${m.sets}组
- 组间休息：${m.rest}秒`).join('')}

放松模块（最后一个模块）：
- 时长：6-8分钟
- 动作数：2个
- 内容：泡沫轴放松 + 静态拉伸

今日状态：${depthParams.statusLevel === 'good' ? '状态好，已增加额外动作' : depthParams.statusLevel === 'normal' ? '状态正常，标准安排' : '状态差，保守安排'}

${tierPrompt}

【结构定义——必须理解】
- 模块（module）= 训练目的分类，是容器，不是动作
- 动作（exercise）= 具体的单个训练动作，是内容
- 严禁将模块本身当作动作输出（如「HIIT复合循环」不是一个动作）
- 严禁将多个动作合并成一个复合动作输出
- 超级组在 exercises 数组里用 group_tag 字段标注（如 "A1"/"A2"）

【输出格式要求（JSON）】
{
  "session_name": "课程名称（体现今日训练重点）",
  "tier": "${sessionTier}",
  "intensity_note": "强度说明（1-2句，说明今日档位视角和强度调整）",
  "warmup_note": "热身说明（1句）",
  "modules": [
    {
      "module_name": "模块名称",
      "module_duration": "预计时长",
      "format": "独立单体 | 拮抗超级组 | 功能链三联 | 循环 | EMOM | 单体高阶",
      "exercises": [
        {
          "name": "具体动作名称（中文+英文）",
          "group_tag": "A1",
          "sets": 4,
          "reps": "8次/侧",
          "rest_seconds": 0,
          "rhythm": "X012",
          "target_muscles": "主要肌群",
          "dyline": "动力线解析（20字以内，Pro/Ultra必填）",
          "cue": "Cue口令（15字以内）",
          "notes": "执行说明（不超过30字）"
        }
      ]
    }
  ]
}

模块数量：${totalModuleCount} 个（热身1 + 主训${moduleCount}个 + 放松1）。
group_tag 说明：超级组内动作标注 A1/A2/A3，循环动作标注 D1/D2/D3，独立动作可省略。
Standard档 dyline 字段可省略，Pro/Ultra档必填。
`;

  // ── 总动作数期望 ──────────────────────────────────────────
  const totalMainEx = (depthParams.moduleStructure || []).reduce((sum, m) => sum + m.exercises, 0);
  systemPrompt += `
总动作数期望：热身2-3个 + 主训${totalMainEx}个 + 放松2个 = ${totalMainEx + 4}-${totalMainEx + 5}个
`;

  // ── 输出质量要求 ───────────────────────────────────────────
  systemPrompt += `
[输出质量要求]
- 总动作数控制在 ${depthParams.totalExercises || `${depthParams.moduleCount * depthParams.exPerMod}个`}，不要超出也不要不足
- 每组组数：${depthParams.setCount || 3}组为主
- 组间休息：${depthParams.restSeconds || '60-90秒'}
- 每个动作必须包含：具体重量建议(kg)、节奏(如3030)、组间休息秒数
- 深度差异体现在：
  standard档：单关节为主，基础感知Cue，无超级组或最多1个
  pro档：多关节复合，动力线解析，${depthParams.supersetMax}个超级组，dyline字段必填
  ultra档：爆发+弹性，筋膜链注释，三联组，节奏X012，dyline字段必填
- Cue口令：15字以内，描述身体感受（如「感受左髋向右膝对角线发力」）
`;

  systemPrompt += `
【生成要求】
- 严格按照以上框架的模块结构生成课程
- 每个模块的动作数量、组数、休息时间必须符合框架要求
- 只使用门店已有设备，不得使用未列出的器材
- 每个动作必须有：具体重量建议、节奏、组间休息、Cue口令
- 动作名称必须清晰准确，不得使用模糊描述
`;

  // Block 训练目标是每次课程的指挥棒 - 优先级最高
  if (String(input.blockGoal || '').trim()) {
    systemPrompt += `\n\n【当前 Block 训练目标（本次课程的指挥棒）】
${input.blockGoal}

规则：
- 本次课程的所有动作选择必须直接服务于此目标
- 如果某个动作与此目标无关，即使教练建议也要规避
- 动作选择优先级：Block目标 > 周重点 > 日重点 > 前次动作递增`;
  }

  // 上周训练总结与本周反馈的闭环
  if (lastWeekBrief) {
    systemPrompt += `\n\n【上周执行总结与改进方向】
${lastWeekBrief}

执行要点：
- 如果上周动作技术有问题，本次应选择更简化的变式
- 如果上周疲劳指标高，本次应降低强度和组数
- 如果上周完成质量好，本次可在此基础上递增强度或复杂度
- 延续有效的训练刺激，改进遇到的问题`;
  }

  // 近期训练走势数据 - 用于动态调整本次课程强度
  if (recentSessions.length > 0) {
    const rpeRecords = recentSessions.map(s => `${s.date || '未知'}: RPE ${s.rpe || 0}/10`).join('，');
    const avgRpe = recentSessions.reduce((sum, s) => sum + (s.rpe || 0), 0) / recentSessions.length;
    const trend = recentSessions.length >= 2
      ? (recentSessions[recentSessions.length - 1].rpe || 0) - (recentSessions[0].rpe || 0)
      : 0;
    const trendText = trend > 1 ? '疲劳积累' : trend < -1 ? '恢复趋势' : '相对稳定';
    systemPrompt += `\n\n【近期训练RPE趋势分析（近${recentSessions.length}次）】
训练记录：${rpeRecords}
平均RPE: ${avgRpe.toFixed(1)}/10
走势: ${trendText}

调整逻辑：
- 如果平均RPE >= 8 或有疲劳积累：降低本次强度，减少组数，增加组间休息
- 如果平均RPE <= 4 或有恢复趋势：可逐步增加本次强度和复杂度
- 如果平均RPE在 5-7：正常推进，维持或微调强度`;
  }

  if (Array.isArray(input.coachRules) && input.coachRules.length) {
    systemPrompt += `\n\n【教练偏好规则（必须遵守）】\n${input.coachRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`;
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
    if (s.injury_history) parts.push(`- 伤病史：${s.injury_history}（AI必须自动规避相关动作）`);
    if (s.discomfort_areas?.length) parts.push(`- 身体不适区域：${s.discomfort_areas.join('、')}`);
    if (s.exercise_experience) parts.push(`- 训练经验：${s.exercise_experience}`);
    if (s.fitness_goal) parts.push(`- 训练目标：${s.fitness_goal}`);
    if (s.occupation_traits?.length) parts.push(`- 职业特点：${s.occupation_traits.join('、')}`);
  }

  if (Array.isArray(input.weeklyData) && input.weeklyData.length) {
    const latest = input.weeklyData[input.weeklyData.length - 1];
    if (latest?.weight > 0) {
      parts.push('\n## 最新体测数据');
      parts.push(`- 体重：${latest.weight} kg`);
      if (latest.bf) parts.push(`- 体脂率：${latest.bf}%`);
    }
  }

  if (input.preSessionData) {
    const psd = input.preSessionData;
    parts.push('\n## 课前评估（最高优先级）');
    parts.push(`- 恢复状态：${psd.recoveryStatus}`);
    parts.push(`- 今日状态：${psd.todayStatus}`);
    parts.push(`- 不适区域：${(psd.discomfortAreas || []).join('、') || '无'}`);
    if (psd.customNotes) parts.push(`- 教练备注：${psd.customNotes}`);
    if (psd.coachNote) parts.push(`- 教练备注：${psd.coachNote}`);

    const isRecoveryPoor = String(psd.recoveryStatus || '').includes('酸痛') || String(psd.todayStatus || '').includes('状态差');
    const hasDiscomfort = Array.isArray(psd.discomfortAreas) && psd.discomfortAreas.some((a) => a !== '无不适');
    if (isRecoveryPoor) parts.push('⚠️ 强制：恢复不足，降低强度，减少组数，增加间歇');
    if (hasDiscomfort)
      parts.push(`⚠️ 强制：${psd.discomfortAreas.filter((a) => a !== '无不适').join('、')}不适，必须规避相关动作`);
    if (String(psd.todayStatus || '').includes('状态差')) parts.push('⚠️ 强制：客户今日状态差，整体强度不超过RPE 5，以恢复激活为主');
  }

  // 同类训练日的上一次记录 - 作为动作递增和变异的基准
  if (Array.isArray(input.lastSessionExercises) && input.lastSessionExercises.length) {
    const dateStr = input.lastSessionDate ? `（${input.lastSessionDate}）` : '';
    parts.push(`\n## 上次同类训练日动作记录${dateStr}`);
    parts.push('规则：本次动作选择必须基于上次进行递增、变异或替换，不允许完全复制');
    input.lastSessionExercises.forEach((ex) => {
      const details = `${ex.name}  ${ex.sets}×${ex.reps}  间歇${ex.rest_seconds}s`;
      const fullDetails = ex.notes ? `${details}  [${ex.notes}]` : details;
      parts.push(`- ${fullDetails}`);
    });
    parts.push('\n递增方式（按优先级）：');
    parts.push('1. 增加组数（如 3×8 → 4×8）');
    parts.push('2. 增加重量（同组数和次数）');
    parts.push('3. 变式替换（保持训练目的，更高难度变式）');
    parts.push('4. 修改节奏（如 3030 → X012，增加爆发性）');
  }

  parts.push(`\n请生成完整的 ${totalModuleCount} 模块课程方案（热身1 + 主训${moduleCount}个 + 放松1），每个模块的动作数、格式、视角注释按档位规范严格执行。`);

  const exerciseSchema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      group_tag: { type: 'string' },
      sets: { type: 'number' },
      reps: { type: 'string' },
      rest_seconds: { type: 'number' },
      rhythm: { type: 'string' },
      target_muscles: { type: 'string' },
      dyline: { type: 'string' },
      cue: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['name', 'sets', 'reps', 'rest_seconds', 'target_muscles', 'cue', 'notes'],
    additionalProperties: false,
  };

  const moduleSchema = {
    type: 'object',
    properties: {
      module_name: { type: 'string' },
      module_duration: { type: 'string' },
      format: { type: 'string' },
      exercises: { type: 'array', items: exerciseSchema },
    },
    required: ['module_name', 'module_duration', 'format', 'exercises'],
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
          name: 'fika_session_plan',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              session_name: { type: 'string' },
              tier: { type: 'string' },
              intensity_note: { type: 'string' },
              warmup_note: { type: 'string' },
              modules: {
                type: 'array',
                description: `训练模块数组，必须包含 ${totalModuleCount} 个模块（热身1 + 主训${moduleCount} + 放松1）`,
                items: moduleSchema,
              },
            },
            required: ['session_name', 'tier', 'intensity_note', 'warmup_note', 'modules'],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = extractLLMContent(result);
    if (!rawContent) {
      console.error('[generateSessionPlan] LLM 返回空内容');
      return { error: 'AI 返回内容为空' };
    }

    let jsonStr = String(rawContent).trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const sessionPlan = JSON.parse(jsonStr);

    const modules = sessionPlan.modules || [];
    const warnings = [];

    if (modules.length !== totalModuleCount) {
      console.warn(`[generateSessionPlan] 模块数量: 期望${totalModuleCount}, 实际${modules.length}`);
      if (modules.length > totalModuleCount) sessionPlan.modules = modules.slice(0, totalModuleCount);
      warnings.push(`模块数量: 期望${totalModuleCount}, 实际${modules.length}`);
    }

    if (lastRpe > 0 && sessionPlan.modules) {
      for (const mod of sessionPlan.modules) {
        if (!mod.exercises) continue;
        for (const ex of mod.exercises) {
          if (lastRpe >= 8) {
            ex.sets = Math.max(1, (ex.sets || 3) - 1);
            ex.rest_seconds = (ex.rest_seconds || 60) + 15;
          } else if (lastRpe <= 4) {
            ex.sets = (ex.sets || 3) + 1;
            ex.rest_seconds = Math.max(30, (ex.rest_seconds || 60) - 10);
          }
        }
      }
    }

    sessionPlan.tier = sessionTier;
    sessionPlan.rpe_input = lastRpe || null;
    sessionPlan.rpe_mode = rpeMode;
    sessionPlan.status_score = statusScore;
    sessionPlan.intensity_phase = intensity;
    if (sessionTier === 'ultra') {
      sessionPlan.neural_mode = ultraRecoveryMode ? 'recovery' : 'high_intensity';
    }
    if (warnings.length > 0) sessionPlan._validation_warning = warnings.join('; ');

    return sessionPlan;
  } catch (err) {
    console.error('[generateSessionPlan] LLM error:', err);
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
