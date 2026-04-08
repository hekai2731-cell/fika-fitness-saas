import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { Client } from '@/lib/db';
import { loadClients, saveClients } from '@/lib/store';

type MembershipLevel = 'standard' | 'advanced' | 'professional' | 'elite';

function initials(name: string) {
  const s = (name || '').trim();
  if (!s) return 'FI';
  return s.slice(0, 2).toUpperCase();
}

const tierMeta: Record<MembershipLevel, { label: string; cn: string; accent: string; soft: string; ring: string; storeTier: NonNullable<Client['tier']> }> = {
  standard: {
    label: 'Standard',
    cn: '基础会员',
    accent: '#24262D',
    soft: 'rgba(36,38,45,.14)',
    ring: 'rgba(36,38,45,.3)',
    storeTier: 'standard',
  },
  advanced: {
    label: 'Advanced',
    cn: '进阶会员',
    accent: '#2F8A56',
    soft: 'rgba(47,138,86,.16)',
    ring: 'rgba(47,138,86,.3)',
    storeTier: 'pro',
  },
  professional: {
    label: 'Professional',
    cn: '专业会员',
    accent: '#CF7A25',
    soft: 'rgba(207,122,37,.16)',
    ring: 'rgba(207,122,37,.3)',
    storeTier: 'pro',
  },
  elite: {
    label: 'Elite',
    cn: '至尊会员',
    accent: '#C33B3B',
    soft: 'rgba(195,59,59,.16)',
    ring: 'rgba(195,59,59,.3)',
    storeTier: 'ultra',
  },
};

