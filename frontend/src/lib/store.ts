import type { Client } from '@/lib/db';
import { syncOnClientChange } from './sync';

const KEY = 'fika_coach_clients_v1';

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function loadClients(): Client[] {
  const raw = safeParse<Client[]>(localStorage.getItem(KEY));
  if (raw && Array.isArray(raw)) return raw;
  const seeded = seedClients();
  saveClients(seeded);
  return seeded;
}

export function saveClients(clients: Client[]) {
  localStorage.setItem(KEY, JSON.stringify(clients));
  // 触发数据同步
  syncOnClientChange();
}

export function upsertClient(client: Client) {
  const clients = loadClients();
  const idx = clients.findIndex((c) => c.id === client.id);
  if (idx >= 0) clients[idx] = client;
  else clients.unshift(client);
  saveClients(clients);
}

export function getClient(clientId: string): Client | null {
  return loadClients().find((c) => c.id === clientId) || null;
}

export function seedClients(): Client[] {
  const now = Date.now();
  const clientId = `client-${now}`;

  return [
    {
      id: clientId,
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
    },
  ];
}
