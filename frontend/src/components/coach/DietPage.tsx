// DietPage — 饮食草稿管理（教练端）
// 对接 /api/ai/generate(diet) 和 /api/ai/drafts
import { useEffect, useState } from 'react';
import { getClientsFromCache } from '@/lib/store';
import type { Client } from '@/lib/db';

// ─── API base ────────────────────────────────────────────────
const isProduction = import.meta.env.PROD;
const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '');
function apiUrl(path: string) {
  return apiBase ? String(apiBase).replace(/\/$/, '') + path : path;
}

// ─── 类型 ────────────────────────────────────────────────────
interface AiDraft {
  id: string;
  clientId: string;
  planType: string;
  status: 'pending' | 'approved' | 'rejected';
  output_result: string;
  createdAt: string;
}

type DayMenu = {
  breakfast?: string;
  lunch?: string;
  dinner?: string;
  snack?: string;
  [key: string]: string | undefined;
};

// ─── 工具函数 ─────────────────────────────────────────────────
function parseDietOutput(raw: string): Record<string, DayMenu> | null {
  try {
    const json = JSON.parse(raw);
    if (typeof json === 'object' && json !== null && !Array.isArray(json)) {
      return json as Record<string, DayMenu>;
    }
  } catch {
    // 不是 JSON，原始文本显示
  }
  return null;
}

const DAY_LABEL_MAP: Record<string, string> = {
  monday: '周一', tuesday: '周二', wednesday: '周三',
  thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日',
};
const MEAL_LABEL_MAP: Record<string, string> = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐',
};

function StatusBadge({ status }: { status: AiDraft['status'] }) {
  const map = {
    pending:  { label: '待审核', bg: '#fef9c3', color: '#a16207' },
    approved: { label: '已确认', bg: '#dcfce7', color: '#166534' },
    rejected: { label: '已拒绝', bg: '#fee2e2', color: '#991b1b' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '3px 10px',
      borderRadius: 999, background: s.bg, color: s.color,
    }}>{s.label}</span>
  );
}

