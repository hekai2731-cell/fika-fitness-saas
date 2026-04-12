# FiKA SaaS 项目重整方案

> 生成时间：2026-04-11

---

## 一、现状诊断

### 文件规模（行数）
| 文件 | 行数 | 问题 |
|---|---|---|
| PlanningPage.tsx | 4073 | 训练规划+AI生成+发布回滚全在一个文件 |
| ClientsPage.tsx | 1734 | 客户档案+体测+档位+问卷审批 |
| App.tsx | 1338 | 路由+登录+客户选择页+初始化 |
| StudentPortal.tsx | 1550 | 学生端所有Tab |
| AdminPortal.tsx | 1478 | 管理端所有Tab |
| CoachSessionView.tsx | 1392 | 上课记录+心率 |
| backend/index.js | 822 | 所有API路由混在一起 |

### 数据架构问题
- **所有数据塞在 Client 文档里**：blocks、sessions、published_blocks、plan_publish_history、assessments、bodyMetrics、dailyLogs 全部嵌套在同一个 MongoDB 文档
- **单文档会越来越大**，一个活跃客户训练半年后，文档可能超过 5MB
- **没有独立的 Collection**：训练计划、上课记录、AI生成草稿都没有自己的存储空间

---

## 二、目标架构

### 后端 Collections（6个独立 Collection）

```
fika_clients          → 客户档案（基本信息+体测+画像+LTV）
fika_training_plans   → 训练规划（Block/Week/Day 结构）
fika_ai_drafts        → AI生成草稿（可插拔，教练确认后推到 training_plans）
fika_sessions         → 上课记录（每次课的执行数据）
fika_finances         → 财务记录（课时余额/收费/续费）
fika_coaches          → 教练数据（已有）
```

### 关联关系
```
training_plans.clientId → clients.id
ai_drafts.clientId     → clients.id
ai_drafts.planId       → training_plans._id（确认后关联）
sessions.clientId      → clients.id
sessions.planDayId     → training_plans 里某个 day 的 id（可选）
finances.clientId      → clients.id
```

### 后端路由拆分（6个路由文件）
```
routes/clients.js      → /api/clients/*        客户档案 CRUD
routes/plans.js        → /api/plans/*           训练规划 CRUD + 发布/回滚
routes/ai.js           → /api/ai/*             AI生成（session/week/full/diet）
routes/sessions.js     → /api/sessions/*        上课记录
routes/finances.js     → /api/finances/*        财务
routes/admin.js        → /api/admin/*           管理端聚合查询
```

### 前端组件拆分

```
src/
├── App.tsx                        ← 只管路由切换和登录，约200行
├── pages/
│   ├── CoachPortal.tsx           ← 教练端壳子 + Tab路由
│   ├── StudentPortal.tsx         ← 学生端壳子
│   └── AdminPortal.tsx           ← 管理端壳子
├── features/
│   ├── clients/                  ← 模块一：客户档案
│   │   ├── ClientListPage.tsx    ← 客户选择/列表
│   │   ├── ClientDetailPage.tsx  ← 档案详情（体测/画像/LTV/档位）
│   │   ├── AssessmentForm.tsx    ← 体测录入表单
│   │   └── useClients.ts        ← 客户数据 hook
│   ├── plans/                    ← 模块二：训练规划
│   │   ├── PlanOverview.tsx      ← Block/Week 导航
│   │   ├── DayEditor.tsx         ← 单日训练编辑器
│   │   ├── PublishPanel.tsx      ← 发布/回滚面板
│   │   └── usePlans.ts          ← 规划数据 hook
│   ├── ai/                       ← 模块三：AI生成
│   │   ├── AiGeneratePanel.tsx   ← 生成表单 + 预览
│   │   ├── AiPreviewModal.tsx    ← 草稿预览/确认
│   │   └── useAiDrafts.ts       ← AI草稿 hook
│   ├── sessions/                 ← 模块四：上课记录
│   │   ├── SessionRecorder.tsx   ← 上课实时记录
│   │   ├── SessionHistory.tsx    ← 历史记录列表
│   │   ├── HeartRatePanel.tsx    ← 心率模块
│   │   └── useSessions.ts       ← 上课数据 hook
│   ├── finances/                 ← 模块五：财务
│   │   ├── FinanceOverview.tsx
│   │   ├── PackagePurchase.tsx
│   │   └── useFinances.ts
│   └── admin/                    ← 模块六：管理端监控
│       ├── DashboardTab.tsx
│       ├── CoachPerformance.tsx
│       └── ClientAlerts.tsx
├── components/ui/                ← 通用UI组件（现有保留）
└── lib/
    ├── api.ts                    ← 统一 fetch 封装
    ├── db.ts                     ← 类型定义
    └── store.ts                  ← 缓存管理
```

