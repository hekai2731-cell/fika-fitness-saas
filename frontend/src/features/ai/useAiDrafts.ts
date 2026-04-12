import { useState, useCallback } from 'react';
import type { AiDraft } from '@/lib/db';

const API_BASE = '/api/ai';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error ${res.status}`);
  }
  return res.json();
}

export function useAiDrafts(clientId: string | null | undefined) {
  const [drafts, setDrafts] = useState<AiDraft[]>([]);
  const [loading, setLoading] = useState(false);

  // 加载草稿列表
  const loadDrafts = useCallback(async () => {
    if (!clientId) { setDrafts([]); return; }
    setLoading(true);
    try {
      const result = await apiFetch<AiDraft[]>(`/drafts/?clientId=${clientId}&status=pending`);
      setDrafts(result);
    } catch (err) {
      console.error('[useAiDrafts] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // 生成新草稿
  const generate = useCallback(async (planType: 'session' | 'week' | 'full' | 'diet', payload: Record<string, unknown>) => {
    try {
      const result = await apiFetch<any>(`/generate`, {
        method: 'POST',
        body: JSON.stringify({ ...payload, planType, clientId }),
      });
      return result;
    } catch (err) {
      console.error('[useAiDrafts] generate failed:', err);
      return null;
    }
  }, [clientId]);

  // 批准草稿
  const approve = useCallback(async (draftId: string, target_plan_id?: string) => {
    try {
      await apiFetch(`/drafts/${draftId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ target_plan_id }),
      });
      setDrafts(prev => prev.filter(d => d._id !== draftId));
    } catch (err) {
      console.error('[useAiDrafts] approve failed:', err);
    }
  }, []);

  // 拒绝草稿
  const reject = useCallback(async (draftId: string, reason?: string) => {
    try {
      await apiFetch(`/drafts/${draftId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setDrafts(prev => prev.filter(d => d._id !== draftId));
    } catch (err) {
      console.error('[useAiDrafts] reject failed:', err);
    }
  }, []);

  return { drafts, loading, loadDrafts, generate, approve, reject };
}
