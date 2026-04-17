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
  // 模拟历史课程心率数据（后续可接真实数据）
  const [sessionHistory] = useState([
    { date: '04/14', avgBpm: 142, maxBpm: 168, dominantZone: 3, duration: '52分钟' },
    { date: '04/11', avgBpm: 138, maxBpm: 162, dominantZone: 3, duration: '58分钟' },
    { date: '04/08', avgBpm: 151, maxBpm: 175, dominantZone: 4, duration: '45分钟' },
    { date: '04/05', avgBpm: 133, maxBpm: 158, dominantZone: 2, duration: '60分钟' },
    { date: '04/02', avgBpm: 145, maxBpm: 171, dominantZone: 3, duration: '55分钟' },
  ]);

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

  return (
    <div
      className="heart-page-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        fontFamily: 'Manrope, "SF Pro Display", "PingFang SC", sans-serif',
      }}
    >
      {/* ── 顶部 Header ── */}
      <Card style={{ borderRadius: 20, border: '1px solid rgba(210,216,233,0.72)', background: 'rgba(255,255,255,0.52)', backdropFilter: 'blur(10px)' }}>
        <CardHeader style={{ paddingBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <CardTitle style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>
                心率管理
              </CardTitle>
              <CardDescription style={{ marginTop: 4, fontSize: 13, color: '#5f677b' }}>
                {selectedClient ? `${selectedClient.name} · ${selectedClient.age || '--'}岁` : '请选择客户'}
                {' · '}静息心率 {manualRhr} bpm · 最大心率 {profile.mhr} bpm
              </CardDescription>
            </div>

            {/* 右侧控制 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {/* RHR 输入 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 36, borderRadius: 10, border: '1px solid rgba(210,216,233,0.8)', background: 'rgba(255,255,255,0.7)' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '.1em' }}>RHR</span>
                <input
                  type="number" min={30} max={120} value={manualRhr}
                  onChange={(e) => setManualRhr(+e.target.value)}
                  style={{ width: 40, border: 'none', background: 'transparent', fontWeight: 800, fontSize: 16, color: '#4f56c8', outline: 'none', padding: 0 }}
                />
              </div>

              {/* 年龄输入 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', height: 36, borderRadius: 10, border: '1px solid rgba(210,216,233,0.8)', background: 'rgba(255,255,255,0.7)' }}>
                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '.1em' }}>AGE</span>
                <input
                  type="number" min={10} max={90} value={manualAge}
                  onChange={(e) => setManualAge(+e.target.value)}
                  style={{ width: 32, border: 'none', background: 'transparent', fontWeight: 700, fontSize: 14, color: '#1e293b', outline: 'none', padding: 0 }}
                />
              </div>

              {/* 重算按钮 */}
              <Button
                type="button"
                onClick={handleManualApply}
                style={{ height: 36, padding: '0 14px', borderRadius: 10, background: '#5c62d5', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}
              >
                重算区间
              </Button>

              {/* 连接心率带按钮 */}
              {hr.status === 'connected' ? (
                <button
                  onClick={hr.disconnect}
                  style={{ height: 36, padding: '0 14px', borderRadius: 10, background: 'rgba(239,68,68,0.1)', color: '#dc2626', fontSize: 12, fontWeight: 700, border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
                >
                  断开心率带
                </button>
              ) : (
                <button
                  onClick={hr.connect}
                  disabled={hr.status === 'connecting' || hr.status === 'unsupported'}
                  style={{ height: 36, padding: '0 14px', borderRadius: 10, background: '#FF6B35', color: '#fff', fontSize: 12, fontWeight: 700, border: 'none', cursor: hr.status === 'connecting' ? 'not-allowed' : 'pointer', opacity: hr.status === 'connecting' ? 0.7 : 1 }}
                >
                  {hr.status === 'connecting' ? '连接中...' : '⚡ 连接心率带'}
                </button>
              )}

              <StatusBadge status={hr.status} />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ── 已连接：实时监控模式 ── */}
      {hr.status === 'connected' && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 14, alignItems: 'stretch' }}>

          {/* 左：实时心率圆环 */}
          <Card style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)' }}>
            <CardContent style={{ padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              {/* 圆环 */}
              <div
                style={{
                  width: 220, height: 220, borderRadius: '50%',
                  background: `conic-gradient(${ringColor} ${ringPct}%, #e2e6ef ${ringPct}% 100%)`,
                  display: 'grid', placeItems: 'center', transition: 'all .3s ease',
                }}
              >
                <div style={{ width: 164, height: 164, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}>
                  <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1, color: '#111827' }}>
                    {hasBpm ? bpm : '--'}
                  </div>
                  <div style={{ fontSize: 10, letterSpacing: '.14em', color: '#94a3b8', fontWeight: 700, marginTop: 4 }}>
                    BPM
                  </div>
                </div>
              </div>

              {/* 强度 + 区间 */}
              <div style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ borderRadius: 12, background: 'rgba(92,98,213,0.08)', border: '1px solid rgba(92,98,213,0.15)', padding: '10px 12px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: '#4f56c8' }}>{intensity}%</div>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '.1em', marginTop: 3 }}>强度</div>
                </div>
                <div style={{ borderRadius: 12, background: hr.currentZone ? hr.currentZone.bgColor : 'rgba(107,114,128,0.08)', border: `1px solid ${hr.currentZone ? hr.currentZone.color + '30' : 'rgba(107,114,128,0.15)'}`, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: hr.currentZone ? hr.currentZone.color : '#6b7280', lineHeight: 1.3 }}>
                    {hr.currentZone ? hr.currentZone.labelEn : 'Rest'}
                  </div>
                  <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '.1em', marginTop: 3 }}>当前区间</div>
                </div>
              </div>

              {/* 本次采样统计 */}
              {hr.samples.length > 10 && (() => {
                const stats = hr.getStats();
                if (!stats) return null;
                return (
                  <div style={{ width: '100%', borderRadius: 12, background: 'rgba(248,249,252,0.8)', border: '1px solid rgba(216,221,236,0.8)', padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '.1em', marginBottom: 8 }}>本次训练</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      {[['平均', stats.avgBpm], ['最高', stats.maxBpm], ['最低', stats.minBpm]].map(([l, v]) => (
                        <div key={l as string} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>{v}</div>
                          <div style={{ fontSize: 9, color: '#94a3b8', marginTop: 2 }}>{l}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* 右：区间表 + 当前区间详情 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)', flex: 1 }}>
              <CardContent style={{ padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '.08em', marginBottom: 12 }}>心率区间 · 实时对照</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {profile.zones.map((z) => {
                    const active = hr.currentZone?.zone === z.zone;
                    return (
                      <div
                        key={z.zone}
                        style={{
                          display: 'grid', gridTemplateColumns: '120px 1fr auto',
                          alignItems: 'center', gap: 10,
                          borderRadius: 10,
                          border: `1px solid ${active ? z.color + '50' : 'rgba(216,221,236,0.8)'}`,
                          background: active ? z.bgColor : 'rgba(248,249,252,0.5)',
                          padding: '8px 12px',
                          transition: 'all .2s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: z.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: active ? z.color : '#334155' }}>
                            Z{z.zone} {z.labelEn}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: active ? z.color : '#475569', fontVariantNumeric: 'tabular-nums' }}>
                          {z.minBpm} – {z.maxBpm} bpm
                        </div>
                        {active && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: z.color, color: '#fff' }}>
                            当前
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* 当前区间说明 */}
            {hr.currentZone && (
              <Card style={{ borderRadius: 16, border: `1px solid ${hr.currentZone.color}30`, background: hr.currentZone.bgColor, backdropFilter: 'blur(8px)' }}>
                <CardContent style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: hr.currentZone.color, marginTop: 6, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: hr.currentZone.color }}>
                        {hr.currentZone.label} · {hr.currentZone.description}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                        {hr.currentZone.function} · 恢复时间 {recoveryTime.split('/')[0].trim()}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── 未连接：客户心率档案模式 ── */}
      {hr.status !== 'connected' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 14 }}>

          {/* 左：客户心率基础档案 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* 心率档案卡 */}
            <Card style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)' }}>
              <CardContent style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '.08em', marginBottom: 14 }}>心率基础档案</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                  {[
                    { label: '静息心率', value: `${manualRhr}`, unit: 'bpm', color: '#4f56c8' },
                    { label: '最大心率', value: `${profile.mhr}`, unit: 'bpm', color: '#dc2626' },
                    { label: '心率储备', value: `${profile.hrr}`, unit: 'bpm', color: '#7c3aed' },
                    { label: '推算VO2Max', value: `${vo2Max.toFixed(1)}`, unit: '', color: '#0d9488' },
                  ].map((item) => (
                    <div key={item.label} style={{ borderRadius: 12, background: 'rgba(248,249,252,0.8)', border: '1px solid rgba(216,221,236,0.6)', padding: '12px 14px' }}>
                      <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' }}>{item.label}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: item.color, marginTop: 4, lineHeight: 1 }}>
                        {item.value}
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginLeft: 3 }}>{item.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 五区间说明 */}
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>训练区间参考</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {profile.zones.map((z) => (
                    <div key={z.zone} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 8, background: z.bgColor, border: `1px solid ${z.color}20` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: z.color }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: z.color }}>Z{z.zone}</span>
                        <span style={{ fontSize: 11, color: '#475569' }}>{z.labelEn}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                        {z.minBpm}–{z.maxBpm}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 连接提示 */}
            <div style={{ borderRadius: 14, border: '1px dashed rgba(255,107,53,0.3)', background: 'rgba(255,107,53,0.05)', padding: '14px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#FF6B35', marginBottom: 4 }}>开始训练后连接心率带</div>
              <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>连接后可实时查看心率区间<br />训练结束后自动保存本次心率数据</div>
            </div>
          </div>

          {/* 右：历史课程心率分析 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* 历史心率走势 */}
            <Card style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)' }}>
              <CardContent style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>近期课程心率记录</div>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>最近 {sessionHistory.length} 节课</span>
                </div>

                {/* 柱状图 */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 80, marginBottom: 8 }}>
                  {sessionHistory.map((s, i) => {
                    const maxH = Math.max(...sessionHistory.map(x => x.maxBpm));
                    const minVal = 100;
                    const avgH = Math.round(((s.avgBpm - minVal) / (maxH - minVal)) * 64) + 8;
                    const maxBarH = Math.round(((s.maxBpm - minVal) / (maxH - minVal)) * 64) + 8;
                    const zColor = ZONE_COLORS[s.dominantZone] || '#6b7280';
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                        <div style={{ width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <div style={{ width: '60%', height: maxBarH, background: `${zColor}30`, borderRadius: '3px 3px 0 0', border: `1px solid ${zColor}40` }} />
                          <div style={{ position: 'absolute', bottom: 0, width: '60%', height: avgH, background: zColor, borderRadius: '3px 3px 0 0', opacity: 0.8 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 日期标签 */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {sessionHistory.map((s, i) => (
                    <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#94a3b8' }}>{s.date}</div>
                  ))}
                </div>

                {/* 图例 */}
                <div style={{ display: 'flex', gap: 14, marginTop: 10 }}>
                  {[['深色', '平均心率'], ['浅色', '峰值心率']].map(([t, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: t === '深色' ? '#7c3aed' : 'rgba(124,58,237,0.25)' }} />
                      <span style={{ fontSize: 10, color: '#94a3b8' }}>{l}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 历史课程明细 */}
            <Card style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.72)', background: 'rgba(255,255,255,0.5)', backdropFilter: 'blur(10px)' }}>
              <CardContent style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', letterSpacing: '.08em', marginBottom: 12 }}>课程心率明细</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* 表头 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '60px 60px 60px 60px 1fr', gap: 8, padding: '0 10px', fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: '.08em' }}>
                    <span>日期</span><span>平均</span><span>峰值</span><span>时长</span><span>主要区间</span>
                  </div>
                  {sessionHistory.map((s, i) => {
                    const zColor = ZONE_COLORS[s.dominantZone] || '#6b7280';
                    const zName = profile.zones.find(z => z.zone === s.dominantZone)?.labelEn || '--';
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 60px 60px 60px 1fr', gap: 8, alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: 'rgba(248,249,252,0.6)', border: '1px solid rgba(216,221,236,0.5)', fontSize: 12 }}>
                        <span style={{ color: '#475569', fontWeight: 600 }}>{s.date}</span>
                        <span style={{ fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{s.avgBpm}</span>
                        <span style={{ fontWeight: 700, color: '#dc2626', fontVariantNumeric: 'tabular-nums' }}>{s.maxBpm}</span>
                        <span style={{ color: '#64748b' }}>{s.duration}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 20, background: `${zColor}15`, color: zColor, fontSize: 10, fontWeight: 700, width: 'fit-content' }}>
                          Z{s.dominantZone} {zName}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* 趋势分析 */}
                <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: 'rgba(92,98,213,0.06)', border: '1px solid rgba(92,98,213,0.15)' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#4f56c8', marginBottom: 4 }}>强度趋势分析</div>
                  <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                    {(() => {
                      const recent = sessionHistory.slice(0, 3);
                      const avgRecent = Math.round(recent.reduce((a, b) => a + b.avgBpm, 0) / recent.length);
                      const older = sessionHistory.slice(3);
                      if (!older.length) return '数据积累中，继续训练后可查看趋势';
                      const avgOlder = Math.round(older.reduce((a, b) => a + b.avgBpm, 0) / older.length);
                      const diff = avgRecent - avgOlder;
                      if (diff > 5) return `近3节课平均心率比之前高 ${diff} bpm，训练强度有所提升，注意恢复质量。`;
                      if (diff < -5) return `近3节课平均心率比之前低 ${Math.abs(diff)} bpm，整体强度趋于稳定，可适当提升负荷。`;
                      return `近期训练强度稳定，平均心率保持在 ${avgRecent} bpm，继续当前节奏。`;
                    })()}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {hr.status === 'unsupported' && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.08)', color: '#991b1b', fontSize: 12 }}>
          当前浏览器不支持 Web Bluetooth API。请使用 Chrome 或 Edge，并确保网站为 HTTPS。
        </div>
      )}
    </div>
  );
}
