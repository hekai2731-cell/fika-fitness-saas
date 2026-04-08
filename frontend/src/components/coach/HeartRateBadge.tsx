import { useState, type CSSProperties } from 'react';
import { type UseHeartRateReturn } from '@/hooks/useHeartRate';
import { ZONE_BG, ZONE_COLORS } from '@/lib/heartRateUtils';

interface HeartRateBadgeProps {
  hr: UseHeartRateReturn;
}

export function HeartRateBadge({ hr }: HeartRateBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  const zone = hr.currentZone;
  const bpmColor = zone ? ZONE_COLORS[zone.zone] : 'rgba(255,255,255,0.5)';
  const zoneBg = zone ? ZONE_BG[zone.zone] : 'rgba(255,255,255,0.06)';

  const zoneDurations = (() => {
    const zd: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    hr.samples.forEach((s) => {
      if (s.zone) zd[s.zone]++;
    });
    return zd;
  })();

  const totalSamples = hr.samples.length || 1;

  const S = {
    bar: {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '7px 14px',
      background: 'rgba(255,255,255,0.04)',
      borderBottom: '1px solid rgba(255,255,255,0.08)',
      flexShrink: 0,
    } as CSSProperties,
    bpm: {
      fontSize: 22, fontWeight: 900, color: bpmColor,
      fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      transition: 'color 0.3s',
      minWidth: 54,
    } as CSSProperties,
    bpmLabel: {
      fontSize: 9, color: 'rgba(255,255,255,0.3)',
      letterSpacing: '.1em', textTransform: 'uppercase',
    } as CSSProperties,
    zonePill: {
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 20,
      background: zoneBg, border: `1px solid ${bpmColor}30`,
      transition: 'all 0.3s',
    } as CSSProperties,
    zoneDot: {
      width: 6, height: 6, borderRadius: '50%',
      background: bpmColor, flexShrink: 0,
    } as CSSProperties,
    zoneText: { fontSize: 11, fontWeight: 700, color: bpmColor } as CSSProperties,
    status: { fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 'auto' } as CSSProperties,
    connectBtn: {
      fontSize: 11, padding: '4px 12px', borderRadius: 8,
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'rgba(255,255,255,0.06)',
      color: 'rgba(255,255,255,0.6)',
      cursor: 'pointer', marginLeft: 'auto',
    } as CSSProperties,
    expandBtn: {
      fontSize: 10, color: 'rgba(255,255,255,0.3)',
      cursor: 'pointer', padding: '2px 6px',
    } as CSSProperties,
  };

  return (
    <>
      <div style={S.bar}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={bpmColor} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transition: 'stroke 0.3s' }}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>

        <div>
          <div style={S.bpm}>{hr.bpm ?? '---'}</div>
          <div style={S.bpmLabel}>BPM</div>
        </div>

        {hr.bpm && (
          <div style={S.zonePill}>
            <div style={S.zoneDot} />
            <span style={S.zoneText}>{zone ? `Z${zone.zone} ${zone.label}` : '静息'}</span>
          </div>
        )}

        {hr.samples.length > 0 && (
          <div style={{ display: 'flex', gap: 2, flex: 1, height: 5, borderRadius: 4, overflow: 'hidden', maxWidth: 160 }}>
            {[1, 2, 3, 4, 5].map((z) => {
              const pct = Math.round((zoneDurations[z] / totalSamples) * 100);
              return pct > 0 ? <div key={z} title={`Z${z}: ${pct}%`} style={{ flex: pct, background: ZONE_COLORS[z], minWidth: 2, borderRadius: 2, opacity: 0.75 }} /> : null;
            })}
          </div>
        )}

        {hr.status === 'disconnected' || hr.status === 'error' ? (
          <button style={S.connectBtn} onClick={hr.connect}>连接心率带</button>
        ) : hr.status === 'connecting' ? (
          <span style={S.status}>连接中...</span>
        ) : hr.status === 'connected' ? (
          <button style={S.expandBtn} onClick={() => setExpanded((v) => !v)}>{expanded ? '收起 ▲' : '详情 ▼'}</button>
        ) : null}
      </div>

      {expanded && hr.status === 'connected' && (
        <div style={{
          padding: '10px 14px', background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {[1, 2, 3, 4, 5].map((z) => {
            const secs = zoneDurations[z];
            const m = Math.floor(secs / 60);
            const s = secs % 60;
            const pct = Math.round((secs / totalSamples) * 100);
            return (
              <div key={z} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '6px 10px', borderRadius: 8, minWidth: 56,
                background: secs > 0 ? ZONE_BG[z] : 'rgba(255,255,255,0.04)',
                border: `1px solid ${secs > 0 ? ZONE_COLORS[z] + '30' : 'rgba(255,255,255,0.06)'}`,
              }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: ZONE_COLORS[z], letterSpacing: '.06em' }}>Z{z}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: secs > 0 ? ZONE_COLORS[z] : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, marginTop: 2 }}>
                  {m}:{String(s).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{pct}%</div>
              </div>
            );
          })}

          {hr.samples.length > 2 && (() => {
            const avg = Math.round(hr.samples.slice(-30).reduce((a, s) => a + s.bpm, 0) / Math.min(hr.samples.length, 30));
            return (
              <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>近30s均值</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'rgba(255,255,255,0.7)', fontVariantNumeric: 'tabular-nums' }}>{avg}</div>
              </div>
            );
          })()}
        </div>
      )}
    </>
  );
}

interface HRSummaryProps {
  stats: ReturnType<UseHeartRateReturn['getStats']>;
}

export function HRSummaryCard({ stats }: HRSummaryProps) {
  if (!stats) return null;

  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      background: 'rgba(124,58,237,0.08)',
      border: '1px solid rgba(124,58,237,0.2)',
      marginTop: 8,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(167,139,250,0.7)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>
        心率总结 · HR Summary
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        {[
          { label: '平均', value: stats.avgBpm },
          { label: '最高', value: stats.maxBpm },
          { label: '最低', value: stats.minBpm },
        ].map((item) => (
          <div key={item.label} style={{ textAlign: 'center', flex: 1, padding: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: 7 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#c4b5fd', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{item.label} BPM</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((z) => {
          const secs = stats.zoneDurations[z] || 0;
          if (!secs) return null;
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return (
            <div key={z} style={{ flex: 1, textAlign: 'center', padding: '4px 6px', borderRadius: 6, background: ZONE_BG[z], border: `1px solid ${ZONE_COLORS[z]}30` }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: ZONE_COLORS[z] }}>Z{z}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: ZONE_COLORS[z], fontVariantNumeric: 'tabular-nums' }}>
                {m}:{String(s).padStart(2, '0')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
