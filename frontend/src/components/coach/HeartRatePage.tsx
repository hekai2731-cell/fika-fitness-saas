import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useHeartRate } from '@/hooks/useHeartRate';
import { buildHRProfile, ZONE_COLORS, type HRProfile } from '@/lib/heartRateUtils';
import type { Client } from '@/lib/db';
import { getClientsFromCache } from '@/lib/store';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    connected: { label: '已连接', color: '#065f46', bg: 'rgba(16,185,129,0.12)' },
    connecting: { label: '连接中...', color: '#92400e', bg: 'rgba(245,158,11,0.12)' },
    disconnected: { label: '未连接', color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
    error: { label: '连接失败', color: '#991b1b', bg: 'rgba(239,68,68,0.1)' },
    unsupported: { label: '不支持', color: '#991b1b', bg: 'rgba(239,68,68,0.1)' },
  };
  const s = map[status] || map.disconnected;

  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 20,
        color: s.color,
        background: s.bg,
        border: `1px solid ${s.color}30`,
      }}
    >
      {s.label}
    </span>
  );
}

export function HeartRatePage({ selectedClientId }: { selectedClientId: string | null }) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [manualAge, setManualAge] = useState(28);
  const [manualRhr, setManualRhr] = useState(65);
  const [previewProfile, setPreviewProfile] = useState<HRProfile>(() => buildHRProfile(28, 65));

  const hr = useHeartRate();

  useEffect(() => {
    const list = getClientsFromCache();
    if (!selectedClientId) {
      setSelectedClient(list[0] || null);
      return;
    }
    setSelectedClient(list.find((c) => c.id === selectedClientId) || null);
  }, [selectedClientId]);

  useEffect(() => {
    if (!selectedClient) return;
    const age = selectedClient.age || manualAge;
    const rhr = (selectedClient as any).rhr || manualRhr;
    hr.setClientProfile(age, rhr);
    setPreviewProfile(buildHRProfile(age, rhr));
    setManualAge(age);
    setManualRhr(rhr);
  }, [selectedClient]);

  const handleManualApply = () => {
    hr.setClientProfile(manualAge, manualRhr);
    setPreviewProfile(buildHRProfile(manualAge, manualRhr));
  };

  const profile = hr.profile || previewProfile;
  const bpm = hr.bpm ?? 0;
  const hasBpm = hr.bpm != null;

  const intensity = hasBpm ? Math.max(0, Math.min(100, Math.round(((bpm - profile.rhr) / Math.max(profile.hrr, 1)) * 100))) : 0;
  const ringPct = Math.max(5, intensity);
  const ringColor = hr.currentZone ? hr.currentZone.color : '#5b63d7';

  const ultraRange = (min: number, max: number) => `${Math.max(40, min - 6)} - ${Math.max(45, max - 6)}`;

  const vo2Max = (profile.mhr / Math.max(profile.rhr, 1)) * 17.5;

  const recoveryTime = hr.currentZone?.zone === 5
    ? '24 小时 / 24 hrs'
    : hr.currentZone?.zone === 4
      ? '18 小时 / 18 hrs'
      : hr.currentZone?.zone === 3
        ? '12 小时 / 12 hrs'
        : hr.currentZone?.zone === 2
          ? '8 小时 / 8 hrs'
          : '4 小时 / 4 hrs';

  const loadFocus = hr.currentZone?.zone === 5
    ? '峰值功率 / Peak Power'
    : hr.currentZone?.zone === 4
      ? '高强度 / High'
      : hr.currentZone?.zone === 3
        ? '构建 / Build'
        : hr.currentZone?.zone === 2
          ? '基础 / Base'
          : '恢复 / Recovery';

  const rightTopControls = (
    <div className="heart-top-controls" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <div
        style={{
          minWidth: 170,
          height: 40,
          borderRadius: 12,
          border: '1px solid var(--color-border-tertiary)',
          background: 'rgba(255,255,255,0.58)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--color-text-primary)',
        }}
      >
        {selectedClient ? `${selectedClient.name} · ${selectedClient.age || '--'}岁` : '当前客户'}
      </div>

      <div
        style={{
          height: 40,
          padding: '0 14px',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: '1px solid var(--color-border-tertiary)',
          background: 'rgba(255,255,255,0.58)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', fontWeight: 700 }}>RHR</span>
        <input
          type="number"
          min={30}
          max={120}
          value={manualRhr}
          onChange={(e) => setManualRhr(+e.target.value)}
          style={{
            width: 48,
            border: 'none',
            background: 'transparent',
            fontWeight: 800,
            fontSize: 20,
            color: '#4f56c8',
            outline: 'none',
            padding: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>次/分 / bpm</span>
      </div>

      <div
        style={{
          height: 40,
          padding: '0 12px',
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          border: '1px solid var(--color-border-tertiary)',
          background: 'rgba(255,255,255,0.58)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Age</span>
        <input
          type="number"
          min={10}
          max={90}
          value={manualAge}
          onChange={(e) => setManualAge(+e.target.value)}
          style={{
            width: 36,
            border: 'none',
            background: 'transparent',
            fontWeight: 700,
            fontSize: 14,
            color: 'var(--color-text-primary)',
            outline: 'none',
            padding: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
      </div>

      <Button
        type="button"
        onClick={handleManualApply}
        style={{
          height: 40,
          borderRadius: 12,
          padding: '0 18px',
          background: '#5c62d5',
          border: '1px solid #5c62d5',
        }}
      >
        重新计算区间 / Recalculate Zones
      </Button>
    </div>
  );

  return (
    <div
      className="heart-page-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        fontFamily: 'Manrope, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <Card className="heart-hero-card" style={{ borderRadius: 26, border: '1px solid rgba(210,216,233,0.72)', background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(10px)' }}>
        <CardHeader style={{ paddingBottom: 10 }}>
          <div className="heart-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <CardTitle className="heart-title" style={{ fontSize: 40, letterSpacing: '-0.02em', lineHeight: 1.1, fontWeight: 900 }}>心率监控</CardTitle>
              <CardDescription className="heart-subtitle" style={{ marginTop: 8, fontSize: 18, color: '#5f677b', fontWeight: 500 }}>
                实时心血管遥测与训练区间分析 / Real-time cardiovascular telemetry and training zone analysis.
              </CardDescription>
            </div>
            {rightTopControls}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <StatusBadge status={hr.status} />
            {hr.status === 'connected' ? (
              <Button variant="outline" onClick={hr.disconnect} type="button" style={{ borderRadius: 10 }}>
                断开心率带
              </Button>
            ) : (
              <Button
                type="button"
                onClick={hr.connect}
                disabled={hr.status === 'connecting' || hr.status === 'unsupported'}
                variant="outline"
                style={{ borderRadius: 10 }}
              >
                {hr.status === 'connecting' ? '连接中...' : '连接心率带'}
              </Button>
            )}
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              最大心率 MHR {profile.mhr} · 心率储备 HRR {profile.hrr} · 采样数 Samples {hr.samples.length}
            </span>
          </div>
        </CardHeader>
      </Card>

      {hr.status === 'unsupported' && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', color: '#991b1b', fontSize: 12 }}>
          当前浏览器不支持 Web Bluetooth API。请使用 Chrome 或 Edge，并确保网站为 HTTPS。
        </div>
      )}

      <div className="heart-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 16, alignItems: 'stretch' }}>
        <Card className="heart-ring-card" style={{ borderRadius: 28, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)' }}>
          <CardContent style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                className="heart-ring-wrap"
                style={{
                  width: 292,
                  height: 292,
                  borderRadius: '50%',
                  background: `conic-gradient(${ringColor} ${ringPct}%, #e2e6ef ${ringPct}% 100%)`,
                  display: 'grid',
                  placeItems: 'center',
                  transition: 'all .3s ease',
                  boxShadow: 'inset 0 0 0 1px rgba(143,153,181,.12)',
                }}
              >
                <div
                  style={{
                    width: 220,
                    height: 220,
                    borderRadius: '50%',
                    background: 'radial-gradient(circle at 30% 22%, #ffffff 0%, #f4f6fc 92%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    boxShadow: '0 14px 36px rgba(113,123,156,.12)',
                  }}
                >
                  <div style={{ fontSize: 68, fontWeight: 900, lineHeight: 1, letterSpacing: '-0.02em', color: '#111827', fontVariantNumeric: 'tabular-nums' }}>
                    {hasBpm ? bpm : '--'}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: '#636d84', fontWeight: 700 }}>
                    当前心率 / Current BPM
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ borderRadius: 16, border: '1px solid rgba(218,223,236,0.8)', background: 'rgba(255,255,255,0.56)', padding: '14px 16px', backdropFilter: 'blur(8px)' }}>
                <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 900, color: '#4f56c8', fontVariantNumeric: 'tabular-nums' }}>{intensity}%</div>
                <div style={{ marginTop: 6, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6a7288', fontWeight: 700 }}>强度 / Intensity</div>
              </div>
              <div style={{ borderRadius: 16, border: '1px solid rgba(218,223,236,0.8)', background: 'rgba(255,255,255,0.56)', padding: '14px 16px', backdropFilter: 'blur(8px)' }}>
                <div style={{ fontSize: 30, lineHeight: 1, fontWeight: 900, color: hr.currentZone ? ZONE_COLORS[hr.currentZone.zone] : '#4f56c8' }}>
                  {hr.currentZone ? `${hr.currentZone.label} / ${hr.currentZone.labelEn}` : '恢复 / Rest'}
                </div>
                <div style={{ marginTop: 6, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#6a7288', fontWeight: 700 }}>当前区间 / Current Zone</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="heart-right-pane" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card className="heart-zones-card" style={{ borderRadius: 28, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)' }}>
            <CardHeader style={{ paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <CardTitle className="heart-zones-title" style={{ fontSize: 28, letterSpacing: '-0.01em' }}>心率区间 / Heart Rate Zones</CardTitle>
                <span
                  style={{
                    borderRadius: 999,
                    padding: '6px 14px',
                    background: 'rgba(92,98,213,0.14)',
                    color: '#4f56c8',
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '.12em',
                    textTransform: 'uppercase',
                  }}
                >
                  卡氏公式 / Karvonen Method
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="heart-zone-table" style={{ overflowX: 'visible' }}>
              <div
                className="heart-zone-head"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.35fr 1fr 1fr',
                  fontSize: 10,
                  letterSpacing: '.11em',
                  textTransform: 'uppercase',
                  color: '#7b8499',
                  fontWeight: 700,
                  marginBottom: 8,
                  padding: '0 14px',
                }}
              >
                <div>区间名称 / Zone Name</div>
                <div>标准心率 / Standard BPM</div>
                <div>强化心率 / Ultra BPM</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profile.zones.map((z) => {
                  const active = hr.currentZone?.zone === z.zone;
                  return (
                    <div
                      key={z.zone}
                      className="heart-zone-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.35fr 1fr 1fr',
                        gap: 8,
                        alignItems: 'center',
                        borderRadius: 14,
                        border: `1px solid ${active ? 'rgba(92,98,213,0.35)' : 'rgba(216,221,236,0.92)'}`,
                        background: active ? 'rgba(92,98,213,0.12)' : 'rgba(248,249,252,0.64)',
                        padding: '12px 14px',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                        <span className="heart-zone-name" style={{ fontSize: 18, fontWeight: 800, color: active ? '#4f56c8' : '#20253a' }}>
                          Z{z.zone} {z.labelEn}
                        </span>
                      </div>
                      <div className="heart-zone-bpm" style={{ fontSize: 18, fontWeight: 700, color: active ? '#4f56c8' : '#2c3248', fontVariantNumeric: 'tabular-nums' }}>
                        {z.minBpm} - {z.maxBpm}
                      </div>
                      <div className="heart-zone-bpm" style={{ fontSize: 18, fontWeight: 700, color: '#2c3248', fontVariantNumeric: 'tabular-nums' }}>
                        {ultraRange(z.minBpm, z.maxBpm)}
                      </div>
                    </div>
                  );
                })}
              </div>
              </div>
            </CardContent>
          </Card>

          <div className="heart-metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            <Card style={{ borderRadius: 18, border: '1px solid rgba(216,221,236,0.76)', background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(8px)' }}>
              <CardContent style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#73809c', fontWeight: 700 }}>最大摄氧量 / VO2 Max</div>
                <div style={{ marginTop: 6, fontSize: 36, fontWeight: 900, color: '#4f56c8', lineHeight: 1 }}>{vo2Max.toFixed(1)}</div>
              </CardContent>
            </Card>
            <Card style={{ borderRadius: 18, border: '1px solid rgba(216,221,236,0.76)', background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(8px)' }}>
              <CardContent style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#73809c', fontWeight: 700 }}>恢复时间 / Recovery Time</div>
                <div style={{ marginTop: 6, fontSize: 36, fontWeight: 900, color: '#1f2438', lineHeight: 1 }}>{recoveryTime}</div>
              </CardContent>
            </Card>
            <Card style={{ borderRadius: 18, border: '1px solid rgba(216,221,236,0.76)', background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(8px)' }}>
              <CardContent style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: '#73809c', fontWeight: 700 }}>负荷重点 / Load Focus</div>
                <div style={{ marginTop: 6, fontSize: 36, fontWeight: 900, color: '#1f2438', lineHeight: 1 }}>{loadFocus}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Card className="heart-logic-card" style={{ borderRadius: 24, border: '1px solid rgba(216,221,236,0.74)', background: 'rgba(244,245,250,0.56)', backdropFilter: 'blur(10px)' }}>
        <CardContent style={{ padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#ffffff', border: '1px solid rgba(209,215,232,0.9)', display: 'grid', placeItems: 'center', color: '#4f56c8', fontWeight: 900 }}>
              ≈
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 23, fontWeight: 800, color: '#1f2438' }}>区间计算逻辑 / Zone Calculation Logic</div>
              <div style={{ marginTop: 6, fontSize: 16, color: '#5f677b', lineHeight: 1.6 }}>
                目标心率基于 <span style={{ color: '#4f56c8', fontWeight: 700 }}>卡氏公式 / Karvonen Formula</span> 计算，将静息心率 (RHR) 纳入，得到个体化心率储备 (HRR)。公式 / Formula:
                <code
                  style={{
                    marginLeft: 8,
                    padding: '2px 8px',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.86)',
                    border: '1px solid rgba(212,217,232,0.95)',
                    color: '#2d3348',
                    fontSize: 14,
                  }}
                >
                  目标心率 Target HR = ((MHR - RHR) × %Intensity) + RHR
                </code>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <style>{`
        @media (max-width: 1280px) {
          .heart-title { font-size: 36px !important; }
          .heart-subtitle { font-size: 17px !important; }
          .heart-ring-wrap {
            width: 250px !important;
            height: 250px !important;
          }
        }

        @media (max-width: 1194px) and (min-width: 835px) {
          .heart-page-root {
            gap: 12px !important;
          }
          .heart-main-grid {
            grid-template-columns: 0.92fr 1.18fr !important;
            gap: 12px !important;
          }
          .heart-title {
            font-size: 34px !important;
          }
          .heart-subtitle {
            margin-top: 4px !important;
            font-size: 15px !important;
          }
          .heart-zone-table {
            overflow-x: auto !important;
          }
          .heart-zones-title {
            font-size: 26px !important;
          }
          .heart-zone-head {
            font-size: 9px !important;
            margin-bottom: 6px !important;
            padding: 0 10px !important;
          }
          .heart-zone-row {
            padding: 9px 12px !important;
            border-radius: 12px !important;
          }
          .heart-zone-name {
            font-size: 16px !important;
          }
          .heart-zone-bpm {
            font-size: 16px !important;
          }
          .heart-metrics-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
          }
          .heart-top-controls {
            justify-content: flex-end;
          }
          .heart-ring-wrap {
            width: 236px !important;
            height: 236px !important;
          }
          .heart-zones-card {
            border-radius: 22px !important;
          }
          .heart-logic-card code {
            display: inline-block;
            margin-top: 6px;
            margin-left: 0 !important;
          }
        }

        @media (max-width: 834px) {
          .heart-title { font-size: 32px !important; }
          .heart-subtitle { font-size: 14px !important; }
          .heart-top-controls {
            width: 100%;
            justify-content: flex-start;
          }
          .heart-main-grid {
            grid-template-columns: 1fr !important;
          }
          .heart-metrics-grid {
            grid-template-columns: 1fr !important;
          }
          .heart-zone-table {
            overflow-x: auto !important;
          }
          .heart-ring-wrap {
            width: 220px !important;
            height: 220px !important;
          }
        }
      `}</style>
    </div>
  );
}
