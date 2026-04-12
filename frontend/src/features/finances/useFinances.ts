import { useState, useCallback } from 'react';
import type { FinanceRecord, FinanceSummary } from '@/lib/db';

const API_BASE = '/api/finances';

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

export function useFinances(clientId: string | null | undefined) {
  const [records, setRecords] = useState<FinanceRecord[]>([]);
  const [summary, setSummary] = useState<FinanceSummary>({ sessions_purchased: 0, sessions_consumed: 0, sessions_refunded: 0, sessions_remaining: 0 });
  const [loading, setLoading] = useState(false);

  const loadFinances = useCallback(async () => {
    if (!clientId) { setRecords([]); setSummary({ sessions_purchased: 0, sessions_consumed: 0, sessions_refunded: 0, sessions_remaining: 0 }); return; }
    setLoading(true);
    try {
      const result = await apiFetch<any>(`/?clientId=${clientId}`);
      setRecords(result.records || []);
      setSummary(result.summary || { sessions_purchased: 0, sessions_consumed: 0, sessions_refunded: 0, sessions_remaining: 0 });
    } catch (err) {
      console.error('[useFinances] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const createRecord = useCallback(async (data: Partial<FinanceRecord>) => {
    try {
      const result = await apiFetch<any>(`/`, {
        method: 'POST',
        body: JSON.stringify({ ...data, clientId }),
      });
      if (result.record) {
        setRecords(prev => [result.record, ...prev]);
      }
      return result;
    } catch (err) {
      console.error('[useFinances] create failed:', err);
      return null;
    }
  }, [clientId]);

  const deleteRecord = useCallback(async (id: string) => {
    try {
      await apiFetch(`/${id}`, { method: 'DELETE' });
      setRecords(prev => prev.filter(r => r._id !== id));
    } catch (err) {
      console.error('[useFinances] delete failed:', err);
    }
  }, []);

  return { records, summary, loading, loadFinances, createRecord, deleteRecord };
}
