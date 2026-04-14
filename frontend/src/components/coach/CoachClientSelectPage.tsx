import { useState, useEffect } from 'react';
import type { Client } from '@/lib/db';
import { getClientsFromCache, saveClient, updateClientsCache } from '@/lib/store';
import { calcLtvScore } from '@/lib/ltvScore';
import QRCode from 'qrcode';

type MembershipLevel = 'standard' | 'advanced' | 'professional' | 'elite';

function lsGet<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem('fika_' + key) || '') ?? fallback;
  } catch {
    return fallback;
  }
}

export function CoachClientSelectPage({
  onPick,
  onLogout,
  coachCode,
}: {
  onPick: (clientId: string) => void;
  onLogout: () => void;
  coachCode?: string | null;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [newName, setNewName] = useState('');
  const [newTier, setNewTier] = useState<NonNullable<Client['tier']>>('standard');
  const [newGoal, setNewGoal] = useState('');
  const [showRecruitmentCode, setShowRecruitmentCode] = useState(false);
  const [recruitmentQrUrl, setRecruitmentQrUrl] = useState('');

  const genRoadCode = () => {
    const suffix = String(Math.floor(100 + Math.random() * 900));
    return `FIKA-WF${suffix}`;
  };

  const syncClientStores = (nextClients: Client[]) => {
    updateClientsCache(nextClients);
  };

  const refreshClients = () => {
    const cached = getClientsFromCache().filter((c) => c.name !== '示例客户');
    const activeClients = cached.filter((c: any) => !(c as any).deletedAt);
    const visible = coachCode ? activeClients.filter((c: any) => String(c.coachCode || '') === String(coachCode)) : activeClients;
    setClients(visible);
  };

  const readAllMergedClients = () => {
    const cached = getClientsFromCache().filter((c) => c.name !== '示例客户');
    return cached as Client[];
  };

  useEffect(() => {
    refreshClients();
  }, [coachCode]);

  useEffect(() => {
    if (!showRecruitmentCode || !coachCode) {
      setRecruitmentQrUrl('');
      return;
    }
    const link = `https://saas.fikafitness.com/survey?coach=${coachCode}`;
    QRCode.toDataURL(link, { width: 240, margin: 1 })
      .then((data: string) => {
        setRecruitmentQrUrl(data);
      })
      .catch((e: unknown) => {
        console.error('[coach-select] recruitment qrcode generate failed', e);
      });
  }, [showRecruitmentCode, coachCode]);


  const createClient = () => {
    const all = readAllMergedClients().filter((c) => c.name !== '示例客户');
    const name = newName.trim();
    if (!name) return;
    const roadCode = genRoadCode();
    const newClient: Client = {
      id: `CL${Date.now()}`,
      name,
      roadCode: roadCode as any,
      tier: newTier,
      age: 0,
      height: 0,
      weight: 0,
      goal: '',
      injury: '',
      weeklyData: [],
      start_date: '',
      current_week: 0,
      blocks: [],
      published_blocks: [],
      plan_draft_version: 0,
      plan_published_version: 0,
      plan_updated_at: '',
      plan_published_at: '',
      sessions: [],
    };
    (newClient as any).coachCode = coachCode || '';
    syncClientStores([...all, newClient]);
    void saveClient(newClient).catch((err) => {
      console.error('[app] Failed to sync new coach client to server:', err);
    });
    refreshClients();
    setCreateOpen(false);
    setNewName('');
    setNewTier('standard');
    setNewGoal('');
  };

  const confirmDeleteClient = () => {
    if (!deleteTarget) return;
    if (deleteConfirmText.trim() !== '确认删除') {
      alert('请输入"确认删除"后再继续');
      return;
    }
    const all = readAllMergedClients();
    const coaches = lsGet<Array<{ code?: string; name?: string }>>('coaches', []);
    const coachName = coaches.find((c) => String(c.code || '') === String(coachCode || ''))?.name || '未知教练';
    const deletedAt = new Date().toISOString();
    const updated = all.map((c) =>
      c.id === deleteTarget.id
        ? ({
            ...c,
            deletedAt,
            deletedByCoachCode: coachCode || '',
            deletedByCoachName: coachName,
          } as Client)
        : c,
    );
    syncClientStores(updated);
    setDeleteTarget(null);
    setDeleteConfirmText('');
    refreshClients();
  };


  const resolveMembershipLevel = (c: Client): MembershipLevel => {
    const stored = c.membershipLevel as MembershipLevel | undefined;
    if (stored === 'standard' || stored === 'advanced' || stored === 'professional' || stored === 'elite') return stored;
    return 'standard';
  };

  const getTierVisual = (level: MembershipLevel) => {
    if (level === 'elite') {
      return {
        cn: '至尊会员', en: 'Elite', key: 'elite',
        border: 'rgba(195,59,59,.36)', glow: 'rgba(195,59,59,.24)',
        cardBg: 'linear-gradient(152deg, rgba(255,242,244,.92), rgba(255,221,227,.8))',
        badgeBg: 'linear-gradient(140deg, rgba(226,88,95,.98), rgba(182,47,53,.94))',
        badgeBorder: 'rgba(145,31,36,.46)', badgeText: '#fff8f8', accent: '#C33B3B',
      };
    }
    if (level === 'professional') {
      return {
        cn: '专业会员', en: 'Professional', key: 'professional',
        border: 'rgba(207,122,37,.35)', glow: 'rgba(207,122,37,.2)',
        cardBg: 'linear-gradient(152deg, rgba(255,246,235,.92), rgba(255,230,201,.8))',
        badgeBg: 'linear-gradient(140deg, rgba(240,165,90,.98), rgba(199,113,28,.95))',
        badgeBorder: 'rgba(157,84,18,.42)', badgeText: '#fff9f1', accent: '#CF7A25',
      };
    }
    if (level === 'advanced') {
      return {
        cn: '进阶会员', en: 'Advanced', key: 'advanced',
        border: 'rgba(47,138,86,.35)', glow: 'rgba(47,138,86,.18)',
        cardBg: 'linear-gradient(152deg, rgba(241,251,245,.92), rgba(219,242,229,.8))',
        badgeBg: 'linear-gradient(140deg, rgba(93,191,133,.98), rgba(43,126,78,.95))',
        badgeBorder: 'rgba(35,95,61,.42)', badgeText: '#f7fffa', accent: '#2F8A56',
      };
    }
    return {
      cn: '基础会员', en: 'Standard', key: 'standard',
      border: 'rgba(36,38,45,.22)', glow: 'rgba(36,38,45,.14)',
      cardBg: 'linear-gradient(152deg, rgba(248,249,253,.9), rgba(233,237,245,.8))',
      badgeBg: 'linear-gradient(140deg, rgba(164,171,190,.95), rgba(112,121,147,.94))',
      badgeBorder: 'rgba(91,99,124,.45)', badgeText: '#f5f7fb', accent: '#24262D',
    };
  };

  return (
    <div className="coach-content" style={{ padding: 20 }}>
      <div style={{ maxWidth: 1160, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div className="logo" style={{ fontSize: 20 }}>
            <div>
              <span className="logo-fi">Fi</span>
              <span className="logo-ka">KA</span>
            </div>
            <div className="logo-sub">Coach Pro · Select Client</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {coachCode && (
              <button className="btn btn-o" style={{ fontSize: 12 }} onClick={() => setShowRecruitmentCode(true)} type="button">
                招募码 QR
              </button>
            )}
            <button className="btn btn-o" style={{ fontSize: 12 }} onClick={() => setCreateOpen(true)} type="button">
              + 新增客户
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onLogout} type="button">
              退出
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, position: 'relative', padding: 6, overflow: 'hidden' }}>

          {clients.length === 0 ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, color: '#68708b' }}>当前没有客户，先点右上角"新增客户"。下方是卡片预览样式：</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 12 }}>
                {[
                  { id: 'preview-1', name: '客户预览 A', level: 'standard' as MembershipLevel },
                  { id: 'preview-2', name: '客户预览 B', level: 'advanced' as MembershipLevel },
                  { id: 'preview-3', name: '客户预览 C', level: 'professional' as MembershipLevel },
                  { id: 'preview-4', name: '客户预览 D', level: 'elite' as MembershipLevel },
                ].map((c) => {
                  const tierVisual = getTierVisual(c.level);
                  return (
                    <div key={c.id} className={`coach-client-card tier-${tierVisual.key}`}
                      style={{ borderRadius: 16, border: `1px solid ${tierVisual.border}`, background: tierVisual.cardBg, boxShadow: `0 10px 24px ${tierVisual.glow}, inset 0 1px 0 rgba(255,255,255,.68)`, padding: 14, textAlign: 'left', opacity: .9 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: '#23293f' }}>{c.name}</div>
                        <span className="coach-tier-badge" style={{ fontSize: 10, fontWeight: 800, color: tierVisual.badgeText, background: tierVisual.badgeBg, border: `1px solid ${tierVisual.badgeBorder}`, borderRadius: 999, padding: '4px 8px', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.35), 0 4px 10px rgba(25,32,58,.18)' }}>
                          {tierVisual.cn} / {tierVisual.en}
                        </span>
                      </div>
                      <div style={{ marginTop: 10, borderRadius: 12, background: 'rgba(255,255,255,.54)', border: '1px solid rgba(255,255,255,.72)', padding: '8px 10px', fontSize: 12, color: '#4f566f', lineHeight: 1.5 }}>
                        训练目标展示区域
                      </div>
                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {[
                          { k: '路书码', v: 'FIKA-WF000' }, { k: '周期', v: '12周' },
                          { k: '当前周', v: 'Week 1' }, { k: '单次', v: '0 Sessions' },
                        ].map((item) => (
                          <div key={item.k} style={{ borderRadius: 10, padding: '8px 9px', background: 'rgba(255,255,255,.48)', border: '1px solid rgba(255,255,255,.72)' }}>
                            <div style={{ fontSize: 10, color: '#7b839b', letterSpacing: '.08em' }}>{item.k}</div>
                            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: tierVisual.accent }}>{item.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginTop: 14 }}>
              {clients.map((c) => {
                const level = resolveMembershipLevel(c);
                const tierVisual = getTierVisual(level);
                const cycleWeeks = (c as any).weeks_total || (c as any).weeks || Math.max(4, (c.blocks || []).length * 4);
                const sessionsCount = (c.sessions || []).length;
                const ltvScore = typeof c.ltv_score === 'number' ? c.ltv_score : calcLtvScore(c);
                const ltvTag = ltvScore >= 70 ? '高价值' : (ltvScore < 30 && sessionsCount > 10 ? '流失风险' : '');
                return (
                  <button key={c.id} type="button" onClick={() => onPick(c.id)}
                    className={`coach-client-card tier-${tierVisual.key}`}
                    style={{ borderRadius: 16, border: `1px solid ${tierVisual.border}`, background: tierVisual.cardBg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', padding: 14, textAlign: 'left', boxShadow: `0 10px 24px ${tierVisual.glow}, inset 0 1px 0 rgba(255,255,255,.72)` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#23293f' }}>{c.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ltvTag && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, fontWeight: 900, borderRadius: 999, padding: '4px 8px', border: ltvTag === '高价值' ? '1px solid rgba(217,119,6,.5)' : '1px solid rgba(220,38,38,.5)', background: ltvTag === '高价值' ? 'rgba(245,158,11,.18)' : 'rgba(220,38,38,.14)', color: ltvTag === '高价值' ? '#b45309' : '#b91c1c' }}>
                            {ltvTag}
                          </span>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 900, color: tierVisual.badgeText, background: tierVisual.badgeBg, border: `1px solid ${tierVisual.badgeBorder}`, borderRadius: 999, padding: '4px 9px', letterSpacing: '.08em', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.36), 0 4px 10px rgba(25,32,58,.2)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'rgba(255,255,255,.9)', boxShadow: '0 0 6px rgba(255,255,255,.75)' }} />
                          {(c.tier || 'standard').toUpperCase()}
                        </span>
                        <span role="button" onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); setDeleteConfirmText(''); }}
                          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#B42318', borderRadius: 999, border: '1px solid rgba(180,35,24,.35)', background: 'rgba(255,236,233,.86)', padding: '4px 8px', cursor: 'pointer' }}>
                          删除
                        </span>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, borderRadius: 12, background: 'rgba(255,255,255,.56)', border: '1px solid rgba(255,255,255,.74)', padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#7b839b', letterSpacing: '.08em', textTransform: 'uppercase' }}>目标 / Goal</div>
                      <div style={{ marginTop: 4, fontSize: 13, fontWeight: 700, color: '#37405a', lineHeight: 1.45, minHeight: 36 }}>
                        {c.goal || '未设置目标'}
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[
                        { k: '路书码', v: String((c as any).roadCode || c.id) },
                        { k: '周期', v: `${cycleWeeks}周` },
                        { k: '当前周', v: `Week ${c.current_week || 1}` },
                        { k: '单次', v: `${(c.sessions || []).length} Sessions` },
                      ].map((item) => (
                        <div key={item.k} style={{ borderRadius: 10, padding: '8px 9px', background: 'rgba(255,255,255,.5)', border: '1px solid rgba(255,255,255,.75)' }}>
                          <div style={{ fontSize: 10, color: '#7b839b', letterSpacing: '.08em' }}>{item.k}</div>
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800, color: tierVisual.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.v}</div>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {showRecruitmentCode && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}
              onClick={() => setShowRecruitmentCode(false)}>
              <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 400, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>招募二维码</div>
                {recruitmentQrUrl && (
                  <div style={{ marginBottom: 16 }}>
                    <img src={recruitmentQrUrl} alt="recruitment qr" style={{ width: 200, height: 200, display: 'block', margin: '0 auto' }} />
                  </div>
                )}
                <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>长按保存二维码分享给客户</div>
                <button type="button" onClick={() => setShowRecruitmentCode(false)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#5a41d6', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  关闭
                </button>
              </div>
            </div>
          )}

          {createOpen && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(13,16,28,.42)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
              onClick={() => setCreateOpen(false)}>
              <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid rgba(255,255,255,.34)', background: 'linear-gradient(150deg, rgba(255,255,255,.18), rgba(214,224,255,.14))', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 20px 40px rgba(8,10,20,.35)', padding: 14 }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f4f7ff' }}>新增客户</div>
                <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(223,231,255,.82)' }}>填写姓名 / 档位 / 目标</div>
                <div style={{ marginTop: 12, display: 'grid', gap: 9 }}>
                  <input className="inp" placeholder="客户姓名" value={newName} onChange={(e) => setNewName(e.target.value)} />
                  <select className="inp" value={newTier} onChange={(e) => setNewTier(e.target.value as NonNullable<Client['tier']>)}>
                    <option value="standard">Standard</option>
                    <option value="pro">Pro</option>
                    <option value="ultra">Elite</option>
                  </select>
                  <textarea className="inp" placeholder="训练目标" value={newGoal} onChange={(e) => setNewGoal(e.target.value)} rows={3} style={{ resize: 'none', paddingTop: 8 }} />
                </div>
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost" type="button" onClick={() => setCreateOpen(false)}>取消</button>
                  <button className="btn btn-o" type="button" onClick={createClient}>创建</button>
                </div>
              </div>
            </div>
          )}

          {deleteTarget && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 85, background: 'rgba(13,16,28,.5)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 18 }}
              onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}>
              <div style={{ width: '100%', maxWidth: 420, borderRadius: 16, border: '1px solid rgba(255,255,255,.34)', background: 'linear-gradient(150deg, rgba(255,255,255,.2), rgba(241,208,208,.16))', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', boxShadow: '0 20px 40px rgba(8,10,20,.35)', padding: 14 }}
                onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f4f7ff' }}>删除客户卡片</div>
                <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(223,231,255,.82)', lineHeight: 1.5 }}>
                  将从教练端客户卡片中移除：{deleteTarget.name}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: '#ff9f9f' }}>
                  请输入 <span style={{ color: '#EF4444', fontWeight: 900 }}>确认删除</span> 后继续
                </div>
                <input className="inp" style={{ marginTop: 8 }} placeholder="输入：确认删除" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} />
                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button className="btn btn-ghost" type="button" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(''); }}>取消</button>
                  <button className="btn" type="button" style={{ background: '#B42318', color: '#fff' }} onClick={confirmDeleteClient}>确认删除</button>
                </div>
              </div>
            </div>
          )}
        </div>
        <style>{`
          .coach-client-card {
            position: relative;
            overflow: hidden;
            transition: transform .24s ease, box-shadow .26s ease;
          }
          .coach-client-card:hover {
            transform: translateY(-2px);
          }
          .coach-client-card::before {
            content: '';
            position: absolute;
            inset: 0;
            pointer-events: none;
            border-radius: inherit;
            border: 1px solid transparent;
            opacity: 0;
          }
          .coach-client-card.tier-advanced::before {
            opacity: .95;
            border-color: rgba(47,138,86,.48);
            animation: tier-breath-green 2.4s ease-in-out infinite;
          }
          .coach-client-card.tier-professional::before {
            opacity: .95;
            border-color: rgba(207,122,37,.52);
            animation: tier-breath-amber 2.2s ease-in-out infinite;
          }
          .coach-client-card.tier-elite::before {
            opacity: 1;
            border-color: rgba(195,59,59,.58);
            animation: tier-breath-elite 2.1s ease-in-out infinite;
          }
          .coach-client-card.tier-elite::after {
            content: '';
            position: absolute;
            top: -26%;
            left: -48%;
            width: 44%;
            height: 160%;
            transform: rotate(15deg);
            pointer-events: none;
            background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,216,158,.72), rgba(255,255,255,0));
            animation: tier-gold-shimmer 2.8s ease-in-out infinite;
          }
          .coach-tier-badge {
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
          }
          @keyframes tier-breath-green {
            0%, 100% { box-shadow: 0 0 0 0 rgba(47,138,86,.08), inset 0 0 0 1px rgba(47,138,86,.32); }
            50% { box-shadow: 0 0 0 6px rgba(47,138,86,.14), inset 0 0 0 1px rgba(47,138,86,.48); }
          }
          @keyframes tier-breath-amber {
            0%, 100% { box-shadow: 0 0 0 0 rgba(207,122,37,.08), inset 0 0 0 1px rgba(207,122,37,.32); }
            50% { box-shadow: 0 0 0 6px rgba(207,122,37,.14), inset 0 0 0 1px rgba(207,122,37,.48); }
          }
          @keyframes tier-breath-elite {
            0%, 100% { box-shadow: 0 0 0 0 rgba(195,59,59,.08), inset 0 0 0 1px rgba(195,59,59,.4); }
            50% { box-shadow: 0 0 0 7px rgba(195,59,59,.14), inset 0 0 0 1px rgba(195,59,59,.56); }
          }
          @keyframes tier-gold-shimmer {
            0% { left: -54%; opacity: 0; }
            18% { opacity: .82; }
            42% { opacity: .26; }
            100% { left: 122%; opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
}