---

## 三、Client 文档瘦身

### 之前（全塞在 Client 里）
```
Client {
  id, name, gender, age, ...       // 基本信息 ✓ 保留
  bodyMetrics, assessments, ...    // 体测数据 ✓ 保留
  profile, ltv_score, ...          // 画像+LTV ✓ 保留
  membershipLevel, tier, ...       // 档位    ✓ 保留
  blocks, published_blocks,        // ✗ 移出 → training_plans
  plan_draft_version, ...          // ✗ 移出 → training_plans
  plan_publish_history,            // ✗ 移出 → training_plans
  sessions,                        // ✗ 移出 → sessions
  dietPlans,                       // ✗ 移出 → ai_drafts
  dailyLogs,                       // ✗ 移出 → sessions 或独立
}
```

### 之后（Client 只存档案数据）
```
Client {
  id, roadCode, name, coachCode, coachName,
  gender, age, height, weight,
  tier, membershipLevel,
  goal, goal_type, injury, injury_detail,
  bodyMetrics, assessments,
  profile, ltv_score,
  weeks, weeks_total, current_week, start_date,
  deletedAt, deletedByCoachCode, deletedByCoachName,
}
```

---

## 四、新增 Mongoose Models

### TrainingPlan（训练规划）
```js
{
  clientId: String,          // 关联客户
  coachCode: String,         // 创建教练
  status: 'draft' | 'published' | 'archived',
  version: Number,
  blocks: [Mixed],           // Block/Week/Day 结构
  published_blocks: [Mixed], // 最新发布的副本
  published_at: Date,
  publish_history: [{        // 只存摘要
    version, published_at, published_by, summary
  }],
}
```

### AiDraft（AI草稿）
```js
{
  clientId: String,
  coachCode: String,
  planType: 'session' | 'week' | 'full' | 'diet',
  input_payload: Mixed,      // 发给AI的参数
  output_result: Mixed,      // AI返回的结果
  status: 'pending' | 'approved' | 'rejected',
  approved_at: Date,
  target_plan_id: ObjectId,  // 确认后关联到哪个 TrainingPlan
}
```

### Session（上课记录）
```js
{
  clientId: String,
  coachCode: String,
  date: Date,
  week: Number,
  day: String,
  duration: Number,
  rpe: Number,
  performance: String,
  note: String,
  price: Number,
  level: Number,
  hrAvg: Number, hrMax: Number, hrMin: Number,
  hrZoneDurations: Mixed,
  kcal: Number,
  exercises: [Mixed],        // 实际执行的动作详情
}
```

### Finance（财务记录）
```js
{
  clientId: String,
  coachCode: String,
  type: 'purchase' | 'consumption' | 'refund',
  amount: Number,            // 金额
  sessions_count: Number,    // 课时数量
  package_type: String,      // 对应 membershipLevel
  note: String,
  date: Date,
}
```

---

## 五、迁移步骤（分5期，每期可独立部署）

### 第1期：后端拆路由 + 新建 Models（不改前端）
1. 创建 4 个新 Model 文件
2. 把 index.js 的路由拆到 6 个文件
3. 写数据迁移脚本：从 Client 文档里抽出 blocks/sessions 到新 Collection
4. 保持旧 API 兼容，新旧 API 并存

### 第2期：前端 App.tsx 瘦身
1. 把 CoachClientSelectPage 抽出为独立组件
2. 把登录逻辑抽到 `useAuth.ts` hook
3. App.tsx 只剩路由切换，约200行

### 第3期：训练规划模块独立化
1. PlanningPage 拆成 PlanOverview + DayEditor + PublishPanel
2. AI生成逻辑抽到 features/ai/
3. 前端改用 /api/plans/* 新接口

### 第4期：上课记录模块独立化
1. CoachSessionView 拆成 SessionRecorder + HeartRatePanel
2. 前端改用 /api/sessions/* 新接口

### 第5期：财务 + 管理端
1. FinancePage 接入 /api/finances/*
2. AdminPortal 改为只读聚合查询

---

## 六、每期耗时估算

| 期 | 内容 | 预估工作量 |
|---|---|---|
| 第1期 | 后端拆路由 + Models + 迁移脚本 | 2-3天 |
| 第2期 | App.tsx 瘦身 | 1天 |
| 第3期 | 训练规划模块独立化 | 2-3天 |
| 第4期 | 上课记录模块独立化 | 1-2天 |
| 第5期 | 财务 + 管理端 | 1-2天 |

**总计约 7-11 个工作日**，每期完成后可独立部署和测试。
