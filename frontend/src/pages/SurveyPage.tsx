import { type CSSProperties, useMemo, useState } from 'react';

import type { Client } from '@/lib/db';

type Profile = NonNullable<Client['profile']>;
type StepKey = 0 | 1 | 2 | 3;

const STEP_1 = [
  {
    key: 'age_range' as const,
    title: '你的年龄段？',
    options: [
      { label: '18-25', value: '18-25' },
      { label: '26-35', value: '26-35' },
      { label: '36-45', value: '36-45' },
      { label: '45以上', value: '45+' },
    ],
  },
  {
    key: 'occupation' as const,
    title: '你的职业方向？',
    options: [
      { label: '职场白领', value: 'white_collar' },
      { label: '创业者', value: 'entrepreneur' },
      { label: '自由职业', value: 'freelance' },
      { label: '学生', value: 'student' },
      { label: '其他', value: 'other' },
    ],
  },
  {
    key: 'distance_km' as const,
    title: '距门店大概多远？',
    options: [
      { label: '步行10分钟内', value: 'walk10' },
      { label: '开车15分钟内', value: 'drive15' },
      { label: '更远', value: 'far' },
    ],
  },
  {
    key: 'referral_source' as const,
    title: '怎么知道我们的？',
    options: [
      { label: '朋友介绍', value: 'friend' },
      { label: '小红书', value: 'xiaohongshu' },
      { label: '路过看到', value: 'passing' },
      { label: '搜索', value: 'search' },
      { label: '其他', value: 'other' },
    ],
  },
  {
    key: 'decision_speed' as const,
    title: '从了解到决定来，花了多久？',
    options: [
      { label: '当天就决定了', value: 'same_day' },
      { label: '考虑了几天', value: 'few_days' },
      { label: '考虑了超过一周', value: 'over_week' },
    ],
  },
];

const STEP_2 = [
  {
    key: 'training_experience' as const,
    title: '之前有健身经历吗？',
    options: [
      { label: '完全没有', value: 'none' },
      { label: '断断续续练过', value: 'irregular' },
      { label: '有规律训练超过6个月', value: 'regular_6m+' },
    ],
  },
  {
    key: 'weekly_frequency_plan' as const,
    title: '每周能来几次？',
    options: [
      { label: '1次', value: 1 },
      { label: '2次', value: 2 },
      { label: '3次', value: 3 },
      { label: '3次以上', value: 4 },
    ],
  },
  {
    key: 'goal_type' as const,
    title: '最想改变什么？',
    options: [
      { label: '减脂塑形', value: 'fat_loss' },
      { label: '增肌', value: 'muscle_gain' },
      { label: '提升体能', value: 'performance' },
      { label: '改善姿态', value: 'posture' },
      { label: '功能康复', value: 'rehabilitation' },
    ],
  },
  {
    key: 'goal_timeline' as const,
    title: '期望多久看到明显效果？',
    options: [
      { label: '1个月内', value: '1month' },
      { label: '3个月内', value: '3months' },
      { label: '半年以上', value: '6months+' },
      { label: '没有具体预期', value: 'no_expectation' },
    ],
  },
];

const STEP_3 = [
  {
    key: 'sleep_quality' as const,
    title: '平均睡眠质量？',
    options: [
      { label: '很好', value: 'good' },
      { label: '一般', value: 'average' },
      { label: '很差', value: 'poor' },
    ],
  },
  {
    key: 'stress_level' as const,
    title: '工作压力水平？',
    options: [
      { label: '轻松', value: 'low' },
      { label: '中等', value: 'medium' },
      { label: '高压', value: 'high' },
    ],
  },
  {
    key: 'diet_regularity' as const,
    title: '饮食规律吗？',
    options: [
      { label: '很规律', value: 'regular' },
      { label: '偶尔乱', value: 'occasional' },
      { label: '经常外卖', value: 'often_takeout' },
    ],
  },
  {
    key: 'sedentary_6h' as const,
    title: '每天久坐超过6小时？',
    options: [
      { label: '是', value: true },
      { label: '否', value: false },
    ],
  },
  {
    key: 'budget_level' as const,
    title: '预计每月在健身上的投入？',
    options: [
      { label: '1000元以下', value: 'under_1000' },
      { label: '1000-3000元', value: '1000_3000' },
      { label: '3000元以上', value: 'over_3000' },
    ],
  },
];

