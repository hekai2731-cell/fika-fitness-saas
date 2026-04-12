import { useState, useEffect, useCallback } from 'react';
import type { TrainingPlan, Block } from '@/lib/db';

const API_BASE = '/api/plans';

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

export function usePlans(clientId: string | null | undefined) {
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载客户的训练规划
  const loadPlan = useCallback(async () => {
    if (!clientId) { setPlan(null); return; }
    setLoading(true);
    try {
      const plans = await apiFetch<TrainingPlan[]>(`/?clientId=${clientId}`);
      // 取最新一个
      const latest = plans.sort((a, b) =>
        new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime(),
      )[0] || null;
      setPlan(latest);
    } catch (err) {
      console.error('[usePlans] load failed:', err);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  // 保存 blocks 草稿
  const saveDraft = useCallback(async (blocks: Block[]) => {
    if (!clientId) return;
    try {
      if (plan?._id) {
        const result = await apiFetch<any>(`/${plan._id}`, {
          method: 'PUT',
          body: JSON.stringify({ blocks }),
        });
        if (result.plan) setPlan(result.plan);
      } else {
        const result = await apiFetch<any>(`/`, {
          method: 'POST',
          body: JSON.stringify({ clientId, coachCode: '', blocks, status: 'draft' }),
        });
        if (result.plan) setPlan(result.plan);
      }
    } catch (err) {
      console.error('[usePlans] save draft failed:', err);
    }
  }, [clientId, plan]);

  // 发布
  const publish = useCallback(async (coachCode?: string, coachName?: string) => {
    if (!plan?._id) return;
    try {
      const result = await apiFetch<any>(`/${plan._id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ publishedByCoachCode: coachCode, publishedByCoachName: coachName }),
      });
      if (result.plan) setPlan(result.plan);
    } catch (err) {
      console.error('[usePlans] publish failed:', err);
    }
  }, [plan]);

  // 回滚
  const rollback = useCallback(async (version?: number) => {
    if (!plan?._id) return;
    try {
      const result = await apiFetch<any>(`/${plan._id}/rollback`, {
        method: 'POST',
        body: JSON.stringify({ version }),
      });
      if (result.plan) setPlan(result.plan);
    } catch (err) {
      console.error('[usePlans] rollback failed:', err);
    }
  }, [plan]);

  // 标记 review_ready
  const markReviewReady = useCallback(async () => {
    if (!plan?._id) return;
    try {
      const result = await apiFetch<any>(`/${plan._id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'review_ready' }),
      });
      if (result.plan) setPlan(result.plan);
    } catch (err) {
      console.error('[usePlans] mark review_ready failed:', err);
    }
  }, [plan]);

  return {
    plan,
    blocks: plan?.blocks || [],
    publishedBlocks: plan?.published_blocks || [],
    status: plan?.status || 'draft',
    loading,
    saveDraft,
    publish,
    rollback,
    markReviewReady,
    reload: loadPlan,
  };
}
