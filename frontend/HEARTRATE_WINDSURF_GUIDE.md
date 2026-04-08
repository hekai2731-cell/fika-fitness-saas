# FiKA 心率系统接入 — Windsurf 操作指令

## 第一步：复制三个文件到项目

| 文件 | 目标路径 |
|------|---------|
| heartRateUtils.ts | frontend/src/lib/heartRateUtils.ts |
| useHeartRate.ts   | frontend/src/hooks/useHeartRate.ts |
| HeartRatePage.tsx | frontend/src/components/coach/HeartRatePage.tsx （替换原有） |
| HeartRateBadge.tsx | frontend/src/components/coach/HeartRateBadge.tsx （新建） |

---

## 第二步：在 CoachSessionView.tsx 接入心率悬浮条

在 CoachSessionView.tsx 文件里做以下三处改动：

### 2-1. 顶部 import
```tsx
import { useHeartRate } from '@/hooks/useHeartRate';
import { HeartRateBadge, HRSummaryCard } from './coach/HeartRateBadge';
```

### 2-2. 组件内初始化 hook（在 useState 区域加）
```tsx
const hr = useHeartRate(client.age, (client as any).rhr || 65);
```

### 2-3. 在训练界面最顶部（进度条下面，sess-layout 外面）插入悬浮条
```tsx
<HeartRateBadge hr={hr} />
```

### 2-4. 在训练结束弹窗（finish panel）的 RPE 区域下方加心率总结
```tsx
<HRSummaryCard stats={hr.getStats()} />
```

### 2-5. 在 saveSession 函数里保存心率数据
```tsx
const hrStats = hr.getStats();
await props.onRecordSession({
  ...data,
  hr_avg: hrStats?.avgBpm,
  hr_max: hrStats?.maxBpm,
  hr_min: hrStats?.minBpm,
  hr_zone_durations: hrStats?.zoneDurations,
});
hr.clearSamples();
```

---

## 第三步：HeartRatePage 已完整，无需额外改动

CoachShell.tsx 里的 `tab === 'heartrate'` 路由到 HeartRatePage 不变，
只需把原来的空壳文件替换成新的 HeartRatePage.tsx 即可。

---

## 第四步：确认 HTTPS 部署

Web Bluetooth API 强制要求 HTTPS。
本地 http://127.0.0.1 开发时无法连接蓝牙设备（浏览器安全限制）。

部署到 https://fikafitness.com 后才能正常使用蓝牙心率带。

开发阶段可以用模拟 BPM 测试 UI（在 useHeartRate.ts 里加 mock 数据即可）。

---

## 兼容设备

所有支持标准 GATT Heart Rate Profile 的 BLE 设备：
- Polar H10 / H9（推荐，精度最高）
- Wahoo TICKR / TICKR X
- Garmin HRM-Pro / HRM-Dual
- 任意支持 heart_rate service 的蓝牙心率带

---

## 卡氏公式逻辑（来自 PDF）

```
MHR = 220 - 年龄
目标心率 = (MHR - RHR) × 强度% + RHR

Z1 恢复拔固：50–60%  → Standard
Z2 有氧燃脂：60–70%  → Standard
Z3 心肺强化：70–80%  → Pro
Z4 乳酸阈值：80–90%  → Ultra
Z5 极限爆发：90–100% → Ultra
```
