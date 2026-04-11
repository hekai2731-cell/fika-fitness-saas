import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getClientsFromCache, saveClient, updateClientsCache } from '@/lib/store';
import type { Client } from '@/lib/db';

const SESSION_PRICE: Record<string, number> = {
  standard: 328,
  pro: 388,
  ultra: 458,
};

function getSessionPrice(tier?: string) {
  return SESSION_PRICE[tier || 'standard'] || 328;
}

function initials(name?: string) {
  if (!name) return '??';
  const normalized = String(name).trim();
  if (!normalized) return '??';
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return normalized.slice(0, 2).toUpperCase();
}

function PaymentForm({
  client,
  onSave,
  onCancel,
}: {
  client: Client;
  onSave: (amount: number, note: string) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const inputStyle: React.CSSProperties = {
    height: 38, padding: '0 10px', borderRadius: 7,
    border: '1px solid var(--color-border-secondary)',
    background: 'var(--color-background-secondary)',
    fontSize: 13, color: 'var(--color-text-primary)', width: '100%', outline: 'none',
  };

  return (
    <div style={{ padding: 16, background: 'var(--color-background-secondary)', borderRadius: 12, marginBottom: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>记录付款 / Record Payment</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>客户 / Client</div>
          <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', fontWeight: 700 }}>{client.name}</div>
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>付款金额 / Amount (¥)</div>
          <input style={inputStyle} type="number" placeholder="例如 1000 / e.g. 1000" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>备注 / Note</div>
          <input style={inputStyle} placeholder="如：微信转账，第3期 / e.g. WeChat transfer, phase 3" value={note} onChange={e => setNote(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="outline" onClick={onCancel} type="button">取消 / Cancel</Button>
        <Button
          type="button"
          onClick={() => { if (+amount > 0) onSave(+amount, note); }}
        >确认收款 / Confirm Payment</Button>
      </div>
    </div>
  );
}

export function FinancePage({ selectedClientId }: { selectedClientId: string | null }) {
  const [client, setClient] = useState<Client | null>(null);
  const [showPayForm, setShowPayForm] = useState(false);

  useEffect(() => {
    const list = getClientsFromCache();
    if (!selectedClientId) {
      setClient(list[0] || null);
      return;
    }
    setClient(list.find((c) => c.id === selectedClientId) || null);
  }, [selectedClientId]);

  const persistClient = (next: Client) => {
    const all = getClientsFromCache();
    const idx = all.findIndex((c) => c.id === next.id);
    if (idx >= 0) all[idx] = next;
    updateClientsCache(all);
    void saveClient(next).catch((err) => {
      console.error('[FinancePage] Failed to save client:', err);
    });
    setClient(next);
  };

  const handleAddPayment = (amount: number, note: string) => {
    if (!client) return;
    const weeklyData = [...(client.weeklyData || []), {
      date: new Date().toLocaleDateString('zh-CN'),
      paid: amount,
      note: note || '',
      weight: null,
      bf: null,
      attendance: null,
    }];
    persistClient({ ...client, weeklyData } as Client);
    setShowPayForm(false);
  };

  const scopedClients = useMemo(() => (client ? [client] : []), [client]);

  // 生成交易记录（充值+扣费）
  const generateTransactionRecords = (c: Client) => {
    const records: Array<{
      id: string;
      type: 'payment' | 'session';
      date: string;
      description: string;
      amount: number;
      tier?: string;
    }> = [];

    // 添加充值记录
    (c.weeklyData || []).forEach((w: any) => {
      if (w.paid && w.paid > 0) {
        records.push({
          id: `payment-${w.date}-${Math.random()}`,
          type: 'payment',
          date: w.date,
          description: w.note || '账户充值',
          amount: w.paid,
        });
      }
    });

    // 添加课程扣费记录
    (c.sessions || []).forEach((s: any) => {
      if (s.price && s.price > 0) {
        records.push({
          id: `session-${s.date}-${Math.random()}`,
          type: 'session',
          date: s.date,
          description: s.day || '训练课程',
          amount: -s.price,
          tier: c.tier || 'standard',
        });
      }
    });

    // 按日期排序（最新的在前）
    return records.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const stats = useMemo(() => {
    let totalPaid = 0;
    let totalBalance = 0;
    let overdueCount = 0;

    const monthlyMap: Record<string, number> = {};

    const ledger = scopedClients.map((c) => {
      const paid = (c.weeklyData || []).reduce((s, w) => s + ((w as any).paid || 0), 0);
      const spent = (c.sessions || []).reduce((s, se) => s + ((se as any).price || getSessionPrice(c.tier)), 0);
      const balance = paid - spent;

      totalPaid += paid;
      totalBalance += balance;
      if (balance < 0) overdueCount++;

      (c.weeklyData || []).forEach((w: any) => {
        if (!w.paid || !w.date) return;
        const parts = String(w.date).split('/');
        const key = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : String(w.date).slice(0, 7);
        monthlyMap[key] = (monthlyMap[key] || 0) + Number(w.paid || 0);
      });

      const transactionRecords = generateTransactionRecords(c);

      return {
        id: c.id,
        name: c.name,
        tier: c.tier || 'standard',
        balance,
        paid,
        spent,
        sessions: (c.sessions || []).length,
        subtitle:
          c.goal ||
          (c.blocks?.[c.blocks.length - 1]?.title
            ? `${c.blocks?.[c.blocks.length - 1]?.title}`
            : '客户计划 / Client Program'),
        transactionRecords,
      };
    }).sort((a, b) => a.balance - b.balance);

    const monthKeys = Object.keys(monthlyMap).sort((a, b) => a.localeCompare(b));
    const currentMonthRevenue = monthKeys.length ? monthlyMap[monthKeys[monthKeys.length - 1]] : 0;
    const previousMonthRevenue = monthKeys.length > 1 ? monthlyMap[monthKeys[monthKeys.length - 2]] : 0;
    const changePct = previousMonthRevenue > 0
      ? Math.round(((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100)
      : null;

    return {
      totalPaid,
      totalBalance,
      overdueCount,
      currentMonthRevenue,
      changePct,
      ledger,
    };
  }, [scopedClients]);

  if (!client) {
    return <div style={{ fontSize: 13, color: 'var(--s500)' }}>暂无客户数据</div>;
  }

  const balanceProgress = Math.max(10, Math.min(100, Math.round((stats.totalBalance / Math.max(stats.totalPaid, 1)) * 100)));

  return (
    <div
      className="finance-page-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: 'Manrope, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <div className="finance-header" style={{ padding: '8px 0 4px' }}>
        <div className="finance-title" style={{ fontSize: 50, lineHeight: 1.05, letterSpacing: '-0.02em', fontWeight: 900, color: '#151a25' }}>账单/财务</div>
        <div className="finance-subtitle" style={{ marginTop: 8, fontSize: 18, color: '#4a5268', fontWeight: 500 }}>财务概览与客户账本 / Financial Overview & Client Ledger</div>
      </div>

      <div className="finance-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <Card style={{ borderRadius: 24, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.56)', backdropFilter: 'blur(8px)' }}>
          <CardContent style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 12, letterSpacing: '.11em', textTransform: 'uppercase', color: '#636d84', fontWeight: 700 }}>当前余额 / Current Balance</div>
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <span style={{ fontSize: 40, fontWeight: 900, color: '#4f56c8', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>¥{stats.totalBalance.toLocaleString()}</span>
              {stats.changePct !== null && (
                <span style={{ fontSize: 16, color: stats.changePct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 700, paddingBottom: 5 }}>
                  {stats.changePct >= 0 ? '+' : ''}{stats.changePct}%
                </span>
              )}
            </div>
            <div style={{ marginTop: 14, height: 6, borderRadius: 999, background: 'rgba(79,86,200,0.14)', overflow: 'hidden' }}>
              <div style={{ width: `${balanceProgress}%`, height: '100%', background: '#4f56c8' }} />
            </div>
          </CardContent>
        </Card>

        <Card style={{ borderRadius: 24, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.56)', backdropFilter: 'blur(8px)' }}>
          <CardContent style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 12, letterSpacing: '.11em', textTransform: 'uppercase', color: '#636d84', fontWeight: 700 }}>月度营收 / Monthly Revenue</div>
            <div style={{ marginTop: 16, fontSize: 40, fontWeight: 900, color: '#161b27', lineHeight: 1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
              ¥{stats.currentMonthRevenue.toLocaleString()}
            </div>
            <div style={{ marginTop: 14, fontSize: 14, color: '#6b7287' }}>本季度表现峰值 / Performance peak this quarter</div>
          </CardContent>
        </Card>

        <Card style={{ borderRadius: 24, border: '1px solid rgba(151,160,213,0.35)', background: 'rgba(98,107,196,0.08)', backdropFilter: 'blur(8px)' }}>
          <CardContent style={{ padding: '18px 20px' }}>
            <div style={{ fontSize: 12, letterSpacing: '.11em', textTransform: 'uppercase', color: '#4f56c8', fontWeight: 700 }}>待处理事项 / Action Required</div>
            <div style={{ marginTop: 14, fontSize: 18, color: '#1f2438', fontWeight: 600, lineHeight: 1.35 }}>
              {stats.overdueCount} 位客户余额逾期 / Clients with overdue balances
            </div>
            <Button
              type="button"
              onClick={() => setShowPayForm((v) => !v)}
              style={{ marginTop: 16, borderRadius: 999, height: 36, padding: '0 20px', background: '#5d64d6', border: '1px solid #5d64d6', fontSize: 13, fontWeight: 700 }}
            >
              {showPayForm ? '收起表单 / Close Form' : '发送提醒 / Issue Reminders'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {showPayForm && (
        <PaymentForm
          client={client}
          onSave={handleAddPayment}
          onCancel={() => setShowPayForm(false)}
        />
      )}

      <Card className="finance-ledger-card" style={{ borderRadius: 28, border: '1px solid rgba(216,221,236,0.75)', background: 'rgba(255,255,255,0.55)', position: 'relative', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            right: 24,
            top: 26,
            fontSize: 170,
            lineHeight: 1,
            fontWeight: 900,
            color: 'rgba(121,131,167,0.08)',
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          FIKA
        </div>

        <CardHeader style={{ paddingBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <CardTitle style={{ fontSize: 30, fontWeight: 800, color: '#1d2335' }}>客户账本 / Client Ledger</CardTitle>
            <div style={{ display: 'flex', gap: 18, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#69738a', fontWeight: 700 }}>
              <span>筛选: 全部 / Filter: All</span>
              <span>排序: 欠费 / Sort: Debt</span>
            </div>
          </div>
        </CardHeader>

        <CardContent style={{ padding: 0 }}>
          {stats.ledger.map((item) => {
            const color = item.balance < 0 ? '#dc2626' : item.balance > 0 ? '#16a34a' : '#1f2438';
            const label = String(item.tier || 'standard').toUpperCase();
            const avatarBg =
              label === 'ULTRA'
                ? 'rgba(88,98,207,0.16)'
                : label === 'PRO'
                  ? 'rgba(245,158,11,0.22)'
                  : 'rgba(148,163,184,0.18)';
            const avatarColor =
              label === 'ULTRA'
                ? '#4f56c8'
                : label === 'PRO'
                  ? '#a16207'
                  : '#475569';
            return (
              <div key={item.id}>
                <div
                  className="finance-ledger-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0,1fr) 150px 160px 42px',
                    alignItems: 'center',
                    gap: 10,
                    padding: '16px 18px',
                    borderTop: '1px solid rgba(216,221,236,0.85)',
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                    <div
                      className="finance-avatar"
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 16,
                        fontWeight: 800,
                        color: avatarColor,
                        background: avatarBg,
                        flexShrink: 0,
                      }}
                    >
                      {initials(item.name)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="finance-ledger-name" style={{ fontSize: 24, fontWeight: 700, color: '#1f2438', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.01em' }}>
                        {item.name}
                      </div>
                      <div className="finance-ledger-subtitle" style={{ marginTop: 2, fontSize: 14, color: '#6e778f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.subtitle}
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7b849a', fontWeight: 700 }}>档位 / Tier</div>
                    <Badge
                      variant="secondary"
                      style={{
                        marginTop: 7,
                        fontSize: 11,
                        letterSpacing: '.06em',
                        borderRadius: 999,
                        background: label === 'ULTRA' ? 'rgba(93,100,214,0.15)' : 'rgba(148,163,184,0.16)',
                        color: label === 'ULTRA' ? '#4f56c8' : '#64748b',
                      }}
                    >
                      {label}
                    </Badge>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#7b849a', fontWeight: 700 }}>余额 / Balance</div>
                    <div className="finance-ledger-balance" style={{ marginTop: 6, fontSize: 26, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                      {item.balance > 0 ? '+' : ''}¥{item.balance.toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: 'none',
                      background: 'transparent',
                      color: '#7b849a',
                      fontSize: 18,
                      cursor: 'pointer',
                    }}
                  >
                    ⋮
                  </button>
                </div>

                {/* 交易记录详情 */}
                {item.transactionRecords && item.transactionRecords.length > 0 && (
                  <div
                    style={{
                      padding: '0 18px 16px',
                      borderTop: '1px solid rgba(216,221,236,0.4)',
                      background: 'rgba(248,250,252,0.6)',
                    }}
                  >
                    <div style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#6b7280',
                      letterSpacing: '.08em',
                      textTransform: 'uppercase',
                      marginBottom: 8,
                    }}>
                      交易记录 / Transaction Records
                    </div>
                    {item.transactionRecords.slice(0, 5).map((record) => (
                      <div
                        key={record.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 0',
                          fontSize: 12,
                          borderBottom: '1px solid rgba(216,221,236,0.2)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: record.type === 'payment' ? '#16a34a' : '#dc2626',
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: '#1f2438',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}>
                              {record.description}
                            </div>
                            <div style={{
                              fontSize: 10,
                              color: '#6b7280',
                              marginTop: 1,
                            }}>
                              {record.date}
                              {record.type === 'session' && record.tier && (
                                <span style={{
                                  marginLeft: 6,
                                  padding: '1px 4px',
                                  borderRadius: 3,
                                  background: record.tier === 'pro' ? 'rgba(245,158,11,0.15)' : 'rgba(148,163,184,0.15)',
                                  color: record.tier === 'pro' ? '#a16207' : '#475569',
                                  fontSize: 9,
                                  fontWeight: 600,
                                }}>
                                  {record.tier.toUpperCase()}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: record.type === 'payment' ? '#16a34a' : '#dc2626',
                          fontVariantNumeric: 'tabular-nums',
                          marginLeft: 8,
                        }}>
                          {record.type === 'payment' ? '+' : ''}¥{Math.abs(record.amount).toLocaleString()}
                        </div>
                      </div>
                    ))}
                    {item.transactionRecords.length > 5 && (
                      <div style={{
                        textAlign: 'center',
                        fontSize: 11,
                        color: '#6b7280',
                        marginTop: 4,
                        fontStyle: 'italic',
                      }}>
                        还有 {item.transactionRecords.length - 5} 条记录...
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <style>{`
    @media (max-width: 1280px) {
      .finance-title { font-size: 44px !important; }
      .finance-subtitle { font-size: 17px !important; }
    }
          .finance-title { font-size: 44px !important; }
          .finance-subtitle { font-size: 17px !important; }
        }

        @media (max-width: 1194px) and (min-width: 1101px) {
          .finance-page-root {
            gap: 12px !important;
          }
          .finance-header {
            padding: 2px 0 0 !important;
          }
          .finance-title {
            font-size: 40px !important;
          }
          .finance-subtitle {
            margin-top: 4px !important;
            font-size: 15px !important;
          }
          .finance-kpi-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            gap: 10px !important;
          }
          .finance-ledger-row {
            grid-template-columns: minmax(0,1fr) 138px 150px 34px !important;
            padding: 10px 12px !important;
            gap: 8px !important;
          }
          .finance-avatar {
            width: 32px !important;
            height: 32px !important;
            font-size: 13px !important;
          }
          .finance-ledger-name {
            font-size: 22px !important;
          }
          .finance-ledger-subtitle {
            margin-top: 1px !important;
            font-size: 12px !important;
          }
          .finance-ledger-balance {
            margin-top: 4px !important;
            font-size: 24px !important;
          }
        }

        @media (max-width: 1100px) and (min-width: 835px) {
          .finance-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          .finance-kpi-grid > *:last-child {
            grid-column: 1 / -1;
          }
          .finance-ledger-card {
            border-radius: 22px !important;
          }
          .finance-ledger-row {
            grid-template-columns: minmax(0,1fr) 120px 140px 34px !important;
            padding: 14px 14px !important;
            gap: 8px !important;
          }
          .finance-ledger-row div[style*='font-size: 28px'] {
            font-size: 22px !important;
          }
          .finance-ledger-row div[style*='font-size: 14px'] {
            font-size: 12px !important;
          }
          .finance-ledger-row div[style*='font-size: 29px'] {
            font-size: 24px !important;
          }
        }

        @media (max-width: 834px) {
          .finance-title { font-size: 40px !important; }
          .finance-subtitle { font-size: 16px !important; }
          .finance-kpi-grid { grid-template-columns: 1fr !important; }
          .finance-ledger-row {
            grid-template-columns: minmax(0,1fr) 120px 130px 32px !important;
            padding: 14px 12px !important;
          }
        }
      `}</style>
    </div>
  );
}
