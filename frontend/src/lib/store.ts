import type { Client } from '@/lib/db';
import { calcLtvScore } from '@/lib/ltvScore';

// ── 内存缓存（应用启动时从服务器加载） ────────────────────────────────────────

let clientsCache: Client[] = [];
let coachesCache: { code: string; name: string; specialties?: string[] }[] = [];

// ── 客户数据相关 ────────────────────────────────────────────

/**
 * 从服务器加载所有客户数据
 */
export async function loadClients(): Promise<Client[]> {
  try {
    const res = await fetch('/api/clients');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const clients = await res.json();
    clientsCache = Array.isArray(clients) ? clients : [];
    console.log('[store] Loaded', clientsCache.length, 'clients from server');
    return clientsCache;
  } catch (e) {
    console.warn('[store] Failed to load clients:', e);
    return clientsCache;  // 返回缓存的数据
  }
}

/**
 * 从内存缓存读取客户（用于同步调用）
 */
export function getClientsFromCache(): Client[] {
  return clientsCache;
}

/**
 * 保存单个客户到服务器
 */
export async function saveClient(client: Client): Promise<void> {
  const nextClient: Client = { ...client, ltv_score: calcLtvScore(client) };

  try {
    const res = await fetch(`/api/clients/${nextClient.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextClient),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('[store] Client saved:', nextClient.id);

    // 更新内存缓存
    const idx = clientsCache.findIndex(c => c.id === nextClient.id);
    if (idx >= 0) {
      clientsCache[idx] = nextClient;
    } else {
      clientsCache.unshift(nextClient);
    }
  } catch (e) {
    console.error('[store] Failed to save client:', e);
    throw e;  // 抛出错误，不再静默失败
  }
}

/**
 * 删除客户
 */
export async function deleteClient(clientId: string): Promise<void> {
  try {
    const res = await fetch(`/api/clients/${clientId}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('[store] Client deleted:', clientId);

    // 更新内存缓存
    clientsCache = clientsCache.filter(c => c.id !== clientId);
  } catch (e) {
    console.error('[store] Failed to delete client:', e);
    throw e;
  }
}

/**
 * 更新内存缓存（用于 UI 状态同步）
 */
export function updateClientsCache(clients: Client[]): void {
  clientsCache = clients;
}

// ── 教练数据相关 ────────────────────────────────────────────

export interface Coach {
  code: string;
  name: string;
  specialties?: string[];
}

/**
 * 从服务器加载所有教练
 */
export async function loadCoaches(): Promise<Coach[]> {
  try {
    const res = await fetch('/api/coaches');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const coaches = await res.json();
    coachesCache = Array.isArray(coaches) ? coaches : [];
    console.log('[store] Loaded', coachesCache.length, 'coaches from server');
    return coachesCache;
  } catch (e) {
    console.warn('[store] Failed to load coaches:', e);
    return coachesCache;
  }
}

/**
 * 从内存缓存读取教练
 */
export function getCoachesFromCache(): Coach[] {
  return coachesCache;
}

/**
 * 保存教练列表到服务器
 */
export async function saveCoaches(coaches: Coach[]): Promise<void> {
  try {
    const res = await fetch('/api/coaches', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(coaches),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    coachesCache = coaches;
    console.log('[store] Coaches saved');
  } catch (e) {
    console.error('[store] Failed to save coaches:', e);
    throw e;
  }
}

/**
 * 示例客户数据生成器
 */
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

/**
 * 从服务器强制刷新客户缓存，并触发全局通知让各页面重新渲染
 * 用于多设备同步：教练改完数据，其他设备自动更新
 */
export async function refreshClients(): Promise<void> {
  try {
    const res = await fetch('/api/clients');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const clients = await res.json();
    clientsCache = Array.isArray(clients) ? clients : [];
    window.dispatchEvent(new CustomEvent('fika:clients-refreshed'));
  } catch (e) {
    console.warn('[store] refreshClients failed:', e);
  }
}
