import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { loadClients, saveClients } from '@/lib/store';
import type { Client } from '@/lib/db';

interface MacroTarget {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface DietPlan {
  id: string;
  title: string;
  period: string;
  target: MacroTarget;
  notes: string;
  meals: MealTemplate[];
  createdAt: string;
}

interface MealTemplate {
  name: string;
  time: string;
  items: FoodItem[];
}

interface FoodItem {
  name: string;
  amount: string;
  calories: number;
  protein: number;
}

interface DailyLog {
  id: string;
  date: string;
  meals: DailyMeal[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  note: string;
  compliance: boolean;
}

interface DailyMeal {
  name: string;
  items: FoodItem[];
}

interface SuggestedMealCard {
  key: string;
  label: string;
  title: string;
  kcal: number;
  time: string;
  tags: string[];
  bg: string;
}

interface MicronutrientRow {
  name: string;
  value: string;
  pct: number;
}

function genId(p: string) {
  return `${p}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function calcCompliance(log: DailyLog, target: MacroTarget): boolean {
  const calPct = log.totalCalories / target.calories;
  const proPct = log.totalProtein / target.protein;
  return calPct >= 0.85 && calPct <= 1.15 && proPct >= 0.85;
}

function NewPlanForm({ onSave, onCancel }: { onSave: (p: DietPlan) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    title: '', period: '', notes: '',
    calories: '', protein: '', carbs: '', fat: '',
  });
  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const save = () => {
    if (!form.title || !form.calories) return;
    onSave({
      id: genId('dp'),
      title: form.title,
      period: form.period,
      notes: form.notes,
      target: {
        calories: +form.calories || 0,
        protein: +form.protein || 0,
        carbs: +form.carbs || 0,
        fat: +form.fat || 0,
      },
      meals: [],
      createdAt: new Date().toLocaleDateString('zh-CN'),
    });
  };

  const inputStyle: React.CSSProperties = {
    height: 38, padding: '0 10px', borderRadius: 7,
    border: '1px solid var(--color-border-secondary)',
    background: 'var(--color-background-secondary)',
    fontSize: 13, color: 'var(--color-text-primary)', width: '100%',
    outline: 'none',
  };

  return (
    <div style={{ padding: '14px 16px', background: 'var(--color-background-secondary)', borderRadius: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>新建阶段方案</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>方案名称 *</div><input style={inputStyle} placeholder="如：减脂阶段 Phase 1" value={form.title} onChange={f('title')} /></div>
        <div><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>执行周期</div><input style={inputStyle} placeholder="如：Week 1–4" value={form.period} onChange={f('period')} /></div>
        <div><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>热量目标 (kcal) *</div><input style={inputStyle} type="number" placeholder="1800" value={form.calories} onChange={f('calories')} /></div>
        <div><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>蛋白质 (g)</div><input style={inputStyle} type="number" placeholder="150" value={form.protein} onChange={f('protein')} /></div>
        <div><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>碳水 (g)</div><input style={inputStyle} type="number" placeholder="180" value={form.carbs} onChange={f('carbs')} /></div>
        <div><div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>脂肪 (g)</div><input style={inputStyle} type="number" placeholder="60" value={form.fat} onChange={f('fat')} /></div>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>饮食原则</div>
        <textarea
          style={{ ...inputStyle, height: 60, padding: '8px 10px', resize: 'vertical' as const }}
          placeholder="如：以高蛋白低碳水为主，控制精制糖摄入..."
          value={form.notes}
          onChange={f('notes')}
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Button variant="outline" onClick={onCancel} type="button">取消</Button>
        <Button onClick={save} type="button">创建方案</Button>
      </div>
    </div>
  );
}

function DailyLogForm({ onSave, onCancel }: { onSave: (log: DailyLog) => void; onCancel: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [meals, setMeals] = useState([
    { name: '早餐', items: [{ name: '', amount: '', calories: 0, protein: 0 }] },
    { name: '午餐', items: [{ name: '', amount: '', calories: 0, protein: 0 }] },
    { name: '晚餐', items: [{ name: '', amount: '', calories: 0, protein: 0 }] },
  ]);
  const [totalCarbs, setTotalCarbs] = useState('');
  const [totalFat, setTotalFat] = useState('');
  const [note, setNote] = useState('');

  const totalCal = meals.flatMap(m => m.items).reduce((s, i) => s + (+i.calories || 0), 0);
  const totalPro = meals.flatMap(m => m.items).reduce((s, i) => s + (+i.protein || 0), 0);

  const updateItem = (mi: number, ii: number, key: string, val: string) => {
    setMeals(prev => prev.map((m, idx) =>
      idx !== mi ? m : {
        ...m,
        items: m.items.map((item, jdx) =>
          jdx !== ii ? item : { ...item, [key]: key === 'name' || key === 'amount' ? val : +val || 0 },
        ),
      },
    ));
  };

  const addItem = (mi: number) => {
    setMeals(prev => prev.map((m, idx) =>
      idx !== mi ? m : { ...m, items: [...m.items, { name: '', amount: '', calories: 0, protein: 0 }] },
    ));
  };

  const save = () => {
    const log: DailyLog = {
      id: genId('dl'),
      date,
      meals: meals.map(m => ({ name: m.name, items: m.items.filter(i => i.name) })),
      totalCalories: totalCal,
      totalProtein: totalPro,
      totalCarbs: +totalCarbs || 0,
      totalFat: +totalFat || 0,
      note,
      compliance: false,
    };
    onSave(log);
  };

  const inputSm: React.CSSProperties = {
    height: 30, padding: '0 8px', borderRadius: 6,
    border: '1px solid var(--color-border-secondary)',
    background: 'var(--color-background-secondary)',
    fontSize: 12, color: 'var(--color-text-primary)',
    outline: 'none',
  };

  return (
    <div style={{ padding: 16, background: 'var(--color-background-secondary)', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>添加今日饮食记录</div>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputSm, width: 140 }} />
      </div>

      {meals.map((meal, mi) => (
        <div key={mi} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: 5 }}>{meal.name}</div>
          {meal.items.map((item, ii) => (
            <div key={ii} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 60px 60px 20px', gap: 5, marginBottom: 5 }}>
              <input style={inputSm} placeholder="食物名称" value={item.name} onChange={e => updateItem(mi, ii, 'name', e.target.value)} />
              <input style={inputSm} placeholder="100g" value={item.amount} onChange={e => updateItem(mi, ii, 'amount', e.target.value)} />
              <input style={inputSm} type="number" placeholder="kcal" value={item.calories || ''} onChange={e => updateItem(mi, ii, 'calories', e.target.value)} />
              <input style={inputSm} type="number" placeholder="蛋白g" value={item.protein || ''} onChange={e => updateItem(mi, ii, 'protein', e.target.value)} />
              <button type="button" onClick={() => setMeals(prev => prev.map((m, idx) => idx !== mi ? m : { ...m, items: m.items.filter((_, jdx) => jdx !== ii) }))} style={{ fontSize: 14, color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => addItem(mi)} style={{ fontSize: 11, color: 'var(--color-text-info)', background: 'none', border: 'none', cursor: 'pointer' }}>+ 添加食物</button>
        </div>
      ))}

      <Separator style={{ margin: '10px 0' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>碳水估算 (g)</div>
          <input style={{ ...inputSm, width: '100%' }} type="number" value={totalCarbs} onChange={e => setTotalCarbs(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 4 }}>脂肪估算 (g)</div>
          <input style={{ ...inputSm, width: '100%' }} type="number" value={totalFat} onChange={e => setTotalFat(e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {[
          { label: '总热量', value: `${totalCal} kcal`, color: '#7C3AED' },
          { label: '蛋白质', value: `${totalPro}g`, color: '#0D9488' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: '7px', background: 'var(--color-background-primary)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <textarea
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border-secondary)', background: 'var(--color-background-primary)', fontSize: 12, color: 'var(--color-text-primary)', resize: 'none', outline: 'none', height: 50 }}
        placeholder="今日饮食备注..."
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
        <Button variant="outline" onClick={onCancel} type="button">取消</Button>
        <Button onClick={save} type="button">保存记录</Button>
      </div>
    </div>
  );
}

export function DietPage({ selectedClientId }: { selectedClientId: string | null }) {
  const [client, setClient] = useState<Client | null>(null);

  const [activeTab, setActiveTab] = useState<'plans' | 'daily' | 'stats'>('plans');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [showNewLog, setShowNewLog] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  // 生产环境使用相对路径，开发环境使用环境变量
  const isProduction = import.meta.env.PROD;
  const apiBase = isProduction ? '' : ((import.meta as any).env?.VITE_API_BASE_URL || '');
  const apiUrl = (path: string) => (apiBase ? String(apiBase).replace(/\/$/, '') + path : path);

  useEffect(() => {
    const list = loadClients();
    if (!selectedClientId) {
      setClient(list[0] || null);
      return;
    }
    setClient(list.find((c) => c.id === selectedClientId) || null);
  }, [selectedClientId]);

  const persistClient = (next: Client) => {
    const all = loadClients();
    const idx = all.findIndex(c => c.id === next.id);
    if (idx >= 0) all[idx] = next;
    saveClients(all);
    setClient(next);
  };

  const dietPlans: DietPlan[] = (client as any)?.dietPlans || [];
  const dailyLogs: DailyLog[] = (client as any)?.dailyLogs || [];
  const activePlan = dietPlans.find(p => p.id === activePlanId) ?? dietPlans[0] ?? null;

  useEffect(() => {
    if (activePlan && !activePlanId) setActivePlanId(activePlan.id);
  }, [activePlan, activePlanId]);

  const addPlan = (plan: DietPlan) => {
    if (!client) return;
    const next = { ...client, dietPlans: [...dietPlans, plan] } as any;
    persistClient(next);
    setActivePlanId(plan.id);
    setShowNewPlan(false);
  };

  const aiGenPlan = async () => {
    if (!client) return;
    setAiLoading(true);
    setAiError('');
    try {
      const res = await fetch(apiUrl('/api/diet-plan'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: client.name,
          gender: client.gender,
          age: client.age,
          height: client.height,
          weight: client.weight,
          goal: client.goal || '',
          tier: client.tier || 'standard',
          injury: client.injury || '',
        }),
      });
      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const json = isJson ? await res.json() : { error: await res.text() };
      if (!res.ok || json.error) throw new Error(json.error || 'request failed');
      const plan: DietPlan = {
        id: genId('dp'),
        title: json.title || 'AI 生成方案',
        period: json.period || '',
        notes: json.notes || '',
        target: {
          calories: json.calories || 0,
          protein: json.protein || 0,
          carbs: json.carbs || 0,
          fat: json.fat || 0,
        },
        meals: json.meals || [],
        createdAt: new Date().toLocaleDateString('zh-CN'),
      };
      addPlan(plan);
    } catch (e: any) {
      const msg = String(e?.message || '');
      if (msg.includes('did not match the expected pattern')) {
        setAiError('AI 接口地址配置异常，请检查 VITE_API_BASE_URL（例如 https://fikafitness.com）');
      } else {
        setAiError(msg || '生成失败，请检查 API Key');
      }
    } finally {
      setAiLoading(false);
    }
  };

  const addLog = (log: DailyLog) => {
    if (!client || !activePlan) return;
    const logWithCompliance = { ...log, compliance: calcCompliance(log, activePlan.target) };
    const next = { ...client, dailyLogs: [...dailyLogs, logWithCompliance] } as any;
    persistClient(next);
    setShowNewLog(false);
  };

  const last7 = dailyLogs.slice(-7);
  const complianceRate = last7.length > 0
    ? Math.round(last7.filter(l => l.compliance).length / last7.length * 100)
    : null;

  const TABS = [
    { key: 'plans' as const, label: '阶段方案' },
    { key: 'daily' as const, label: '每日记录' },
  ];

  const activePlanIndex = activePlan ? dietPlans.findIndex((p) => p.id === activePlan.id) : -1;

  const suggestedMeals = useMemo<SuggestedMealCard[]>(() => {
    const fallback = [
      {
        key: 'breakfast',
        label: 'Breakfast',
        title: '燕麦蛋白碗',
        kcal: 540,
        time: '07:30',
        tags: ['HIGH-FIBER', 'PROTEIN+'],
        bg: 'linear-gradient(135deg,#dbeafe,#bfdbfe)',
      },
      {
        key: 'lunch',
        label: 'Lunch',
        title: '香煎三文鱼配藜麦',
        kcal: 820,
        time: '12:30',
        tags: ['OMEGA-3', 'RECOVERY'],
        bg: 'linear-gradient(135deg,#cffafe,#a5f3fc)',
      },
      {
        key: 'dinner',
        label: 'Dinner',
        title: '慢炖鸡胸肉沙拉',
        kcal: 680,
        time: '18:30',
        tags: ['LEAN-PRO', 'LOW-GI'],
        bg: 'linear-gradient(135deg,#dcfce7,#bbf7d0)',
      },
      {
        key: 'snack',
        label: 'Snack',
        title: '混合坚果与蛋白奶昔',
        kcal: 310,
        time: '16:00',
        tags: ['PRE-TRAIN', 'FUEL'],
        bg: 'linear-gradient(135deg,#fee2e2,#fecaca)',
      },
    ];

    if (!activePlan?.meals?.length) return fallback;
    const mapping = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];
    return activePlan.meals.slice(0, 4).map((meal, idx) => ({
      key: `${meal.name}-${idx}`,
      label: mapping[idx] || meal.name,
      title: meal.items?.map((i) => i.name).slice(0, 2).join(' · ') || meal.name,
      kcal: meal.items?.reduce((sum, item) => sum + (Number(item.calories) || 0), 0) || 0,
      time: meal.time || ['07:30', '12:30', '18:30', '16:00'][idx] || '--:--',
      tags: [meal.name.toUpperCase().slice(0, 10), idx % 2 ? 'RECOVERY' : 'PERFORM'],
      bg: ['linear-gradient(135deg,#dbeafe,#bfdbfe)', 'linear-gradient(135deg,#cffafe,#a5f3fc)', 'linear-gradient(135deg,#dcfce7,#bbf7d0)', 'linear-gradient(135deg,#fee2e2,#fecaca)'][idx] || 'linear-gradient(135deg,#e2e8f0,#cbd5e1)',
    }));
  }, [activePlan]);

  const micronutrients = useMemo<MicronutrientRow[]>(() => {
    const protein = activePlan?.target.protein || 140;
    const fats = activePlan?.target.fat || 60;
    const magnesium = Math.round(protein * 2.4);
    const d3 = client?.tier === 'ultra' ? 5000 : client?.tier === 'pro' ? 4000 : 3000;
    const omega3 = Math.round(Math.max(1800, fats * 50));
    return [
      { name: 'Magnesium', value: `${magnesium}mg`, pct: Math.min(100, Math.round((magnesium / 500) * 100)) },
      { name: 'Vitamin D3', value: `${d3} IU`, pct: Math.min(100, Math.round((d3 / 5500) * 100)) },
      { name: 'Omega-3', value: `${omega3}mg`, pct: Math.min(100, Math.round((omega3 / 3500) * 100)) },
    ];
  }, [activePlan, client?.tier]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        fontFamily: 'Manrope, "SF Pro Display", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <div className="diet-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 48, lineHeight: 1.1, fontWeight: 900, letterSpacing: '-0.02em', color: '#151a25' }}>饮食管理</div>
          <div style={{ marginTop: 8, fontSize: 24, color: '#4a5268' }}>Dietary management and clinical nutrition programming</div>
        </div>
        <div className="diet-top-controls" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(216,221,236,0.85)',
              background: 'rgba(255,255,255,0.62)',
              minWidth: 250,
            }}
          >
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#0f172a,#64748b)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700 }}>
              {(client?.name || 'CW').slice(0, 2).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, color: '#1f2438', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {client?.name || '当前客户'}
              </div>
              <div style={{ fontSize: 11, color: '#6b7287', marginTop: 1 }}>Elite Endurance · Tier {client?.tier || '1'}</div>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowNewPlan(v => !v)} type="button" style={{ borderRadius: 999 }}>+ 新建阶段</Button>
          <Button
            onClick={aiGenPlan}
            disabled={aiLoading || !client}
            type="button"
            style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', color: '#534AB7', borderRadius: 999 }}
          >
            {aiLoading
              ? <><span className="animate-spin inline-block w-3 h-3 border border-t-transparent rounded-full mr-1" />生成中...</>
              : '⚡ AI 生成方案'}
          </Button>
        </div>
      </div>

      {aiError && (
        <div style={{ fontSize: 12, color: '#DC2626', padding: '8px 10px', background: 'rgba(220,38,38,0.06)', borderRadius: 10 }}>
          {aiError}
          <button type="button" onClick={() => setAiError('')} style={{ marginLeft: 8, fontWeight: 700, cursor: 'pointer', background: 'none', border: 'none', color: '#DC2626' }}>✕</button>
        </div>
      )}

      {showNewPlan && <NewPlanForm onSave={addPlan} onCancel={() => setShowNewPlan(false)} />}

      <div className="diet-main-grid" style={{ display: 'grid', gridTemplateColumns: '220px 1fr 260px', gap: 14, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, background: 'rgba(241,243,248,0.9)', borderRadius: 12, padding: 4 }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                style={{
                  height: 32,
                  flex: 1,
                  borderRadius: 10,
                  border: 'none',
                  fontSize: 12,
                  fontWeight: 700,
                  color: activeTab === t.key ? '#4f56c8' : '#5f677b',
                  background: activeTab === t.key ? '#ffffff' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {dietPlans.length === 0 && (
            <Card style={{ borderRadius: 16, border: '1px solid rgba(216,221,236,0.8)', background: 'rgba(255,255,255,0.58)' }}>
              <CardContent style={{ padding: 14, fontSize: 12, color: '#6b7287' }}>暂无阶段方案，点击 AI 生成方案</CardContent>
            </Card>
          )}

          {dietPlans.map((p, idx) => {
            const state = idx === activePlanIndex ? 'CURRENT PHASE' : idx > activePlanIndex ? 'UPCOMING' : 'COMPLETED';
            const active = p.id === activePlan?.id;
            return (
              <div
                key={p.id}
                onClick={() => setActivePlanId(p.id)}
                style={{
                  padding: '12px 14px',
                  borderRadius: 14,
                  border: `1px solid ${active ? 'rgba(79,86,200,0.48)' : 'rgba(216,221,236,0.85)'}`,
                  background: active ? 'rgba(79,86,200,0.06)' : 'rgba(255,255,255,0.58)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: active ? '#4f56c8' : '#8791a9', fontWeight: 700 }}>{state}</span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{p.period || '--'}</span>
                </div>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: '#1f2438', lineHeight: 1.35 }}>{p.title}</div>
                <div style={{ marginTop: 6, fontSize: 12, color: '#6e778f', lineHeight: 1.4 }}>{p.notes || 'Clinical nutrition progression plan.'}</div>
              </div>
            );
          })}
        </div>

        {activeTab === 'plans' ? (
          <div className="diet-center-pane" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Card className="diet-detail-card" style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.85)', background: 'rgba(255,255,255,0.62)' }}>
              <CardHeader style={{ paddingBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: '#1d2335' }}>
                    {activePlan?.title || 'AI 体能表现营养阶段'} <span style={{ color: '#5d64d6', fontSize: 32 }}>Detail</span>
                  </div>
                  <Button variant="ghost" type="button" onClick={() => setShowNewPlan(true)} style={{ color: '#4f56c8', fontWeight: 700 }}>
                    ✎ Adjust Plan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="diet-nutrient-table-wrap" style={{ overflow: 'hidden', borderRadius: 12, border: '1px solid rgba(216,221,236,0.8)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr', gap: 10, padding: '10px 14px', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#76829d', fontWeight: 700, background: 'rgba(241,243,248,0.9)' }}>
                    <div>Nutrient</div>
                    <div>Target (Daily)</div>
                    <div>Clinical Range</div>
                    <div>Status</div>
                  </div>

                  {[
                    { name: 'Total Calories', target: `${activePlan?.target.calories || 2850} kcal`, range: `${Math.round((activePlan?.target.calories || 2850) * 0.94)} - ${Math.round((activePlan?.target.calories || 2850) * 1.06)}`, status: 'OPTIMIZED', color: '#5d64d6' },
                    { name: 'Protein', target: `${activePlan?.target.protein || 180}g (25%)`, range: `${Math.round((activePlan?.target.protein || 180) * 0.9)}g - ${Math.round((activePlan?.target.protein || 180) * 1.1)}g`, status: 'HIGH', color: '#64748b' },
                    { name: 'Carbohydrates', target: `${activePlan?.target.carbs || 350}g (50%)`, range: `${Math.round((activePlan?.target.carbs || 350) * 0.95)}g - ${Math.round((activePlan?.target.carbs || 350) * 1.08)}g`, status: 'OPTIMIZED', color: '#5d64d6' },
                    { name: 'Fats', target: `${activePlan?.target.fat || 75}g (25%)`, range: `${Math.round((activePlan?.target.fat || 75) * 0.9)}g - ${Math.round((activePlan?.target.fat || 75) * 1.2)}g`, status: 'BALANCED', color: '#a16207' },
                  ].map((row, idx) => (
                    <div key={row.name} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 0.9fr', gap: 10, padding: '12px 14px', background: idx % 2 ? 'rgba(255,255,255,0.74)' : 'rgba(248,250,253,0.74)', borderTop: idx ? '1px solid rgba(226,232,240,0.8)' : 'none' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#20253a' }}>{row.name}</div>
                      <div style={{ fontSize: 13, color: '#3a4358' }}>{row.target}</div>
                      <div style={{ fontSize: 13, color: '#6b7287' }}>{row.range}</div>
                      <div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '4px 8px', borderRadius: 999, color: row.color, background: `${row.color}22` }}>{row.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                <div style={{ fontSize: 38, fontWeight: 800, color: '#1d2335' }}>参考餐单</div>
                <div style={{ fontSize: 30, color: '#4a5268' }}>Suggested Daily Menu</div>
              </div>
              <div className="diet-meal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 }}>
                {suggestedMeals.map((meal) => (
                  <Card key={meal.key} style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(216,221,236,0.85)', background: 'rgba(255,255,255,0.62)' }}>
                    <div style={{ height: 118, background: meal.bg, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 10, top: 10, fontSize: 10, padding: '4px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.86)', color: '#4f56c8', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>{meal.label}</span>
                    </div>
                    <CardContent style={{ padding: '10px 12px' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2438', lineHeight: 1.35 }}>{meal.title}</div>
                      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#5f677b' }}>
                        <span>{meal.kcal} kcal</span>
                        <span>⏱ {meal.time}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                        {meal.tags.map((tag) => (
                          <span key={tag} style={{ fontSize: 9, borderRadius: 999, padding: '2px 6px', background: 'rgba(15,23,42,0.06)', color: '#4b5563', letterSpacing: '.04em' }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#1d2335' }}>每日饮食记录</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6b7287' }}>近7日合规率 {complianceRate !== null ? `${complianceRate}%` : '--'}</span>
                <Button type="button" onClick={() => setShowNewLog((v) => !v)}>{showNewLog ? '取消' : '+ 添加记录'}</Button>
              </div>
            </div>
            {showNewLog && <DailyLogForm onSave={addLog} onCancel={() => setShowNewLog(false)} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[...dailyLogs].reverse().map((log) => (
                <Card key={log.id} style={{ borderRadius: 14, border: '1px solid rgba(216,221,236,0.85)', background: 'rgba(255,255,255,0.62)' }}>
                  <CardContent style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 56, textAlign: 'center', padding: '6px 0', borderRadius: 10, background: 'rgba(241,243,248,0.92)' }}>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{log.date.split('/').slice(-1)[0] || '--'}</div>
                      <div style={{ fontSize: 10, color: '#6b7287' }}>{log.date.slice(0, 5)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                        <span>热量 <b>{log.totalCalories}</b> kcal</span>
                        <span>蛋白 <b>{log.totalProtein}</b>g</span>
                        <span>碳水 <b>{log.totalCarbs}</b>g</span>
                        <span>脂肪 <b>{log.totalFat}</b>g</span>
                      </div>
                      {log.note && <div style={{ marginTop: 4, fontSize: 12, color: '#6b7287' }}>{log.note}</div>}
                    </div>
                    <span style={{ fontSize: 11, borderRadius: 999, padding: '4px 10px', background: log.compliance ? 'rgba(16,185,129,0.12)' : 'rgba(148,163,184,0.16)', color: log.compliance ? '#065f46' : '#64748b', fontWeight: 700 }}>
                      {log.compliance ? '达标' : '未达标'}
                    </span>
                  </CardContent>
                </Card>
              ))}
              {dailyLogs.length === 0 && (
                <Card style={{ borderRadius: 14, border: '1px dashed rgba(148,163,184,0.4)', background: 'rgba(255,255,255,0.52)' }}>
                  <CardContent style={{ padding: 24, textAlign: 'center', color: '#6b7287', fontSize: 13 }}>暂无每日记录</CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        <Card style={{ borderRadius: 20, border: '1px solid rgba(216,221,236,0.85)', background: 'rgba(255,255,255,0.62)' }}>
          <CardHeader style={{ paddingBottom: 8 }}>
            <CardTitle style={{ fontSize: 18 }}>重点微量营养素 / Focus Micronutrients</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {micronutrients.map((m) => (
                <div key={m.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: '#1f2438' }}>{m.name}</span>
                    <span style={{ color: '#4f56c8', fontWeight: 700 }}>{m.value}</span>
                  </div>
                  <div style={{ marginTop: 6, height: 5, borderRadius: 999, background: 'rgba(148,163,184,0.22)', overflow: 'hidden' }}>
                    <div style={{ width: `${m.pct}%`, height: '100%', background: '#5d64d6' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, fontSize: 12, color: '#4f56c8', fontStyle: 'italic', lineHeight: 1.5, background: 'rgba(93,100,214,0.08)', border: '1px solid rgba(93,100,214,0.22)', padding: '10px 12px', borderRadius: 10 }}>
              "Increase anti-inflammatory fats post-workout to reduce oxidative stress."
            </div>
          </CardContent>
        </Card>
      </div>

      <style>{`
        @media (max-width: 1280px) {
          .diet-main-grid {
            grid-template-columns: 200px 1fr 240px !important;
          }
          .diet-meal-grid {
            grid-template-columns: repeat(3, minmax(0,1fr)) !important;
          }
        }

        @media (max-width: 1024px) and (min-width: 820px) {
          .diet-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .diet-top-controls {
            width: 100%;
            justify-content: flex-start;
          }
          .diet-main-grid {
            grid-template-columns: 210px 1fr !important;
          }
          .diet-micro-card {
            grid-column: 1 / -1;
          }
          .diet-meal-grid {
            grid-template-columns: repeat(2, minmax(0,1fr)) !important;
          }
          .diet-detail-card {
            border-radius: 16px !important;
          }
          .diet-nutrient-table-wrap {
            overflow-x: auto !important;
          }
        }

        @media (max-width: 819px) {
          .diet-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .diet-top-controls {
            width: 100%;
            justify-content: flex-start;
          }
          .diet-main-grid {
            grid-template-columns: 1fr !important;
          }
          .diet-meal-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
