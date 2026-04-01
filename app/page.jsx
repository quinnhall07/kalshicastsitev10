"use client";

import { useState, useEffect, useCallback } from "react";

// ─── MATH HELPERS (used by DistributionContent) ───────────────────────────────
function erf(x) {
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1/(1+p*ax);
  const y = 1-(((((a5*t+a4)*t)+a3)*t+a2)*t+a1)*t*Math.exp(-ax*ax);
  return sign*y;
}
function normCDF(x) { return 0.5*(1+erf(x/Math.SQRT2)); }
function normPDF(x) { return Math.exp(-0.5*x*x)/Math.sqrt(2*Math.PI); }
function skewnormPDF(x,alpha,xi,omega) {
  if(omega<=0) return 0;
  const z=(x-xi)/omega;
  return (2/omega)*normPDF(z)*normCDF(alpha*z);
}

// ─── NEXT.JS CONFIG ───────────────────────────────────────────────────────────
// Set NEXT_PUBLIC_GH_REPO=quinnhall07/kalshicastdata in your .env.local
const GH_REPO = process.env.NEXT_PUBLIC_GH_REPO || 'quinnhall07/kalshicastdata';

// ─── MODEL COLORS & SOURCES ───────────────────────────────────────────────────
const MODEL_COLORS = {
  NWS:'#00d4d8',OME_BASE:'#f5a623',OME_GFS:'#4a90d9',OME_EC:'#2ec07a',
  OME_ICON:'#a855f7',OME_GEM:'#14b8a6',WAPI:'#f97316',VCR:'#ec4899',TOM:'#eab308',
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg0: #050608; --bg1: #0b0d10; --bg2: #111318; --bg3: #181b22;
    --border: #1e2230; --border2: #252a38;
    --amber: #f5a623; --amber-dim: #8a5d12; --amber-glow: rgba(245,166,35,0.12);
    --cyan: #00d4d8; --cyan-dim: #006468;
    --green: #2ec07a; --green-dim: #0d4029;
    --red: #e84040; --red-dim: #4a1010;
    --yellow: #ffd166; --muted: #3a4055;
    --text-dim: #5a6280; --text-mid: #7a8299; --text: #b8c0d4; --text-bright: #e8eaf2;
    --font-mono: 'IBM Plex Mono', monospace; --font-sans: 'IBM Plex Sans', sans-serif;
    --purple: #a855f7; --teal: #14b8a6;
  }

  body { background:var(--bg0); color:var(--text); font-family:var(--font-mono); font-size:12px; line-height:1.5; overflow:hidden; }
  .shell { display:flex; flex-direction:column; height:100vh; width:100vw; background:var(--bg0); }

  /* TOP BAR */
  .topbar { display:flex; align-items:center; height:44px; background:var(--bg1); border-bottom:1px solid var(--border); padding:0; flex-shrink:0; position:relative; }
  .topbar::after { content:''; position:absolute; bottom:-1px; left:0; right:0; height:1px; background:linear-gradient(90deg,var(--amber) 0%,transparent 60%); opacity:0.4; }
  .logo { display:flex; align-items:center; gap:8px; padding:0 20px; height:100%; border-right:1px solid var(--border); font-size:13px; font-weight:600; letter-spacing:0.08em; color:var(--amber); text-transform:uppercase; flex-shrink:0; }
  .logo-dot { width:8px; height:8px; border-radius:50%; background:var(--amber); box-shadow:0 0 8px var(--amber); animation:pulse 2s ease-in-out infinite; }
  .topbar-metrics { display:flex; align-items:center; flex:1; height:100%; }
  .tmet { display:flex; flex-direction:column; justify-content:center; padding:0 16px; height:100%; border-right:1px solid var(--border); }
  .tmet-label { font-size:9px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; }
  .tmet-val { font-size:13px; font-weight:500; color:var(--text-bright); }
  .tmet-val.pos { color:var(--green); } .tmet-val.neg { color:var(--red); } .tmet-val.warn { color:var(--amber); } .tmet-val.amber { color:var(--amber); }
  .topbar-right { display:flex; align-items:center; gap:8px; padding:0 16px; margin-left:auto; flex-shrink:0; }
  .status-badge { display:flex; align-items:center; gap:5px; padding:3px 10px; border-radius:2px; font-size:10px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; }
  .status-badge.ok { background:var(--green-dim); color:var(--green); border:1px solid rgba(46,192,122,0.3); }
  .status-badge.warn { background:rgba(245,166,35,0.12); color:var(--amber); border:1px solid rgba(245,166,35,0.3); }
  .status-badge.error { background:var(--red-dim); color:var(--red); border:1px solid rgba(232,64,64,0.3); }
  .status-badge.paper { background:rgba(0,212,216,0.1); color:var(--cyan); border:1px solid var(--cyan-dim); }
  .status-badge.live-mode { background:rgba(46,192,122,0.15); color:var(--green); border:1px solid rgba(46,192,122,0.4); }
  .status-dot { width:5px; height:5px; border-radius:50%; }
  .status-dot.ok { background:var(--green); box-shadow:0 0 4px var(--green); animation:pulse 2s ease-in-out infinite; }
  .status-dot.warn { background:var(--amber); box-shadow:0 0 4px var(--amber); animation:pulse 1.5s ease-in-out infinite; }
  .status-dot.error { background:var(--red); box-shadow:0 0 4px var(--red); animation:pulse 0.8s ease-in-out infinite; }
  .btn-halt { padding:5px 14px; border-radius:2px; font-family:var(--font-mono); font-size:11px; font-weight:600; letter-spacing:0.08em; cursor:pointer; border:none; text-transform:uppercase; transition:all 0.15s ease; }
  .btn-halt.active { background:var(--red); color:#fff; box-shadow:0 0 12px rgba(232,64,64,0.5); }
  .btn-halt.active:hover { background:#ff5555; }
  .btn-halt.halted { background:var(--green); color:#000; box-shadow:0 0 12px rgba(46,192,122,0.5); }

  /* TABS */
  .tabs { display:flex; align-items:flex-end; background:var(--bg1); border-bottom:1px solid var(--border); flex-shrink:0; height:36px; }
  .tab { padding:0 18px; height:36px; display:flex; align-items:center; gap:6px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; cursor:pointer; color:var(--text-dim); border-bottom:2px solid transparent; transition:all 0.15s ease; white-space:nowrap; border-right:1px solid var(--border); }
  .tab:hover { color:var(--text); background:var(--bg2); }
  .tab.active { color:var(--amber); border-bottom-color:var(--amber); background:var(--bg2); }
  .tab-badge { display:inline-flex; align-items:center; justify-content:center; min-width:14px; height:14px; padding:0 3px; border-radius:2px; font-size:9px; font-weight:600; }
  .tab-badge.red { background:var(--red-dim); color:var(--red); }
  .tab-badge.amber { background:var(--amber-glow); color:var(--amber); }
  .tab-badge.green { background:var(--green-dim); color:var(--green); }

  /* CONTENT */
  .content { flex:1; overflow-y:auto; background:var(--bg0); }
  .content::-webkit-scrollbar { width:4px; } .content::-webkit-scrollbar-track { background:var(--bg1); } .content::-webkit-scrollbar-thumb { background:var(--border2); border-radius:2px; }
  .section { padding:16px; }
  .grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  .grid-4 { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:12px; }

  /* CARDS */
  .card { background:var(--bg1); border:1px solid var(--border); border-radius:3px; overflow:hidden; }
  .card-header { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:var(--bg2); border-bottom:1px solid var(--border); font-size:9px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--text-dim); }
  .card-header .card-title { color:var(--text-mid); }
  .card-body { padding:12px; }

  /* STAT BOXES */
  .stat-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:0; border:1px solid var(--border); border-radius:3px; overflow:hidden; }
  .stat-box { padding:12px 14px; background:var(--bg1); border-right:1px solid var(--border); border-bottom:1px solid var(--border); }
  .stat-box:nth-child(4n) { border-right:none; }
  .stat-label { font-size:9px; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-bottom:4px; }
  .stat-val { font-size:20px; font-weight:500; color:var(--text-bright); line-height:1; }
  .stat-val.amber { color:var(--amber); } .stat-val.green { color:var(--green); } .stat-val.red { color:var(--red); }
  .stat-sub { font-size:10px; color:var(--text-dim); margin-top:3px; }

  /* TABLES */
  .data-table { width:100%; border-collapse:collapse; }
  .data-table th { padding:6px 10px; font-size:9px; font-weight:600; letter-spacing:0.1em; text-transform:uppercase; color:var(--text-dim); text-align:left; border-bottom:1px solid var(--border2); background:var(--bg2); white-space:nowrap; }
  .data-table td { padding:7px 10px; font-size:11px; color:var(--text); border-bottom:1px solid var(--border); white-space:nowrap; }
  .data-table tr:last-child td { border-bottom:none; }
  .data-table tr:hover td { background:var(--bg2); }
  .tag { display:inline-block; padding:1px 6px; border-radius:2px; font-size:9px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; }
  .tag.high { background:rgba(0,212,216,0.1); color:var(--cyan); }
  .tag.low { background:rgba(245,166,35,0.1); color:var(--amber); }
  .tag.maker { background:var(--green-dim); color:var(--green); }
  .tag.taker { background:rgba(0,212,216,0.1); color:var(--cyan); }
  .tag.ok { background:var(--green-dim); color:var(--green); }
  .tag.partial { background:rgba(245,166,35,0.1); color:var(--amber); }
  .tag.error { background:var(--red-dim); color:var(--red); }
  .tag.warn { background:rgba(245,166,35,0.1); color:var(--amber); }
  .tag.stale { background:var(--red-dim); color:var(--red); }

  /* PIPELINE */
  .pipeline-row { display:flex; align-items:center; border-bottom:1px solid var(--border); }
  .pipeline-row:last-child { border-bottom:none; }
  .pr-type { width:120px; padding:9px 12px; font-size:11px; font-weight:600; color:var(--text-bright); text-transform:uppercase; letter-spacing:0.06em; }
  .pr-time { flex:1; padding:9px 12px; font-size:10px; color:var(--text-dim); }
  .pr-stats { padding:9px 12px; font-size:10px; color:var(--text-dim); display:flex; gap:12px; }
  .pr-stat-item { display:flex; gap:4px; } .pr-stat-val { color:var(--text); }

  /* MDD */
  .mdd-bar-track { height:6px; background:var(--bg3); border-radius:1px; overflow:hidden; position:relative; }
  .mdd-bar-fill { height:100%; border-radius:1px; transition:width 0.4s ease; }
  .mdd-ticks { display:flex; justify-content:space-between; margin-top:4px; }
  .mdd-tick { font-size:9px; color:var(--text-dim); }

  /* BSS GRID */
  .bss-grid-wrap { overflow:auto; }
  .bss-grid { border-collapse:collapse; }
  .bss-grid th { padding:5px 8px; font-size:9px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-dim); background:var(--bg2); border:1px solid var(--border); white-space:nowrap; }
  .bss-grid td { padding:0; border:1px solid var(--border); }
  .bss-station { padding:6px 10px; font-size:10px; font-weight:600; color:var(--text-bright); background:var(--bg2); white-space:nowrap; }
  .bss-cell-q { background:rgba(46,192,122,0.18); color:var(--green); font-size:10px; font-weight:600; text-align:center; padding:6px 4px; cursor:pointer; transition:background 0.1s; }
  .bss-cell-q:hover { background:rgba(46,192,122,0.32); }
  .bss-cell-m { background:rgba(245,166,35,0.10); color:var(--amber); font-size:10px; text-align:center; padding:6px 4px; cursor:pointer; transition:background 0.1s; }
  .bss-cell-m:hover { background:rgba(245,166,35,0.22); }
  .bss-cell-n { background:var(--bg1); color:var(--text-dim); font-size:10px; text-align:center; padding:6px 4px; cursor:pointer; transition:background 0.1s; }
  .bss-cell-n:hover { background:var(--bg3); }
  .bss-cell-p { background:rgba(232,64,64,0.10); color:var(--red); font-size:10px; text-align:center; padding:6px 4px; cursor:pointer; transition:background 0.1s; }
  .bss-cell-p:hover { background:rgba(232,64,64,0.2); }
  .bss-legend { display:flex; gap:16px; margin-top:10px; }
  .bss-leg-item { display:flex; align-items:center; gap:5px; font-size:9px; color:var(--text-dim); }
  .bss-leg-box { width:12px; height:12px; border-radius:1px; flex-shrink:0; }

  /* BSS DRILLDOWN PANEL */
  .drilldown-panel { position:fixed; top:0; right:0; width:320px; height:100vh; background:var(--bg1); border-left:1px solid var(--border2); z-index:200; overflow-y:auto; animation:slideInRight 0.18s ease; padding:0; }
  .drilldown-header { padding:12px 16px; background:var(--bg2); border-bottom:1px solid var(--border); display:flex; align-items:center; justify-content:space-between; position:sticky; top:0; z-index:1; }
  .drilldown-body { padding:14px 16px; }
  .dp-row { display:flex; justify-content:space-between; align-items:baseline; padding:5px 0; border-bottom:1px solid var(--border); }
  .dp-row:last-child { border-bottom:none; }
  .dp-key { font-size:10px; color:var(--text-dim); }
  .dp-val { font-size:11px; color:var(--text-bright); font-weight:500; }

  /* STATION CARDS */
  .station-cards-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .station-card { background:var(--bg1); border:1px solid var(--border); border-radius:3px; overflow:hidden; cursor:default; transition:border-color 0.15s; padding:12px; position:relative; }
  .station-card.good { border-left:3px solid var(--green); }
  .station-card.medium { border-left:3px solid var(--amber); }
  .station-card.poor { border-left:3px solid var(--red); }
  .sc-id { font-size:14px; font-weight:600; color:var(--amber); }
  .sc-city { font-size:9px; color:var(--text-dim); margin-bottom:8px; }
  .sc-score { font-size:11px; color:var(--text-bright); margin-bottom:6px; }
  .sc-mini-grid { display:flex; flex-direction:column; gap:2px; }
  .sc-mini-row { display:flex; gap:2px; }
  .sc-mini-cell { width:14px; height:10px; border-radius:1px; }

  /* MODALS */
  .modal-overlay { position:fixed; inset:0; background:rgba(5,6,8,0.88); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:500; animation:fadeIn 0.15s ease; padding:16px; }
  .modal-box { background:var(--bg1); border:1px solid var(--border2); border-radius:4px; box-shadow:0 24px 64px rgba(0,0,0,0.8); max-height:90vh; overflow-y:auto; }
  .modal-box::-webkit-scrollbar { width:3px; } .modal-box::-webkit-scrollbar-thumb { background:var(--border2); }
  .modal-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:var(--bg2); border-bottom:1px solid var(--border); position:sticky; top:0; z-index:1; }
  .modal-title { font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--text-mid); }
  .modal-close { background:transparent; border:1px solid var(--border2); color:var(--text-dim); cursor:pointer; padding:2px 7px; border-radius:2px; font-size:11px; font-family:var(--font-mono); transition:all 0.1s; }
  .modal-close:hover { border-color:var(--amber); color:var(--amber); }
  .modal-body { padding:16px; }
  .modal-skeleton { background:var(--bg2); border-radius:2px; animation:shimmer 1.2s ease-in-out infinite; }
  @keyframes shimmer { 0%,100%{opacity:0.4} 50%{opacity:0.8} }

  /* ACTION BUTTONS */
  .row-actions { display:flex; gap:4px; }
  .btn-sm { padding:1px 7px; border-radius:2px; font-family:var(--font-mono); font-size:9px; font-weight:600; cursor:pointer; border:none; text-transform:uppercase; letter-spacing:0.04em; transition:all 0.1s; }
  .btn-sm.cyan { background:rgba(0,212,216,0.1); color:var(--cyan); border:1px solid rgba(0,212,216,0.2); }
  .btn-sm.cyan:hover { background:rgba(0,212,216,0.2); }
  .btn-sm.amber { background:var(--amber-glow); color:var(--amber); border:1px solid var(--amber-dim); }
  .btn-sm.amber:hover { background:rgba(245,166,35,0.2); }
  .btn-sm.green { background:rgba(46,192,122,0.1); color:var(--green); border:1px solid rgba(46,192,122,0.2); }
  .btn-sm.green:hover { background:rgba(46,192,122,0.2); }

  /* MODELS TAB */
  .weight-bar-container { display:flex; height:32px; border-radius:2px; overflow:hidden; border:1px solid var(--border); }
  .weight-segment { display:flex; align-items:center; justify-content:center; font-size:8px; font-weight:600; color:rgba(0,0,0,0.7); transition:all 0.3s; cursor:default; position:relative; overflow:hidden; }
  .weight-segment.stale::after { content:''; position:absolute; inset:0; background:repeating-linear-gradient(45deg,rgba(0,0,0,0.2) 0px,rgba(0,0,0,0.2) 3px,transparent 3px,transparent 6px); }

  /* GH ACTIONS */
  .gh-row { display:flex; align-items:center; gap:0; border-bottom:1px solid var(--border); padding:8px 12px; }
  .gh-row:last-child { border-bottom:none; }
  .gh-workflow { width:130px; font-size:11px; font-weight:600; color:var(--text-bright); text-transform:uppercase; letter-spacing:0.04em; }
  .gh-status { width:100px; font-size:10px; }
  .gh-age { flex:1; font-size:10px; color:var(--text-dim); }
  .gh-duration { width:70px; font-size:10px; color:var(--text-dim); }
  .gh-link { font-size:9px; color:var(--cyan); text-decoration:none; border:1px solid var(--cyan-dim); padding:1px 6px; border-radius:2px; }
  .gh-link:hover { background:rgba(0,212,216,0.1); }

  /* SECTION HEADERS */
  .section-header { display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border); }
  .section-title { font-size:10px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--text-mid); }
  .section-sub { font-size:9px; color:var(--text-dim); margin-left:auto; }

  /* WIN BAR */
  .win-bar-track { display:flex; height:6px; border-radius:1px; overflow:hidden; }
  .win-bar-w { background:var(--green); transition:width 0.4s; }
  .win-bar-l { background:var(--red); transition:width 0.4s; }

  /* PARAMS */
  .param-row { display:flex; align-items:center; gap:0; border-bottom:1px solid var(--border); padding:0; }
  .param-row:last-child { border-bottom:none; }
  .param-key { width:280px; padding:8px 12px; font-size:10px; color:var(--text-bright); font-family:var(--font-mono); flex-shrink:0; }
  .param-val-cell { width:200px; padding:4px 8px; flex-shrink:0; }
  .param-input { width:100%; background:var(--bg0); border:1px solid var(--border2); color:var(--text-bright); padding:3px 6px; border-radius:2px; font-family:var(--font-mono); font-size:10px; outline:none; }
  .param-input:focus { border-color:var(--amber); }
  .param-dtype { width:60px; padding:8px 8px; font-size:9px; color:var(--text-dim); flex-shrink:0; }
  .param-desc { flex:1; padding:8px 12px; font-size:10px; color:var(--text-dim); font-family:var(--font-sans); }
  .param-search { background:var(--bg0); border:1px solid var(--border2); color:var(--text-bright); padding:5px 10px; border-radius:2px; font-family:var(--font-mono); font-size:11px; outline:none; width:260px; }
  .param-search:focus { border-color:var(--amber); }

  /* STATIONS */
  .station-row { display:flex; align-items:center; border-bottom:1px solid var(--border); }
  .station-row:last-child { border-bottom:none; }
  .st-id { width:70px; padding:8px 12px; font-size:11px; font-weight:600; color:var(--text-bright); }
  .st-city { flex:1; padding:8px 12px; font-size:10px; color:var(--text-mid); }
  .st-metar { width:120px; padding:8px 12px; }
  .st-obs { width:80px; padding:8px 12px; font-size:10px; color:var(--text-dim); text-align:right; }
  .metar-age { font-size:10px; }
  .metar-age.fresh { color:var(--green); } .metar-age.stale { color:var(--red); } .metar-age.warn { color:var(--amber); }

  /* AUDIT TRAIL */
  .audit-stage { border-left:3px solid var(--border2); padding:0 0 16px 16px; margin-bottom:4px; }
  .audit-stage.l2 { border-left-color:var(--cyan); }
  .audit-stage.l3 { border-left-color:var(--amber); }
  .audit-stage.l4g { border-left-color:var(--green); }
  .audit-stage.l4s { border-left-color:var(--purple); }
  .audit-stage-header { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px; cursor:pointer; }
  .audit-kv { display:grid; grid-template-columns:160px 1fr; gap:0; }
  .audit-k { font-size:10px; color:var(--text-dim); padding:3px 0; }
  .audit-v { font-size:10px; color:var(--text-bright); padding:3px 0; font-weight:500; }
  .audit-cascade-row { display:flex; align-items:center; gap:8px; padding:3px 0; font-size:10px; }
  .audit-mul { color:var(--text-dim); width:80px; }
  .audit-arrow { color:var(--text-dim); }
  .audit-result { color:var(--text-bright); font-weight:600; width:60px; }
  .audit-note { color:var(--text-dim); font-size:9px; }
  .gate-row { display:flex; align-items:center; gap:8px; padding:4px 0; border-bottom:1px solid var(--border); font-size:10px; }
  .gate-row:last-child { border-bottom:none; }
  .gate-name { width:70px; font-weight:600; }
  .gate-val { flex:1; color:var(--text-dim); }
  .gate-pass { color:var(--green); } .gate-fail { color:var(--red); }

  /* EMPTY / ERROR STATES */
  .empty-state { padding:32px; text-align:center; color:var(--text-dim); font-size:11px; }
  .empty-state .icon { font-size:24px; margin-bottom:8px; opacity:0.4; }

  /* LOADING */
  .loading-screen { display:flex; align-items:center; justify-content:center; height:100%; flex-direction:column; gap:12px; }
  .loading-dot { width:8px; height:8px; border-radius:50%; background:var(--amber); animation:pulse 1s ease-in-out infinite; }

  /* ANIMATIONS */
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes fadeIn { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideInRight { from{transform:translateX(100%)} to{transform:translateX(0)} }
  .fadein { animation:fadeIn 0.2s ease forwards; }
  .overflow-auto { overflow:auto; }
  .overflow-auto::-webkit-scrollbar { width:3px; height:3px; }
  .overflow-auto::-webkit-scrollbar-thumb { background:var(--border2); }

  /* NUCLEAR LAUNCH MODAL */
  .nuke-overlay { position:fixed; inset:0; background:rgba(10,0,0,0.92); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:9999; animation:fadeIn 0.2s ease; }
  .nuke-box { border: 2px solid var(--red); background: #000; padding: 40px 30px; width: 440px; max-width: 95vw; text-align: center; box-shadow: 0 0 50px rgba(232,64,64,0.15), inset 0 0 20px rgba(232,64,64,0.1); position: relative; overflow: hidden; }
  .nuke-box::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 6px; background: repeating-linear-gradient(45deg, var(--red) 0, var(--red) 10px, transparent 10px, transparent 20px); }
  .nuke-box::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; height: 6px; background: repeating-linear-gradient(-45deg, var(--red) 0, var(--red) 10px, transparent 10px, transparent 20px); }
  
  .nuke-header { color: var(--red); font-size: 20px; font-weight: 700; letter-spacing: 0.3em; text-transform: uppercase; margin-bottom: 24px; animation: pulse 1.2s infinite; text-shadow: 0 0 10px var(--red); }
  .nuke-text { color: var(--text); font-size: 11px; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.15em; line-height: 1.6; }
  
  .nuke-input-wrap { position: relative; margin-bottom: 24px; }
  .nuke-input { width: 100%; background: rgba(232,64,64,0.05); border: 1px solid var(--red-dim); color: var(--red); font-size: 28px; text-align: center; padding: 12px; font-family: var(--font-mono); letter-spacing: 0.4em; outline: none; transition: all 0.2s; }
  .nuke-input:focus { border-color: var(--red); box-shadow: 0 0 20px rgba(232,64,64,0.3), inset 0 0 10px rgba(232,64,64,0.2); background: rgba(232,64,64,0.1); }
  .nuke-input::placeholder { color: rgba(232,64,64,0.3); letter-spacing: 0.2em; font-size: 18px; }
  
  .nuke-btn { background: var(--red-dim); border: 1px solid var(--red); color: var(--red); font-family: var(--font-mono); font-size: 14px; font-weight: 700; padding: 14px; width: 100%; cursor: pointer; text-transform: uppercase; letter-spacing: 0.2em; transition: all 0.2s; position: relative; z-index: 20; }
  .nuke-btn:hover:not(:disabled) { background: var(--red); color: #000; box-shadow: 0 0 20px var(--red); }
  .nuke-btn:disabled { opacity: 0.4; cursor: not-allowed; border-color: var(--border); color: var(--text-dim); background: transparent; }
  
  .nuke-scanline { position: absolute; top:0; left:0; right:0; bottom:0; background: linear-gradient(to bottom, transparent 50%, rgba(0,0,0,0.4) 51%); background-size: 100% 4px; pointer-events: none; z-index: 10; opacity: 0.8; }
`;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = {
  usd:(v)=>v>=0?`+$${v.toFixed(2)}`:`-$${Math.abs(v).toFixed(2)}`,
  pct:(v)=>`${(v*100).toFixed(1)}%`,
  pct2:(v)=>`${(v*100).toFixed(2)}%`,
  ts:(s)=>{ const d=new Date(s); return `${d.toISOString().slice(0,10)} ${d.toISOString().slice(11,19)}Z`; },
  age:(m)=>m>=60?`${(m/60).toFixed(1)}h`:`${m}m`,
  ago:(isoStr)=>{
    if(!isoStr) return '—';
    const diff=(Date.now()-new Date(isoStr))/1000;
    if(diff<60) return `${Math.floor(diff)}s ago`;
    if(diff<3600) return `${Math.floor(diff/60)}m ago`;
    if(diff<86400) return `${(diff/3600).toFixed(1)}h ago`;
    return `${Math.floor(diff/86400)}d ago`;
  },
  dur:(sec)=>{ if(!sec) return '—'; const m=Math.floor(sec/60),s=sec%60; return `${m}m ${s}s`; },
};

function bssColor(bss) {
  if(bss>=0.07) return "bss-cell-q";
  if(bss>=0.03) return "bss-cell-m";
  if(bss>=0)    return "bss-cell-n";
  return "bss-cell-p";
}
function sevColor(s) { if(s>=0.8) return "var(--red)"; if(s>=0.6) return "var(--amber)"; return "var(--yellow)"; }
function mddColor(mdd) { if(mdd>=0.20) return "var(--red)"; if(mdd>=0.10) return "var(--amber)"; return "var(--green)"; }

function kalmanBiasStyle(bk, uk) {
  const magnitude = Math.min(Math.abs(bk)/3.0, 1.0);
  const certainty = Math.max(0.25, 1.0-uk/4.0);
  if(Math.abs(bk)<0.12) return {background:'transparent',color:'var(--muted)',text:''};
  if(bk>0) {
    const r=Math.round(180+75*magnitude),g=Math.round(80-76*magnitude),b=Math.round(80-76*magnitude);
    return {background:`rgba(${r},${g},${b},${certainty})`,color:magnitude>0.5?'#fff':'var(--red)',text:`+${bk.toFixed(1)}`};
  } else {
    const r=Math.round(40-30*magnitude),g=Math.round(100-40*magnitude),b=Math.round(180+55*magnitude);
    return {background:`rgba(${r},${g},${b},${certainty})`,color:magnitude>0.5?'#fff':'#6baed6',text:bk.toFixed(1)};
  }
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  {id:"overview",label:"Overview"},{id:"positions",label:"Positions"},
  {id:"bets",label:"Recent Bets"},{id:"alerts",label:"Alerts"},
  {id:"params",label:"Parameters"},{id:"bss",label:"BSS Matrix"},
  {id:"stations",label:"Stations"},{id:"models",label:"Models"},
  {id:"status",label:"Status"},
];

// ─── HOOKS ────────────────────────────────────────────────────────────────────

// ─── HOOKS ────────────────────────────────────────────────────────────────────

const EMPTY_STATE = {
  system: {
    trading_halted: false,
    paper_mode: true,
    db_connected: false,
    last_checked: null,
    bankroll: 0, portfolio_value: 0, daily_pnl: 0, cumulative_pnl: 0,
    mdd_alltime: 0, mdd_rolling_90: 0, cal: 0,
    n_bets_total: 0, n_bets_won: 0, n_bets_lost: 0,
    // Add the new fields
    sr_dollar: 0, sr_simple: 0, sharpe_rolling_30: 0, fdr: 0, eur: 0, market_cal: 0,
  },
  pipeline_runs: [],
  open_positions: [],
  recent_bets: [],
  alerts: [],
  params: [],
  bss_matrix: [],
  stations: [],
  kalman_states: [],
};

function useData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async (signal) => {
    const endpoints = [
      ['/api/system',         'system'],
      ['/api/pipeline_runs',  'pipeline_runs'],
      ['/api/positions',      'open_positions'],
      ['/api/bets',           'recent_bets'],
      ['/api/alerts',         'alerts'],
      ['/api/params',         'params'],
      //['/api/bss-matrix',     'bss_matrix'],
      //['/api/stations',       'stations'],
      //['/api/kalman-states',  'kalman_states'],
    ];

    try {
      const results = await Promise.allSettled(
        endpoints.map(([ep]) =>
          fetch(ep, { signal }).then(r => { 
            if (!r.ok) throw new Error(r.status); 
            return r.json(); 
          })
        )
      );

      // Prevent state updates if the component unmounted or request was aborted
      if (signal && signal.aborted) return;

      const merged = { ...EMPTY_STATE, system: { ...EMPTY_STATE.system } };
      results.forEach(({ status, value }, i) => {
        if (status === 'fulfilled') merged[endpoints[i][1]] = value;
      });

      if (results[0].status === 'fulfilled') {
        merged.system.db_connected = true;
      }

      setData(merged);
      setLoading(false);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('Data fetch error:', e);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    
    // Initial fetch
    fetchAll(controller.signal);
    
    // Poll every 60 seconds
    const t = setInterval(() => fetchAll(controller.signal), 60_000);
    
    // Cleanup on unmount
    return () => { 
      controller.abort(); 
      clearInterval(t); 
    };
  }, [fetchAll]);

  // Wrap manual refresh so it doesn't accidentally pass the event object as the signal
  return { data, loading, refresh: () => fetchAll() };
}

// Generic per-resource fetch hook — no mock fallback
function useApiFetch(url) {
  const [state, setState] = useState({ loading: Boolean(url), data: null, error: null });

  useEffect(() => {
    if (!url) {
      setState({ loading: false, data: null, error: null });
      return;
    }
    setState(s => ({ ...s, loading: true, error: null }));
    let cancelled = false;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { if (!cancelled) setState({ loading: false, data, error: null }); })
      .catch(err => { if (!cancelled) setState({ loading: false, data: null, error: err.message }); });
    return () => { cancelled = true; };
  }, [url]);

  return state;
}

// ─── MODAL: WRAPPER ───────────────────────────────────────────────────────────
function ModalWrapper({ onClose, title, width=560, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ width, maxWidth: '95vw' }}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── MODAL: DISTRIBUTION ──────────────────────────────────────────────────────
function DistributionModal({ ticker, onClose }) {
  const { loading, data, error } = useApiFetch(
    ticker ? `/api/shadow-book/${encodeURIComponent(ticker)}` : null
  );
  if (!ticker) return null;
  return (
    <ModalWrapper onClose={onClose} title={`Shadow Book — ${ticker}`} width={560}>
      <div className="modal-body">
        {loading && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div className="modal-skeleton" style={{ height: 200, marginBottom: 12, borderRadius: 3 }} />
            <div className="modal-skeleton" style={{ height: 40, borderRadius: 3 }} />
          </div>
        )}
        {!loading && data && <DistributionContent data={data} />}
        {!loading && !data && (
          <div className="empty-state">
            <div className="icon">📊</div>
            {error ? `Error: ${error}` : 'No shadow book data available for this ticker.'}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}

function DistributionContent({ data }) {
  const { xi_s, omega_s, alpha_s, mu, sigma_eff, bins = [], metar_truncated, t_obs_max } = data;
  const W=520,H=200,ml=10,mr=10,mt=20,mb=28;
  const iW=W-ml-mr, iH=H-mt-mb;
  const sigma = sigma_eff || 2.5, xMin=mu-4*sigma, xMax=mu+4*sigma;
  const sx=(x)=>ml+(x-xMin)/(xMax-xMin)*iW;
  const N=300;
  const pts=[];
  for(let i=0;i<=N;i++){
    const x=xMin+i/N*(xMax-xMin);
    pts.push({x,y:skewnormPDF(x,alpha_s||0,xi_s||mu,omega_s||sigma)});
  }
  const maxY=Math.max(...pts.map(p=>p.y),0.001);
  const sy=(y)=>H-mb-(y/maxY)*iH;
  const pathD=pts.map((p,i)=>`${i===0?'M':'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const areaD=pathD+` L${sx(xMax)},${sy(0)} L${sx(xMin)},${sy(0)} Z`;
  const activeBin=bins.find(b=>b.is_active);
  const pWin=activeBin?.p_win||0;
  const ticks=[-3,-2,-1,0,1,2,3].map(n=>({x:mu+n*sigma,label:`${(mu+n*sigma).toFixed(0)}°F`}))
    .filter(t=>t.x>=xMin&&t.x<=xMax);
  const interiorBins = bins.filter(b => b.bin_lower > -500 && b.bin_upper < 500);
  const binMaxP = Math.max(...interiorBins.map(b=>b.p_win), 0.01);

  return (
    <div>
      {metar_truncated && (
        <div style={{margin:'0 0 8px',padding:'5px 10px',background:'rgba(245,166,35,0.08)',border:'1px solid var(--amber-dim)',borderRadius:2,fontSize:9,color:'var(--amber)'}}>
          ⚠ Distribution truncated — T_obs_max = {t_obs_max}°F
        </div>
      )}
      <svg width={W} height={H} style={{display:'block',margin:'0 auto'}}>
        <defs>
          <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(245,166,35,0.25)"/>
            <stop offset="100%" stopColor="rgba(245,166,35,0.0)"/>
          </linearGradient>
          <linearGradient id="activeBinGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(245,166,35,0.35)"/>
            <stop offset="100%" stopColor="rgba(245,166,35,0.1)"/>
          </linearGradient>
        </defs>
        {activeBin && activeBin.bin_lower > -500 && activeBin.bin_upper < 500 && (
          <rect x={sx(Math.max(activeBin.bin_lower,xMin))} y={mt}
            width={sx(Math.min(activeBin.bin_upper,xMax))-sx(Math.max(activeBin.bin_lower,xMin))}
            height={iH} fill="url(#activeBinGrad)" rx={1}/>
        )}
        <path d={areaD} fill="url(#curveGrad)"/>
        <path d={pathD} fill="none" stroke="rgba(245,166,35,0.85)" strokeWidth={1.8}/>
        <line x1={ml} y1={H-mb} x2={W-mr} y2={H-mb} stroke="var(--border2)" strokeWidth={1}/>
        {ticks.map(t=>(
          <g key={t.label}>
            <line x1={sx(t.x)} y1={H-mb} x2={sx(t.x)} y2={H-mb+3} stroke="var(--border2)" strokeWidth={1}/>
            <text x={sx(t.x)} y={H-mb+11} textAnchor="middle" fontSize={8} fill="var(--text-dim)" fontFamily="IBM Plex Mono">{t.label}</text>
          </g>
        ))}
        <line x1={sx(mu)} y1={mt} x2={sx(mu)} y2={H-mb} stroke="rgba(245,166,35,0.4)" strokeWidth={1} strokeDasharray="3,3"/>
        {activeBin && activeBin.bin_lower > -500 && (
          <g>
            <rect x={sx((activeBin.bin_lower+activeBin.bin_upper)/2)-28} y={mt+4} width={56} height={14} rx={2} fill="var(--amber)" opacity={0.9}/>
            <text x={sx((activeBin.bin_lower+activeBin.bin_upper)/2)} y={mt+14} textAnchor="middle" fontSize={9} fontWeight={700} fill="#000" fontFamily="IBM Plex Mono">
              P={fmt.pct(pWin)}
            </text>
          </g>
        )}
      </svg>
      <div style={{marginTop:4,display:'flex',alignItems:'flex-end',gap:1,height:40,padding:'0 10px'}}>
        {interiorBins.map((b,i)=>(
          <div key={i} title={`${b.ticker}\nP(win)=${(b.p_win*100).toFixed(1)}%`}
            style={{
              flex:1,maxWidth:28,
              height:`${(b.p_win/binMaxP*100).toFixed(0)}%`,
              minHeight:2,
              background:b.is_active?'var(--amber)':'rgba(255,255,255,0.08)',
              borderRadius:'1px 1px 0 0',
              border:b.is_active?'1px solid var(--amber)':'none',
              transition:'height 0.3s',
            }}/>
        ))}
      </div>
      <div style={{height:1,background:'var(--border2)',margin:'0 10px'}}/>
      <div style={{display:'flex',gap:20,marginTop:10,padding:'8px 0 0',fontSize:10,color:'var(--text-dim)'}}>
        <span>μ = <strong style={{color:'var(--amber)'}}>{mu?.toFixed(1)}°F</strong></span>
        <span>σ_eff = <strong style={{color:'var(--text)'}}>{sigma_eff?.toFixed(2)}°F</strong></span>
        <span>G₁ = <strong style={{color:'var(--text)'}}>{data.g1_s?.toFixed(3)}</strong></span>
        <span>α = <strong style={{color:'var(--text)'}}>{alpha_s?.toFixed(3)}</strong></span>
        <span style={{marginLeft:'auto'}}>Model: <strong style={{color:'var(--cyan)'}}>{data.top_model_id}</strong></span>
      </div>
    </div>
  );
}

// ─── MODAL: IBE ───────────────────────────────────────────────────────────────
function IBEModal({ ticker, onClose }) {
  const { loading, data, error } = useApiFetch(
    ticker ? `/api/ibe-signals/${encodeURIComponent(ticker)}` : null
  );
  if (!ticker) return null;
  return (
    <ModalWrapper onClose={onClose} title={`IBE Signals — ${ticker}`} width={440}>
      <div className="modal-body">
        {loading && <div className="modal-skeleton" style={{ height: 340, borderRadius: 3 }} />}
        {!loading && data && <IBEContent data={data} />}
        {!loading && !data && (
          <div className="empty-state">
            <div className="icon">📡</div>
            {error ? `Error: ${error}` : 'No IBE signal data available.'}
            <div style={{fontSize:9,marginTop:4,color:'var(--text-dim)'}}>Signals are logged when a bet is evaluated in live mode.</div>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}

function IBEContent({ data }) {
  const signals=[
    {key:'KCV',raw:`${data.kcv_norm?.toFixed(3)} (norm)`,mod:data.kcv_mod},
    {key:'MPDS',raw:data.mpds_k?.toFixed(5),mod:data.mpds_mod},
    {key:'HMAS',raw:data.hmas?.toFixed(4),mod:data.hmas_mod},
    {key:'FCT',raw:data.fct?.toFixed(4),mod:data.fct_mod},
    {key:'SCAS',raw:data.scas?.toFixed(4),mod:data.scas_mod},
  ];
  const mods=[data.kcv_mod,data.mpds_mod,data.hmas_mod,data.fct_mod,data.scas_mod];
  const maxR=1.5;
  const CX=130,CY=130,R=95;
  const angles=mods.map((_,i)=>-Math.PI/2+i*2*Math.PI/5);
  const toXY=(a,v)=>({x:CX+R*(v/maxR)*Math.cos(a),y:CY+R*(v/maxR)*Math.sin(a)});
  const pts05=angles.map(a=>toXY(a,0.5));
  const pts10=angles.map(a=>toXY(a,1.0));
  const ptsMaxR=angles.map(a=>toXY(a,maxR));
  const ptsData=mods.map((m,i)=>toXY(angles[i],Math.min(m||0,maxR)));
  const polyStr=(pts)=>pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const LABELS=['KCV','MPDS','HMAS','FCT','SCAS'];
  const composite=data.composite||0;
  const compColor=composite>=1.0?'var(--green)':composite>=0.8?'var(--amber)':'var(--red)';
  return (
    <div>
      <div style={{display:'flex',gap:16,alignItems:'flex-start'}}>
        <svg width={260} height={260} style={{flexShrink:0}}>
          <polygon points={polyStr(pts05)} fill="none" stroke="var(--border2)" strokeWidth={0.5} strokeDasharray="2,2"/>
          <polygon points={polyStr(pts10)} fill="none" stroke="rgba(245,166,35,0.4)" strokeWidth={1} strokeDasharray="3,3"/>
          <polygon points={polyStr(ptsMaxR)} fill="none" stroke="var(--border)" strokeWidth={0.5}/>
          {angles.map((a,i)=>(<line key={i} x1={CX} y1={CY} x2={ptsMaxR[i].x} y2={ptsMaxR[i].y} stroke="var(--border2)" strokeWidth={0.5}/>))}
          <polygon points={polyStr(ptsData)} fill="rgba(0,212,216,0.15)" stroke="var(--cyan)" strokeWidth={1.5}/>
          {ptsData.map((p,i)=>(<circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--cyan)" stroke="var(--bg1)" strokeWidth={1}/>))}
          {angles.map((a,i)=>{const lp=toXY(a,maxR*1.15);return(
            <text key={i} x={lp.x} y={lp.y} textAnchor="middle" dominantBaseline="middle" fontSize={8} fill="var(--text-dim)" fontFamily="IBM Plex Mono">{LABELS[i]}</text>
          );})}
          {ptsData.map((p,i)=>(
            <text key={i} x={p.x+(Math.cos(angles[i])*18)} y={p.y+(Math.sin(angles[i])*14)} textAnchor="middle" dominantBaseline="middle" fontSize={8} fontWeight={600} fill="var(--cyan)" fontFamily="IBM Plex Mono">
              {(mods[i]||0).toFixed(2)}
            </text>
          ))}
          <text x={CX+4} y={CY-R*0.5/maxR+4} fontSize={7} fill="var(--text-dim)" fontFamily="IBM Plex Mono">0.5</text>
          <text x={CX+4} y={CY-R*1.0/maxR+4} fontSize={7} fill="rgba(245,166,35,0.6)" fontFamily="IBM Plex Mono">1.0</text>
        </svg>
        <div style={{flex:1,minWidth:0}}>
          <div style={{marginBottom:14,padding:'10px 12px',background:'var(--bg2)',borderRadius:3,border:'1px solid var(--border)'}}>
            <div style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Composite Modifier</div>
            <div style={{fontSize:28,fontWeight:600,color:compColor,lineHeight:1}}>{composite.toFixed(4)}</div>
            <div style={{fontSize:9,color:'var(--text-dim)',marginTop:3}}>
              {composite>=1.0?'↑ boosting bet size':composite>=0.8?'→ near-neutral':'↓ reducing bet size'}
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr>{['Signal','Raw','Mod',''].map(h=>(<th key={h} style={{padding:'4px 6px',fontSize:8,color:'var(--text-dim)',textAlign:'left',borderBottom:'1px solid var(--border)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{h}</th>))}</tr></thead>
            <tbody>
              {signals.map(s=>(
                <tr key={s.key}>
                  <td style={{padding:'5px 6px',fontSize:10,fontWeight:600,color:'var(--text-bright)'}}>{s.key}</td>
                  <td style={{padding:'5px 6px',fontSize:9,color:'var(--text-dim)',fontFamily:'monospace'}}>{s.raw}</td>
                  <td style={{padding:'5px 6px',fontSize:10,fontWeight:600,color:(s.mod||0)>=1.0?'var(--green)':(s.mod||0)>=0.8?'var(--amber)':'var(--red)'}}>{(s.mod||0).toFixed(4)}</td>
                  <td style={{padding:'5px 6px',fontSize:9,color:'var(--text-dim)'}}>{(s.mod||0)>=1.0?'▲':(s.mod||0)>=0.8?'→':'▼'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{marginTop:12,padding:'7px 10px',borderRadius:2,
        background:data.veto_triggered?'var(--red-dim)':'var(--green-dim)',
        border:`1px solid ${data.veto_triggered?'rgba(232,64,64,0.3)':'rgba(46,192,122,0.3)'}`,
        fontSize:10,color:data.veto_triggered?'var(--red)':'var(--green)',fontWeight:600}}>
        {data.veto_triggered ? `⚠ Veto triggered: ${data.veto_reason}` : '✓ No veto triggered'}
      </div>
      {data.recorded_at && <div style={{marginTop:8,fontSize:9,color:'var(--text-dim)'}}>Recorded {fmt.ts(data.recorded_at)}</div>}
    </div>
  );
}

// ─── MODAL: DECISION AUDIT ────────────────────────────────────────────────────
function AuditModal({ ticker, onClose }) {
  const { loading, data, error } = useApiFetch(
    ticker ? `/api/decision-audit/${encodeURIComponent(ticker)}` : null
  );
  if (!ticker) return null;
  return (
    <ModalWrapper onClose={onClose} title={`Decision Audit — ${ticker}`} width={600}>
      <div className="modal-body">
        {loading && (
          <>{[1,2,3,4].map(i=>(<div key={i} style={{marginBottom:16}}><div className="modal-skeleton" style={{height:16,width:120,marginBottom:8,borderRadius:2}}/><div className="modal-skeleton" style={{height:80,borderRadius:3}}/></div>))}</>
        )}
        {!loading && data && <AuditContent data={data} />}
        {!loading && !data && (
          <div className="empty-state">
            <div className="icon">🔍</div>
            {error ? `Error: ${error}` : 'Decision audit data not available for this ticker.'}
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}

function AuditContent({ data }) {
  const [open,setOpen]=useState({l2:true,l3:true,l4g:true,l4s:true});
  const tog=(k)=>setOpen(o=>({...o,[k]:!o[k]}));
  const l2=data.l2_ensemble||{};
  const l3=data.l3_pricing||{};
  const l4=data.l4_execution||{};
  const gateNames={edge:'Edge',spread:'Spread',skill:'Skill',lead:'Lead',reserved:'Reserved'};

  // Sizing cascade — use stored values from DB, derive what we can
  const bss    = data.bss  || 0;
  const phi    = data.phi  || Math.max(0.1, Math.min(1.0, bss / 0.25));
  const fstar  = l4.f_star  || 0;
  const f_phi  = l4.f_op && l4.f_op > 0 ? l4.f_op : +(fstar * phi).toFixed(4);
  const ibe    = l4.ibe_composite || 1;
  const f_ibe  = +(f_phi * ibe).toFixed(4);
  const gamma  = l4.gamma_convergence || 1.0;
  const f_gamma = +(f_ibe * gamma).toFixed(4);
  const dscale = l4.d_scale || 1.0;
  const ffinal = l4.f_final > 0 ? l4.f_final : +(f_gamma * dscale).toFixed(4);
  const bankroll = 1000;
  const contracts = Math.max(1, Math.floor(ffinal * bankroll / Math.max(l4.contract_price || 0.28, 0.01)));

  const KV=({k,v,accent})=>(
    <div className="audit-kv">
      <div className="audit-k">{k}</div>
      <div className="audit-v" style={accent?{color:accent}:{}}>{v||'—'}</div>
    </div>
  );

  return (
    <div>
      {/* L2 Ensemble */}
      <div className="audit-stage l2" style={{marginBottom:12}}>
        <div className="audit-stage-header" style={{color:'var(--cyan)'}} onClick={()=>tog('l2')}>
          <span>L2 — Ensemble State</span>
          <span style={{color:'var(--text-dim)',fontSize:9,marginLeft:'auto'}}>{open.l2?'▲':'▼'}</span>
        </div>
        {open.l2 && <div>
          <KV k="Top model" v={l2.top_model_id} accent="var(--cyan)"/>
          <KV k="M_k (models)" v={l2.m_k ? `${l2.m_k} models` : '—'}/>
          <KV k="F_top" v={l2.f_tk_top != null ? `${l2.f_tk_top.toFixed(1)}°F` : '—'}/>
          <KV k="F̄ (ensemble mean)" v={l2.f_bar_tk != null ? `${l2.f_bar_tk.toFixed(1)}°F` : '—'}/>
          <KV k="S_tk (spread)" v={l2.s_tk != null ? `${l2.s_tk.toFixed(2)}°F` : '—'}/>
          <KV k="σ_eff" v={l2.sigma_eff != null ? `${l2.sigma_eff.toFixed(2)}°F` : '—'}/>
          <KV k="B_k (Kalman bias)" v={l2.b_k != null ? `${l2.b_k > 0 ? '+' : ''}${l2.b_k.toFixed(3)}°F` : '—'} accent={l2.b_k > 0.5 ? 'var(--red)' : l2.b_k < -0.5 ? '#6baed6' : undefined}/>
          <KV k="U_k (uncertainty)" v={l2.u_k != null ? `${l2.u_k.toFixed(3)}°F²` : '—'}/>
          <KV k="μ (corrected)" v={<span style={{color:'var(--amber)',fontWeight:700}}>{((l2.f_tk_top||0)+(l2.b_k||0)).toFixed(1)}°F</span>}/>
          {l2.stale_model_ids && <KV k="Stale models" v={l2.stale_model_ids} accent="var(--amber)"/>}
        </div>}
      </div>

      {/* L3 Pricing */}
      <div className="audit-stage l3" style={{marginBottom:12}}>
        <div className="audit-stage-header" style={{color:'var(--amber)'}} onClick={()=>tog('l3')}>
          <span>L3 — Skew-Normal Pricing</span>
          <span style={{color:'var(--text-dim)',fontSize:9,marginLeft:'auto'}}>{open.l3?'▲':'▼'}</span>
        </div>
        {open.l3 && <div>
          <KV k="G₁_s (skewness)" v={l3.g1_s != null ? (l3.g1_s > 0 ? `+${l3.g1_s.toFixed(4)}` : l3.g1_s.toFixed(4)) : '0'} accent={l3.g1_s > 0.1 ? 'var(--red)' : l3.g1_s < -0.1 ? '#6baed6' : undefined}/>
          <KV k="α_s (shape)" v={l3.alpha_s?.toFixed(4) || '0'}/>
          <KV k="ξ_s (location)" v={l3.xi_s != null ? `${l3.xi_s.toFixed(2)}°F` : '—'}/>
          <KV k="ω_s (scale)" v={l3.omega_s != null ? `${l3.omega_s.toFixed(2)}°F` : '—'}/>
          <KV k="P(win)" v={<span style={{color:'var(--amber)',fontWeight:700}}>{fmt.pct(l3.p_win||0)}</span>}/>
          <KV k="METAR truncated" v={l3.metar_truncated ? <span style={{color:'var(--amber)'}}>Yes — T_obs={l3.t_obs_max}°F</span> : 'No'}/>
        </div>}
      </div>

      {/* Gates */}
      <div className="audit-stage l4g" style={{marginBottom:12}}>
        <div className="audit-stage-header" style={{color:'var(--green)'}} onClick={()=>tog('l4g')}>
          <span>L4 — Conviction Gates</span>
          <span style={{color:'var(--text-dim)',fontSize:9,marginLeft:'auto'}}>{open.l4g?'▲':'▼'}</span>
        </div>
        {open.l4g && <div>
          {Object.entries(l4.gate_flags||{edge:false,spread:false,skill:false,lead:false,reserved:true}).map(([k,pass])=>(
            <div key={k} className="gate-row">
              <span className={`gate-name ${pass?'gate-pass':'gate-fail'}`}>{pass?'✓':'✗'} {gateNames[k]||k}</span>
              <span className="gate-val">
                {k==='edge' && `p−c = ${(((l3.p_win||0)-(l4.contract_price||0))*100).toFixed(1)}¢`}
                {k==='spread' && `S = ${l2.s_tk?.toFixed(2)||'—'}°F  (max 4.0°F)`}
                {k==='skill' && `BSS = ${bss.toFixed(3)}  (enter ≥0.07)`}
                {k==='lead' && `ceil 72h`}
                {k==='reserved' && '—'}
              </span>
            </div>
          ))}
        </div>}
      </div>

      {/* Sizing */}
      <div className="audit-stage l4s">
        <div className="audit-stage-header" style={{color:'var(--purple)'}} onClick={()=>tog('l4s')}>
          <span>L4 — Kelly Sizing Chain</span>
          <span style={{color:'var(--text-dim)',fontSize:9,marginLeft:'auto'}}>{open.l4s?'▲':'▼'}</span>
        </div>
        {open.l4s && <div>
          {[
            {mul:`f* (Smirnov)`,val:fstar.toFixed(4),result:null,note:'raw Kelly fraction'},
            {mul:`× Φ(BSS=${bss.toFixed(3)}) = ${phi.toFixed(2)}`,val:null,result:f_phi.toFixed(4),note:'skill scaling'},
            {mul:`× IBE composite = ${ibe.toFixed(3)}`,val:null,result:f_ibe.toFixed(4),note:'IBE scaling'},
            {mul:`× Γ (conv.) = ${gamma.toFixed(3)}`,val:null,result:f_gamma.toFixed(4),note:'convergence'},
            {mul:`× D_scale = ${dscale.toFixed(2)}`,val:null,result:ffinal.toFixed(4),note:'drawdown + jitter'},
          ].map((row,i)=>(
            <div key={i} className="audit-cascade-row" style={{borderBottom:'1px solid var(--border)',paddingBottom:5,marginBottom:5}}>
              <span className="audit-mul">{row.mul}</span>
              {row.val && <span className="audit-result" style={{color:'var(--amber)'}}>{row.val}</span>}
              {row.result && <><span className="audit-arrow">→</span><span className="audit-result" style={{color:'var(--text-bright)'}}>{row.result}</span></>}
              <span className="audit-note">{row.note}</span>
            </div>
          ))}
          <div style={{marginTop:8,padding:'8px',background:'var(--bg2)',borderRadius:3,border:'1px solid var(--border)'}}>
            <div className="audit-kv"><div className="audit-k">f_final</div><div className="audit-v" style={{color:'var(--amber)',fontWeight:700}}>{ffinal.toFixed(4)}</div></div>
            <div className="audit-kv"><div className="audit-k">Dollar amount</div><div className="audit-v">${(ffinal*bankroll).toFixed(2)}</div></div>
            <div className="audit-kv"><div className="audit-k">Contracts</div><div className="audit-v" style={{color:'var(--text-bright)',fontWeight:700}}>{contracts} @ ${(l4.contract_price||0).toFixed(2)}</div></div>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ─── TAB: OVERVIEW ────────────────────────────────────────────────────────────
function OverviewTab({ data, liveBalance, onToggleTrading }) {
  const s = data.system;
  const params = data.params || [];
  
  // Read MDD thresholds from params (fallback to defaults if not found)
  const getParam = (key, def) => {
    const p = params.find(x => x.key === key);
    return p && p.value !== undefined ? Number(p.value) : def;
  };
  const mddSafe = getParam('drawdown.mdd_safe', 0.10);
  const mddHalt = getParam('drawdown.mdd_halt', 0.20);
  
  // Local MDD Color helper using dynamic thresholds
  const localMddColor = (mdd) => {
    if(mdd >= mddHalt) return "var(--red)";
    if(mdd >= mddSafe) return "var(--amber)";
    return "var(--green)";
  };

  const displayBankroll = liveBalance?.balance ?? s.bankroll ?? 0;
  const displayPortfolio = liveBalance?.portfolio_value ?? s.portfolio_value ?? 0;
  const winRate = s.n_bets_total > 0 ? s.n_bets_won / s.n_bets_total : 0;
  const mddFill = Math.min(s.mdd_alltime / mddHalt, 1) * 100;
  
  return (
    <div className="section fadein">
      <div className="section-header">
        <span className="section-title">Financial Snapshot</span>
        <span className="section-sub">Updated {fmt.ts(s.last_checked)}</span>
      </div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-label">Bankroll{s.paper_mode ? ' — Paper' : ' — Live'}</div>
          <div className="stat-val amber">${displayBankroll.toFixed(2)}</div>
          <div className="stat-sub" style={{color: s.paper_mode ? 'var(--cyan)' : 'var(--green)'}}>{s.paper_mode ? '📄 Paper mode' : '🔴 Live trading'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Portfolio Value</div>
          <div className="stat-val">${displayPortfolio.toFixed(2)}</div>
          <div className="stat-sub" style={{color:s.cumulative_pnl>=0?'var(--green)':'var(--red)'}}>{fmt.usd(s.cumulative_pnl)} cumulative</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Daily P&L</div>
          <div className={`stat-val ${s.daily_pnl>=0?'green':'red'}`}>{fmt.usd(s.daily_pnl)}</div>
          <div className="stat-sub">{s.n_bets_total} total bets</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">Win Rate</div>
          <div className="stat-val" style={{color:winRate>=0.55?'var(--green)':'var(--amber)'}}>{fmt.pct(winRate)}</div>
          <div className="stat-sub">{s.n_bets_won}W / {s.n_bets_lost}L</div>
        </div>
      </div>

      {/* NEW: Performance & Success Measures Grid */}
      <div className="section-header" style={{ marginTop: 8 }}>
        <span className="section-title">Performance Measures</span>
      </div>
      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <div className="stat-box">
          <div className="stat-label">Sharpe Ratio (30d)</div>
          <div className="stat-val" style={{color: s.sharpe_rolling_30 >= 1 ? 'var(--green)' : 'var(--text-bright)'}}>
            {s.sharpe_rolling_30?.toFixed(3) || '0.000'}
          </div>
          <div className="stat-sub">Simple SR: {s.sr_simple?.toFixed(3) || '0.000'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">CAL (Calibration)</div>
          <div className="stat-val" style={{color: s.cal <= 0.05 ? 'var(--green)' : 'var(--text-bright)'}}>
            {s.cal?.toFixed(4) || '0.0000'}
          </div>
          <div className="stat-sub">Market CAL: {s.market_cal?.toFixed(4) || '—'}</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">FDR</div>
          <div className="stat-val">{s.fdr?.toFixed(3) || '0.000'}</div>
          <div className="stat-sub">Fractional Drawdown Ratio</div>
        </div>
        <div className="stat-box">
          <div className="stat-label">EUR</div>
          <div className="stat-val">{s.eur?.toFixed(3) || '0.000'}</div>
          <div className="stat-sub">Expected Utility Ratio</div>
        </div>
      </div>

      <div style={{marginBottom:14,padding:'10px 12px',background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:3}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
          <span style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Max Drawdown (All-Time)</span>
          <span style={{fontSize:11,color:localMddColor(s.mdd_alltime),fontWeight:600}}>{fmt.pct2(s.mdd_alltime)}</span>
        </div>
        <div className="mdd-bar-track">
          <div className="mdd-bar-fill" style={{width:`${mddFill}%`,background:localMddColor(s.mdd_alltime)}}/>
        </div>
        <div className="mdd-ticks">
          <span className="mdd-tick">0%</span>
          <span className="mdd-tick" style={{color:'var(--amber)'}}>{(mddSafe*100).toFixed(0)}% WARN</span>
          <span className="mdd-tick" style={{color:'var(--red)'}}>{(mddHalt*100).toFixed(0)}% HALT</span>
        </div>
        <div style={{display:'flex',gap:16,marginTop:6}}>
          <span style={{fontSize:9,color:'var(--text-dim)'}}>90-DAY: <span style={{color:'var(--text)'}}>{fmt.pct2(s.mdd_rolling_90)}</span></span>
          <span style={{fontSize:9,color:'var(--text-dim)'}}>CAL: <span style={{color:'var(--text)'}}>{s.cal?.toFixed(4) || '0.0000'}</span></span>
          <span style={{fontSize:9,color:'var(--text-dim)',marginLeft:'auto'}}>{s.mdd_alltime>=mddHalt?<span style={{color:'var(--red)',fontWeight:600}}>⚠ HALTED</span>:s.mdd_alltime>=mddSafe?<span style={{color:'var(--amber)',fontWeight:600}}>▲ WARNING</span>:<span style={{color:'var(--green)',fontWeight:600}}>✓ NORMAL</span>}</span>
        </div>
      </div>
      <div style={{marginBottom:16}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
          <span style={{fontSize:9,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.1em'}}>Won {s.n_bets_won}</span>
          <span style={{fontSize:9,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{s.n_bets_lost} Lost</span>
        </div>
        <div className="win-bar-track" style={{height:5}}>
          <div className="win-bar-w" style={{width:`${winRate*100}%`}}/>
          <div className="win-bar-l" style={{width:`${(1-winRate)*100}%`}}/>
        </div>
      </div>
      <div className="grid-2">
        {/* Left Column: Pipeline Runs */}
        <div>
          <div className="section-header" style={{marginTop:8}}><span className="section-title">Pipeline Runs</span></div>
          <div className="card" style={{marginBottom:16}}>
            {data.pipeline_runs.length === 0 ? (
              <div className="empty-state">No pipeline run data available.</div>
            ) : data.pipeline_runs.map((r,i)=>(
              <div key={i} className="pipeline-row">
                <div className="pr-type">{r.type}</div>
                <div style={{padding:'9px 4px'}}><span className={`tag ${(r.status||'').toLowerCase()}`}>{r.status}</span></div>
                <div className="pr-time">{r.started ? fmt.ts(r.started) : '—'}</div>
                <div className="pr-stats">
                  {r.rows_daily>0&&<div className="pr-stat-item">daily: <span className="pr-stat-val">{r.rows_daily}</span></div>}
                  {r.rows_hourly>0&&<div className="pr-stat-item">hourly: <span className="pr-stat-val">{r.rows_hourly}</span></div>}
                  <div className="pr-stat-item">ok: <span className="pr-stat-val" style={{color:'var(--green)'}}>{r.stations_ok}</span></div>
                  {r.stations_fail>0&&<div className="pr-stat-item">fail: <span className="pr-stat-val" style={{color:'var(--red)'}}>{r.stations_fail}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Open Positions */}
        <div>
          <div className="section-header" style={{marginTop:8}}><span className="section-title">Open Positions</span><span className="section-sub">{data.open_positions.length} active</span></div>
          <div className="card" style={{marginBottom:16}}>
            {data.open_positions.length === 0 ? (
              <div className="empty-state">No open positions.</div>
            ) : (
              <table className="data-table"><thead><tr><th>Ticker</th><th>Type</th><th>Bin</th><th>Entry</th><th>Contracts</th></tr></thead>
                <tbody>{data.open_positions.map((p,i)=>(
                  <tr key={i}>
                    <td style={{color:'var(--text-dim)',fontSize:10}}>{p.ticker||'—'}</td>
                    <td><span className={`tag ${((p.target_type||'')).toLowerCase()}`}>{p.target_type}</span></td>
                    <td style={{color:'var(--cyan)',fontSize:11}}>{p.bin_lower?.toFixed(0)}–{p.bin_upper?.toFixed(0)}°F</td>
                    <td style={{color:'var(--amber)'}}>{(p.entry_price||0).toFixed(2)}</td>
                    <td style={{color:'var(--text-bright)'}}>{p.contracts}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: POSITIONS ───────────────────────────────────────────────────────────
function PositionsTab({ data, onOpenModal }) {
  const positions = data.open_positions || [];
  
  // Calculate exposure summaries
  let highExposure = 0;
  let lowExposure = 0;
  let totalExposure = 0;
  
  positions.forEach(p => {
    const cost = (p.contracts || 0) * (p.entry_price || 0);
    totalExposure += cost;
    if ((p.target_type || '').toUpperCase() === 'HIGH') highExposure += cost;
    if ((p.target_type || '').toUpperCase() === 'LOW') lowExposure += cost;
  });

  return (
    <div className="section fadein">
      <div className="section-header"><span className="section-title">Open Positions</span><span className="section-sub">{positions.length} active contracts</span></div>
      
      {/* Exposure Summary Added Here */}
      <div style={{padding:'10px 12px',background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:3,display:'flex',gap:24,marginBottom:16}}>
        {[
          {label:'Total Positions',val:positions.length},
          {label:'Total Contracts',val:positions.reduce((a,p)=>a+(p.contracts||0),0)},
          {label:'Total At Risk',val:`$${totalExposure.toFixed(2)}`, color: 'var(--amber)'},
          {label:'HIGH Exposure',val:`$${highExposure.toFixed(2)}`, color: 'var(--cyan)'},
          {label:'LOW Exposure',val:`$${lowExposure.toFixed(2)}`, color: 'var(--cyan)'},
        ].map(item=>(
          <div key={item.label}>
            <div style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{item.label}</div>
            <div style={{fontSize:14,fontWeight:500,color:item.color || 'var(--text-bright)'}}>{item.val}</div>
          </div>
        ))}
      </div>

      <div className="card">
        {positions.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div>No open positions.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Ticker</th><th>Station</th><th>Target</th><th>Type</th><th>Bin</th><th>Entry $</th><th>Qty</th><th>Order</th><th>Actions</th></tr></thead>
            <tbody>{positions.map((p,i)=>(
              <tr key={i}>
                <td style={{color:'var(--text-dim)',fontSize:9,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'}} title={p.ticker||''}>{p.ticker}</td>
                <td style={{color:'var(--text-bright)',fontWeight:600}}>{p.station_id}</td>
                <td style={{color:'var(--text-dim)',fontSize:10}}>{p.target_date ? String(p.target_date).slice(0,10) : '—'}</td>
                <td><span className={`tag ${(p.target_type||'').toLowerCase()}`}>{p.target_type}</span></td>
                <td style={{color:'var(--cyan)'}}>{p.bin_lower?.toFixed(0)}–{p.bin_upper?.toFixed(0)}°F</td>
                <td style={{color:'var(--amber)',fontWeight:500}}>{(p.entry_price||0).toFixed(2)}</td>
                <td style={{color:'var(--text-bright)'}}>{p.contracts}</td>
                <td><span className={`tag ${(p.order_type||'').toLowerCase()}`}>{p.order_type}</span></td>
                <td>
                  <div className="row-actions">
                    <button className="btn-sm cyan" onClick={()=>onOpenModal('dist',p.ticker)} title="Distribution">Dist.</button>
                    <button className="btn-sm amber" onClick={()=>onOpenModal('ibe',p.ticker)} title="IBE Signals">IBE</button>
                    <button className="btn-sm green" onClick={()=>onOpenModal('audit',p.ticker)} title="Decision Audit">Audit</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── TAB: BETS ────────────────────────────────────────────────────────────────
function BetsTab({ data }) {
  const bets = data.recent_bets;
  const betsWithPWin = bets.filter(b => b.p_win_at_entry != null);
  const aboveDiag = betsWithPWin.filter(b => b.p_win_at_entry > b.entry_price).length;
  const avgEdge = betsWithPWin.length
    ? betsWithPWin.reduce((a,b)=>a+(b.p_win_at_entry-b.entry_price),0)/betsWithPWin.length*100
    : 0;
  return (
    <div className="section fadein">
      <div className="section-header"><span className="section-title">Settled Bets</span><span className="section-sub">{bets.length} records</span></div>
      <div className="card">
        {bets.length === 0 ? (
          <div className="empty-state"><div className="icon">🎲</div>No settled bets yet.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Ticker</th><th>Station</th><th>Date</th><th>Type</th><th>Bin</th><th>Entry $</th><th>Qty</th><th>Outcome</th><th>Net P&L</th><th>Order</th></tr></thead>
            <tbody>{bets.map((b,i)=>(
              <tr key={i}>
                <td style={{color:'var(--text-dim)',fontSize:9}}>{b.ticker}</td>
                <td style={{color:'var(--text-bright)',fontWeight:600}}>{b.station||b.station_id}</td>
                <td style={{color:'var(--text-dim)',fontSize:10}}>{b.target_date}</td>
                <td><span className={`tag ${(b.type||b.target_type||'').toLowerCase()}`}>{b.type||b.target_type}</span></td>
                <td style={{color:'var(--cyan)'}}>{b.bin}</td>
                <td style={{color:'var(--amber)'}}>{(b.entry_price||0).toFixed(2)}</td>
                <td style={{color:'var(--text-bright)'}}>{b.contracts}</td>
                <td><span style={{padding:'1px 8px',borderRadius:2,fontSize:10,fontWeight:700,background:b.outcome===1?'var(--green-dim)':'var(--red-dim)',color:b.outcome===1?'var(--green)':'var(--red)'}}>{b.outcome===1?'WIN':'LOSS'}</span></td>
                <td style={{fontWeight:600,color:(b.pnl_net||0)>=0?'var(--green)':'var(--red)'}}>{(b.pnl_net||0)>=0?'+':''}{(b.pnl_net||0).toFixed(2)}</td>
                <td><span className={`tag ${(b.order_type||'').toLowerCase()}`}>{b.order_type}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div style={{height:12}}/>
      <div style={{padding:'10px 12px',background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:3,display:'flex',gap:24,marginBottom:20}}>
        {[
          {label:'Net P&L',val:`$${bets.reduce((a,b)=>a+(b.pnl_net||0),0).toFixed(2)}`,pos:bets.reduce((a,b)=>a+(b.pnl_net||0),0)>=0},
          {label:'Wins',val:bets.filter(b=>b.outcome===1).length,pos:true},
          {label:'Losses',val:bets.filter(b=>b.outcome===0).length,pos:false},
          {label:'Win Rate',val:`${bets.length?(bets.filter(b=>b.outcome===1).length/bets.length*100).toFixed(0):0}%`,pos:true},
        ].map(item=>(
          <div key={item.label}>
            <div style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{item.label}</div>
            <div style={{fontSize:14,fontWeight:500,color:item.pos?'var(--green)':'var(--red)'}}>{item.val}</div>
          </div>
        ))}
      </div>

      {betsWithPWin.length > 0 && (
        <>
          <div className="section-header"><span className="section-title">Edge Quality Scatter</span><span className="section-sub">{betsWithPWin.length} bets with P(win) data</span></div>
          <div className="card"><div className="card-body"><EdgeScatter bets={betsWithPWin} aboveDiag={aboveDiag} avgEdge={avgEdge}/></div></div>
        </>
      )}
    </div>
  );
}

function EdgeScatter({ bets, aboveDiag, avgEdge }) {
  const [hovered,setHovered]=useState(null);
  const W=540,H=240,ml=44,mr=20,mt=16,mb=32;
  const iW=W-ml-mr,iH=H-mt-mb;
  const sx=(v)=>ml+v*iW;
  const sy=(v)=>H-mb-v*iH;
  const eps=0.03;
  return (
    <div>
      <svg width={W} height={H} style={{display:'block',overflow:'visible'}}>
        {[0,0.2,0.4,0.6,0.8,1.0].map(v=>(
          <g key={v}>
            <line x1={ml} y1={sy(v)} x2={W-mr} y2={sy(v)} stroke="var(--border)" strokeWidth={0.5}/>
            <text x={ml-4} y={sy(v)+3} textAnchor="end" fontSize={8} fill="var(--text-dim)" fontFamily="IBM Plex Mono">{(v*100).toFixed(0)}%</text>
            <line x1={sx(v)} y1={mt} x2={sx(v)} y2={H-mb} stroke="var(--border)" strokeWidth={0.5}/>
            <text x={sx(v)} y={H-mb+11} textAnchor="middle" fontSize={8} fill="var(--text-dim)" fontFamily="IBM Plex Mono">{(v*100).toFixed(0)}¢</text>
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4,3"/>
        <line x1={ml} y1={H-mb} x2={W-mr} y2={H-mb} stroke="var(--border2)" strokeWidth={1}/>
        <line x1={ml} y1={mt} x2={ml} y2={H-mb} stroke="var(--border2)" strokeWidth={1}/>
        <text x={ml+iW/2} y={H-2} textAnchor="middle" fontSize={8} fill="var(--text-dim)" fontFamily="IBM Plex Mono">Entry Price</text>
        <text x={10} y={mt+iH/2} textAnchor="middle" fontSize={8} fill="var(--text-dim)" fontFamily="IBM Plex Mono" transform={`rotate(-90,10,${mt+iH/2})`}>P(win) at entry</text>
        {bets.map((b,i)=>{
          const cx=sx(b.entry_price||0), cy=sy(b.p_win_at_entry||0);
          const win=b.outcome===1;
          const isHov=hovered===i;
          return (
            <g key={b.ticker||i} onMouseEnter={()=>setHovered(i)} onMouseLeave={()=>setHovered(null)} style={{cursor:'default'}}>
              {win
                ? <circle cx={cx} cy={cy} r={isHov?7:5} fill={`rgba(46,192,122,${isHov?0.9:0.7})`} stroke="var(--green)" strokeWidth={isHov?1.5:1}/>
                : <><line x1={cx-4} y1={cy-4} x2={cx+4} y2={cy+4} stroke={`rgba(232,64,64,${isHov?1:0.75})`} strokeWidth={isHov?2:1.5}/><line x1={cx+4} y1={cy-4} x2={cx-4} y2={cy+4} stroke={`rgba(232,64,64,${isHov?1:0.75})`} strokeWidth={isHov?2:1.5}/></>
              }
            </g>
          );
        })}
        {hovered!=null && bets[hovered] && (()=>{
          const b=bets[hovered];
          const cx=sx(b.entry_price||0), cy=sy(b.p_win_at_entry||0);
          const edge=((b.p_win_at_entry||0)-(b.entry_price||0))*100;
          const tx=cx>W*0.7?cx-130:cx+10;
          const ty=cy<30?cy+10:cy-36;
          return (
            <g>
              <rect x={tx} y={ty} width={140} height={28} rx={2} fill="var(--bg2)" stroke="var(--border2)" strokeWidth={1}/>
              <text x={tx+6} y={ty+11} fontSize={9} fill="var(--text-bright)" fontFamily="IBM Plex Mono">{b.station||b.station_id||'—'}</text>
              <text x={tx+6} y={ty+22} fontSize={8} fill={edge>0?'var(--green)':'var(--red)'} fontFamily="IBM Plex Mono">Edge: {edge>0?'+':''}{edge.toFixed(1)}¢ · {b.outcome===1?'WIN':'LOSS'}</text>
            </g>
          );
        })()}
      </svg>
      <div style={{display:'flex',gap:20,marginTop:8,fontSize:10,color:'var(--text-dim)'}}>
        <span><span style={{color:'var(--green)',fontWeight:600}}>{aboveDiag}</span> bets above diagonal</span>
        <span><span style={{color:'var(--red)',fontWeight:600}}>{bets.length-aboveDiag}</span> below</span>
        <span style={{marginLeft:'auto'}}>Avg edge: <span style={{color:avgEdge>0?'var(--green)':'var(--red)',fontWeight:600}}>{avgEdge>0?'+':''}{avgEdge.toFixed(1)}¢</span></span>
      </div>
    </div>
  );
}

// ─── TAB: ALERTS ──────────────────────────────────────────────────────────────
function AlertsTab({ data, onResolve }) {
  const [ghRuns,setGhRuns]=useState(null);
  const [ghError,setGhError]=useState(false);
  const [ghLoading,setGhLoading]=useState(true);

  useEffect(()=>{
    let cancelled=false;
    const fetch_ = () => {
      // Changed to hit our new authenticated local route instead of the public GitHub API
      fetch(`/api/gh-actions`)
        .then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); })
        .then(d=>{
          if(cancelled) return;
          const byWorkflow={};
          for(const run of (d.workflow_runs||[])){
            const nm=(run.name||'unknown').toLowerCase();
            if(!byWorkflow[nm]) byWorkflow[nm]=run;
          }
          setGhRuns(Object.values(byWorkflow).slice(0,8));
          setGhError(false);
          setGhLoading(false);
        })
        .catch(e=>{ if(!cancelled){setGhError(true);setGhLoading(false);} });
    };
    fetch_();
    const t = setInterval(fetch_, 300_000);
    return ()=>{ cancelled=true; clearInterval(t); };
  },[]);

  const statusIcon=(s,conclusion)=>{
    const val=conclusion||s;
    if(val==='success') return <span style={{color:'var(--green)',fontWeight:700}}>✓ success</span>;
    if(val==='failure') return <span style={{color:'var(--red)',fontWeight:700}}>✗ failure</span>;
    if(s==='in_progress'||s==='queued') return <span style={{color:'var(--amber)',fontWeight:700}}>⟳ running</span>;
    return <span style={{color:'var(--text-dim)'}}>— {val}</span>;
  };

  const unresolved=data.alerts.filter(a=>!a.resolved);
  return (
    <div className="section fadein">
      <div className="section-header">
        <span className="section-title">Pipeline Schedule — GitHub Actions</span>
        {GH_REPO && <a href={`https://github.com/${GH_REPO}/actions`} target="_blank" rel="noreferrer" style={{fontSize:9,color:'var(--cyan)',marginLeft:'auto',textDecoration:'none'}}>{GH_REPO} ↗</a>}
      </div>
      <div className="card" style={{marginBottom:20}}>
        {ghLoading && <div style={{padding:'12px 16px',fontSize:10,color:'var(--text-dim)'}}>Loading GitHub Actions status…</div>}
        {!ghLoading && ghError && !GH_REPO && <div style={{padding:'12px 16px',fontSize:10,color:'var(--text-dim)'}}>Set <code style={{color:'var(--amber)'}}>NEXT_PUBLIC_GH_REPO</code> in .env.local to enable GitHub Actions status.</div>}
        {!ghLoading && ghError && GH_REPO && <div style={{padding:'12px 16px',fontSize:10,color:'var(--text-dim)'}}>GitHub Actions unavailable (rate limit or auth error). <a href={`https://github.com/${GH_REPO}/actions`} target="_blank" rel="noreferrer" style={{color:'var(--cyan)'}}>View on GitHub ↗</a></div>}
        {!ghLoading && ghRuns && ghRuns.map((run,i)=>(
          <div key={i} className="gh-row">
            <div className="gh-workflow">{run.name}</div>
            <div className="gh-status">{statusIcon(run.status,run.conclusion)}</div>
            <div className="gh-age">{fmt.ago(run.updated_at||run.created_at)}</div>
            <div className="gh-duration">{run.run_duration_ms?fmt.dur(Math.round(run.run_duration_ms/1000)):''}</div>
            <a href={run.html_url} target="_blank" rel="noreferrer" className="gh-link">Logs ↗</a>
          </div>
        ))}
      </div>

      <div className="section-header">
        <span className="section-title">System Alerts</span>
        <span className="section-sub">{unresolved.length} unresolved</span>
      </div>
      {data.alerts.length === 0 ? (
        <div className="empty-state"><div className="icon">✅</div>No alerts.</div>
      ) : data.alerts.map(a=>(
        <div key={a.id} style={{
          marginBottom:8,padding:'10px 14px',
          background:a.resolved?'var(--bg1)':'var(--bg2)',
          border:`1px solid ${a.resolved?'var(--border)':'var(--border2)'}`,
          borderLeft:`3px solid ${a.resolved?'var(--muted)':sevColor(a.severity||0)}`,
          borderRadius:3,opacity:a.resolved?0.55:1,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
            <span style={{fontSize:10,fontWeight:700,color:a.resolved?'var(--text-dim)':sevColor(a.severity||0),textTransform:'uppercase',letterSpacing:'0.06em'}}>{a.type}</span>
            {a.station&&<span style={{fontSize:9,color:'var(--text-dim)'}}>{a.station}</span>}
            <span style={{fontSize:9,color:'var(--text-dim)',marginLeft:'auto'}}>{a.ts ? fmt.ts(a.ts) : '—'}</span>
            {!a.resolved&&<button onClick={()=>onResolve(a.id)} style={{padding:'1px 8px',background:'transparent',border:'1px solid var(--border2)',color:'var(--text-dim)',cursor:'pointer',borderRadius:2,fontSize:9,fontFamily:'var(--font-mono)'}}>Resolve</button>}
          </div>
          <div style={{fontSize:10,color:'var(--text-dim)'}}>{typeof a.detail==='string'?a.detail:JSON.stringify(a.detail)}</div>
          {a.resolved&&<div style={{fontSize:9,color:'var(--muted)',marginTop:3}}>RESOLVED</div>}
        </div>
      ))}
    </div>
  );
}

// ─── TAB: PARAMS ──────────────────────────────────────────────────────────────
function ParamsTab({ data }) {
  const [search,setSearch]=useState('');
  const [values,setValues]=useState(()=>Object.fromEntries((data.params||[]).map(p=>[p.key,p.value||''])));
  const [dirty,setDirty]=useState({});
  const [saving,setSaving]=useState(false);

  const filtered=(data.params||[]).filter(p=>
    p.key.includes(search.toLowerCase())||
    (p.description||'').toLowerCase().includes(search.toLowerCase())
  );

  const onChange=(key,val)=>{
    setValues(v=>({...v,[key]:val}));
    setDirty(d=>({...d,[key]:true}));
  };

  const saveChanges=async()=>{
    setSaving(true);
    const changed=Object.keys(dirty).map(k=>({key:k,value:values[k]}));
    try {
      const res = await fetch('/api/params', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch(e) {
      console.error('Params save error:', e);
    }
    setDirty({});
    setSaving(false);
  };

  const discard=()=>{
    setValues(Object.fromEntries((data.params||[]).map(p=>[p.key,p.value||''])));
    setDirty({});
  };

  return (
    <div className="section fadein">
      <div className="section-header">
        <span className="section-title">System Parameters</span>
        <span className="section-sub">{(data.params||[]).length} params · {Object.keys(dirty).length} unsaved</span>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center'}}>
        <input className="param-search" placeholder="Filter by key or description…"
          value={search} onChange={e=>setSearch(e.target.value)}/>
        {Object.keys(dirty).length>0&&(
          <>
            <button onClick={saveChanges} disabled={saving} style={{padding:'4px 14px',background:'var(--green)',color:'#000',border:'none',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:10,fontWeight:700,cursor:'pointer',letterSpacing:'0.06em',textTransform:'uppercase'}}>
              {saving?'Saving…':`Save ${Object.keys(dirty).length}`}
            </button>
            <button onClick={discard} style={{padding:'4px 10px',background:'transparent',color:'var(--text-dim)',border:'1px solid var(--border2)',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:10,cursor:'pointer'}}>
              Discard
            </button>
          </>
        )}
      </div>
      <div className="card">
        <div style={{display:'flex',background:'var(--bg2)',borderBottom:'1px solid var(--border)'}}>
          {[['Key',280],['Value',200],['Type',60],['Description','1fr']].map(([h,w])=>(
            <div key={h} style={{width:typeof w==='number'?w:undefined,flex:typeof w==='string'?1:undefined,padding:'5px 12px',fontSize:9,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)'}}>{h}</div>
          ))}
        </div>
        <div className="overflow-auto" style={{maxHeight:500}}>
          {filtered.length === 0 ? (
            <div className="empty-state">No parameters match.</div>
          ) : filtered.map(p=>(
            <div key={p.key} className="param-row" style={dirty[p.key]?{background:'rgba(245,166,35,0.03)'}:{}}>
              <div className="param-key" style={{color:'var(--cyan)'}}>
                {p.key}{dirty[p.key]&&<span style={{color:'var(--amber)',marginLeft:5}}>●</span>}
              </div>
              <div className="param-val-cell">
                <input className="param-input" style={{color:dirty[p.key]?'var(--amber)':'var(--text-bright)',borderColor:dirty[p.key]?'var(--amber-dim)':'transparent'}}
                  value={values[p.key]??p.value??''}
                  onChange={e=>onChange(p.key,e.target.value)}/>
              </div>
              <div className="param-dtype">{p.dtype}</div>
              <div className="param-desc">{p.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BSS DRILLDOWN ────────────────────────────────────────────────────────────
function BSSdrilldown({ cell, onClose }) {
  useEffect(()=>{
    const h=(e)=>{ if(e.key==='Escape') onClose(); };
    window.addEventListener('keydown',h);
    return()=>window.removeEventListener('keydown',h);
  },[onClose]);
  if(!cell) return null;
  const bssCol=cell.bss>=0.07?'var(--green)':cell.bss>=0.03?'var(--amber)':cell.bss>=0?'var(--text-dim)':'var(--red)';
  return (
    <div className="drilldown-panel">
      <div className="drilldown-header">
        <div>
          <div style={{fontSize:12,fontWeight:700,color:'var(--text-bright)'}}>{cell.station} · {cell.type} · {cell.bracket}</div>
          <div style={{fontSize:9,color:'var(--text-dim)',marginTop:1}}>BSS Skill Matrix Cell</div>
        </div>
        <button className="modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="drilldown-body">
        <div style={{padding:'14px 0 12px',borderBottom:'1px solid var(--border)',marginBottom:12}}>
          <div style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:4}}>Current BSS</div>
          <div style={{fontSize:32,fontWeight:600,color:bssCol,lineHeight:1}}>{cell.bss.toFixed(4)}</div>
          <div style={{marginTop:8}}>
            <span style={{display:'inline-block',padding:'2px 10px',borderRadius:2,fontSize:10,fontWeight:700,
              background:cell.qualified?'var(--green-dim)':'var(--red-dim)',
              color:cell.qualified?'var(--green)':'var(--red)',
              border:`1px solid ${cell.qualified?'rgba(46,192,122,0.3)':'rgba(232,64,64,0.3)'}`}}>
              {cell.qualified?'QUALIFIED':'UNQUALIFIED'}
            </span>
          </div>
        </div>
        {[
          ['BS Model',cell.bs_model?.toFixed(5)||'—'],
          ['BS Baseline (clim.)',cell.bs_baseline_1?.toFixed(5)||'0.06667'],
          ['N observations',cell.n_observations||'—'],
          ['Lead bracket',cell.bracket],
          ['Target type',cell.type],
          ['Station',cell.station],
        ].map(([k,v])=>(
          <div key={k} className="dp-row"><span className="dp-key">{k}</span><span className="dp-val">{v}</span></div>
        ))}
        <div style={{marginTop:14,padding:'10px',background:'var(--bg2)',borderRadius:3,border:'1px solid var(--border)'}}>
          <div style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:6}}>Skill Gate Thresholds</div>
          <div style={{display:'flex',gap:0,borderRadius:2,overflow:'hidden',height:18}}>
            <div style={{flex:3,background:'var(--red-dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'var(--red)'}}>exit &lt;0.03</div>
            <div style={{flex:4,background:'rgba(245,166,35,0.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'var(--amber)'}}>0.03–0.07</div>
            <div style={{flex:10,background:'var(--green-dim)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'var(--green)'}}>qualified ≥0.07</div>
          </div>
          <div style={{marginTop:6,fontSize:9,color:'var(--text-dim)'}}>
            Current: <span style={{color:bssCol,fontWeight:700}}>{cell.bss.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: BSS MATRIX ─────────────────────────────────────────────────────────
function BSSTab({ data }) {
  const [filterType,setFilterType]=useState('ALL');
  const [viewMode,setViewMode]=useState('grid');
  const [drillCell,setDrillCell]=useState(null);
  const [sortBy,setSortBy]=useState('score');

  const matrix=data.bss_matrix||[];
  const stations=[...new Set(matrix.map(r=>r.station))];
  const brackets=['h1','h2','h3','h4','h5'];
  const types=filterType==='ALL'?['HIGH','LOW']:[filterType];

  const getCell=(station,type,bracket)=>matrix.find(r=>r.station===station&&r.type===type&&r.bracket===bracket);
  const qualified=matrix.filter(r=>r.qualified).length;

  const stationCards=stations.map(st=>{
    const cells=matrix.filter(r=>r.station===st);
    const qCells=cells.filter(r=>r.qualified);
    const meanBSS=cells.length>0?cells.reduce((a,r)=>a+r.bss,0)/cells.length:0;
    const hStar=qCells.length>0?[...new Set(qCells.map(r=>r.bracket))].sort().pop():null;
    const city = data.stations?.find(s=>s.id===st)?.city || '';
    return {id:st,city,meanBSS,qCount:qCells.length,hStar,cells};
  });

  const sortedCards=[...stationCards].sort((a,b)=>sortBy==='score'?b.meanBSS-a.meanBSS:a.id.localeCompare(b.id));

  return (
    <div className="section fadein" style={{position:'relative'}}>
      <div className="section-header">
        <span className="section-title">BSS Skill Matrix</span>
        <span style={{fontSize:9,color:'var(--text-dim)'}}>{qualified}/{matrix.length} cells qualified</span>
        <div style={{marginLeft:'auto',display:'flex',gap:6,alignItems:'center'}}>
          {['grid','cards'].map(v=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:'2px 10px',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:9,fontWeight:600,cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em',background:viewMode===v?'var(--amber)':'transparent',color:viewMode===v?'#000':'var(--text-dim)',border:`1px solid ${viewMode===v?'var(--amber)':'var(--border2)'}`}}>{v}</button>
          ))}
          {['ALL','HIGH','LOW'].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{padding:'2px 10px',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:9,fontWeight:600,cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em',background:filterType===t?'rgba(0,212,216,0.15)':'transparent',color:filterType===t?'var(--cyan)':'var(--text-dim)',border:`1px solid ${filterType===t?'var(--cyan-dim)':'var(--border2)'}`}}>{t}</button>
          ))}
        </div>
      </div>

      {matrix.length === 0 && <div className="empty-state"><div className="icon">📊</div>No BSS data — BSS matrix populates after the first evaluation cycle (night pipeline).</div>}

      {matrix.length > 0 && viewMode==='grid' && (
        <>
          <div className="card bss-grid-wrap overflow-auto" style={{marginBottom:12}}>
            <table className="bss-grid">
              <thead>
                <tr>
                  <th style={{textAlign:'left',minWidth:72}}>Station</th>
                  {types.map(tt=>brackets.map(lb=>(<th key={`${tt}-${lb}`}>{tt[0]}{lb}</th>)))}
                </tr>
              </thead>
              <tbody>
                {stations.map(st=>(
                  <tr key={st}>
                    <td className="bss-station">{st}</td>
                    {types.map(tt=>brackets.map(lb=>{
                      const cell=getCell(st,tt,lb);
                      const cls=cell?bssColor(cell.bss):'bss-cell-n';
                      return (
                        <td key={`${tt}-${lb}`}>
                          <div className={cls} title={`${st} · ${tt} · ${lb}: BSS=${cell?.bss?.toFixed(4)||'N/A'}${cell?.qualified?' ✓':''}`}
                            onClick={()=>setDrillCell(cell?{...cell,station:st,type:tt,bracket:lb}:null)}>
                            {cell?cell.bss.toFixed(2):'—'}
                          </div>
                        </td>
                      );
                    }))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bss-legend">
            {[{cls:'bss-cell-q',label:'Qualified (≥0.07)'},{cls:'bss-cell-m',label:'Marginal (0.03–0.07)'},{cls:'bss-cell-n',label:'Below exit (<0.03)'},{cls:'bss-cell-p',label:'Negative'}].map(({cls,label})=>(
              <div key={cls} className="bss-leg-item"><div className={`bss-leg-box ${cls}`}/><span>{label}</span></div>
            ))}
            <span style={{marginLeft:'auto',fontSize:9,color:'var(--text-dim)'}}>Click any cell for drilldown</span>
          </div>
        </>
      )}

      {matrix.length > 0 && viewMode==='cards' && (
        <>
          <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center'}}>
            <span style={{fontSize:9,color:'var(--text-dim)'}}>Sort:</span>
            {[['score','Skill Score'],['id','Station ID']].map(([v,l])=>(
              <button key={v} onClick={()=>setSortBy(v)} style={{padding:'2px 8px',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:9,fontWeight:600,cursor:'pointer',textTransform:'uppercase',background:sortBy===v?'var(--amber-glow)':'transparent',color:sortBy===v?'var(--amber)':'var(--text-dim)',border:`1px solid ${sortBy===v?'var(--amber-dim)':'var(--border2)'}`}}>{l}</button>
            ))}
          </div>
          <div className="station-cards-grid">
            {sortedCards.map(sc=>{
              const borderClass=sc.qCount>=3?'good':sc.qCount>=1?'medium':'poor';
              return (
                <div key={sc.id} className={`station-card ${borderClass}`}>
                  <div className="sc-id">{sc.id}</div>
                  <div className="sc-city">{sc.city}</div>
                  <div className="sc-score" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Mean BSS: <strong style={{color:sc.meanBSS>=0.07?'var(--green)':sc.meanBSS>=0.03?'var(--amber)':'var(--red)'}}>{sc.meanBSS.toFixed(3)}</strong></span>
                    {sc.hStar&&<span style={{fontSize:9,color:'var(--cyan)'}}>h*={sc.hStar}</span>}
                  </div>
                  <div style={{fontSize:9,color:'var(--text-dim)',marginBottom:5}}>{sc.qCount}/10 cells qualified</div>
                  <div className="sc-mini-grid">
                    {['HIGH','LOW'].map(tt=>(
                      <div key={tt} className="sc-mini-row">
                        <span style={{fontSize:7,color:'var(--text-dim)',width:12,flexShrink:0}}>{tt[0]}</span>
                        {brackets.map(lb=>{
                          const cell=getCell(sc.id,tt,lb);
                          const bg=!cell?'var(--bg3)':cell.bss>=0.07?'rgba(46,192,122,0.45)':cell.bss>=0.03?'rgba(245,166,35,0.35)':cell.bss>=0?'rgba(255,255,255,0.06)':'rgba(232,64,64,0.3)';
                          return (<div key={lb} className="sc-mini-cell" style={{background:bg}} title={`${sc.id} ${tt} ${lb}: ${cell?cell.bss.toFixed(3):'N/A'}`} onClick={()=>setDrillCell(cell?{...cell,station:sc.id,type:tt,bracket:lb}:null)}/>);
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {drillCell && (
        <><div style={{position:'fixed',inset:0,zIndex:150}} onClick={()=>setDrillCell(null)}/><BSSdrilldown cell={drillCell} onClose={()=>setDrillCell(null)}/></>
      )}
    </div>
  );
}

// ─── TAB: STATIONS ────────────────────────────────────────────────────────────
function StationsTab({ data }) {
  const stations=data.stations||[];
  const live=stations.filter(s=>s.metar_age_min<60).length;
  const warn=stations.filter(s=>s.metar_age_min>=60&&s.metar_age_min<120).length;
  const stale=stations.filter(s=>s.metar_age_min>=120).length;
  return (
    <div className="section fadein">
      <div className="section-header">
        <span className="section-title">Station Health — METAR Freshness</span>
        <span className="section-sub">Stale threshold: 120 min</span>
      </div>
      <div style={{display:'flex',gap:12,marginBottom:12}}>
        {[{label:'Live',val:live,color:'var(--green)'},{label:'Warn',val:warn,color:'var(--amber)'},{label:'Stale',val:stale,color:'var(--red)'}].map(({label,val,color})=>(
          <div key={label} style={{padding:'8px 16px',background:'var(--bg1)',border:`1px solid var(--border)`,borderLeft:`3px solid ${color}`,borderRadius:3}}>
            <div style={{fontSize:9,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{label}</div>
            <div style={{fontSize:18,fontWeight:600,color}}>{val}</div>
          </div>
        ))}
      </div>
      <div className="card">
        {stations.length === 0 ? (
          <div className="empty-state"><div className="icon">📡</div>No station data available.</div>
        ) : (
          <>
            <div style={{display:'flex',background:'var(--bg2)',borderBottom:'1px solid var(--border)'}}>
              {[['Station',70],['City','flex'],['METAR Age',120],['Obs Count',80],['Status',80]].map(([h,w])=>(
                <div key={h} style={{width:typeof w==='number'?w:undefined,flex:typeof w==='string'?1:undefined,padding:'5px 12px',fontSize:9,fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--text-dim)'}}>{h}</div>
              ))}
            </div>
            <div className="overflow-auto" style={{maxHeight:500}}>
              {stations.map(st=>{
                const isStale=st.metar_age_min>=120;
                const isWarn=st.metar_age_min>=60&&!isStale;
                const cls=isStale?'stale':isWarn?'warn':'fresh';
                return (
                  <div key={st.id} className="station-row">
                    <div className="st-id">{st.id}</div>
                    <div className="st-city">{st.city}</div>
                    <div className="st-metar"><span className={`metar-age ${cls}`}>{st.metar_age_min<9999?fmt.age(st.metar_age_min)+' ago':'No data'}</span></div>
                    <div className="st-obs">{st.obs_count} obs</div>
                    <div style={{width:80,padding:'8px 12px'}}>
                      <span className={`tag ${isStale?'error':isWarn?'warn':'ok'}`}>{isStale?'STALE':isWarn?'WARN':'LIVE'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB: MODELS ─────────────────────────────────────────────────────────────
// ─── TAB: MODELS ─────────────────────────────────────────────────────────────
function ModelsTab({ data }) {
  // Derive station list from live stations data
  const stationIds = (data.stations || []).map(s => s.id);
  const defaultStation = stationIds[0] || 'KNYC';
  const [selectedStation,setSelectedStation]=useState(defaultStation);

  // ADD THIS: Update selectedStation when stationIds populates after initial load
  useEffect(() => {
    if (stationIds.length > 0 && !stationIds.includes(selectedStation)) {
      setSelectedStation(stationIds[0]);
    }
  }, [stationIds, selectedStation]);

  const { loading: weightsLoading, data: weightsData } = useApiFetch(
    `/api/ensemble-weights?station=${selectedStation}`
  );

  const kalmanStates=data.kalman_states||[];
  const bigBias=kalmanStates.filter(k=>Math.abs(k.b_k||0)>1.0).length;
  const highUnc=kalmanStates.filter(k=>(k.u_k||0)>2.0).length;
  const stationsForGrid = stationIds.length > 0 ? stationIds : ['KNYC'];

  return (
    <div className="section fadein">
      {/* Kalman Heatmap */}
      <div className="section-header">
        <span className="section-title">Kalman Bias Heatmap</span>
        <span style={{fontSize:9,color:'var(--text-dim)',marginLeft:'auto'}}>
          {bigBias} filters |B_k| &gt;1°F · {highUnc} high uncertainty (U_k &gt;2)
        </span>
      </div>
      <div className="card" style={{marginBottom:8,overflowX:'auto'}}>
        {kalmanStates.length === 0 ? (
          <div className="empty-state"><div className="icon">🌡️</div>No Kalman state data — populates after the first night pipeline run.</div>
        ) : (
          <div style={{minWidth:720}}>
            <div style={{display:'flex',borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
              <div style={{width:60,padding:'6px 10px',fontSize:8,fontWeight:600,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.08em',flexShrink:0}}>Type</div>
              {stationsForGrid.map(sid=>(
                <div key={sid} style={{flex:1,minWidth:42,padding:'6px 2px',fontSize:8,fontWeight:600,color:'var(--text-dim)',textAlign:'center',textTransform:'uppercase',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={sid}>
                  {sid.slice(1)}
                </div>
              ))}
            </div>
            {['HIGH','LOW'].map(tt=>(
              <div key={tt} style={{display:'flex',borderBottom:tt==='HIGH'?'1px solid var(--border)':'none'}}>
                <div style={{width:60,padding:'0 10px',fontSize:9,fontWeight:700,color:'var(--text-mid)',flexShrink:0,display:'flex',alignItems:'center',background:'var(--bg2)',borderRight:'1px solid var(--border)'}}>{tt}</div>
                {stationsForGrid.map(sid=>{
                  const ks=kalmanStates.find(k=>k.station_id===sid&&k.target_type===tt);
                  const bk=ks?.b_k??0;
                  const uk=ks?.u_k??4;
                  const style_=kalmanBiasStyle(bk,uk);
                  return (
                    <div key={sid} style={{flex:1,minWidth:42,height:36,background:style_.background||'var(--bg1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:600,color:style_.color||'var(--text-dim)',cursor:'default',transition:'all 0.2s'}}
                      title={`${sid} ${tt}\nB_k = ${bk>0?'+':''}${bk.toFixed(2)}°F\nU_k = ${uk.toFixed(2)}°F²\nVersion: ${ks?.state_version||'—'}`}>
                      {style_.text||''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Color scale legend */}
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,padding:'6px 0'}}>
        <span style={{fontSize:9,color:'#6baed6',fontWeight:600}}>−3°F</span>
        <div style={{flex:1,height:8,borderRadius:2,background:'linear-gradient(90deg,rgba(40,100,200,0.8) 0%,rgba(40,100,200,0.2) 35%,rgba(255,255,255,0.05) 50%,rgba(200,80,80,0.2) 65%,rgba(220,60,60,0.85) 100%)'}}/>
        <span style={{fontSize:9,color:'var(--red)',fontWeight:600}}>+3°F</span>
        <span style={{fontSize:9,color:'var(--text-dim)',marginLeft:12}}>opacity ∝ certainty (1 − U_k/4)</span>
      </div>

      {/* Ensemble Weight Breakdown */}
      <div className="section-header"><span className="section-title">Ensemble Weight Breakdown</span></div>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:10,color:'var(--text-dim)'}}>Station:</span>
        <select value={selectedStation} onChange={e=>setSelectedStation(e.target.value)} style={{background:'var(--bg2)',border:'1px solid var(--border2)',color:'var(--text-bright)',padding:'4px 8px',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:11,outline:'none',cursor:'pointer'}}>
          {(data.stations||[]).map(s=>(
            <option key={s.id} value={s.id}>{s.id} — {s.city}</option>
          ))}
        </select>
        {weightsLoading&&<span style={{fontSize:9,color:'var(--text-dim)'}}>Loading…</span>}
      </div>

      {!weightsLoading && weightsData && (()=>{
        const weights=weightsData.weights||[];
        if(weights.length===0) return <div className="empty-state"><div className="icon">⚖️</div>No weight data for this station — populates after the first market-open pipeline run.</div>;
        const total=weights.reduce((a,w)=>a+w.w_m,0)||1;
        const maxW=Math.max(...weights.map(w=>w.w_m),0);
        const entropyColor=maxW>0.60?'var(--red)':maxW>0.40?'var(--amber)':'var(--green)';
        return (
          <div>
            <div className="weight-bar-container" style={{marginBottom:8,height:36}}>
              {weights.map(w=>(
                <div key={w.source_id} className={`weight-segment${w.is_stale?' stale':''}`}
                  style={{width:`${(w.w_m/total*100).toFixed(1)}%`,background:MODEL_COLORS[w.source_id]||'#888',minWidth:w.w_m>0.05?28:0}}
                  title={`${w.source_id}: ${(w.w_m*100).toFixed(1)}%${w.is_stale?' (STALE)':''}`}>
                  {w.w_m>0.08&&<span style={{fontSize:8}}>{w.source_id.replace('OME_','')}</span>}
                </div>
              ))}
            </div>
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:14}}>
              {weights.map(w=>(
                <div key={w.source_id} style={{display:'flex',alignItems:'center',gap:4,fontSize:9,color:w.is_stale?'var(--text-dim)':'var(--text)'}}>
                  <div style={{width:10,height:10,borderRadius:1,background:MODEL_COLORS[w.source_id]||'#888',opacity:w.is_stale?0.4:1}}/>
                  {w.source_id}{w.is_stale&&<span style={{color:'var(--red)',fontSize:8}}>⚠</span>}
                </div>
              ))}
            </div>
            <div className="card" style={{marginBottom:12}}>
              <table className="data-table">
                <thead><tr><th>Model</th><th>Weight</th><th>BSS_m</th><th>Lead Bracket</th><th>Stale</th><th>Decay</th></tr></thead>
                <tbody>
                  {weights.map(w=>(
                    <tr key={w.source_id} style={w.is_stale?{opacity:0.6}:{}}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:8,height:8,borderRadius:1,background:MODEL_COLORS[w.source_id]||'#888',flexShrink:0}}/>
                          <span style={{fontWeight:600,color:'var(--text-bright)'}}>{w.source_id}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <div style={{width:60,height:4,background:'var(--bg3)',borderRadius:1,overflow:'hidden'}}>
                            <div style={{width:`${(w.w_m/maxW*100).toFixed(0)}%`,height:'100%',background:MODEL_COLORS[w.source_id]||'#888',borderRadius:1}}/>
                          </div>
                          <span style={{color:'var(--amber)',fontWeight:600}}>{(w.w_m*100).toFixed(1)}%</span>
                        </div>
                      </td>
                      <td style={{color:w.bss_m>=0.07?'var(--green)':w.bss_m>=0.03?'var(--amber)':'var(--red)'}}>{w.bss_m?.toFixed(4)||'—'}</td>
                      <td style={{color:'var(--text-dim)'}}>{w.lead_bracket}</td>
                      <td>{w.is_stale?<span className="tag stale">STALE</span>:<span style={{color:'var(--text-dim)',fontSize:10}}>—</span>}</td>
                      <td style={{color:'var(--text-dim)'}}>{w.stale_decay_factor?.toFixed(3)||'1.000'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex',gap:20,padding:'8px 12px',background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:3,fontSize:10}}>
              <span style={{color:'var(--text-dim)'}}>Max weight: <span style={{color:'var(--amber)',fontWeight:600}}>{(maxW*100).toFixed(1)}%</span></span>
              <span style={{color:'var(--text-dim)'}}>Stale models: <span style={{color:weights.filter(w=>w.is_stale).length>0?'var(--amber)':'var(--text)'}}>{weights.filter(w=>w.is_stale).length}</span></span>
              <span style={{marginLeft:'auto',color:'var(--text-dim)'}}>Concentration: <strong style={{color:entropyColor}}>{maxW>0.60?'HIGH':maxW>0.40?'MEDIUM':'LOW'}</strong></span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── STATUS TAB ──────────────────────────────────────────────────────
const HEALTH_COLORS = {
  healthy: '#2ec07a',
  degraded: '#f5a623',
  failed:   '#e84040',
  no_data:  'rgba(255,255,255,0.05)',
};
 
const HEALTH_LABELS = {
  healthy: { icon: '✓', label: 'Healthy',  color: '#2ec07a' },
  degraded: { icon: '⚠', label: 'Degraded', color: '#f5a623' },
  failed:   { icon: '✗', label: 'Failed',   color: '#e84040' },
  no_data:  { icon: '—', label: 'No Data',  color: '#3a4055' },
};
 
// Each service row: what health key to read, and how to build tooltip details
const STATUS_SERVICES = [
  {
    id: 'collection',
    label: 'Morning Collection',
    desc: 'FORECASTS_DAILY · 9 sources · 20 stations',
    healthKey: 'collection',
    expectedRows: 720,
    getDetails: (d) => ({
      summary:  d.morning_status ? `Pipeline: ${d.morning_status}` : 'No run recorded',
      rows:     `${d.forecast_rows.toLocaleString()} / 720 forecast rows`,
      extra:    d.stations_fail > 0 ? `${d.stations_fail} source(s) failed` : null,
      extra2:   d.stations_ok   > 0 ? `${d.stations_ok} source(s) OK` : null,
      error:    d.morning_error,
    }),
  },
  {
    id: 'night',
    label: 'Night Pipeline',
    desc: 'CLI OBSERVATIONS · KALMAN · BSS MATRIX',
    healthKey: 'pipeline_night',
    expectedRows: 20,
    getDetails: (d) => ({
      summary: d.night_status ? `Pipeline: ${d.night_status}` : 'No run recorded',
      rows:    `${d.obs_rows} / 20 station observations`,
      extra:   d.amendments > 0 ? `${d.amendments} CLI amendment(s) applied` : null,
      extra2:  null,
      error:   d.night_error,
    }),
  },
  {
    id: 'pricing',
    label: 'Shadow Book',
    desc: 'L3 PRICING · Skew-Normal · METAR truncation',
    healthKey: 'pricing',
    expectedRows: 600,
    getDetails: (d) => ({
      summary: d.market_status ? `Market Open: ${d.market_status}` : 'No run recorded',
      rows:    `${d.shadow_rows.toLocaleString()} / 600 priced bins`,
      extra:   null,
      extra2:  null,
      error:   d.market_error,
    }),
  },
  {
    id: 'metar',
    label: 'METAR Coverage',
    desc: 'INTRADAY OBSERVATIONS · Aviation Weather Center',
    healthKey: 'metar',
    expectedRows: null,
    getDetails: (d) => ({
      summary: `${d.metar_stations} / 20 stations with intraday data`,
      rows:    null,
      extra:   d.metar_stations < 20 ? `${20 - d.metar_stations} station(s) missing METAR` : null,
      extra2:  null,
      error:   null,
    }),
  },
  {
    id: 'evaluation',
    label: 'Brier Grading',
    desc: 'L5 EVALUATION · BRIER_SCORES · BSS matrix',
    healthKey: 'evaluation',
    expectedRows: null,
    getDetails: (d) => ({
      summary: d.brier_rows > 0
        ? `${d.brier_rows} score(s) graded`
        : d.night_status === 'OK' ? 'Night pipeline ran — no scores yet' : 'No grading recorded',
      rows:    null,
      extra:   null,
      extra2:  null,
      error:   null,
    }),
  },
  {
    id: 'alerts',
    label: 'System Alerts',
    desc: 'CRITICAL EVENTS · SYSTEM_ALERTS table',
    healthKey: 'alerts',
    expectedRows: null,
    getDetails: (d) => ({
      summary: d.critical_alerts > 0
        ? `${d.critical_alerts} CRITICAL alert(s)`
        : d.total_alerts > 0
          ? `${d.total_alerts} alert(s) — none critical`
          : 'No alerts recorded',
      rows:    null,
      extra:   d.alert_types || null,
      extra2:  null,
      error:   null,
    }),
  },
];

// ─── TOOLTIP ──────────────────────────────────────────────────────────────────
 
function StatusTooltip({ day, service, mouseX, mouseY }) {
  const details  = service.getDetails(day);
  const health   = day.health[service.healthKey];
  const hlMeta   = HEALTH_LABELS[health] || HEALTH_LABELS.no_data;
  const barColor = HEALTH_COLORS[health];
 
  const fmtDate = (iso) => {
    if (!iso) return '—';
    // Use noon UTC to avoid date-rollover from timezone offsets
    const d = new Date(`${iso}T12:00:00Z`);
    return d.toLocaleDateString('en-US', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  };
 
  // Keep tooltip inside viewport
  const TW = 270;
  const safeX = Math.min(
    Math.max(mouseX - TW / 2, 8),
    (typeof window !== 'undefined' ? window.innerWidth : 1200) - TW - 8
  );
 
  return (
    <div
      style={{
        position:    'fixed',
        left:        safeX,
        top:         mouseY - 8,
        transform:   'translateY(-100%)',
        zIndex:      2000,
        width:       TW,
        background:  'var(--bg2)',
        border:      '1px solid var(--border2)',
        borderTop:   `2px solid ${barColor}`,
        borderRadius: 3,
        padding:     '10px 14px',
        boxShadow:   '0 12px 32px rgba(0,0,0,0.7)',
        pointerEvents: 'none',
        fontFamily:  'var(--font-mono)',
      }}
    >
      {/* Date */}
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-bright)', marginBottom: 5 }}>
        {fmtDate(day.date)}
      </div>
 
      {/* Health badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
        <div style={{
          padding: '1px 7px', borderRadius: 2, fontSize: 9, fontWeight: 700,
          background: `${barColor}20`, color: barColor,
          border: `1px solid ${barColor}50`, textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {hlMeta.icon} {hlMeta.label}
        </div>
      </div>
 
      {/* Summary */}
      <div style={{ fontSize: 10, color: 'var(--text)', marginBottom: details.rows ? 3 : 0 }}>
        {details.summary}
      </div>
 
      {/* Row counts vs expected */}
      {details.rows && (
        <div style={{ fontSize: 9, color: 'var(--text-dim)', marginBottom: 2 }}>
          {details.rows}
          {service.expectedRows && (
            <span style={{
              marginLeft: 6,
              color: day[service.healthKey === 'collection' ? 'forecast_rows' : 'shadow_rows'] / service.expectedRows >= 0.85
                ? 'var(--green)' : 'var(--amber)',
              fontSize: 9,
            }}>
              ({((
                (service.healthKey === 'collection' ? day.forecast_rows : day.shadow_rows)
                / service.expectedRows
              ) * 100).toFixed(0)}%)
            </span>
          )}
        </div>
      )}
 
      {/* Extra info */}
      {details.extra && (
        <div style={{ fontSize: 9, color: 'var(--amber)', marginTop: 3 }}>
          {details.extra}
        </div>
      )}
      {details.extra2 && (
        <div style={{ fontSize: 9, color: 'var(--green)', marginTop: 2 }}>
          {details.extra2}
        </div>
      )}
 
      {/* Error box */}
      {details.error && (
        <div style={{
          marginTop: 7, padding: '5px 8px',
          background: 'rgba(232,64,64,0.08)', border: '1px solid rgba(232,64,64,0.2)',
          borderRadius: 2, fontSize: 9, color: 'var(--red)', lineHeight: 1.5,
          wordBreak: 'break-word',
        }}>
          {details.error}
        </div>
      )}
 
      {/* RELATED block (mimics Anthropic style) */}
      {(details.extra || details.error) && (
        <div style={{
          marginTop: 8, paddingTop: 7,
          borderTop: '1px solid var(--border)',
          fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          Related
        </div>
      )}
    </div>
  );
}
 
// ─── SINGLE SERVICE ROW ───────────────────────────────────────────────────────
 
function StatusServiceRow({ service, days, onBarEnter, onBarLeave }) {
  // Overall status: based on last 7 days
  const recentDays = (days || []).slice(-7);
  const hasFailure  = recentDays.some(d => d.health[service.healthKey] === 'failed');
  const hasDegraded = recentDays.some(d => d.health[service.healthKey] === 'degraded');
  const overallStatus = hasFailure
    ? { label: 'Degraded Performance', color: 'var(--red)' }
    : hasDegraded
      ? { label: 'Degraded Performance', color: 'var(--amber)' }
      : { label: 'Operational', color: 'var(--green)' };
 
  // Uptime % across non-no_data days
  const activeDays   = (days || []).filter(d => d.health[service.healthKey] !== 'no_data');
  const healthyDays  = activeDays.filter(d => d.health[service.healthKey] === 'healthy').length;
  const uptimePct    = activeDays.length > 0
    ? (healthyDays / activeDays.length * 100).toFixed(2)
    : null;
 
  return (
    <div style={{ marginBottom: 28 }}>
      {/* Label row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-bright)' }}>
            {service.label}
          </span>
          <span style={{
            fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            {service.desc}
          </span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: overallStatus.color, flexShrink: 0, marginLeft: 16 }}>
          {overallStatus.label}
        </span>
      </div>
 
      {/* Bar chart */}
      <div style={{
        display: 'flex', gap: 1, height: 30, borderRadius: 2, overflow: 'hidden',
      }}>
        {(days || Array(90).fill(null)).map((day, i) => {
          const health = day ? day.health[service.healthKey] : 'no_data';
          return (
            <div
              key={day?.date || i}
              style={{
                flex: 1, minWidth: 0,
                background: HEALTH_COLORS[health] || HEALTH_COLORS.no_data,
                cursor: day ? 'default' : 'default',
                transition: 'filter 0.08s',
              }}
              onMouseEnter={day ? (e) => onBarEnter(e, day, service) : undefined}
              onMouseLeave={day ? onBarLeave : undefined}
            />
          );
        })}
      </div>
 
      {/* Timeline labels */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        marginTop: 4, alignItems: 'center',
      }}>
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>90 days ago</span>
        {uptimePct !== null && (
          <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>
            {uptimePct}% uptime
          </span>
        )}
        <span style={{ fontSize: 9, color: 'var(--text-dim)' }}>Today</span>
      </div>
    </div>
  );
}
 
// ─── MAIN TAB COMPONENT ───────────────────────────────────────────────────────
 
function StatusTab() {
  const [days,    setDays]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [tooltip, setTooltip] = useState(null); // { day, service, mouseX, mouseY }
 
  useEffect(() => {
    fetch('/api/status')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d  => { setDays(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);
 
  const handleBarEnter = (e, day, service) => {
    setTooltip({
      day,
      service,
      mouseX: e.clientX,
      mouseY: e.clientY,
    });
  };
 
  const handleBarLeave = () => setTooltip(null);
 
  // Summary stats across all services for the header banner
  const recentDays = (days || []).slice(-1); // just today
  const overallHealthy = recentDays.length > 0 && STATUS_SERVICES.every(
    s => recentDays[0].health[s.healthKey] === 'healthy'
  );
 
  return (
    <div className="section fadein" style={{ maxWidth: 1100 }}>
 
      {/* Page header */}
      <div className="section-header">
        <span className="section-title">System Status — 90 Day History</span>
        <span className="section-sub">Per-table health · expected vs actual rows</span>
      </div>
 
      {/* Overall status banner */}
      {!loading && !error && days && (
        <div style={{
          marginBottom: 24, padding: '10px 16px',
          background:  overallHealthy ? 'rgba(46,192,122,0.06)' : 'rgba(245,166,35,0.06)',
          border:      `1px solid ${overallHealthy ? 'rgba(46,192,122,0.25)' : 'rgba(245,166,35,0.25)'}`,
          borderLeft:  `3px solid ${overallHealthy ? 'var(--green)' : 'var(--amber)'}`,
          borderRadius: 3,
          display:     'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: overallHealthy ? 'var(--green)' : 'var(--amber)',
            boxShadow:  `0 0 6px ${overallHealthy ? 'var(--green)' : 'var(--amber)'}`,
            flexShrink: 0, animation: 'pulse 2s ease-in-out infinite',
          }}/>
          <span style={{ fontSize: 11, fontWeight: 600, color: overallHealthy ? 'var(--green)' : 'var(--amber)' }}>
            {overallHealthy ? 'All systems operational' : 'Some systems degraded — hover bars for details'}
          </span>
          {days.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)' }}>
              Earliest record:{' '}
              {days.find(d => d.forecast_rows > 0 || d.shadow_rows > 0 || d.obs_rows > 0)?.date || '—'}
            </span>
          )}
        </div>
      )}
 
      {/* Loading state */}
      {loading && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          {[0,1,2].map(i => (
            <div key={i} className="loading-dot" style={{
              display: 'inline-block', margin: '0 4px',
              animationDelay: `${i * 0.2}s`,
            }}/>
          ))}
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 10, letterSpacing: '0.1em' }}>
            Querying 90-day health history…
          </div>
        </div>
      )}
 
      {/* Error state */}
      {!loading && error && (
        <div style={{
          padding: '16px', background: 'var(--red-dim)',
          border: '1px solid rgba(232,64,64,0.3)', borderRadius: 3,
          fontSize: 10, color: 'var(--red)',
        }}>
          Failed to load status data: {error}
        </div>
      )}
 
      {/* Service rows */}
      {!loading && !error && days && (
        <>
          <div style={{ marginBottom: 8 }}>
            {STATUS_SERVICES.map(service => (
              <StatusServiceRow
                key={service.id}
                service={service}
                days={days}
                onBarEnter={handleBarEnter}
                onBarLeave={handleBarLeave}
              />
            ))}
          </div>
 
          {/* Legend */}
          <div style={{
            display: 'flex', gap: 20, alignItems: 'center',
            paddingTop: 12, borderTop: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Legend:
            </span>
            {Object.entries(HEALTH_LABELS).map(([key, meta]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 14, height: 14, borderRadius: 2,
                  background: HEALTH_COLORS[key],
                  border: key === 'no_data' ? '1px solid var(--border2)' : 'none',
                }}/>
                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{meta.label}</span>
              </div>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-dim)' }}>
              Hover any bar for details
            </span>
          </div>
 
          {/* Raw counts table (last 7 days) — useful for debugging */}
          <details style={{ marginTop: 20 }}>
            <summary style={{
              fontSize: 9, color: 'var(--text-dim)', cursor: 'pointer',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              padding: '6px 0', borderTop: '1px solid var(--border)', userSelect: 'none',
            }}>
              Raw counts — last 7 days
            </summary>
            <div style={{ marginTop: 8, overflowX: 'auto' }}>
              <table className="data-table" style={{ minWidth: 700 }}>
                <thead>
                  <tr>
                    {['Date','Forecast Rows','Shadow Rows','Obs Rows','Brier Rows','METAR Stns','Alerts (crit)','Morning','Night','Market'].map(h => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.slice(-7).reverse().map(d => (
                    <tr key={d.date}>
                      <td style={{ fontWeight: 600, color: 'var(--text-bright)' }}>{d.date}</td>
                      <td style={{ color: d.forecast_rows >= 600 ? 'var(--green)' : 'var(--amber)' }}>
                        {d.forecast_rows.toLocaleString()}
                      </td>
                      <td style={{ color: d.shadow_rows >= 500 ? 'var(--green)' : d.shadow_rows > 0 ? 'var(--amber)' : 'var(--text-dim)' }}>
                        {d.shadow_rows.toLocaleString()}
                      </td>
                      <td style={{ color: d.obs_rows >= 18 ? 'var(--green)' : d.obs_rows > 0 ? 'var(--amber)' : 'var(--text-dim)' }}>
                        {d.obs_rows}
                        {d.amendments > 0 && <span style={{ color: 'var(--amber)', marginLeft: 4 }}>+{d.amendments}△</span>}
                      </td>
                      <td style={{ color: d.brier_rows > 0 ? 'var(--green)' : 'var(--text-dim)' }}>
                        {d.brier_rows}
                      </td>
                      <td style={{ color: d.metar_stations >= 18 ? 'var(--green)' : d.metar_stations > 0 ? 'var(--amber)' : 'var(--text-dim)' }}>
                        {d.metar_stations}
                      </td>
                      <td>
                        {d.total_alerts > 0
                          ? <span style={{ color: d.critical_alerts > 0 ? 'var(--red)' : 'var(--amber)' }}>
                              {d.total_alerts} ({d.critical_alerts})
                            </span>
                          : <span style={{ color: 'var(--text-dim)' }}>—</span>
                        }
                      </td>
                      {[d.morning_status, d.night_status, d.market_status].map((s, i) => (
                        <td key={i}>
                          {s
                            ? <span className={`tag ${s.toLowerCase()}`}>{s}</span>
                            : <span style={{ color: 'var(--text-dim)' }}>—</span>
                          }
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
 
      {/* Tooltip rendered last so it floats above everything */}
      {tooltip && (
        <StatusTooltip
          day={tooltip.day}
          service={tooltip.service}
          mouseX={tooltip.mouseX}
          mouseY={tooltip.mouseY}
        />
      )}
    </div>
  );
}

// CLOCK
function UTCClock() {
  const [now, setNow] = useState(null);
  
  useEffect(() => {
    setNow(new Date()); // Set initial time only on the client
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <span>--:--:--</span>;
  return <span>{now.toISOString().slice(11, 19)}</span>;
}

// ─── ROOT DASHBOARD ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data, loading, refresh } = useData();
  const [tab,setTab]=useState('overview');
  const [modal,setModal]=useState({type:null,ticker:null});
  const [halting,setHalting]=useState(false);

  const [liveBalance, setLiveBalance] = useState(null);
  
  useEffect(() => {
    const fetchBalance = () =>
      fetch('/api/kalshi/balance')
        .then(r => r.ok ? r.json() : null)
        .then(d => d && setLiveBalance(d))
        .catch(() => {});
        
    fetchBalance();
    const t = setInterval(fetchBalance, 30_000);
    return () => clearInterval(t);
  }, []);

  const openModal  = useCallback((type,ticker)=>setModal({type,ticker}),[]);
  const closeModal = useCallback(()=>setModal({type:null,ticker:null}),[]);

  const [haltModal, setHaltModal] = useState({ open: false, targetState: false, password: '', error: '' });

  // 1. Fixed function name back to toggleTrading
  const toggleTrading = useCallback(() => {
    if (!data) return;
    setHaltModal({ 
      open: true, 
      targetState: !data.system.trading_halted, 
      password: '', 
      error: '' 
    });
  }, [data]);

  const confirmToggleTrading = useCallback(async () => {
    setHalting(true);
    setHaltModal(prev => ({ ...prev, error: '' }));
    try {
      const res = await fetch('/api/system/halt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          halted: haltModal.targetState, 
          password: haltModal.password 
        }),
      });
      
      if (res.ok) {
        await refresh();
        setHaltModal({ open: false, targetState: false, password: '', error: '' });
      } else {
        const errData = await res.json();
        setHaltModal(prev => ({ ...prev, error: errData.error || 'Invalid password' }));
      }
    } catch (e) {
      setHaltModal(prev => ({ ...prev, error: 'Network error occurred' }));
    } finally {
      setHalting(false);
    }
  }, [haltModal.targetState, haltModal.password, refresh]);

  const resolveAlert = useCallback(async (id) => {
    try {
      await fetch(`/api/alerts/${id}/resolve`, { method: 'PATCH' });
    } catch (e) {}
    await refresh();
  }, [refresh]);

  // 2. Cleaned up loading screen (removed duplicate modal)
  if (loading || !data) return (
    <>
      <style>{css}</style>
      <div className="shell">
        <div className="loading-screen">
          <div style={{ display: 'flex', gap: 8 }}>
            {[0,1,2].map(i=>(<div key={i} className="loading-dot" style={{animationDelay:`${i*0.2}s`}}/>))}
          </div>
          <div style={{fontSize:10,color:'var(--text-dim)',letterSpacing:'0.1em',textTransform:'uppercase'}}>
            Connecting to KalshiCast DB…
          </div>
        </div>
      </div>
    </>
  );

  const s = data.system || {};
  
  const displayBankroll = liveBalance?.balance ?? s.bankroll ?? 0;
  const displayPortfolio = liveBalance?.portfolio_value ?? s.portfolio_value ?? 0;
  
  const winRate=(s.n_bets_total||0)>0?(s.n_bets_won||0)/(s.n_bets_total||1):0;
  const unresolvedAlerts=(data.alerts||[]).filter(a=>!a.resolved).length;
  const staleStations=(data.stations||[]).filter(s=>s.metar_age_min>=120).length;
  const systemStatus=s.trading_halted?'error':unresolvedAlerts>0?'warn':'ok';
  const systemLabel=s.trading_halted?'HALTED':unresolvedAlerts>0?`${unresolvedAlerts} ALERT${unresolvedAlerts>1?'S':''}`:('NOMINAL');

  const tabBadges={
    alerts:unresolvedAlerts>0?{n:unresolvedAlerts,cls:'red'}:null,
    stations:staleStations>0?{n:staleStations,cls:'amber'}:null,
    positions:{n:(data.open_positions||[]).length,cls:'green'},
  };

  return (
    <>
      <style>{css}</style>
      <div className="shell">

        {/* TOP BAR */}
        <div className="topbar">
          <div className="logo">
            <div className="logo-dot" style={s.trading_halted?{background:'var(--red)',boxShadow:'0 0 8px var(--red)'}:{}}/>
            Kalshicast
            <span style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.05em', marginLeft: '4px' }}>
              BY KNOWLU
            </span>
          </div>
          <div className="topbar-metrics">
            <div className="tmet">
              <div className="tmet-label">Bankroll{s.paper_mode ? ' \u00b7 Paper' : ' \u00b7 Live'}</div>
              <div className="tmet-val amber">${displayBankroll.toFixed(2)}</div>
            </div>
            <div className="tmet">
              <div className="tmet-label">Daily P&L</div>
              <div className={`tmet-val ${(s.daily_pnl||0)>=0?'pos':'neg'}`}>{fmt.usd(s.daily_pnl||0)}</div>
            </div>
            <div className="tmet">
              <div className="tmet-label">Cumulative</div>
              <div className={`tmet-val ${(s.cumulative_pnl||0)>=0?'pos':'neg'}`}>{fmt.usd(s.cumulative_pnl||0)}</div>
            </div>
            <div className="tmet">
              <div className="tmet-label">MDD</div>
              <div className="tmet-val warn">{fmt.pct2(s.mdd_alltime||0)}</div>
            </div>
            <div className="tmet">
              <div className="tmet-label">Win Rate</div>
              <div className="tmet-val">{fmt.pct(winRate)}</div>
            </div>
            <div className="tmet">
              <div className="tmet-label">Open Pos.</div>
              <div className="tmet-val">{(data.open_positions||[]).length}</div>
            </div>
            <div className="tmet">
              <div className="tmet-label">UTC</div>
              <div className="tmet-val" style={{fontSize:11}}>
                <UTCClock />
              </div>
            </div>
          </div>
          <div className="topbar-right">
            {s.paper_mode !== undefined && (
              <div className={`status-badge ${s.paper_mode ? 'paper' : 'live-mode'}`}>
                {s.paper_mode ? '📄 PAPER' : '🔴 LIVE'}
              </div>
            )}
            <div className={`status-badge ${systemStatus}`}>
              <div className={`status-dot ${systemStatus}`}/>
              {systemLabel}
            </div>
            {/* 3. Uses toggleTrading now */}
            <button
              className={`btn-halt ${s.trading_halted ? 'halted' : 'active'}`}
              onClick={toggleTrading}
              disabled={halting}
            >
              {halting ? '…' : s.trading_halted ? '▶ Resume' : '⏹ Halt'}
            </button>
          </div>
        </div>

        {/* TABS */}
        <div className="tabs">
          {TABS.map(t => {
            const badge = tabBadges[t.id];
            return (
              <div key={t.id} className={`tab${tab===t.id?' active':''}`} onClick={()=>setTab(t.id)}>
                {t.label}
                {badge && <span className={`tab-badge ${badge.cls}`}>{badge.n}</span>}
              </div>
            );
          })}
          <div style={{flex:1}}/>
          <div style={{padding:'0 12px',display:'flex',alignItems:'center',fontSize:9,color:'var(--text-dim)'}}>
            DB:&nbsp;
            <span style={{color:s.db_connected?'var(--green)':'var(--red)',fontWeight:600}}>
              {s.db_connected?'CONNECTED':'DISCONNECTED'}
            </span>
          </div>
        </div>

        {/* CONTENT */}
        <div className="content">
          {tab==='overview'  && <OverviewTab  data={data} liveBalance={liveBalance} onToggleTrading={toggleTrading}/>}
          {tab==='positions' && <PositionsTab data={data} onOpenModal={openModal}/>}
          {tab==='bets'      && <BetsTab      data={data}/>}
          {tab==='alerts'    && <AlertsTab    data={data} onResolve={resolveAlert}/>}
          {tab==='params'    && <ParamsTab    data={data}/>}
          {tab==='bss'       && <BSSTab       data={data}/>}
          {tab==='stations'  && <StationsTab  data={data}/>}
          {tab==='models'    && <ModelsTab    data={data}/>}
          {tab==='status'    && <StatusTab    data={data}/>}
        </div>

        {/* MODALS */}
        {modal.type==='dist'  && <DistributionModal ticker={modal.ticker} onClose={closeModal}/>}
        {modal.type==='ibe'   && <IBEModal          ticker={modal.ticker} onClose={closeModal}/>}
        {modal.type==='audit' && <AuditModal        ticker={modal.ticker} onClose={closeModal}/>}

        {/* 4. Nuclear Modal properly placed */}
        {haltModal.open && (
          <div 
            className="nuke-overlay" 
            onClick={e => e.target === e.currentTarget && setHaltModal(prev => ({ ...prev, open: false }))}
          >
            <div className="nuke-box">
              <div className="nuke-scanline"></div>
              
              <div className="nuke-header">
                ⚠ {haltModal.targetState ? 'CRITICAL OVERRIDE' : 'SYSTEM RESTORATION'} ⚠
              </div>
              
              <div className="nuke-text">
                {haltModal.targetState
                  ? "Authorization required to initiate emergency trading halt. All active algorithms will be suspended."
                  : "Authorization required to restore automated trading protocols and resume market execution."}
              </div>
              
              <div className="nuke-input-wrap">
                <input
                  type="password"
                  className="nuke-input"
                  placeholder="[ ENTER CODES ]"
                  value={haltModal.password}
                  onChange={e => setHaltModal(prev => ({ ...prev, password: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && haltModal.password && confirmToggleTrading()}
                  autoFocus
                  spellCheck="false"
                  autoComplete="off"
                />
              </div>

              {haltModal.error && (
                <div style={{ color: 'var(--red)', fontSize: '11px', marginBottom: '18px', fontWeight: 600, letterSpacing: '0.15em', textShadow: '0 0 8px var(--red)' }}>
                  [ ERROR: {haltModal.error.toUpperCase()} ]
                </div>
              )}

              <button
                className="nuke-btn"
                onClick={confirmToggleTrading}
                disabled={halting || !haltModal.password}
              >
                {halting ? 'VERIFYING SIGNATURE...' : haltModal.targetState ? 'EXECUTE HALT PROTOCOL' : 'AUTHORIZE RESUME'}
              </button>
              
              <div style={{ marginTop: '24px', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.2em', position: 'relative', zIndex: 20 }}>
                <span 
                  style={{ cursor: 'pointer', transition: 'color 0.2s' }} 
                  onMouseEnter={e => e.target.style.color = 'var(--text-bright)'}
                  onMouseLeave={e => e.target.style.color = 'var(--text-dim)'}
                  onClick={() => setHaltModal(prev => ({ ...prev, open: false }))}
                >
                  [ ABORT SEQUENCE ]
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  ); 
}