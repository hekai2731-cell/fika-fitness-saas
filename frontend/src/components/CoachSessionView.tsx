/**
 * CoachSessionView.tsx — UI 完整重写
 * 布局、视觉、动效全部重新设计，业务逻辑与 props 接口保持不变
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Client } from '@/lib/db';
import { useHeartRate } from '@/hooks/useHeartRate';
import { ZONE_COLORS, ZONE_BG } from '@/lib/heartRateUtils';

// ─── 类型（与原版完全一致）────────────────────────────────
interface ExerciseSet {
  num: number;
  weight: string;
  reps: string;
  done: boolean;
}

interface Exercise {
  id: string;
  name: string;
  nameEn?: string;
  groupTag?: string;
  sectionTitle: string;
  sectionFormat?: string;
  restSeconds: number;
  rhythm?: string;
  cue?: string;
  dyline?: string;
  sets: ExerciseSet[];
  notes?: string;
}

interface RecordedSession {
  date: string;
  day: string;
  week: number;
  level: number;
  duration: number;
  rpe: number;
  performance: string;
  price: number;
  note: string;
  hrAvg?: number;
  hrMax?: number;
  hrMin?: number;
  hrZoneDurations?: Record<number, number>;
  kcal?: number;
  actual_weights?: number[];
  coach_notes?: string;
  post_assessment?: { weight?: number; body_fat_pct?: number; rhr?: number };
}

interface CoachSessionViewProps {
  client: Client;
  coachCode?: string;
  onClose: () => void;
  onRecordSession: (session: RecordedSession) => Promise<void>;
  onCancelSession?: () => void;
}

// ─── 工具 ────────────────────────────────────────────────
function genId() { return `ex-${Date.now()}-${Math.floor(Math.random() * 999)}`; }

function fmt(secs: number) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

const TAG_COLORS: Record<string, string> = {
  A: '#7C3AED', B: '#0D9488', C: '#D97706', D: '#DC2626', E: '#2563EB', F: '#9333EA',
};
function tagColor(tag?: string) {
  if (!tag) return '#6B7280';
  return TAG_COLORS[tag[0]] || '#6B7280';
}

function parsePlan(client: Client): Exercise[] {
  const blocks = (client as any).blocks || [];
  const exs: Exercise[] = [];
  for (const b of blocks) {
    for (const w of (b.training_weeks || b.weeks || [])) {
      for (const d of (w.days || [])) {
        const mods = (d as any).modules || [];
        for (const mod of mods) {
          for (const ex of (mod.exercises || [])) {
            const sets = ex.sets || 3;
            exs.push({
              id: ex.id || genId(),
              name: ex.name || '',
              nameEn: ex.name_en || ex.nameEn || '',
              groupTag: ex.group_tag || ex.groupTag || '',
              sectionTitle: mod.module_name || mod.name || '',
              sectionFormat: mod.format || '',
              restSeconds: ex.rest_seconds || ex.restSeconds || 0,
              rhythm: ex.rhythm || '',
              cue: ex.cue || '',
              dyline: ex.dyline || '',
              sets: Array.from({ length: typeof sets === 'number' ? sets : 3 }, (_, i) => ({
                num: i + 1,
                reps: String(ex.reps || '10'),
                weight: ex.weight || '',
                done: false,
              })),
            });
          }
        }
        if (exs.length > 0) return exs;
      }
    }
  }
  return exs;
}

// ─── 样式常量 ─────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');

.csv-root *{box-sizing:border-box;margin:0;padding:0;}
.csv-root{
  position:fixed;inset:0;z-index:100;
  font-family:'DM Sans',-apple-system,'PingFang SC',sans-serif;
  background:#f4f5f8;color:#181a24;
  display:flex;flex-direction:column;
  -webkit-font-smoothing:antialiased;
}

/* progress strip */
.csv-strip{height:3px;background:#ececf1;flex-shrink:0;position:relative}
.csv-strip-fill{
  height:100%;
  background:linear-gradient(90deg,#5B5FE8,#FF5C35);
  border-radius:0 3px 3px 0;
  transition:width .8s cubic-bezier(.4,0,.2,1);
  position:relative;
}
.csv-strip-fill::after{
  content:'';position:absolute;right:-4px;top:-3px;
  width:9px;height:9px;border-radius:50%;
  background:#FF5C35;
  box-shadow:0 0 0 3px rgba(255,92,53,.2),0 0 12px rgba(255,92,53,.5);
  animation:csv-pulse 2s ease-in-out infinite;
}
@keyframes csv-pulse{
  0%,100%{box-shadow:0 0 0 3px rgba(255,92,53,.2),0 0 12px rgba(255,92,53,.5)}
  50%{box-shadow:0 0 0 6px rgba(255,92,53,.1),0 0 20px rgba(255,92,53,.7)}
}

/* three-column body */
.csv-body{flex:1;display:grid;grid-template-columns:260px 1fr 380px;overflow:hidden;}

/* ── LEFT ── */
.csv-left{background:#fff;border-right:1px solid #ececf1;display:flex;flex-direction:column;overflow:hidden;}
.csv-client-pill{
  margin:14px 14px 0;padding:12px 14px;border-radius:16px;
  background:#f8f8fa;border:1px solid #ececf1;
  display:flex;align-items:center;gap:10px;flex-shrink:0;
}
.csv-avatar{
  width:36px;height:36px;border-radius:50%;flex-shrink:0;
  background:linear-gradient(135deg,#5B5FE8,#8B8FFF);
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:800;color:#fff;
}
.csv-cname{font-size:13px;font-weight:700;color:#181a24;letter-spacing:-.01em;}
.csv-csub{font-size:10px;color:#757a91;margin-top:1px;font-family:'DM Mono',monospace;}
.csv-exlist{flex:1;overflow-y:auto;padding:8px 0;scrollbar-width:thin;scrollbar-color:#ececf1 transparent;}
.csv-sec-label{padding:10px 18px 4px;font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b8bccb;}
.csv-ex-btn{
  width:100%;text-align:left;padding:9px 18px;border:none;background:transparent;cursor:pointer;
  display:flex;align-items:center;gap:10px;position:relative;transition:background .12s;
}
.csv-ex-btn:hover{background:#f8f8fa;}
.csv-ex-btn.active{background:rgba(91,95,232,.1);}
.csv-ex-btn.active::before{
  content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);
  width:3px;height:65%;background:#5B5FE8;border-radius:0 3px 3px 0;
}
.csv-ex-btn.done{opacity:.45;}
.csv-ex-indicator{
  width:20px;height:20px;border-radius:50%;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  background:#f4f5f8;font-size:9px;color:#b8bccb;transition:all .2s;
}
.csv-ex-btn.active .csv-ex-indicator{background:rgba(91,95,232,.1);color:#5B5FE8;}
.csv-ex-btn.done .csv-ex-indicator{background:rgba(20,184,122,.1);color:#14B87A;font-size:11px;}
.csv-ex-info{flex:1;min-width:0;}
.csv-ex-n{font-size:12px;font-weight:600;color:#45495e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .12s;}
.csv-ex-btn.active .csv-ex-n{color:#5B5FE8;font-weight:700;}
.csv-ex-p{font-size:9px;color:#b8bccb;margin-top:2px;font-family:'DM Mono',monospace;}
.csv-tag-pill{font-size:8px;font-weight:800;padding:2px 6px;border-radius:5px;flex-shrink:0;letter-spacing:.04em;}
.csv-end-btn{
  margin:10px 14px 14px;padding:10px;border-radius:12px;
  background:rgba(239,60,77,.1);border:1.5px solid rgba(239,60,77,.2);
  color:#EF3C4D;font-size:12px;font-weight:700;cursor:pointer;
  display:flex;align-items:center;justify-content:center;gap:6px;
  font-family:inherit;transition:all .15s;flex-shrink:0;
}
.csv-end-btn:hover{background:rgba(239,60,77,.18);border-color:rgba(239,60,77,.35);}

/* ── CENTER ── */
.csv-center{display:flex;flex-direction:column;overflow:hidden;background:#f4f5f8;}
.csv-hero{
  padding:22px 26px 18px;flex-shrink:0;background:#fff;
  border-bottom:1px solid #ececf1;position:relative;overflow:hidden;
}
.csv-hero::before{
  content:'';position:absolute;top:-40px;right:-20px;
  width:180px;height:180px;border-radius:50%;
  background:radial-gradient(circle,rgba(91,95,232,.06) 0%,transparent 70%);
  pointer-events:none;
}
.csv-hero-tags{display:flex;gap:6px;align-items:center;margin-bottom:12px;flex-wrap:wrap;}
.csv-tag-module{font-size:9px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.06em;text-transform:uppercase;}
.csv-tag-rhythm{
  display:inline-flex;align-items:center;gap:3px;
  font-size:9px;font-weight:700;padding:3px 9px;border-radius:20px;
  background:rgba(245,166,35,.1);color:#F5A623;border:1px solid rgba(245,166,35,.2);
  font-family:'DM Mono',monospace;
}
.csv-note-btn{
  font-size:9px;font-weight:700;padding:3px 9px;border-radius:20px;
  background:#f4f5f8;border:1px solid #ececf1;color:#757a91;
  cursor:pointer;transition:all .12s;font-family:inherit;
}
.csv-note-btn.active{background:rgba(20,184,122,.1);border-color:rgba(20,184,122,.25);color:#14B87A;}
.csv-ex-name-big{
  font-size:clamp(2rem,3.2vw,2.8rem);font-weight:900;color:#181a24;
  line-height:1.05;letter-spacing:-.03em;
  animation:csv-name-in .3s ease;
}
@keyframes csv-name-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.csv-ex-name-en{font-size:12px;color:#b8bccb;font-weight:300;margin-top:4px;}
.csv-cue-card{
  margin-top:14px;padding:13px 16px;border-radius:12px;
  background:linear-gradient(135deg,rgba(91,95,232,.06),rgba(91,95,232,.03));
  border:1px solid rgba(91,95,232,.15);
}
.csv-cue-lbl{font-size:8px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:rgba(91,95,232,.5);margin-bottom:6px;}
.csv-cue-txt{font-size:13px;font-weight:600;color:rgba(91,95,232,.85);line-height:1.55;}
.csv-dy-btn{
  margin-top:10px;font-size:10px;color:#757a91;background:none;border:none;cursor:pointer;
  display:flex;align-items:center;gap:4px;padding:0;font-family:inherit;transition:color .12s;
}
.csv-dy-btn:hover{color:#45495e;}
.csv-dy-arrow{display:inline-block;transition:transform .2s;font-style:normal;}
.csv-dy-arrow.open{transform:rotate(90deg);}
.csv-dy-content{
  overflow:hidden;max-height:0;opacity:0;
  transition:max-height .3s ease,opacity .3s ease;
}
.csv-dy-content.open{max-height:80px;opacity:1;}
.csv-dy-inner{
  margin-top:6px;padding:9px 12px;border-radius:8px;
  background:rgba(245,166,35,.08);border:1px solid rgba(245,166,35,.15);
  font-size:11px;color:rgba(180,120,20,.9);font-style:italic;line-height:1.55;
}
.csv-notes-wrap{
  overflow:hidden;max-height:0;opacity:0;
  transition:max-height .3s ease,opacity .3s ease;
}
.csv-notes-wrap.open{max-height:80px;opacity:1;margin-top:10px;}
.csv-notes-ta{
  width:100%;padding:9px 11px;border-radius:8px;resize:none;outline:none;
  background:rgba(20,184,122,.08);border:1px solid rgba(20,184,122,.2);
  color:#45495e;font-size:11px;font-family:inherit;line-height:1.5;
}
.csv-notes-ta::placeholder{color:#b8bccb;}

/* sets */
.csv-sets-area{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#f4f5f8;}
.csv-sets-header{
  padding:12px 22px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
}
.csv-sets-cols{display:flex;gap:8px;align-items:center;font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b8bccb;}
.csv-add-set{
  font-size:11px;font-weight:700;color:#5B5FE8;
  background:rgba(91,95,232,.1);border:1.5px solid rgba(91,95,232,.2);
  border-radius:8px;padding:5px 12px;cursor:pointer;font-family:inherit;transition:all .12s;
}
.csv-add-set:hover{background:rgba(91,95,232,.18);}
.csv-sets-scroll{flex:1;overflow-y:auto;padding:0 18px 12px;scrollbar-width:thin;scrollbar-color:#ececf1 transparent;display:flex;flex-direction:column;gap:6px;}
.csv-set-row{
  display:flex;align-items:center;gap:8px;
  padding:10px 14px;border-radius:12px;
  background:#fff;border:1.5px solid #ececf1;
  transition:all .2s cubic-bezier(.34,1.56,.64,1);
  animation:csv-set-in .25s ease both;
}
@keyframes csv-set-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
.csv-set-row.is-current{border-color:#5B5FE8;background:rgba(91,95,232,.04);box-shadow:0 0 0 3px rgba(91,95,232,.08);}
.csv-set-row.is-done{background:rgba(20,184,122,.08);border-color:rgba(20,184,122,.22);opacity:.72;}
.csv-set-num{width:24px;text-align:center;font-size:13px;font-weight:800;color:#b8bccb;font-family:'DM Mono',monospace;flex-shrink:0;transition:color .2s;}
.csv-set-row.is-current .csv-set-num{color:#5B5FE8;}
.csv-set-row.is-done .csv-set-num{color:#14B87A;font-size:15px;}
.csv-set-inputs{display:flex;align-items:center;gap:6px;flex:1;}
.csv-set-in{
  width:62px;height:34px;text-align:center;
  font-size:14px;font-family:'DM Mono',monospace;font-weight:600;
  background:#f8f8fa;border:1.5px solid #ececf1;border-radius:8px;
  color:#181a24;outline:none;transition:all .15s;
}
.csv-set-in:focus{border-color:#5B5FE8;background:rgba(91,95,232,.04);box-shadow:0 0 0 3px rgba(91,95,232,.1);}
.csv-set-in:disabled{color:#b8bccb;opacity:.6;}
.csv-set-unit{font-size:9px;color:#b8bccb;font-weight:600;flex-shrink:0;}
.csv-del-btn{
  width:28px;height:28px;border-radius:8px;border:none;background:transparent;
  color:rgba(239,60,77,.35);cursor:pointer;font-size:15px;
  display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .12s;
}
.csv-del-btn:hover{background:rgba(239,60,77,.1);color:#EF3C4D;}
.csv-check-btn{
  width:36px;height:36px;border-radius:8px;border:none;cursor:pointer;
  font-size:15px;font-weight:800;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  transition:all .2s cubic-bezier(.34,1.56,.64,1);font-family:inherit;
}
.csv-check-btn.pending{background:#f4f5f8;color:#b8bccb;border:1.5px solid #ececf1;}
.csv-check-btn.current{background:#5B5FE8;color:#fff;border:none;box-shadow:0 4px 16px rgba(91,95,232,.4);}
.csv-check-btn.current:hover{box-shadow:0 6px 20px rgba(91,95,232,.55);transform:scale(1.08);}
.csv-check-btn.done-s{background:rgba(20,184,122,.1);color:#14B87A;border:1.5px solid rgba(20,184,122,.25);}

/* action bar */
.csv-action-bar{padding:13px 18px 15px;flex-shrink:0;background:#fff;border-top:1px solid #ececf1;}
.csv-nav-row{display:flex;align-items:center;gap:8px;}
.csv-nav-btn{
  width:46px;height:54px;border-radius:12px;background:#f4f5f8;
  border:1.5px solid #ececf1;color:#45495e;cursor:pointer;
  display:flex;align-items:center;justify-content:center;transition:all .12s;flex-shrink:0;
}
.csv-nav-btn:hover:not(:disabled){background:#ececf1;}
.csv-nav-btn:disabled{opacity:.3;cursor:not-allowed;}
.csv-main-btn{
  flex:1;height:54px;border-radius:16px;border:none;cursor:pointer;
  font-family:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  position:relative;overflow:hidden;transition:all .2s;
}
.csv-main-btn::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.12),transparent);pointer-events:none;}
.csv-main-btn.orange{background:linear-gradient(135deg,#FF5C35,#FF8040);box-shadow:0 6px 24px rgba(255,92,53,.4);}
.csv-main-btn.green{background:linear-gradient(135deg,#14B87A,#1FD090);box-shadow:0 6px 24px rgba(20,184,122,.4);}
.csv-main-btn:active{transform:scale(.97);}
.csv-act-lbl{font-size:14px;font-weight:800;color:#fff;letter-spacing:-.01em;}
.csv-act-sub{font-size:9px;color:rgba(255,255,255,.5);letter-spacing:.04em;}
.csv-next-hint{text-align:center;margin-top:8px;font-size:10px;color:#b8bccb;}
.csv-next-hint span{color:#45495e;font-weight:600;}
.csv-cancel-tiny{
  display:block;text-align:center;margin-top:5px;font-size:10px;
  color:rgba(239,60,77,.3);background:none;border:none;cursor:pointer;
  font-family:inherit;transition:color .12s;
}
.csv-cancel-tiny:hover{color:rgba(239,60,77,.7);}

/* ── RIGHT ── */
.csv-right{
  background:#f8f8fa;border-left:1px solid #ececf1;
  display:flex;flex-direction:column;overflow-y:auto;
  scrollbar-width:none;padding:16px;gap:12px;
}
.csv-connect-zone{
  padding:22px 20px;border-radius:20px;background:#fff;
  border:1.5px solid #ececf1;text-align:center;
}
.csv-connect-icon{
  width:52px;height:52px;border-radius:50%;margin:0 auto 12px;
  background:linear-gradient(135deg,rgba(91,95,232,.1),rgba(91,95,232,.05));
  border:1.5px solid rgba(91,95,232,.15);
  display:flex;align-items:center;justify-content:center;
}
.csv-connect-lbl{font-size:12px;color:#757a91;margin-bottom:14px;line-height:1.55;}
.csv-connect-btn{
  padding:9px 24px;border-radius:12px;
  background:rgba(91,95,232,.1);border:1.5px solid rgba(91,95,232,.25);
  color:#5B5FE8;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:all .15s;
}
.csv-connect-btn:hover{background:rgba(91,95,232,.18);}
.csv-connect-btn:disabled{opacity:.6;cursor:not-allowed;}
.csv-timer-card{padding:22px 20px;border-radius:20px;background:#fff;border:1.5px solid #ececf1;text-align:center;}
.csv-big-timer{font-size:54px;font-weight:900;font-family:'DM Mono',monospace;color:#181a24;line-height:1;letter-spacing:.04em;}
.csv-timer-lbl{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b8bccb;margin-top:6px;}
.csv-prog-card{padding:18px;border-radius:20px;background:#fff;border:1.5px solid #ececf1;}
.csv-prog-label{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b8bccb;margin-bottom:12px;}
.csv-prog-row{display:flex;align-items:center;gap:14px;}
.csv-prog-ring{position:relative;width:64px;height:64px;flex-shrink:0;}
.csv-prog-ring svg{position:absolute;inset:0;}
.csv-prog-pct{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:800;color:#181a24;font-family:'DM Mono',monospace;
}
.csv-prog-info{flex:1;}
.csv-prog-main{font-size:28px;font-weight:900;color:#181a24;line-height:1;}
.csv-prog-main span{font-size:13px;color:#b8bccb;font-weight:400;}
.csv-prog-bar{height:5px;background:#f4f5f8;border-radius:3px;margin-top:8px;overflow:hidden;}
.csv-prog-fill{height:100%;background:linear-gradient(90deg,#5B5FE8,#FF5C35);border-radius:3px;transition:width .8s cubic-bezier(.4,0,.2,1);}
.csv-notes-card{padding:16px;border-radius:20px;background:#fff;border:1.5px solid #ececf1;flex:1;display:flex;flex-direction:column;}
.csv-notes-lbl{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b8bccb;margin-bottom:10px;}
.csv-quick-ta{flex:1;resize:none;outline:none;border:none;background:transparent;color:#45495e;font-size:12px;font-family:inherit;line-height:1.6;min-height:80px;}
.csv-quick-ta::placeholder{color:#b8bccb;}

/* HR live */
.csv-hr-ring-card{padding:22px 18px;border-radius:20px;background:#fff;border:1.5px solid #ececf1;display:flex;flex-direction:column;align-items:center;gap:14px;}
.csv-hr-ring-wrap{position:relative;width:180px;height:180px;}
.csv-hr-ring-wrap svg{position:absolute;inset:0;transform:rotate(-90deg);}
.csv-hr-track{fill:none;stroke:#f4f5f8;stroke-width:10;}
.csv-hr-fill{fill:none;stroke-width:10;stroke-linecap:round;stroke-dasharray:502;stroke-dashoffset:200;transition:stroke-dashoffset .5s ease,stroke .3s ease;}
.csv-hr-inner{
  position:absolute;inset:16px;border-radius:50%;background:#f8f8fa;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  border:1px solid #ececf1;
}
.csv-hr-num{font-size:50px;font-weight:900;line-height:1;color:#181a24;font-family:'DM Mono',monospace;letter-spacing:-.02em;}
.csv-hr-unit{font-size:9px;font-weight:700;letter-spacing:.14em;color:#b8bccb;margin-top:3px;}
.csv-hr-zone-pill{font-size:11px;font-weight:700;padding:5px 16px;border-radius:20px;background:#f4f5f8;color:#757a91;transition:all .3s;}
.csv-hr-stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;}
.csv-hr-stat{padding:11px 12px;border-radius:12px;background:#f8f8fa;border:1.5px solid #ececf1;}
.csv-hr-stat-v{font-size:24px;font-weight:900;color:#181a24;font-family:'DM Mono',monospace;}
.csv-hr-stat-l{font-size:9px;color:#b8bccb;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-top:3px;}
.csv-zone-card{padding:14px;border-radius:16px;background:#fff;border:1.5px solid #ececf1;}
.csv-zone-title{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#b8bccb;margin-bottom:10px;}
.csv-z-row{display:flex;align-items:center;gap:8px;margin-bottom:7px;}
.csv-z-dot{width:6px;height:6px;border-radius:50%;flex-shrink:0;}
.csv-z-name{font-size:10px;color:#757a91;width:52px;flex-shrink:0;font-weight:500;}
.csv-z-track{flex:1;height:5px;background:#f4f5f8;border-radius:3px;overflow:hidden;}
.csv-z-fill{height:100%;border-radius:3px;transition:width 1s ease;}
.csv-z-dur{font-size:10px;color:#b8bccb;font-family:'DM Mono',monospace;width:32px;text-align:right;flex-shrink:0;}
.csv-disconnect-btn{font-size:11px;padding:7px 14px;border-radius:10px;background:#f4f5f8;border:1.5px solid #ececf1;color:#757a91;cursor:pointer;font-family:inherit;}

/* ── COUNTDOWN OVERLAY ── */
.csv-cd-overlay{
  position:absolute;inset:0;z-index:50;
  background:rgba(248,248,250,.94);backdrop-filter:blur(28px);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
}
.csv-cd-ring{position:relative;width:220px;height:220px;animation:csv-ring-in .4s cubic-bezier(.34,1.56,.64,1);}
@keyframes csv-ring-in{from{transform:scale(.7);opacity:0}to{transform:scale(1);opacity:1}}
.csv-cd-ring svg{position:absolute;inset:0;transform:rotate(-90deg);}
.csv-cd-track{fill:none;stroke:#ececf1;stroke-width:6;}
.csv-cd-arc{fill:none;stroke:#5B5FE8;stroke-width:6;stroke-linecap:round;stroke-dasharray:659;stroke-dashoffset:0;transition:stroke-dashoffset .7s cubic-bezier(.4,0,.2,1),stroke .3s;}
.csv-cd-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;}
.csv-cd-num{font-size:80px;font-weight:900;color:#181a24;line-height:1;font-family:'DM Mono',monospace;letter-spacing:-.03em;transition:all .2s cubic-bezier(.34,1.56,.64,1);}
.csv-cd-num.go{font-size:64px;color:#5B5FE8;animation:csv-go-bounce .5s cubic-bezier(.34,1.56,.64,1);}
@keyframes csv-go-bounce{0%{transform:scale(.8)}60%{transform:scale(1.12)}100%{transform:scale(1)}}
.csv-cd-sub{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#b8bccb;}
.csv-cd-card{
  display:flex;align-items:center;gap:12px;
  padding:12px 20px;border-radius:16px;background:#fff;
  border:1.5px solid #ececf1;box-shadow:0 2px 12px rgba(24,26,36,.06);
  animation:csv-fade-up .5s ease .3s both;
}
@keyframes csv-fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.csv-cd-avatar{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#5B5FE8,#8B8FFF);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:#fff;}
.csv-cd-cname{font-size:14px;font-weight:700;color:#181a24;}
.csv-cd-plan{font-size:11px;color:#757a91;margin-top:2px;}

/* ── REST OVERLAY ── */
.csv-rest-overlay{
  position:absolute;inset:0;z-index:40;
  background:rgba(24,26,36,.9);backdrop-filter:blur(24px);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;
}
.csv-rest-lbl{font-size:10px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.3);}
.csv-rest-ring{position:relative;width:240px;height:240px;}
.csv-rest-ring svg{position:absolute;inset:0;transform:rotate(-90deg);}
.csv-rest-track{fill:none;stroke:rgba(255,255,255,.08);stroke-width:8;}
.csv-rest-arc{fill:none;stroke:#FF5C35;stroke-width:8;stroke-linecap:round;stroke-dasharray:714;stroke-dashoffset:0;transition:stroke-dashoffset .9s linear;filter:drop-shadow(0 0 8px rgba(255,92,53,.5));}
.csv-rest-inner{position:absolute;inset:20px;border-radius:50%;background:rgba(255,255,255,.04);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(255,255,255,.08);}
.csv-rest-num{font-size:80px;font-weight:900;font-family:'DM Mono',monospace;color:#fff;line-height:1;letter-spacing:-.02em;}
.csv-rest-unit{font-size:9px;font-weight:700;letter-spacing:.16em;color:rgba(255,255,255,.3);text-transform:uppercase;}
.csv-next-up{
  display:flex;flex-direction:column;
  padding:14px 22px;border-radius:16px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);
  text-align:center;min-width:220px;
}
.csv-next-up-tag{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);}
.csv-next-up-name{font-size:16px;font-weight:700;color:#fff;margin-top:4px;}
.csv-next-up-detail{font-size:11px;color:rgba(255,255,255,.4);margin-top:2px;font-family:'DM Mono',monospace;}
.csv-skip-btn{
  padding:11px 36px;border-radius:16px;
  background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);
  color:rgba(255,255,255,.4);font-size:12px;font-weight:600;cursor:pointer;
  font-family:inherit;transition:all .15s;
}
.csv-skip-btn:hover{background:rgba(255,255,255,.14);color:rgba(255,255,255,.8);}

/* ── FINISH SHEET ── */
.csv-finish-overlay{
  position:absolute;inset:0;z-index:60;
  background:rgba(24,26,36,.6);backdrop-filter:blur(16px);
  display:flex;align-items:flex-end;justify-content:center;
}
.csv-finish-sheet{
  width:100%;max-width:560px;max-height:90%;
  background:#fff;border-radius:24px 24px 0 0;
  border:1.5px solid #ececf1;border-bottom:none;
  display:flex;flex-direction:column;overflow:hidden;
  box-shadow:0 -20px 60px rgba(24,26,36,.2);
  animation:csv-sheet-up .4s cubic-bezier(.34,1.2,.64,1);
}
@keyframes csv-sheet-up{from{transform:translateY(100%)}to{transform:translateY(0)}}
.csv-sheet-handle{width:40px;height:4px;border-radius:2px;background:#ececf1;margin:14px auto 0;flex-shrink:0;}
.csv-finish-hdr{padding:16px 24px;border-bottom:1px solid #ececf1;flex-shrink:0;}
.csv-finish-hdr h2{font-size:18px;font-weight:800;color:#181a24;letter-spacing:-.02em;}
.csv-finish-hdr p{font-size:12px;color:#757a91;margin-top:3px;}
.csv-finish-body{flex:1;overflow-y:auto;padding:20px 24px;display:flex;flex-direction:column;gap:20px;scrollbar-width:thin;}
.csv-f-lbl{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#b8bccb;margin-bottom:8px;}
.csv-f-hr{padding:14px;border-radius:16px;background:rgba(91,95,232,.05);border:1.5px solid rgba(91,95,232,.15);}
.csv-f-hr-nums{display:flex;gap:8px;margin-bottom:10px;}
.csv-f-hr-cell{flex:1;text-align:center;padding:10px 6px;background:#fff;border-radius:12px;border:1.5px solid #ececf1;}
.csv-f-hr-v{font-size:24px;font-weight:900;color:#5B5FE8;font-family:'DM Mono',monospace;}
.csv-f-hr-l{font-size:9px;color:#b8bccb;margin-top:2px;font-weight:600;}
.csv-f-zones{display:flex;gap:5px;}
.csv-f-z-chip{flex:1;text-align:center;padding:6px 4px;border-radius:8px;font-size:9px;font-weight:700;}
.csv-rpe-grid{display:flex;gap:5px;}
.csv-rpe-btn{
  flex:1;height:56px;border-radius:12px;background:#f4f5f8;
  border:1.5px solid #ececf1;color:#b8bccb;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  font-family:inherit;transition:all .15s;
}
.csv-rpe-btn .n{font-size:16px;font-weight:900;}
.csv-rpe-btn .l{font-size:8px;font-weight:600;}
.csv-rpe-btn.sel{background:#5B5FE8;border-color:#5B5FE8;color:#fff;box-shadow:0 4px 16px rgba(91,95,232,.4);}
.csv-rpe-hint{text-align:center;font-size:11px;color:#757a91;margin-top:6px;min-height:16px;}
.csv-perf-row{display:flex;gap:6px;}
.csv-perf-btn{flex:1;height:42px;border-radius:12px;background:#f4f5f8;border:1.5px solid #ececf1;color:#757a91;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;}
.csv-perf-btn.sel{background:rgba(91,95,232,.1);border-color:rgba(91,95,232,.3);color:#5B5FE8;}
.csv-f-ta{width:100%;padding:11px 13px;border-radius:12px;resize:none;outline:none;background:#f8f8fa;border:1.5px solid #ececf1;color:#45495e;font-size:12px;font-family:inherit;line-height:1.55;transition:border-color .15s;}
.csv-f-ta:focus{border-color:#5B5FE8;background:rgba(91,95,232,.03);}
.csv-f-ta::placeholder{color:#b8bccb;}
.csv-body-row{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}
.csv-body-cell input{width:100%;padding:11px;text-align:center;border-radius:12px;background:#f8f8fa;border:1.5px solid #ececf1;color:#181a24;font-size:13px;font-family:'DM Mono',monospace;font-weight:600;outline:none;transition:border-color .15s;}
.csv-body-cell input:focus{border-color:#5B5FE8;}
.csv-body-cell input::placeholder{color:#b8bccb;font-family:inherit;font-weight:400;font-size:12px;}
.csv-body-unit{font-size:9px;color:#b8bccb;text-align:center;margin-top:4px;font-weight:600;}
.csv-finish-ftr{padding:14px 24px 22px;display:flex;gap:8px;flex-shrink:0;border-top:1px solid #ececf1;}
.csv-f-cancel{flex:1;height:48px;border-radius:14px;background:#f4f5f8;border:1.5px solid #ececf1;color:#757a91;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;}
.csv-f-cancel:hover{background:#ececf1;}
.csv-f-save{flex:2;height:48px;border-radius:14px;background:linear-gradient(135deg,#5B5FE8,#7B7FFF);border:none;color:#fff;font-size:14px;font-weight:800;cursor:pointer;font-family:inherit;box-shadow:0 6px 24px rgba(91,95,232,.4);transition:all .2s;}
.csv-f-save:hover{box-shadow:0 8px 30px rgba(91,95,232,.55);transform:translateY(-1px);}

/* ── CANCEL CONFIRM ── */
.csv-cancel-overlay{
  position:absolute;inset:0;z-index:70;
  background:rgba(24,26,36,.75);backdrop-filter:blur(8px);
  display:flex;align-items:center;justify-content:center;padding:24px;
}
.csv-cancel-box{
  background:#fff;border-radius:20px;border:1.5px solid #ececf1;
  padding:28px 24px;max-width:320px;width:100%;text-align:center;
  box-shadow:0 20px 60px rgba(24,26,36,.2);
  animation:csv-ring-in .3s ease;
}
.csv-cancel-box h3{font-size:17px;font-weight:800;color:#181a24;margin-bottom:10px;}
.csv-cancel-box p{font-size:12px;color:#757a91;line-height:1.65;margin-bottom:22px;}
.csv-c-btns{display:flex;gap:8px;}
.csv-c-keep{flex:1;height:44px;border-radius:12px;background:#f4f5f8;border:1.5px solid #ececf1;color:#45495e;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;}
.csv-c-quit{flex:1;height:44px;border-radius:12px;background:rgba(239,60,77,.1);border:1.5px solid rgba(239,60,77,.22);color:#EF3C4D;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;}
`;

// ─── 倒计时覆盖层 ────────────────────────────────────────
function CountdownOverlay({ client, onDone }: { client: Client; onDone: () => void }) {
  const [count, setCount] = useState(3);
  const arcRef = useRef<SVGCircleElement>(null);
  const circumference = 2 * Math.PI * 105;

  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    if (arcRef.current) {
      arcRef.current.style.strokeDashoffset = String(circumference * (1 - count / 3));
    }
    const t = setTimeout(() => setCount(c => c - 1), count === 3 ? 0 : 850);
    return () => clearTimeout(t);
  }, [count, onDone, circumference]);

  const initial = client.name?.[0] ?? '?';

  return (
    <div className="csv-cd-overlay">
      <div className="csv-cd-ring">
        <svg width="220" height="220" viewBox="0 0 220 220">
          <circle className="csv-cd-track" cx="110" cy="110" r="105" />
          <circle ref={arcRef} className="csv-cd-arc" cx="110" cy="110" r="105"
            strokeDasharray={String(circumference)} strokeDashoffset="0" />
        </svg>
        <div className="csv-cd-center">
          <div className={`csv-cd-num${count === 0 ? ' go' : ''}`}>
            {count === 0 ? 'GO' : count}
          </div>
          <div className="csv-cd-sub">准备开始</div>
        </div>
      </div>
      <div className="csv-cd-card">
        <div className="csv-cd-avatar">{initial}</div>
        <div>
          <div className="csv-cd-cname">{client.name}</div>
          <div className="csv-cd-plan">
            {(client as any).membershipLevel === 'professional' || (client as any).membershipLevel === 'elite'
              ? '动力链训练' : '传统分化训练'} · Block {((client as any).blocks?.length) || 1}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 休息覆盖层 ──────────────────────────────────────────
function RestOverlay({ seconds, nextEx, onSkip }: {
  seconds: number; nextEx: Exercise | null; onSkip: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  const arcRef = useRef<SVGCircleElement>(null);
  const circumference = 2 * Math.PI * 113;

  useEffect(() => {
    if (left <= 0) { onSkip(); return; }
    if (arcRef.current) {
      const pct = (seconds - left) / seconds;
      arcRef.current.style.strokeDashoffset = String(circumference * pct);
    }
    const t = setInterval(() => setLeft(v => v - 1), 1000);
    return () => clearInterval(t);
  }, [left, seconds, onSkip, circumference]);

  return (
    <div className="csv-rest-overlay">
      <div className="csv-rest-lbl">组间休息</div>
      <div className="csv-rest-ring">
        <svg width="240" height="240" viewBox="0 0 240 240">
          <circle className="csv-rest-track" cx="120" cy="120" r="113" />
          <circle ref={arcRef} className="csv-rest-arc" cx="120" cy="120" r="113"
            strokeDasharray={String(circumference)} strokeDashoffset="0" />
        </svg>
        <div className="csv-rest-inner">
          <div className="csv-rest-num">{left}</div>
          <div className="csv-rest-unit">秒</div>
        </div>
      </div>
      {nextEx && (
        <div className="csv-next-up">
          <div className="csv-next-up-tag">下一组</div>
          <div className="csv-next-up-name">
            {nextEx.name}
            {nextEx.groupTag && <span style={{ marginLeft: 6, fontSize: 12, opacity: .6 }}>{nextEx.groupTag}</span>}
          </div>
          <div className="csv-next-up-detail">
            {nextEx.sets[0]?.weight ? `${nextEx.sets[0].weight}kg × ` : ''}{nextEx.sets[0]?.reps ?? ''}次
          </div>
        </div>
      )}
      <button className="csv-skip-btn" onClick={onSkip}>跳过休息</button>
    </div>
  );
}

// ─── 结束弹窗 ────────────────────────────────────────────
function FinishSheet({ duration, hrStats, onSave, onCancel }: {
  duration: number;
  hrStats: ReturnType<ReturnType<typeof useHeartRate>['getStats']>;
  onSave: (rpe: number, perf: string, note: string, coachNotes: string,
    postAssessment?: { weight?: number; body_fat_pct?: number; rhr?: number }) => void;
  onCancel: () => void;
}) {
  const [rpe, setRpe] = useState(7);
  const [perf, setPerf] = useState('良好');
  const [note, setNote] = useState('');
  const [coachNotes, setCoachNotes] = useState('');
  const [weight, setWeight] = useState('');
  const [bodyFatPct, setBodyFatPct] = useState('');
  const [rhr, setRhr] = useState('');

  const rpeHints: Record<number, string> = {
    5: '很轻松，下次大幅加量', 6: '比较轻松，下次可加量',
    7: '适中，正常推进', 8: '有点累，注意恢复',
    9: '很累，下次需降载', 10: '力竭，必须降载',
  };
  const rpeOptions = [
    { v: 5, l: '很轻松' }, { v: 6, l: '还好' }, { v: 7, l: '适中' },
    { v: 8, l: '有点累' }, { v: 9, l: '很累' }, { v: 10, l: '力竭' },
  ];

  return (
    <div className="csv-finish-overlay">
      <div className="csv-finish-sheet">
        <div className="csv-sheet-handle" />
        <div className="csv-finish-hdr">
          <h2>训练总结</h2>
          <p>时长 {Math.round(duration / 60)} 分钟</p>
        </div>
        <div className="csv-finish-body">
          {hrStats && (
            <div>
              <div className="csv-f-lbl">心率总结</div>
              <div className="csv-f-hr">
                <div className="csv-f-hr-nums">
                  {[['平均', hrStats.avgBpm], ['最高', hrStats.maxBpm], ['最低', hrStats.minBpm]].map(([l, v]) => (
                    <div key={l as string} className="csv-f-hr-cell">
                      <div className="csv-f-hr-v">{v}</div>
                      <div className="csv-f-hr-l">{l} BPM</div>
                    </div>
                  ))}
                </div>
                <div className="csv-f-zones">
                  {[1, 2, 3, 4, 5].map(z => {
                    const secs = hrStats.zoneDurations[z] || 0;
                    if (!secs) return null;
                    const m = Math.floor(secs / 60), s = secs % 60;
                    return (
                      <div key={z} className="csv-f-z-chip"
                        style={{ background: ZONE_BG[z], color: ZONE_COLORS[z], border: `1px solid ${ZONE_COLORS[z]}30` }}>
                        Z{z}<br />{m}:{String(s).padStart(2, '0')}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <div>
            <div className="csv-f-lbl">RPE 强度感知</div>
            <div className="csv-rpe-grid">
              {rpeOptions.map(({ v, l }) => (
                <button key={v} className={`csv-rpe-btn${rpe === v ? ' sel' : ''}`} onClick={() => setRpe(v)}>
                  <span className="n">{v}</span><span className="l">{l}</span>
                </button>
              ))}
            </div>
            <div className="csv-rpe-hint">{rpeHints[rpe] || ''}</div>
          </div>
          <div>
            <div className="csv-f-lbl">整体表现</div>
            <div className="csv-perf-row">
              {['良好', '一般', '较差'].map(p => (
                <button key={p} className={`csv-perf-btn${perf === p ? ' sel' : ''}`} onClick={() => setPerf(p)}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="csv-f-lbl">教练笔记（选填）</div>
            <textarea className="csv-f-ta" rows={2} placeholder="下次注意离心控制..." value={note} onChange={e => setNote(e.target.value)} />
          </div>
          <div>
            <div className="csv-f-lbl">课后总结（选填）</div>
            <textarea className="csv-f-ta" rows={2} placeholder="记录客户今日表现..." value={coachNotes} onChange={e => setCoachNotes(e.target.value)} />
          </div>
          <div>
            <div className="csv-f-lbl">体测数据（选填）</div>
            <div className="csv-body-row">
              <div className="csv-body-cell">
                <input type="number" step="0.1" placeholder="体重" value={weight} onChange={e => setWeight(e.target.value)} />
                <div className="csv-body-unit">kg</div>
              </div>
              <div className="csv-body-cell">
                <input type="number" step="0.1" placeholder="体脂率" value={bodyFatPct} onChange={e => setBodyFatPct(e.target.value)} />
                <div className="csv-body-unit">%</div>
              </div>
              <div className="csv-body-cell">
                <input type="number" placeholder="静息心率" value={rhr} onChange={e => setRhr(e.target.value)} />
                <div className="csv-body-unit">bpm</div>
              </div>
            </div>
          </div>
        </div>
        <div className="csv-finish-ftr">
          <button className="csv-f-cancel" onClick={onCancel}>取消</button>
          <button className="csv-f-save" onClick={() => {
            onSave(rpe, perf, note, coachNotes, {
              weight: weight ? parseFloat(weight) : undefined,
              body_fat_pct: bodyFatPct ? parseFloat(bodyFatPct) : undefined,
              rhr: rhr ? parseInt(rhr) : undefined,
            });
          }}>完成并记录</button>
        </div>
      </div>
    </div>
  );
}

// ─── 组数行 ──────────────────────────────────────────────
function SetRow({ set, isCurrent, onToggle, onDelete, onUpdateWeight, onUpdateReps }: {
  set: ExerciseSet; isCurrent: boolean;
  onToggle: () => void; onDelete: () => void;
  onUpdateWeight: (v: string) => void; onUpdateReps: (v: string) => void;
}) {
  const cls = `csv-set-row${set.done ? ' is-done' : isCurrent ? ' is-current' : ''}`;
  return (
    <div className={cls}>
      <div className="csv-set-num">{set.done ? '✓' : set.num}</div>
      <div className="csv-set-inputs">
        <input className="csv-set-in" type="number" value={set.weight} placeholder="kg"
          disabled={set.done} onChange={e => onUpdateWeight(e.target.value)} />
        <span className="csv-set-unit">kg ×</span>
        <input className="csv-set-in" type="text" value={set.reps} placeholder="次"
          disabled={set.done} onChange={e => onUpdateReps(e.target.value)} />
        <span className="csv-set-unit">次</span>
      </div>
      {!set.done && <button className="csv-del-btn" onClick={onDelete}>×</button>}
      <button
        className={`csv-check-btn${set.done ? ' done-s' : isCurrent ? ' current' : ' pending'}`}
        onClick={onToggle}
      >✓</button>
    </div>
  );
}

// ─── 右栏：心率面板 ─────────────────────────────────────
function HRPanel({ hr, elapsed, weightKg, doneSets, totalSets }: {
  hr: ReturnType<typeof useHeartRate>;
  elapsed: number; weightKg: number; doneSets: number; totalSets: number;
}) {
  const zone = hr.currentZone;
  const bpm = hr.bpm;
  const hasBpm = typeof bpm === 'number' && bpm > 0;
  const profile = hr.profile;
  const circumference = 2 * Math.PI * 80;

  const intensity = (() => {
    if (!hasBpm || !profile) return 0;
    const range = profile.mhr - profile.rhr;
    if (!Number.isFinite(range) || range <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round(((bpm! - profile.rhr) / range) * 100)));
  })();

  const met = zone ? ({ 1: 3.5, 2: 5.5, 3: 7.5, 4: 9.5, 5: 11.5 }[zone.zone] ?? 3) : 3.0;
  const kcal = Math.max(0, (met * 3.5 * weightKg / 200) * (elapsed / 60));
  const stats = hr.getStats();
  const ringOffset = circumference * (1 - intensity / 100);
  const zoneColor = zone ? ZONE_COLORS[zone.zone] : '#5B5FE8';

  const progPct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const progCirc = 2 * Math.PI * 26;
  const progOffset = progCirc * (1 - progPct / 100);

  if (hr.status !== 'connected') {
    return (
      <>
        <div className="csv-connect-zone">
          <div className="csv-connect-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5B5FE8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div className="csv-connect-lbl">心率带未连接<br />连接后可实时监控训练强度</div>
          <button className="csv-connect-btn"
            disabled={hr.status === 'connecting' || hr.status === 'unsupported'}
            onClick={hr.connect}>
            {hr.status === 'connecting' ? '连接中...' : '⚡ 连接心率带'}
          </button>
        </div>

        <div className="csv-timer-card">
          <div className="csv-big-timer">{fmt(elapsed)}</div>
          <div className="csv-timer-lbl">训练时长</div>
        </div>

        <div className="csv-prog-card">
          <div className="csv-prog-label">完成进度</div>
          <div className="csv-prog-row">
            <div className="csv-prog-ring">
              <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="32" cy="32" r="26" fill="none" stroke="#ececf1" strokeWidth="7" />
                <circle cx="32" cy="32" r="26" fill="none"
                  stroke="url(#progGrad)" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={String(progCirc)}
                  strokeDashoffset={String(progOffset)}
                  style={{ transition: 'stroke-dashoffset .8s ease' }}
                />
                <defs>
                  <linearGradient id="progGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#5B5FE8" />
                    <stop offset="100%" stopColor="#FF5C35" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="csv-prog-pct">{progPct}%</div>
            </div>
            <div className="csv-prog-info">
              <div className="csv-prog-main">{doneSets} <span>/ {totalSets} 组</span></div>
              <div className="csv-prog-bar">
                <div className="csv-prog-fill" style={{ width: `${progPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="csv-notes-card">
          <div className="csv-notes-lbl">快速备注</div>
          <textarea className="csv-quick-ta" placeholder="记录客户今日状态、动作问题..." rows={4} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="csv-hr-ring-card">
        <div className="csv-hr-ring-wrap">
          <svg width="180" height="180" viewBox="0 0 180 180">
            <circle className="csv-hr-track" cx="90" cy="90" r="80" />
            <circle className="csv-hr-fill" cx="90" cy="90" r="80"
              stroke={zoneColor}
              strokeDasharray={String(circumference)}
              strokeDashoffset={String(ringOffset)}
            />
          </svg>
          <div className="csv-hr-inner">
            <div className="csv-hr-num">{hasBpm ? bpm : '--'}</div>
            <div className="csv-hr-unit">BPM</div>
          </div>
        </div>
        <div className="csv-hr-zone-pill" style={{ background: `${zoneColor}18`, color: zoneColor }}>
          {zone ? `Z${zone.zone} · ${zone.labelEn}` : '— Rest'}
        </div>
        <div className="csv-hr-stats">
          <div className="csv-hr-stat">
            <div className="csv-hr-stat-v" style={{ color: '#5B5FE8' }}>{intensity}%</div>
            <div className="csv-hr-stat-l">强度</div>
          </div>
          <div className="csv-hr-stat">
            <div className="csv-hr-stat-v">{kcal.toFixed(1)}</div>
            <div className="csv-hr-stat-l">kcal</div>
          </div>
          {stats && (
            <>
              <div className="csv-hr-stat">
                <div className="csv-hr-stat-v">{stats.avgBpm}</div>
                <div className="csv-hr-stat-l">平均</div>
              </div>
              <div className="csv-hr-stat">
                <div className="csv-hr-stat-v" style={{ color: '#EF3C4D' }}>{stats.maxBpm}</div>
                <div className="csv-hr-stat-l">最高</div>
              </div>
            </>
          )}
        </div>
        <button className="csv-disconnect-btn" onClick={hr.disconnect}>断开心率带</button>
      </div>

      {stats && (
        <div className="csv-zone-card">
          <div className="csv-zone-title">心率区间</div>
          {[1, 2, 3, 4, 5].map(z => {
            const secs = stats.zoneDurations[z] || 0;
            const m = Math.floor(secs / 60), s = secs % 60;
            const maxSecs = Math.max(...Object.values(stats.zoneDurations));
            const pct = maxSecs ? Math.round((secs / maxSecs) * 100) : 0;
            const zoneNames: Record<number, string> = { 1: 'Z1 热身', 2: 'Z2 燃脂', 3: 'Z3 有氧', 4: 'Z4 无氧', 5: 'Z5 极限' };
            return (
              <div key={z} className="csv-z-row">
                <div className="csv-z-dot" style={{ background: ZONE_COLORS[z] }} />
                <div className="csv-z-name" style={{ color: ZONE_COLORS[z] }}>{zoneNames[z]}</div>
                <div className="csv-z-track"><div className="csv-z-fill" style={{ background: ZONE_COLORS[z], width: `${pct}%` }} /></div>
                <div className="csv-z-dur">{m}:{String(s).padStart(2, '0')}</div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ─── 主组件 ──────────────────────────────────────────────
export function CoachSessionView({ client, onClose, onRecordSession, onCancelSession }: CoachSessionViewProps) {
  const [exercises, setExercises] = useState<Exercise[]>(() => parsePlan(client));
  const [curIdx, setCurIdx] = useState(0);
  const [phase, setPhase] = useState<'countdown' | 'session' | 'rest' | 'finish'>('countdown');
  const [restSecs, setRestSecs] = useState(60);
  const [elapsed, setElapsed] = useState(0);
  const [dyOpen, setDyOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const timerRef = useRef<number | null>(null);
  const hr = useHeartRate(client.age, (client as any).rhr || 65);

  // inject CSS once
  useEffect(() => {
    const id = 'csv-styles';
    if (!document.getElementById(id)) {
      const el = document.createElement('style');
      el.id = id; el.textContent = CSS;
      document.head.appendChild(el);
    }
  }, []);

  useEffect(() => {
    if (phase !== 'session') return;
    timerRef.current = window.setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [phase]);

  const curEx = exercises[curIdx] ?? null;
  const curSetIdx = curEx?.sets.findIndex(s => !s.done) ?? -1;

  const completeSet = useCallback(() => {
    if (!curEx) return;
    const nsi = curEx.sets.findIndex(s => !s.done);
    if (nsi === -1) {
      if (curIdx < exercises.length - 1) setCurIdx(i => i + 1);
      return;
    }
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : { ...ex, sets: ex.sets.map((s, si) => si !== nsi ? s : { ...s, done: true }) }
    ));
    if (curEx.restSeconds > 0) { setRestSecs(curEx.restSeconds); setPhase('rest'); }
  }, [curEx, curIdx, exercises.length]);

  const updateSet = (exIdx: number, si: number, key: 'weight' | 'reps', val: string) => {
    setExercises(prev => prev.map((ex, i) =>
      i !== exIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, [key]: val }) }
    ));
  };

  const addSet = () => {
    if (!curEx) return;
    const last = curEx.sets[curEx.sets.length - 1];
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : {
        ...ex, sets: [...ex.sets, { num: ex.sets.length + 1, reps: last?.reps || '10', weight: last?.weight || '', done: false }],
      }
    ));
  };

  const delSet = (si: number) => {
    if (!curEx || curEx.sets.length <= 1) return;
    setExercises(prev => prev.map((ex, i) =>
      i !== curIdx ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si).map((s, j) => ({ ...s, num: j + 1 })) }
    ));
  };

  const updateExerciseNotes = (notes: string) => {
    setExercises(prev => prev.map((ex, i) => i !== curIdx ? ex : { ...ex, notes }));
  };

  const totalSets = exercises.reduce((n, ex) => n + ex.sets.length, 0);
  const doneSets = exercises.reduce((n, ex) => n + ex.sets.filter(s => s.done).length, 0);
  const progPct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;

  const handleSave = async (rpe: number, perf: string, note: string, coachNotes: string,
    postAssessment?: { weight?: number; body_fat_pct?: number; rhr?: number }) => {
    const hrStats = hr.getStats();
    const tier = client.tier || 'standard';
    const price = tier === 'pro' ? 388 : 328;
    const actual_weights: number[] = [];
    exercises.forEach(ex => { ex.sets.forEach(set => { if (set.done && set.weight) actual_weights.push(parseFloat(set.weight)); }); });
    const liveWeight = Number((client as any)?.weight ?? 65);
    const latestZone = hr.currentZone?.zone;
    const met = latestZone ? ({ 1: 3.5, 2: 5.5, 3: 7.5, 4: 9.5, 5: 11.5 }[latestZone] ?? 3) : 3.0;
    const sessionKcal = Math.max(0, (met * 3.5 * liveWeight / 200) * (elapsed / 60));
    await onRecordSession({
      date: new Date().toLocaleDateString('zh-CN'),
      week: client.current_week || 1, level: 1,
      day: (curEx?.sectionTitle || '').trim() || '训练日',
      duration: Math.round(elapsed / 60), rpe, performance: perf, price, note,
      hrAvg: hrStats?.avgBpm, hrMax: hrStats?.maxBpm, hrMin: hrStats?.minBpm,
      hrZoneDurations: hrStats?.zoneDurations,
      kcal: Number(sessionKcal.toFixed(1)),
      actual_weights: actual_weights.length > 0 ? actual_weights : undefined,
      coach_notes: coachNotes,
      post_assessment: (postAssessment?.weight || postAssessment?.body_fat_pct || postAssessment?.rhr) ? postAssessment : undefined,
    });
    hr.clearSamples();
    onClose();
  };

  // group exercises by section
  const sections: { title: string; exs: Array<{ ex: Exercise; idx: number }> }[] = [];
  exercises.forEach((ex, idx) => {
    const last = sections[sections.length - 1];
    if (!last || last.title !== ex.sectionTitle) sections.push({ title: ex.sectionTitle, exs: [{ ex, idx }] });
    else last.exs.push({ ex, idx });
  });

  const mainBtnLabel = (() => {
    if (!curEx) return '全部完成';
    return curSetIdx === -1 ? '→ 下一动作' : `完成第 ${curSetIdx + 1} 组`;
  })();
  const mainBtnSub = curEx && curSetIdx !== -1 && curEx.restSeconds > 0
    ? `完成后休息 ${curEx.restSeconds}s` : '';

  const nextEx = exercises[curIdx + 1] ?? null;
  const initial = client.name?.[0] ?? '?';

  return (
    <div className="csv-root">
      {/* progress strip */}
      <div className="csv-strip">
        <div className="csv-strip-fill" style={{ width: `${progPct}%` }} />
      </div>

      <div className="csv-body">
        {/* ── LEFT ── */}
        <div className="csv-left">
          <div className="csv-client-pill">
            <div className="csv-avatar">{initial}</div>
            <div>
              <div className="csv-cname">{client.name}</div>
              <div className="csv-csub">{doneSets}/{totalSets}组 · {fmt(elapsed)}</div>
            </div>
          </div>

          <div className="csv-exlist">
            {sections.map(sec => (
              <div key={sec.title}>
                <div className="csv-sec-label">{sec.title}</div>
                {sec.exs.map(({ ex, idx }) => {
                  const isActive = idx === curIdx;
                  const isDone = ex.sets.every(s => s.done);
                  const doneCount = ex.sets.filter(s => s.done).length;
                  const tc = tagColor(ex.groupTag);
                  return (
                    <button key={ex.id}
                      className={`csv-ex-btn${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
                      onClick={() => setCurIdx(idx)}>
                      <div className="csv-ex-indicator">
                        {isDone ? '✓' : isActive ? '▶' : ''}
                      </div>
                      {ex.groupTag && !isDone && (
                        <span className="csv-tag-pill"
                          style={{ background: `${tc}18`, color: tc }}>
                          {ex.groupTag}
                        </span>
                      )}
                      <div className="csv-ex-info">
                        <div className="csv-ex-n">{ex.name}</div>
                        <div className="csv-ex-p">{doneCount}/{ex.sets.length}组{ex.rhythm ? ` · ${ex.rhythm}` : ''}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <button className="csv-end-btn" onClick={() => setPhase('finish')}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
            结束训练
          </button>
        </div>

        {/* ── CENTER ── */}
        <div className="csv-center">
          <div className="csv-hero">
            {curEx ? (
              <>
                <div className="csv-hero-tags">
                  {curEx.sectionTitle && (
                    <span className="csv-tag-module"
                      style={{ background: `${tagColor(curEx.groupTag)}14`, color: tagColor(curEx.groupTag), border: `1px solid ${tagColor(curEx.groupTag)}28` }}>
                      {curEx.sectionTitle}
                    </span>
                  )}
                  {curEx.sectionFormat && (
                    <span style={{ fontSize: 9, color: '#b8bccb', border: '1px solid #ececf1', borderRadius: 20, padding: '3px 9px' }}>
                      {curEx.sectionFormat}
                    </span>
                  )}
                  {curEx.rhythm && <span className="csv-tag-rhythm">⚡ {curEx.rhythm}</span>}
                  <button
                    className={`csv-note-btn${notesOpen ? ' active' : ''}`}
                    onClick={() => setNotesOpen(v => !v)}>
                    {notesOpen ? '✓ 已记录' : '📝 备注'}
                  </button>
                </div>
                <div className="csv-ex-name-big" key={curEx.id}>{curEx.name}</div>
                {curEx.nameEn && <div className="csv-ex-name-en">{curEx.nameEn}</div>}
                {curEx.cue && (
                  <div className="csv-cue-card">
                    <div className="csv-cue-lbl">CUE</div>
                    <div className="csv-cue-txt">{curEx.cue}</div>
                  </div>
                )}
                {curEx.dyline && (
                  <div>
                    <button className="csv-dy-btn" onClick={() => setDyOpen(v => !v)}>
                      <span className={`csv-dy-arrow${dyOpen ? ' open' : ''}`}>▶</span> 动力链解析
                    </button>
                    <div className={`csv-dy-content${dyOpen ? ' open' : ''}`}>
                      <div className="csv-dy-inner">{curEx.dyline}</div>
                    </div>
                  </div>
                )}
                <div className={`csv-notes-wrap${notesOpen ? ' open' : ''}`}>
                  <textarea className="csv-notes-ta" rows={2}
                    placeholder="记录此动作的表现、难点或注意事项..."
                    value={curEx.notes || ''}
                    onChange={e => updateExerciseNotes(e.target.value)} />
                </div>
              </>
            ) : (
              <div style={{ color: '#b8bccb', fontSize: 14, padding: '20px 0' }}>从左侧选择动作</div>
            )}
          </div>

          <div className="csv-sets-area">
            <div className="csv-sets-header">
              <div className="csv-sets-cols">
                <span style={{ width: 24 }}>#</span>
                <span style={{ width: 62, textAlign: 'center' }}>重量</span>
                <span style={{ width: 14 }} />
                <span style={{ width: 62, textAlign: 'center' }}>次数</span>
              </div>
              <button className="csv-add-set" onClick={addSet}>+ 加组</button>
            </div>
            <div className="csv-sets-scroll">
              {curEx?.sets.map((set, si) => (
                <SetRow
                  key={si}
                  set={set}
                  isCurrent={si === curSetIdx}
                  onToggle={() => {
                    const nsi = curEx.sets.findIndex(s => !s.done);
                    if (si === nsi) {
                      setExercises(prev => prev.map((ex, i) =>
                        i !== curIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: true }) }
                      ));
                      if (curEx.restSeconds > 0) { setRestSecs(curEx.restSeconds); setPhase('rest'); }
                    } else {
                      setExercises(prev => prev.map((ex, i) =>
                        i !== curIdx ? ex : { ...ex, sets: ex.sets.map((s, j) => j !== si ? s : { ...s, done: !s.done }) }
                      ));
                    }
                  }}
                  onDelete={() => delSet(si)}
                  onUpdateWeight={v => updateSet(curIdx, si, 'weight', v)}
                  onUpdateReps={v => updateSet(curIdx, si, 'reps', v)}
                />
              ))}
            </div>
          </div>

          <div className="csv-action-bar">
            <div className="csv-nav-row">
              <button className="csv-nav-btn" disabled={curIdx === 0}
                onClick={() => { if (curIdx > 0) { setCurIdx(i => i - 1); setDyOpen(false); } }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                className={`csv-main-btn${curSetIdx === -1 ? ' green' : ' orange'}`}
                onClick={completeSet}>
                <span className="csv-act-lbl">{mainBtnLabel}</span>
                {mainBtnSub && <span className="csv-act-sub">{mainBtnSub}</span>}
              </button>
              <button className="csv-nav-btn" disabled={curIdx >= exercises.length - 1}
                onClick={() => { if (curIdx < exercises.length - 1) { setCurIdx(i => i + 1); setDyOpen(false); } }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            {nextEx && (
              <div className="csv-next-hint">
                下一个：<span>{nextEx.name}</span>
                {nextEx.groupTag && <span style={{ color: `${tagColor(nextEx.groupTag)}99`, fontWeight: 700, marginLeft: 4 }}>{nextEx.groupTag}</span>}
              </div>
            )}
            <button className="csv-cancel-tiny" onClick={() => setShowCancelConfirm(true)}>取消课程</button>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="csv-right">
          <HRPanel
            hr={hr}
            elapsed={elapsed}
            weightKg={Number.isFinite(Number((client as any)?.weight)) ? Number((client as any)?.weight) : 65}
            doneSets={doneSets}
            totalSets={totalSets}
          />
        </div>
      </div>

      {/* overlays */}
      {phase === 'countdown' && (
        <CountdownOverlay client={client} onDone={() => setPhase('session')} />
      )}
      {phase === 'rest' && (
        <RestOverlay seconds={restSecs} nextEx={nextEx} onSkip={() => setPhase('session')} />
      )}
      {phase === 'finish' && (
        <FinishSheet
          duration={elapsed}
          hrStats={hr.getStats()}
          onSave={handleSave}
          onCancel={() => setPhase('session')}
        />
      )}
      {showCancelConfirm && (
        <div className="csv-cancel-overlay">
          <div className="csv-cancel-box">
            <h3>确认取消课程？</h3>
            <p>取消后将不会扣费<br />本次训练记录将不会保存</p>
            <div className="csv-c-btns">
              <button className="csv-c-keep" onClick={() => setShowCancelConfirm(false)}>继续训练</button>
              <button className="csv-c-quit" onClick={() => { setShowCancelConfirm(false); onCancelSession?.(); onClose(); }}>确认取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