function DraftCard({
  draft,
  onApprove,
  onReject,
}: {
  draft: AiDraft;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const parsed = parseDietOutput(draft.output_result);
  const dateStr = new Date(draft.createdAt).toLocaleString('zh-CN', { hour12: false });

  return (
    <div style={{
      background: 'rgba(255,255,255,.72)',
      border: '1px solid rgba(216,221,236,.85)',
      borderRadius: 14,
      marginBottom: 10,
      overflow: 'hidden',
    }}>
      {/* 卡片头部 */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', cursor: 'pointer',
          background: open ? 'rgba(241,243,248,.9)' : 'transparent',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 3 }}>{dateStr}</div>
          <StatusBadge status={draft.status} />
        </div>
        <span style={{ fontSize: 16, color: '#94a3b8', transition: 'transform .2s', transform: open ? 'rotate(90deg)' : 'none' }}>▶</span>
      </div>

      {/* 展开内容 */}
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          {parsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              {Object.entries(parsed).map(([dayKey, meals]) => {
                const dayLabel = DAY_LABEL_MAP[dayKey.toLowerCase()] || dayKey;
                return (
                  <div key={dayKey} style={{
                    background: 'rgba(248,250,253,.9)',
                    border: '1px solid rgba(226,232,240,.8)',
                    borderRadius: 10, padding: '10px 12px',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#4f56c8', marginBottom: 8, letterSpacing: '.04em' }}>
                      {dayLabel}
                    </div>
                    {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map(mealKey => {
                      const content = meals[mealKey];
                      if (!content) return null;
                      return (
                        <div key={mealKey} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid rgba(226,232,240,.6)', fontSize: 12 }}>
                          <span style={{ width: 36, color: '#64748b', fontWeight: 700, flexShrink: 0 }}>
                            {MEAL_LABEL_MAP[mealKey]}
                          </span>
                          <span style={{ color: '#334155', lineHeight: 1.5 }}>{content}</span>
                        </div>
                      );
                    })}
                    {/* 其他自定义餐次 */}
                    {Object.entries(meals)
                      .filter(([k]) => !['breakfast','lunch','dinner','snack'].includes(k))
                      .map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: 12, borderBottom: '1px solid rgba(226,232,240,.6)' }}>
                          <span style={{ width: 36, color: '#64748b', fontWeight: 700, flexShrink: 0 }}>{k}</span>
                          <span style={{ color: '#334155', lineHeight: 1.5 }}>{v}</span>
                        </div>
                      ))
                    }
                  </div>
                );
              })}
            </div>
          ) : (
            <pre style={{
              marginTop: 8, fontSize: 12, color: '#334155',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              background: 'rgba(248,250,253,.9)',
              padding: '10px 12px', borderRadius: 10,
              border: '1px solid rgba(226,232,240,.8)',
            }}>
              {draft.output_result}
            </pre>
          )}

          {/* 操作按钮 */}
          {draft.status === 'pending' && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => onApprove(draft.id)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                  background: '#166534', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >✓ 确认</button>
              <button
                type="button"
                onClick={() => onReject(draft.id)}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 8,
                  border: '1px solid #fca5a5', background: '#fee2e2',
                  color: '#991b1b', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >✕ 拒绝</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────
export function DietPage({ selectedClientId }: { selectedClientId: string | null }) {
  const [client, setClient] = useState<Client | null>(null);
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  // 载入客户
  useEffect(() => {
    const list = getClientsFromCache();
    if (!selectedClientId) { setClient(list[0] || null); return; }
    setClient(list.find(c => c.id === selectedClientId) || null);
  }, [selectedClientId]);

  // 拉取草稿
  const fetchDrafts = async (clientId: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(apiUrl(`/api/ai/drafts?clientId=${encodeURIComponent(clientId)}&planType=diet`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const list: AiDraft[] = Array.isArray(json) ? json : (json.drafts || []);
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setDrafts(list);
    } catch (e: any) {
      setError(e.message || '获取草稿失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (client?.id) fetchDrafts(client.id);
    else setDrafts([]);
  }, [client?.id]);

  // 生成新计划
  const generatePlan = async () => {
    if (!client) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(apiUrl('/api/ai/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planType: 'diet',
          clientId: client.id,
          coachCode: (client as any).coachCode || '',
          goal: (client as any).goal || '',
          goal_type: (client as any).goal_type || '',
          membershipLevel: (client as any).membershipLevel || '',
          weight: client.weight,
          height: client.height,
          age: client.age,
          gender: client.gender,
          injury: client.injury || '',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || '生成失败');
      await fetchDrafts(client.id);
    } catch (e: any) {
      setError(e.message || '生成失败，请稍后重试');
    } finally {
      setGenerating(false);
    }
  };

  // 确认草稿
  const approveDraft = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/ai/drafts/${id}/approve`), { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'approved' } : d));
    } catch (e: any) {
      setError(e.message || '操作失败');
    }
  };

  // 拒绝草稿
  const rejectDraft = async (id: string) => {
    const reason = window.prompt('请填写拒绝原因（可选）') ?? '';
    try {
      const res = await fetch(apiUrl(`/api/ai/drafts/${id}/reject`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: 'rejected' } : d));
    } catch (e: any) {
      setError(e.message || '操作失败');
    }
  };

  return (
    <div style={{
      fontFamily: 'Manrope,"SF Pro Display","PingFang SC","Microsoft YaHei",sans-serif',
      padding: '0 2px',
    }}>
      {/* 顶部标题行 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-.02em', color: '#151a25' }}>饮食管理</div>
          <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>
            Dietary Management · AI 生成 &amp; 教练审核
          </div>
        </div>

        {client && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 999,
              border: '1px solid rgba(216,221,236,.85)',
              background: 'rgba(255,255,255,.62)',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg,#4f56c8,#818cf8)',
                color: '#fff', display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 700,
              }}>
                {client.name.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1f2438' }}>{client.name}</span>
            </div>

            <button
              type="button"
              onClick={generatePlan}
              disabled={generating}
              style={{
                padding: '8px 18px', borderRadius: 999,
                border: '1px solid #AFA9EC',
                background: generating ? 'rgba(79,86,200,.12)' : '#EEEDFE',
                color: '#534AB7', fontSize: 13, fontWeight: 700,
                cursor: generating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {generating ? (
                <>
                  <span style={{
                    width: 12, height: 12, border: '2px solid #AFA9EC',
                    borderTopColor: '#4f56c8', borderRadius: '50%',
                    display: 'inline-block', animation: 'spin .8s linear infinite',
                  }} />
                  生成中...
                </>
              ) : '⚡ AI 生成饮食计划'}
            </button>
          </div>
        )}
      </div>

      {/* 无客户 */}
      {!client && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#94a3b8',
          background: 'rgba(255,255,255,.6)', borderRadius: 16,
          border: '1px dashed rgba(148,163,184,.4)', fontSize: 14,
        }}>
          请先选择客户
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div style={{
          fontSize: 12, color: '#dc2626', padding: '8px 12px',
          background: 'rgba(220,38,38,.06)', borderRadius: 10, marginBottom: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* 草稿列表 */}
      {client && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
              饮食计划草稿
              {!loading && <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8' }}>共 {drafts.length} 份</span>}
            </div>
            <button
              type="button"
              onClick={() => fetchDrafts(client.id)}
              disabled={loading}
              style={{
                fontSize: 11, color: '#4f56c8', background: 'none',
                border: 'none', cursor: 'pointer', fontWeight: 700,
              }}
            >{loading ? '加载中...' : '↻ 刷新'}</button>
          </div>

          {loading && (
            <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>加载中...</div>
          )}

          {!loading && drafts.length === 0 && (
            <div style={{
              padding: 40, textAlign: 'center', color: '#94a3b8',
              background: 'rgba(255,255,255,.6)', borderRadius: 16,
              border: '1px dashed rgba(148,163,184,.4)', fontSize: 13,
            }}>
              暂无饮食计划，点击「AI 生成饮食计划」生成第一份
            </div>
          )}

          {!loading && drafts.map(draft => (
            <DraftCard
              key={draft.id}
              draft={draft}
              onApprove={approveDraft}
              onReject={rejectDraft}
            />
          ))}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

