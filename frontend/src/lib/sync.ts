import type { Client } from '@/lib/db';
import { loadClients, saveClients } from './store';

interface SyncConfig {
  apiBase: string;
  coachId?: string;
  tempUserId: string;
}

class ClientSync {
  private config: SyncConfig;
  private syncInProgress = false;
  private lastSyncTime = 0;
  private readonly SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(config: SyncConfig) {
    this.config = config;
  }

  private apiUrl = (path: string) => {
    const base = this.config.apiBase?.replace(/\/$/, '') || '';
    // 如果apiBase为空（生产环境），直接返回path（相对路径）
    return base ? base + path : path;
  };

  // 从服务器拉取客户端数据
  async fetchClients(): Promise<Client[]> {
    try {
      const params = new URLSearchParams();
      if (this.config.coachId) params.append('coachId', this.config.coachId);
      if (this.config.tempUserId) params.append('tempUserId', this.config.tempUserId);

      const response = await fetch(this.apiUrl(`/api/clients?${params}`));
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const serverClients = await response.json();
      return serverClients;
    } catch (error) {
      console.warn('[sync] Failed to fetch clients from server:', error);
      return [];
    }
  }

  // 推送单个客户端到服务器
  async pushClient(client: Client): Promise<boolean> {
    try {
      const response = await fetch(this.apiUrl(`/api/clients/${client.id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(client),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[sync] Client pushed successfully:', client.id);
      return result.success;
    } catch (error) {
      console.warn('[sync] Failed to push client to server:', error);
      return false;
    }
  }

  // 推送所有本地客户端到服务器
  async pushAllClients(): Promise<void> {
    const localClients = loadClients();
    const results = await Promise.allSettled(
      localClients.map(client => this.pushClient(client))
    );

    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length;
    if (failed > 0) {
      console.warn(`[sync] ${failed} clients failed to sync`);
    }
  }

  // 双向同步：合并本地和服务器数据
  async sync(): Promise<void> {
    if (this.syncInProgress) return;
    
    const now = Date.now();
    if (now - this.lastSyncTime < this.SYNC_INTERVAL) {
      console.log('[sync] Sync interval not reached, skipping');
      return;
    }

    this.syncInProgress = true;
    this.lastSyncTime = now;

    try {
      console.log('[sync] Starting client data sync...');
      
      // 1. 获取本地数据
      const localClients = loadClients();
      
      // 2. 获取服务器数据
      const serverClients = await this.fetchClients();
      
      // 3. 合并数据（以本地为准，但包含服务器上的新数据）
      const mergedClients = this.mergeClients(localClients, serverClients);
      
      // 4. 保存合并后的数据
      saveClients(mergedClients);
      
      // 5. 推送本地数据到服务器
      await this.pushAllClients();
      
      console.log('[sync] Sync completed successfully');
    } catch (error) {
      console.error('[sync] Sync failed:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  // 合并本地和服务器客户端数据
  private mergeClients(localClients: Client[], serverClients: Client[]): Client[] {
    const clientMap = new Map<string, Client>();
    
    // 先添加本地数据
    localClients.forEach(client => {
      clientMap.set(client.id, client);
    });
    
    // 添加服务器上不存在于本地的数据
    serverClients.forEach(serverClient => {
      if (!clientMap.has(serverClient.id)) {
        clientMap.set(serverClient.id, serverClient);
      }
    });
    
    return Array.from(clientMap.values());
  }

  // 手动触发同步
  async forceSync(): Promise<void> {
    this.lastSyncTime = 0; // 重置时间戳
    await this.sync();
  }
}

// 导出同步服务实例
let syncInstance: ClientSync | null = null;

export function initSync(config: SyncConfig): ClientSync {
  syncInstance = new ClientSync(config);
  
  // 启动定期同步
  setInterval(() => {
    syncInstance?.sync();
  }, 10 * 60 * 1000); // 每10分钟检查一次
  
  // 页面可见性变化时同步
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && syncInstance) {
      syncInstance.sync();
    }
  });
  
  return syncInstance;
}

export function getSync(): ClientSync {
  if (!syncInstance) {
    throw new Error('Sync not initialized. Call initSync first.');
  }
  return syncInstance;
}

// 在客户端数据变更时调用同步
export function syncOnClientChange(): void {
  // 延迟同步，避免频繁调用
  setTimeout(() => {
    getSync().sync();
  }, 1000);
}
