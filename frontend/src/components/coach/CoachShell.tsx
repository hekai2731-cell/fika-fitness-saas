import { useMemo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export type CoachTab = 'clients' | 'planning' | 'finance' | 'heartrate' | 'diet';

export function CoachShell({
  tab,
  onTab,
  onLogout,
  onBackHome,
  children,
}: {
  tab: CoachTab;
  onTab: (t: CoachTab) => void;
  onLogout: () => void;
  onBackHome?: () => void;
  children: ReactNode;
}) {
  const tabs = useMemo(
    () =>
      [
        { id: 'clients' as const, cn: '客户管理', en: 'Clients' },
        { id: 'planning' as const, cn: '训练规划', en: 'Planning' },
        { id: 'finance' as const, cn: '账单/财务', en: 'Finance' },
        { id: 'heartrate' as const, cn: '心率', en: 'Heart Rate' },
        { id: 'diet' as const, cn: '饮食', en: 'Diet' },
      ] as const,
    [],
  );

  return (
    <div className="z1">
      <div className="coach-content" style={{ padding: 20 }}>
        <div style={{ maxWidth: 1280, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, minHeight: 72, padding: '8px 0' }}>
            <div
              className="logo"
              style={{
                fontSize: 20,
                padding: '0',
                borderRadius: 0,
                border: 'none',
                background: 'transparent',
                boxShadow: 'none',
              }}
            >
              <div>
                <span className="logo-fi">Fi</span>
                <span className="logo-ka">KA</span>
              </div>
              <div className="logo-sub" style={{ color: 'rgba(46,55,92,.82)' }}>Coach Pro · Select Client</div>
            </div>

            <div
              style={{
                flex: 1,
                maxWidth: 860,
                border: 'none',
                background: 'transparent',
                backdropFilter: 'none',
                WebkitBackdropFilter: 'none',
                boxShadow: 'none',
                padding: 0,
              }}
            >
              <Tabs value={tab} onValueChange={(v) => onTab(v as CoachTab)}>
                <TabsList className="coach-tab-list w-full justify-start !bg-transparent border-0 p-0 gap-2">
                  {tabs.map((t) => (
                    <TabsTrigger
                      key={t.id}
                      value={t.id}
                      className="coach-tab-trigger h-10 rounded-full px-5 text-[13px] font-semibold text-slate-600 border border-transparent data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:border-[rgba(232,236,247,.98)] data-[state=active]:shadow-[0_2px_10px_rgba(61,72,109,.14)]"
                    >
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <span>{t.cn}</span>
                        <span style={{ fontSize: 11, opacity: .68 }}>/ {t.en}</span>
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {onBackHome && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onBackHome}
                  type="button"
                  className="coach-top-btn bg-transparent border-[rgba(173,181,222,.62)] text-slate-700 hover:bg-[rgba(206,216,252,.24)]"
                >
                  返回首页
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onLogout} type="button" className="coach-top-btn text-slate-700 hover:bg-[rgba(206,216,252,.26)]">
                退出
              </Button>
            </div>
          </div>

          <div style={{ marginTop: 14 }}>{children}</div>
        </div>
      </div>
    </div>
  );
}