const QUESTION_MAP = {
  0: [],
  1: STEP_1,
  2: STEP_2,
  3: STEP_3,
} as const;

export function SurveyPage() {
  const search = new URLSearchParams(window.location.search);
  const coachCode = String(search.get('coach') || '').trim().toUpperCase();
  const code = String(search.get('code') || '').trim().toUpperCase(); // 兼容旧流程

  const [step, setStep] = useState<StepKey>(coachCode ? 0 : 1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const questions = QUESTION_MAP[step];

  const canNext = useMemo(() => {
    if (step === 0) {
      // 第0步：检查姓名和手机
      return name.trim() !== '' && phone.trim() !== '' && /^\d{11}$/.test(phone);
    }
    return questions.every((q) => {
      const value = profile[q.key as keyof Profile];
      return value !== undefined && value !== '';
    });
  }, [step, name, phone, questions, profile]);

  const onPick = (key: keyof Profile, value: Profile[keyof Profile]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const onSubmit = async () => {
    setSubmitting(true);
    setError(null);

    try {
      if (coachCode) {
        // 新流程：通过教练码提交
        const res = await fetch('/api/survey/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            coachCode,
            name: name.trim(),
            phone: phone.trim(),
            profile: profile as Profile,
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        setSubmittedAt(new Date().toISOString());
      } else if (code) {
        // 旧流程：通过路书码提交
        const findRes = await fetch(`/api/clients/by-road-code/${encodeURIComponent(code)}`);
        if (!findRes.ok) {
          setError('二维码已失效，请联系教练');
          return;
        }

        const client = (await findRes.json()) as Client;
        const nextProfile: Profile = {
          ...(client.profile || {}),
          ...(profile as Profile),
          survey_completed_at: new Date().toISOString(),
        };

        const saveRes = await fetch(`/api/clients/${client.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...client, profile: nextProfile }),
        });

        if (!saveRes.ok) {
          throw new Error(`HTTP ${saveRes.status}`);
        }

        setSubmittedAt(nextProfile.survey_completed_at || new Date().toISOString());
      } else {
        setError('二维码已失效，请联系教练');
      }
    } catch (e) {
      console.error('[survey] submit failed', e);
      setError('提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedAt) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.brand}>FiKA Fitness</div>
          <h2 style={styles.title}>感谢填写，您的教练会尽快联系您</h2>
          <p style={styles.sub}>提交时间：{new Date(submittedAt).toLocaleString('zh-CN')}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>FiKA 客户信息采集</div>
        <div style={styles.progressWrap}>
          <div style={styles.progressText}>{step === 0 ? '基本信息' : `第 ${step} 步 / 共 3 步`}</div>
          <div style={styles.progressTrack}>
            <div style={{ ...styles.progressFill, width: `${(step / (coachCode ? 4 : 3)) * 100}%` }} />
          </div>
        </div>

        {!coachCode && !code && <div style={styles.error}>二维码已失效，请联系教练</div>}
        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.questionWrap}>
          {step === 0 && (
            <>
              <div style={styles.block}>
                <div style={styles.questionTitle}>您的姓名（必填）</div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="请输入姓名"
                  style={{ ...styles.textInput }}
                />
              </div>
              <div style={styles.block}>
                <div style={styles.questionTitle}>手机号（必填）</div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="请输入11位手机号"
                  maxLength={11}
                  style={{ ...styles.textInput }}
                />
              </div>
            </>
          )}
          {step > 0 && questions.map((q) => (
            <div key={q.key} style={styles.block}>
              <div style={styles.questionTitle}>{q.title}</div>
              <div style={styles.optionsGrid}>
                {q.options.map((opt) => {
                  const active = profile[q.key as keyof Profile] === opt.value;
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => onPick(q.key as keyof Profile, opt.value as Profile[keyof Profile])}
                      style={{ ...styles.optionBtn, ...(active ? styles.optionBtnActive : {}) }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={styles.actions}>
          <button type="button" style={styles.secondaryBtn} disabled={step === 0 || step === 1} onClick={() => setStep((s) => Math.max(0, s - 1) as StepKey)}>
            上一步
          </button>

          {step < 3 ? (
            <button type="button" style={styles.primaryBtn} disabled={!canNext} onClick={() => setStep((s) => Math.min(3, s + 1) as StepKey)}>
              下一步
            </button>
          ) : (
            <button type="button" style={styles.primaryBtn} disabled={!canNext || submitting || (!coachCode && !code)} onClick={onSubmit}>
              {submitting ? '提交中...' : '提交问卷'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    padding: '18px 12px',
    background: 'linear-gradient(180deg, #f7f3ff, #f3f4ff)',
  },
  card: {
    width: '100%',
    maxWidth: 480,
    background: '#fff',
    border: '1px solid #e6defe',
    borderRadius: 16,
    boxShadow: '0 14px 36px rgba(83,64,150,.12)',
    padding: 16,
    alignSelf: 'flex-start',
  },
  brand: {
    color: '#5f4ccf',
    fontWeight: 800,
    fontSize: 14,
  },
  title: {
    margin: '10px 0 6px',
    fontSize: 22,
    lineHeight: 1.2,
    color: '#271f56',
  },
  sub: { margin: 0, color: '#5e5f78', fontSize: 13 },
  progressWrap: { marginTop: 8 },
  progressText: { fontSize: 12, color: '#5e5f78', fontWeight: 700 },
  progressTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: 999,
    background: '#ece8ff',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    background: 'linear-gradient(90deg, #6a4ce6, #8b69ff)',
    transition: 'width .2s ease',
  },
  questionWrap: { marginTop: 12, display: 'grid', gap: 12 },
  block: {
    border: '1px solid #ede8fe',
    borderRadius: 12,
    padding: 10,
    background: '#fcfbff',
  },
  questionTitle: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: 700,
    color: '#2a2550',
  },
  optionsGrid: {
    display: 'grid',
    gap: 8,
  },
  optionBtn: {
    border: '1px solid #d8cff8',
    background: '#fff',
    color: '#463f79',
    borderRadius: 10,
    minHeight: 44,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
  },
  optionBtnActive: {
    border: '1px solid #6d54ea',
    color: '#fff',
    background: 'linear-gradient(135deg, #6d54ea, #8d6fff)',
    boxShadow: '0 8px 18px rgba(100,83,195,.28)',
  },
  actions: {
    marginTop: 12,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  primaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    border: 'none',
    color: '#fff',
    background: 'linear-gradient(135deg, #6d54ea, #8d6fff)',
    fontWeight: 800,
    cursor: 'pointer',
  },
  secondaryBtn: {
    minHeight: 44,
    borderRadius: 10,
    border: '1px solid #d8cff8',
    color: '#524b84',
    background: '#fff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  error: {
    marginTop: 10,
    borderRadius: 10,
    border: '1px solid #fecaca',
    background: '#fff1f2',
    color: '#b42318',
    fontSize: 13,
    padding: '8px 10px',
  },
  textInput: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '10px 12px',
    border: '1px solid #d8cff8',
    borderRadius: 10,
    fontSize: 14,
    fontFamily: 'inherit',
    outline: 'none',
    transition: 'border-color .2s',
  },
};
