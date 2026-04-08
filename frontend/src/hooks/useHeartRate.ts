import { useCallback, useEffect, useRef, useState } from 'react';
import { buildHRProfile, detectZone, type HRProfile, type HRZone } from '@/lib/heartRateUtils';

type BTDevice = any;
type BTCharacteristic = any;

const HR_SERVICE = 'heart_rate';
const HR_CHAR = 'heart_rate_measurement';

export type BLEStatus = 'unsupported' | 'disconnected' | 'connecting' | 'connected' | 'error';

export interface HRSample {
  bpm: number;
  zone: number | null;
  ts: number;
}

export interface UseHeartRateReturn {
  status: BLEStatus;
  bpm: number | null;
  currentZone: HRZone | null;
  profile: HRProfile | null;
  samples: HRSample[];
  connect: () => Promise<void>;
  disconnect: () => void;
  setClientProfile: (age: number, rhr: number) => void;
  getStats: () => { avgBpm: number; maxBpm: number; minBpm: number; zoneDurations: Record<number, number> } | null;
  clearSamples: () => void;
}

export function useHeartRate(age?: number, rhr?: number): UseHeartRateReturn {
  const [status, setStatus] = useState<BLEStatus>(() =>
    typeof navigator !== 'undefined' && 'bluetooth' in navigator ? 'disconnected' : 'unsupported',
  );
  const [bpm, setBpm] = useState<number | null>(null);
  const [currentZone, setCurrentZone] = useState<HRZone | null>(null);
  const [profile, setProfile] = useState<HRProfile | null>(age != null ? buildHRProfile(age, rhr ?? 65) : null);
  const [samples, setSamples] = useState<HRSample[]>([]);

  const deviceRef = useRef<BTDevice | null>(null);
  const charRef = useRef<BTCharacteristic | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const setClientProfile = useCallback((a: number, r: number) => {
    const p = buildHRProfile(a, r);
    setProfile(p);
    profileRef.current = p;
  }, []);

  const parseBpm = (value: DataView): number => {
    const flags = value.getUint8(0);
    return flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
  };

  const onHRChange = useCallback((e: Event) => {
    const val = (e.target as BTCharacteristic).value;
    if (!val) return;
    const newBpm = parseBpm(val);
    setBpm(newBpm);
    const zone = profileRef.current ? detectZone(newBpm, profileRef.current) : null;
    setCurrentZone(zone);
    setSamples((prev) => [...prev.slice(-7200), { bpm: newBpm, zone: zone?.zone ?? null, ts: Date.now() }]);
  }, []);

  const connect = useCallback(async () => {
    if (status === 'unsupported') {
      window.alert('您的浏览器不支持蓝牙连接。\n请使用 Chrome 或 Edge，并确保网站使用 HTTPS。');
      return;
    }
    setStatus('connecting');
    try {
      const device: BTDevice = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [HR_SERVICE] }],
      });
      deviceRef.current = device;

      device.addEventListener('gattserverdisconnected', () => {
        setStatus('disconnected');
        setBpm(null);
        setCurrentZone(null);
      });

      const server = await device.gatt!.connect();
      const service = await server.getPrimaryService(HR_SERVICE);
      const char = await service.getCharacteristic(HR_CHAR);
      charRef.current = char;

      await char.startNotifications();
      char.addEventListener('characteristicvaluechanged', onHRChange);
      setStatus('connected');
    } catch (err: any) {
      console.error('[useHeartRate]', err);
      if (err?.name === 'NotFoundError') {
        setStatus('disconnected');
      } else {
        setStatus('error');
      }
    }
  }, [status, onHRChange]);

  const disconnect = useCallback(() => {
    try {
      charRef.current?.removeEventListener('characteristicvaluechanged', onHRChange);
      void charRef.current?.stopNotifications();
      deviceRef.current?.gatt?.disconnect();
    } catch {
      // noop
    }
    deviceRef.current = null;
    charRef.current = null;
    setStatus('disconnected');
    setBpm(null);
    setCurrentZone(null);
  }, [onHRChange]);

  const clearSamples = useCallback(() => setSamples([]), []);

  const getStats = useCallback(() => {
    if (!samples.length) return null;
    const bpms = samples.map((s) => s.bpm);
    const avg = Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length);
    const zd: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    samples.forEach((s) => {
      if (s.zone) zd[s.zone]++;
    });
    return { avgBpm: avg, maxBpm: Math.max(...bpms), minBpm: Math.min(...bpms), zoneDurations: zd };
  }, [samples]);

  useEffect(() => () => {
    disconnect();
  }, [disconnect]);

  return { status, bpm, currentZone, profile, samples, connect, disconnect, setClientProfile, getStats, clearSamples };
}
