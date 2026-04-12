import { useState, useCallback } from 'react';
import type { SessionRecord } from '@/lib/db';

const API_BASE = '/api/sessions';

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

export function useSessions(clientId: string | null | undefined) {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!clientId) { setSessions([]); return; }
    setLoading(true);
    try {
      const result = await apiFetch<SessionRecord[]>(`/?clientId=${clientId}&limit=200`);
      setSessions(result);
    } catch (err) {
      console.error('[useSessions] load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const createSession = useCallback(async (data: Partial<SessionRecord>) => {
    try {
      const result = await apiFetch<any>(`/`, {
        method: 'POST',
        body: JSON.stringify({ ...data, clientId }),
      });
      if (result.session) {
        setSessions(prev => [result.session, ...prev]);
      }
      return result;
    } catch (err) {
      console.error('[useSessions] create failed:', err);
      return null;
    }
  }, [clientId]);

  const updateSession = useCallback(async (id: string, data: Partial<SessionRecord>) => {
    try {
      const result = await apiFetch<any>(`/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      if (result.session) {
        setSessions(prev => prev.map(s => s._id === id ? result.session : s));
      }
      return result;
    } catch (err) {
      console.error('[useSessions] update failed:', err);
      return null;
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    try {
      await apiFetch(`/${id}`, { method: 'DELETE' });
      setSessions(prev => prev.filter(s => s._id !== id));
    } catch (err) {
      console.error('[useSessions] delete failed:', err);
    }
  }, []);

  return { sessions, loading, loadSessions, createSession, updateSession, deleteSession };
}