export function ClientsPage({
  onSelect,
  selectedClientId,
}: {
  onSelect: (clientId: string) => void;
  selectedClientId: string | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [metricLabels, setMetricLabels] = useState<string[]>(['体重 / WEIGHT', '身高 / HEIGHT', '年龄 / AGE', '体脂指数 / BMI', '肌肉量 / MUSCLE', '基础代谢 / BMR', '训练周期 / BLOCKS', '训练课次 / SESSIONS']);
  const [assessmentTitle, setAssessmentTitle] = useState('生活习惯 / Lifestyle Habits');
  const [assessmentItems, setAssessmentItems] = useState<Array<{ l: string; v: string }>>([
    { l: '睡眠质量 / Sleep Quality', v: '★★★★☆' },
    { l: '压力水平 / Stress Level', v: '中等 / MODERATE' },
    { l: '活动水平 / Activity Level', v: '高 / HIGH' },
    { l: '目标 / Goal', v: '' },
    { l: '伤病情况 / Injury', v: '' },
    { l: '健康评分 / Health Score', v: '88%' },
  ]);
  const [editingMetric, setEditingMetric] = useState<number | null>(null);
  const [editingAssessment, setEditingAssessment] = useState<number | null>(null);

  const tierOrder: MembershipLevel[] = ['standard', 'advanced', 'professional', 'elite'];

  const metricLabelMap: Record<string, string> = {
    WEIGHT: '体重 / WEIGHT',
    HEIGHT: '身高 / HEIGHT',
    AGE: '年龄 / AGE',
    BMI: '体脂指数 / BMI',
    MUSCLE: '肌肉量 / MUSCLE',
    BMR: '基础代谢 / BMR',
    BLOCKS: '训练周期 / BLOCKS',
    SESSIONS: '训练课次 / SESSIONS',
  };

  const assessmentLabelMap: Record<string, string> = {
    'Sleep Quality': '睡眠质量 / Sleep Quality',
    'Stress Level': '压力水平 / Stress Level',
    'Activity Level': '活动水平 / Activity Level',
    Goal: '目标 / Goal',
    Injury: '伤病情况 / Injury',
    'Health Score': '健康评分 / Health Score',
  };

  const resolveMembershipLevel = (c: Client | null): MembershipLevel => {
    if (!c) return 'standard';
    const stored = (c as any).membershipLevel as MembershipLevel | undefined;
    if (stored && tierOrder.includes(stored)) return stored;
    if (c.tier === 'ultra') return 'elite';
    if (c.tier === 'pro') return 'professional';
    return 'standard';
  };

  useEffect(() => {
    const list = loadClients().filter((c) => c.name !== '示例客户');
    setClients(list);
    if (list.length > 0) {
      if (selectedClientId && list.some((c) => c.id === selectedClientId)) setActiveId(selectedClientId);
      else setActiveId(list[0].id);
    }
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    if (clients.some((c) => c.id === selectedClientId)) {
      setActiveId(selectedClientId);
    }
  }, [clients, selectedClientId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('fika_clients_copy');
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        metricLabels?: string[];
        assessmentTitle?: string;
        assessmentItems?: Array<{ l: string; v: string }>;
      };
      if (Array.isArray(parsed.metricLabels) && parsed.metricLabels.length >= 8) setMetricLabels(parsed.metricLabels.slice(0, 8));
      if (parsed.assessmentTitle) setAssessmentTitle(parsed.assessmentTitle);
      if (Array.isArray(parsed.assessmentItems) && parsed.assessmentItems.length >= 6) setAssessmentItems(parsed.assessmentItems.slice(0, 6));
    } catch {
      // ignore
    }
  }, []);

  const handleMetricValueEdit = (idx: number, value: string) => {
    if (!activeClient) return;
    
    const numericValue = value.replace(/[^0-9.]/g, '');
    
    const updatedClient = { ...activeClient };
    
    // Direct update client data based on metric index
    if (idx === 0) updatedClient.weight = numericValue ? parseFloat(numericValue) : undefined;
    if (idx === 1) updatedClient.height = numericValue ? parseFloat(numericValue) : undefined;
    if (idx === 2) updatedClient.age = numericValue ? parseInt(numericValue) : undefined;
    
    const updatedClients = clients.map(c => c.id === activeClient.id ? updatedClient : c);
    setClients(updatedClients);
    saveClients(updatedClients);
  };

  
  const handleAssessmentEdit = (idx: number, field: 'l' | 'v', value: string) => {
    const next = [...assessmentItems];
    if (field === 'v' && idx === 5) {
      // 健康评分 - 只允许数字
      const numericValue = value.replace(/[^0-9]/g, '');
      next[idx] = { ...next[idx], [field]: numericValue + '%' };
    } else if (field === 'v' && idx === 0) {
      // 睡眠质量 - 星级评分
      return; // 通过点击星星处理
    } else {
      next[idx] = { ...next[idx], [field]: value };
    }
    setAssessmentItems(next);
  };

  const saveAssessmentChanges = () => {
    if (!activeClient) return;
    
    const updatedClient = { ...activeClient };
    
    // Save assessment data back to client data
    // Map assessment items to client fields
    if (assessmentItems[3]?.v) updatedClient.goal = assessmentItems[3].v; // 目标
    if (assessmentItems[4]?.v) updatedClient.injury = assessmentItems[4].v; // 伤病情况
    
    const updatedClients = clients.map(c => c.id === activeClient.id ? updatedClient : c);
    setClients(updatedClients);
    saveClients(updatedClients);
  };

  const handleStarClick = (starIdx: number) => {
    const stars = '★'.repeat(starIdx + 1) + '☆'.repeat(4 - starIdx);
    handleAssessmentEdit(0, 'v', stars);
    // Auto-save after star rating change
    setTimeout(() => saveAssessmentChanges(), 100);
  };


  const activeClient = useMemo(() => clients.find((c) => c.id === activeId) || clients[0] || null, [clients, activeId]);

  const activeTier = resolveMembershipLevel(activeClient);
  const tier = tierMeta[activeTier];

  const switchTier = (nextTier: MembershipLevel) => {
    if (!activeClient) return;
    const next = clients.map((c) => (
      c.id === activeClient.id
        ? { ...c, tier: tierMeta[nextTier].storeTier, membershipLevel: nextTier } as Client
        : c
    ));
    setClients(next);
    saveClients(next);
  };

  if (!activeClient) {
    return <div style={{ fontSize: 13, color: 'var(--s500)' }}>暂无客户数据</div>;
  }

  const metricCards = [
    { v: activeClient.weight ?? '--', unit: 'kg', tone: '#4F5BDF' },
    { v: activeClient.height ?? '--', unit: 'cm', tone: '#5E6579' },
    { v: activeClient.age ?? '--', unit: '岁', tone: '#D14A63' },
    { v: activeClient.height && activeClient.weight ? (activeClient.weight / ((activeClient.height / 100) * (activeClient.height / 100))).toFixed(1) : '--', unit: '', tone: '#59637B' },
    { v: activeClient.weight ? Math.max(20, activeClient.weight * 0.45).toFixed(1) : '--', unit: 'kg', tone: '#4D5EDB' },
    { v: activeClient.weight && activeClient.height && activeClient.age ? Math.round(10 * activeClient.weight + 6.25 * activeClient.height - 5 * activeClient.age + 5) : '--', unit: 'kcal', tone: '#5E6579' },
    { v: (activeClient.blocks || []).length, unit: '', tone: '#5662E6' },
    { v: (activeClient.sessions || []).length, unit: '', tone: '#7A7F90' },
  ];

  return (
    <div className="clients-premium">
      <div className="clients-layout">
        <div>
          <div className="head-profile" style={{ borderColor: tier.ring }}>
            <div className="avatar-orb" style={{ boxShadow: `0 0 0 2px ${tier.ring}` }}>{initials(activeClient.name)}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="head-name">{activeClient.name}</div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span className="tier-pill" style={{ color: tier.accent, background: tier.soft }}>{tier.cn} / {tier.label} MEMBER</span>
                <span className="head-loc">上海 / Shanghai, CN</span>
              </div>
            </div>
            <div className="head-week">第 {activeClient.current_week || 1} 周 / Week {activeClient.current_week || 1}</div>
          </div>

  
          <div className="section-cap">• BODY COMPOSITION METRICS（身体成分指标）</div>
          <div className="metrics-grid">
            {metricCards.map((m, idx) => (
              <div key={`${idx}-${metricLabels[idx]}`} className="metric-card">
                <div className="metric-k">{metricLabelMap[metricLabels[idx]] || metricLabels[idx]}</div>
                <div 
                  className="metric-v" 
                  style={{ 
                    color: m.tone,
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'baseline'
                  }}
                  onDoubleClick={() => {
                    if (idx < 6) { // 只允许前6个指标编辑数值
                      setEditingMetric(idx);
                    }
                  }}
                >
                  {editingMetric === idx ? (
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end' }}>
                      <input
                        className="metric-input"
                        type="number"
                        value={m.v}
                        onChange={(e) => handleMetricValueEdit(idx, e.target.value)}
                        onBlur={() => setEditingMetric(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingMetric(null);
                          }
                        }}
                        autoFocus
                        style={{
                          width: '100px',
                          fontSize: '30px',
                          fontWeight: 900,
                          border: 'none',
                          background: 'transparent',
                          color: 'inherit',
                          outline: 'none',
                          textAlign: 'right'
                        }}
                      />
                      <span style={{ fontSize: 13, color: '#7B8194', marginLeft: 4 }}>{m.unit}</span>
                    </div>
                  ) : (
                    <>
                      {m.v}
                      <span style={{ fontSize: 13, color: '#7B8194', marginLeft: 4 }}>{m.unit}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="section-cap" style={{ marginTop: 18 }}>• ASSESSMENT & QUESTIONNAIRE（问卷筛查）</div>
          <div className="assessment-card">
            <div 
              className="assessment-title"
              onDoubleClick={() => setEditingAssessment(-1)}
            >
              {editingAssessment === -1 ? (
                <input
                  className="assessment-input"
                  value={assessmentTitle}
                  onChange={(e) => setAssessmentTitle(e.target.value)}
                  onBlur={() => {
                    setEditingAssessment(null);
                    saveAssessmentChanges();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setEditingAssessment(null);
                      saveAssessmentChanges();
                    }
                  }}
                  autoFocus
                />
              ) : (
                assessmentTitle === 'Lifestyle Habits（生活习惯）' ? '生活习惯 / Lifestyle Habits' : assessmentTitle
              )}
            </div>
            <div className="assessment-grid">
              {assessmentItems.map((it, idx) => (
                <div className="habit-item" key={`q-${idx}`}>
                  <span 
                    onDoubleClick={() => setEditingAssessment(idx * 2)}
                  >
                    {editingAssessment === idx * 2 ? (
                      <input
                        className="habit-input"
                        value={it.l}
                        onChange={(e) => handleAssessmentEdit(idx, 'l', e.target.value)}
                        onBlur={() => {
                          setEditingAssessment(null);
                          saveAssessmentChanges();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingAssessment(null);
                            saveAssessmentChanges();
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      assessmentLabelMap[it.l] || it.l
                    )}
                  </span>
                  <b 
                    style={idx === 5 ? { color: tier.accent } : undefined}
                    onDoubleClick={() => {
                      if (idx !== 0) { // 星级评分通过点击处理
                        setEditingAssessment(idx * 2 + 1);
                      }
                    }}
                  >
                    {editingAssessment === idx * 2 + 1 ? (
                      <input
                        className="habit-input"
                        value={idx === 5 ? it.v.replace('%', '') : it.v}
                        onChange={(e) => handleAssessmentEdit(idx, 'v', e.target.value)}
                        onBlur={() => {
                          setEditingAssessment(null);
                          saveAssessmentChanges();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setEditingAssessment(null);
                            saveAssessmentChanges();
                          }
                        }}
                        autoFocus
                        style={{ width: idx === 5 ? '40px' : '100%' }}
                      />
                    ) : idx === 0 ? (
                      // 睡眠质量 - 星级评分
                      <span style={{ cursor: 'pointer' }}>
                        {it.v.split('').map((star, starIdx) => (
                          <span
                            key={starIdx}
                            onClick={() => handleStarClick(starIdx)}
                            style={{ 
                              cursor: 'pointer',
                              color: star === '★' ? '#fbbf24' : '#d1d5db',
                              fontSize: '14px'
                            }}
                          >
                            {star}
                          </span>
                        ))}
                      </span>
                    ) : (
                      idx === 3 ? (it.v || activeClient.goal || '体态与增肌并进') : 
                      idx === 4 ? (it.v || activeClient.injury || '无明显损伤') : 
                      it.v
                    )}
                  </b>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="section-cap">• MEMBERSHIP TIERS（会员等级）</div>
          <div className="tiers-stack">
            {tierOrder.map((key) => {
              const item = tierMeta[key];
              const on = key === activeTier;
              return (
                <div key={key} className="tier-item">
                  <button
                    type="button"
                    className={`tier-card tone-${key} ${on ? 'on' : ''}`}
                    onClick={() => switchTier(key)}
                  >
                    <div className="tier-icon">◆</div>
                    <div>
                      <div className="tier-name">{item.cn} / {item.label}</div>
                      <div className="tier-sub">{item.cn}</div>
                    </div>
                  </button>

                  {on && (
                    <div className={`tier-feature tier-feature-inline tone-${key}`}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="tier-feature-title">{item.cn} / {item.label} ●</div>
                        <div style={{ fontSize: 30 }}>◈</div>
                      </div>
                      <ul className="feature-list">
                        <li>24/7 Priority Support</li>
                        <li>Advanced Biometric Tracking</li>
                        <li>Personal Nutrition Concierge</li>
                      </ul>
                      <Button
                        type="button"
                        className="w-full tier-open-btn"
                        onClick={() => onSelect(activeClient.id)}
                        style={{ marginTop: 14 }}
                      >
                        打开客户训练规划
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .clients-premium {
          --panel-bg: rgba(255,255,255,.55);
          --panel-bg-soft: rgba(255,255,255,.5);
          --panel-bg-strong: rgba(255,255,255,.62);
          --panel-border: rgba(216,221,236,.75);
          --panel-border-soft: rgba(216,221,236,.62);
          --panel-shadow: 0 14px 28px rgba(78,88,120,.12);
          border-radius: 22px;
          padding: 16px;
          background: var(--panel-bg);
          border: 1px solid var(--panel-border);
          box-shadow: var(--panel-shadow);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .copy-edit-btn {
          border: 1px solid rgba(182, 190, 219, .62);
          background: rgba(218,224,251,.46);
          border-radius: 999px;
          height: 30px;
          padding: 0 12px;
          font-size: 12px;
          font-weight: 700;
          color: #546083;
        }

        .clients-premium .clients-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr);
          gap: 18px;
        }

        .clients-premium .head-profile {
          border-radius: 16px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .avatar-orb {
          width: 56px;
          height: 56px;
          border-radius: 999px;
          background: linear-gradient(140deg, rgba(31,37,56,.95), rgba(59,67,95,.92));
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          letter-spacing: .03em;
          flex-shrink: 0;
        }

        .clients-premium .head-name {
          font-size: 34px;
          line-height: 1;
          font-weight: 900;
          color: #1f2435;
        }

        .clients-premium .tier-pill {
          font-size: 11px;
          font-weight: 800;
          border-radius: 999px;
          padding: 5px 10px;
          letter-spacing: .06em;
        }

        .clients-premium .head-loc {
          font-size: 12px;
          color: #6b7286;
        }

        .clients-premium .head-week {
          font-size: 12px;
          font-weight: 700;
          color: #59607a;
          border: 1px solid rgba(156, 164, 196, .42);
          padding: 6px 10px;
          border-radius: 999px;
        }

        .clients-premium .section-cap {
          margin-top: 14px;
          font-size: 11px;
          letter-spacing: .18em;
          font-weight: 800;
          color: #545d79;
        }

        .clients-premium .metrics-grid {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }

        .clients-premium .metric-card {
          border-radius: 14px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          padding: 10px;
          min-height: 86px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .metric-k {
          font-size: 10px;
          letter-spacing: .08em;
          font-weight: 800;
          color: #8a90a6;
        }

        .clients-premium .metric-input,
        .clients-premium .assessment-input,
        .clients-premium .habit-input {
          width: 100%;
          border-radius: 8px;
          border: 1px solid rgba(182,190,219,.58);
          background: rgba(228,233,255,.82);
          color: #2a3146;
          font-size: 12px;
          font-weight: 700;
          padding: 4px 8px;
        }

        .clients-premium .metric-v {
          margin-top: 10px;
          font-size: 30px;
          font-weight: 900;
          line-height: 1;
        }

        .clients-premium .assessment-card {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          padding: 14px;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .assessment-title {
          font-size: 28px;
          font-weight: 900;
          color: #1f2435;
          line-height: 1;
        }

        .clients-premium .assessment-input {
          font-size: 16px;
          font-weight: 800;
          height: 36px;
        }

        .clients-premium .assessment-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
        }

        .clients-premium .habit-item {
          border-radius: 12px;
          border: 1px solid var(--panel-border-soft);
          background: var(--panel-bg-soft);
          padding: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: #59607a;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .habit-input {
          width: 48%;
        }

        .clients-premium .habit-item b {
          color: #252b3d;
          font-weight: 800;
        }

        .clients-premium .tiers-stack {
          margin-top: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
        }

        .clients-premium .tier-item {
          width: 100%;
        }

        .clients-premium .tier-card {
          width: 100%;
          border-radius: 14px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg);
          padding: 14px;
          min-height: 70px;
          display: flex;
          align-items: center;
          gap: 10px;
          text-align: left;
          color: #2f3850;
          position: relative;
          overflow: hidden;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.74),
            inset 0 -16px 22px rgba(148,160,199,.12),
            var(--panel-shadow);
          transition: transform .26s cubic-bezier(.2,.9,.2,1), border-color .24s ease, box-shadow .24s ease;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .tier-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 1px 1px, rgba(104,116,154,.22) 1px, transparent 1.2px);
          background-size: 12px 12px;
          opacity: .22;
          -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.24) 62%, transparent 88%);
          mask-image: linear-gradient(180deg, rgba(0,0,0,.92) 0%, rgba(0,0,0,.24) 62%, transparent 88%);
          pointer-events: none;
        }

        .clients-premium .tier-card::after {
          content: '';
          position: absolute;
          left: 14px;
          right: 14px;
          bottom: 8px;
          height: 10px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(var(--tone-rgb), .66), rgba(var(--tone-rgb), .08));
          filter: blur(10px);
          opacity: .56;
          pointer-events: none;
        }

        .clients-premium .tier-card.on {
          border-color: rgba(var(--tone-rgb), .56);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.8),
            inset 0 -14px 20px rgba(var(--tone-rgb), .12),
            0 0 0 1px rgba(var(--tone-rgb), .34),
            0 12px 22px rgba(41,54,88,.22),
            0 0 20px rgba(var(--tone-rgb), .24);
          transform: translateY(-1px);
        }

        .clients-premium .tier-card:hover {
          transform: translateY(-1px);
          border-color: rgba(var(--tone-rgb), .42);
        }

        .clients-premium .tier-card.tone-standard,
        .clients-premium .tier-feature.tone-standard {
          --tone-rgb: 142, 150, 170;
        }

        .clients-premium .tier-card.tone-advanced,
        .clients-premium .tier-feature.tone-advanced {
          --tone-rgb: 101, 216, 146;
        }

        .clients-premium .tier-card.tone-professional,
        .clients-premium .tier-feature.tone-professional {
          --tone-rgb: 255, 166, 84;
        }

        .clients-premium .tier-card.tone-elite,
        .clients-premium .tier-feature.tone-elite {
          --tone-rgb: 255, 106, 106;
        }

        .clients-premium .tier-icon {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: rgba(var(--tone-rgb), .14);
          color: rgba(var(--tone-rgb), .95);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex-shrink: 0;
          box-shadow: inset 0 0 0 1px rgba(var(--tone-rgb), .34);
        }

        .clients-premium .tier-name {
          font-size: 15px;
          font-weight: 800;
          line-height: 1.1;
          color: rgba(var(--tone-rgb), .96);
          text-shadow: 0 0 12px rgba(var(--tone-rgb), .3);
        }

        .clients-premium .tier-sub {
          margin-top: 4px;
          font-size: 11px;
          color: rgba(63, 72, 96, .72);
        }

        .clients-premium .tier-feature {
          margin-top: 10px;
          border-radius: 16px;
          border: 1px solid var(--panel-border);
          background: var(--panel-bg-strong);
          padding: 16px;
          min-height: 250px;
          color: rgba(46, 56, 79, .92);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,.88),
            inset 0 -16px 20px rgba(var(--tone-rgb), .08),
            0 14px 24px rgba(52, 64, 96, .14),
            0 0 20px rgba(var(--tone-rgb), .18);
          position: relative;
          overflow: hidden;
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .clients-premium .tier-feature::after {
          content: '';
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 10px;
          height: 14px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(var(--tone-rgb), .76), rgba(var(--tone-rgb), .12));
          filter: blur(11px);
          opacity: .66;
          pointer-events: none;
        }

        .clients-premium .tier-feature-inline {
          animation: tierReveal .28s cubic-bezier(.22,.86,.32,1);
          transform-origin: top center;
        }

        .clients-premium .tier-feature-title {
          font-size: 28px;
          font-weight: 900;
          line-height: 1;
          color: rgba(var(--tone-rgb), .98);
          text-shadow: 0 0 14px rgba(var(--tone-rgb), .34);
        }

        .clients-premium .feature-list {
          margin-top: 10px;
          padding-left: 16px;
          display: grid;
          gap: 6px;
          font-size: 12px;
          color: rgba(53, 62, 86, .9);
        }

        .clients-premium .tier-open-btn {
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(var(--tone-rgb), .46);
          background: linear-gradient(135deg, rgba(var(--tone-rgb), .92), rgba(var(--tone-rgb), .72)) !important;
          color: #fff !important;
          font-weight: 800;
          letter-spacing: .02em;
          position: relative;
          overflow: hidden;
          box-shadow:
            0 12px 22px rgba(var(--tone-rgb), .34),
            0 0 18px rgba(var(--tone-rgb), .28),
            inset 0 1px 0 rgba(255,255,255,.34);
          transition: transform .2s ease, box-shadow .24s ease, filter .24s ease;
          animation: tierBtnPulse 2.4s ease-in-out infinite;
        }

        .clients-premium .tier-open-btn::before {
          content: '';
          position: absolute;
          top: 0;
          left: -42%;
          width: 36%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.36), transparent);
          transform: skewX(-16deg);
          transition: left .46s ease;
        }

        .clients-premium .tier-open-btn:hover {
          transform: translateY(-1px);
          box-shadow:
            0 16px 28px rgba(var(--tone-rgb), .38),
            0 0 22px rgba(var(--tone-rgb), .34),
            inset 0 1px 0 rgba(255,255,255,.4);
          filter: saturate(1.06);
        }

        .clients-premium .tier-open-btn:hover::before {
          left: 112%;
        }

        .clients-premium .tier-open-btn:active {
          transform: translateY(0) scale(.985);
          box-shadow:
            0 8px 16px rgba(var(--tone-rgb), .28),
            0 0 14px rgba(var(--tone-rgb), .24),
            inset 0 1px 0 rgba(255,255,255,.32);
        }

        @keyframes tierBtnPulse {
          0%,
          100% {
            box-shadow:
              0 12px 22px rgba(var(--tone-rgb), .34),
              0 0 18px rgba(var(--tone-rgb), .28),
              inset 0 1px 0 rgba(255,255,255,.34);
          }
          50% {
            box-shadow:
              0 14px 24px rgba(var(--tone-rgb), .4),
              0 0 24px rgba(var(--tone-rgb), .34),
              inset 0 1px 0 rgba(255,255,255,.38);
          }
        }

        @keyframes tierReveal {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 1120px) {
          .clients-premium .clients-layout {
            grid-template-columns: 1fr;
          }

          .clients-premium .metrics-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  );
}
