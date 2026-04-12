import { useState } from 'react';
import type { Client } from '@/lib/db';
import { CoachShell, type CoachTab } from '../components/coach/CoachShell';
import { CoachClientSelectPage } from '../components/coach/CoachClientSelectPage';
import { ClientsPage } from '../components/coach/ClientsPage';
import { PlanningPage } from '../components/coach/PlanningPage';
import { FinancePage } from '../components/coach/FinancePage';
import { HeartRatePage } from '../components/coach/HeartRatePage';
import { DietPage } from '../components/coach/DietPage';
import { CoachSessionView } from '../components/CoachSessionView';
import { getClientsFromCache, saveClient, updateClientsCache } from '@/lib/store';
import { useSessions } from '@/features/sessions/useSessions';

export function CoachPortal({
  display,
  onLogout,
  coachCode,
}: {
  display: 'block' | 'none';
  onLogout: () => void;
  coachCode?: string | null;
}) {
  const [tab, setTab] = useState<CoachTab>('clients');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionClient, setSessionClient] = useState<Client | null>(null);
  const { createSession } = useSessions(sessionClient?.id);

  const openSession = (client: Client) => {
    setSessionClient(client);
    setSessionOpen(true);
  };

  const canAccessClient = (clientId: string | null) => {
    if (!clientId) return false;
    const target = getClientsFromCache().find((c) => c.id === clientId);
    if (!target) return false;
    if (!coachCode) return true;
    return String((target as any).coachCode || '') === String(coachCode);
  };

  if (sessionOpen && sessionClient) {
    return (
      <CoachSessionView
        client={sessionClient}
        onClose={() => setSessionOpen(false)}
        onRecordSession={async (session) => {
          if (!sessionClient) return;
          const updated: Client = {
            ...sessionClient,
            sessions: [...(sessionClient.sessions || []), session],
          };
          setSessionClient(updated);
          try {
            await saveClient(updated);
            const all = getClientsFromCache();
            const idx = all.findIndex(c => c.id === updated.id);
            if (idx >= 0) all[idx] = updated;
            else all.push(updated);
            updateClientsCache(all);
            // 通知子组件（ClientsPage / PlanningPage）从 cache 重新加载
            window.dispatchEvent(new Event('storage'));
            void createSession({
              ...session,
              date: String((session as any).date || new Date().toISOString().slice(0, 10)),
              coachCode: coachCode || '',
            }).catch((e: unknown) => console.warn('[portal] session dual-write failed:', e));
          } catch (err) {
            console.error('[app] Failed to save session:', err);
          }
        }}
      />
    );
  }

  return (
    <div id="pg-coach" className="z1" style={{ display }}>
      {!selectedClientId ? (
        <CoachClientSelectPage
          onPick={(id) => {
            if (!canAccessClient(id)) return;
            setSelectedClientId(id);
            setTab('clients');
          }}
          onLogout={onLogout}
          coachCode={coachCode}
        />
      ) : (
      <CoachShell
        tab={tab}
        onTab={setTab}
        onLogout={onLogout}
        onBackHome={() => {
          setSelectedClientId(null);
          setTab('clients');
        }}
      >
        {tab === 'clients' ? (
          <ClientsPage
            selectedClientId={selectedClientId}
            onSelect={(id) => {
              if (!canAccessClient(id)) return;
              setSelectedClientId(id);
              setTab('planning');
            }}
            coachCode={coachCode}
          />
        ) : tab === 'planning' ? (
          <PlanningPage
            selectedClientId={selectedClientId}
            onSelectClient={(id) => {
              if (!canAccessClient(id)) return;
              setSelectedClientId(id);
            }}
            onOpenSession={(c) => openSession(c)}
          />
        ) : tab === 'finance' ? (
          <FinancePage selectedClientId={selectedClientId} />
        ) : tab === 'heartrate' ? (
          <HeartRatePage selectedClientId={selectedClientId} />
        ) : (
          <DietPage selectedClientId={selectedClientId} />
        )}
      </CoachShell>
      )}
    </div>
  );
}
