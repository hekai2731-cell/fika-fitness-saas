import type { Client } from '@/lib/db';

const LS_KEY_CLIENTS = 'fika_coach_clients_v1';
const LS_KEY_COACHES = 'fika_coaches_v1';

// ── 客户数据相关 ────────────────────────────────────────────

function lsReadClients(): Client[] {
  try {
    const raw = localStorage.getItem(LS_KEY_CLIENTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWriteClients(clients: Client[]) {
  localStorage.setItem(LS_KEY_CLIENTS, JSON.stringify(clients));
}

export async function loadClients(): Promise<Client[]> {
  try {
    const response = await fetch('/api/clients');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const clients: Client[] = await response.json();
    lsWriteClients(clients);
    console.log('[store] Loaded', clients.length, 'clients from server');
    return clients;
  } catch (e) {
    console.warn('[store] Failed to fetch clients from server, using cache', e);
    const cached = lsReadClients();
    return cached.length > 0 ? cached : [];
  }
}

export function getClientFromCache(clientId: string): Client | null {
  return lsReadClients().find(c => c.id === clientId) || null;
}

export function getAllClientsFromCache(): Client[] {
  return lsReadClients();
}

export async function saveClient(client: Client): Promise<void> {
  try {
    const response = await fetch(`/api/clients/${client.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(client),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const all = lsReadClients();
    const idx = all.findIndex(c => c.id === client.id);
    if (idx >= 0) all[idx] = client;
    else all.unshift(client);
    lsWriteClients(all);
    console.log('[store] Client saved:', client.id);
  } catch (e) {
    console.warn('[store] Failed to save client:', e);
    const all = lsReadClients();
    const idx = all.findIndex(c => c.id === client.id);
    if (idx >= 0) all[idx] = client;
    else all.unshift(client);
    lsWriteClients(all);
  }
}

// ── 教练数据相关 ────────────────────────────────────────────

export interface Coach {
  code: string;
  name: string;
  specialties?: string[];
}

function lsReadCoaches(): Coach[] {
  try {
    const raw = localStorage.getItem(LS_KEY_COACHES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lsWriteCoaches(coaches: Coach[]) {
  localStorage.setItem(LS_KEY_COACHES, JSON.stringify(coaches));
}

export async function loadCoaches(): Promise<Coach[]> {
  try {
    const response = await fetch('/api/coaches');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const coaches: Coach[] = await response.json();
    lsWriteCoaches(coaches);
    console.log('[store] Loaded', coaches.length, 'coaches from server');
    return coaches;
  } catch (e) {
    console.warn('[store] Failed to fetch coaches from server, using cache', e);
    const cached = lsReadCoaches();
    return cached.length > 0 ? cached : [];
  }
}

export function getCoachesFromCache(): Coach[] {
  return lsReadCoaches();
}

export async function saveCoaches(coaches: Coach[]): Promise<void> {
  try {
    const response = await fetch('/api/coaches', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coaches),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    lsWriteCoaches(coaches);
    console.log('[store] Coaches saved');
  } catch (e) {
    console.warn('[store] Failed to save coaches:', e);
    lsWriteCoaches(coaches);
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
