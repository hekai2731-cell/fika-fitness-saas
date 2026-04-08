import type { Client } from '@/lib/db';

const LS_KEY = 'fika_coach_clients_v1';
const LS_PENDING = 'fika_pending_sync';
const API_BASE = '/api/sync/clients';

function lsRead(): Client[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWrite(clients: Client[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(clients));
}

function pendingAdd(clientId: string) {
  try {
    const raw = localStorage.getItem(LS_PENDING);
    const set = new Set<string>(raw ? JSON.parse(raw) : []);
    set.add(clientId);
    localStorage.setItem(LS_PENDING, JSON.stringify([...set]));
  } catch {}
}

function pendingClear(clientId: string) {
  try {
    const raw = localStorage.getItem(LS_PENDING);
    if (!raw) return;
    const set = new Set<string>(JSON.parse(raw));
    set.delete(clientId);
    localStorage.setItem(LS_PENDING, JSON.stringify([...set]));
  } catch {}
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function loadClientsAsync(coachCode?: string): Promise<Client[]> {
  try {
    const query = coachCode ? `?coachCode=${encodeURIComponent(coachCode)}` : '';
    const clients: Client[] = await apiFetch(`/${query}`);
    lsWrite(clients);
    return clients;
  } catch (e) {
    console.warn('[store] 服务器拉取失败，使用本地缓存', e);
    const cached = lsRead();
    if (cached.length > 0) return cached;
    const seeded = seedClients();
    lsWrite(seeded);
    return seeded;
  }
}

export function loadClients(): Client[] {
  const cached = lsRead();
  if (cached.length > 0) return cached;
  const seeded = seedClients();
  lsWrite(seeded);
  return seeded;
}

export async function saveClientAsync(client: Client): Promise<void> {
  const all = lsRead();
  const idx = all.findIndex(c => c.id === client.id);
  if (idx >= 0) all[idx] = client;
  else all.unshift(client);
  lsWrite(all);
  try {
    await apiFetch(`/${client.id}`, {
      method: 'PUT',
      body: JSON.stringify(client),
    });
    pendingClear(client.id);
  } catch (e) {
    console.warn('[store] 服务器写入失败，加入待同步队列', e);
    pendingAdd(client.id);
  }
}

export function saveClients(clients: Client[]) {
  lsWrite(clients);
  clients.forEach(c => {
    saveClientAsync(c).catch(err => console.warn('[store] batch save error', err));
  });
}

export function upsertClient(client: Client) {
  const all = lsRead();
  const idx = all.findIndex(c => c.id === client.id);
  if (idx >= 0) all[idx] = client;
  else all.unshift(client);
  lsWrite(all);
  saveClientAsync(client).catch(console.warn);
}

export function getClient(clientId: string): Client | null {
  return lsRead().find(c => c.id === clientId) || null;
}

export async function getClientByRoadCode(roadCode: string): Promise<Client | null> {
  try {
    const client = await apiFetch(`/by-road-code/${encodeURIComponent(roadCode)}`);
    const all = lsRead();
    const idx = all.findIndex(c => c.id === client.id);
    if (idx >= 0) all[idx] = client;
    else all.unshift(client);
    lsWrite(all);
    return client;
  } catch (e: any) {
    if (e.message?.includes('404') || e.message?.includes('not found')) return null;
    return lsRead().find(c => c.roadCode === roadCode) || null;
  }
}

export async function migrateLocalToMongo(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  try {
    const clients = lsRead();
    if (clients.length === 0) return { ok: true, count: 0 };
    await apiFetch('/batch', {
      method: 'POST',
      body: JSON.stringify(clients),
    });
    return { ok: true, count: clients.length };
  } catch (e: any) {
    return { ok: false, count: 0, error: e.message };
  }
}

export async function syncPending(): Promise<void> {
  try {
    const raw = localStorage.getItem(LS_PENDING);
    if (!raw) return;
    const ids: string[] = JSON.parse(raw);
    const all = lsRead();
    for (const id of ids) {
      const client = all.find(c => c.id === id);
      if (client) await saveClientAsync(client);
    }
  } catch (e) {
    console.warn('[store] syncPending error', e);
  }
}

export function seedClients(): Client[] {
  return [
    {
      id: `client-${Date.now()}`,
      name: '示例客户',
      tier: 'standard',
      gender: 'male',
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
    } as Client,
  ];
}
