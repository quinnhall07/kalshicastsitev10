# Dashboard Fixes & Customization — Design Spec

**Date:** 2026-04-05
**Scope:** Both repos — kalshicastsitev10 (Next.js dashboard) and Kalshicast-v10 (Python pipeline)

---

## 1. BSS Matrix — Cards Only

Remove the grid/cards view toggle. Delete the `viewMode` state, grid view toggle buttons, the `<table className="bss-grid">` block, and the conditional `viewMode==='grid'` branch. Keep the cards view as the only view, along with sort controls, drilldown panel, type filter, and legend.

**Files changed:**
- `app/page.jsx` — BSSTab component (~lines 1902-2032)

---

## 2. Alerts — Unified DB-Stored System

### 2a. Python Pipeline — Insert Alert on PARTIAL/ERROR

When any pipeline finishes with status != OK, insert a catch-all `SYSTEM_ALERT`:

- `alert_type`: `PIPELINE_{RUN_TYPE}_{STATUS}` (e.g. `PIPELINE_MARKET_OPEN_PARTIAL`)
- `severity_score`: 0.8 for ERROR, 0.6 for PARTIAL
- `details_json`: `{"run_id": ..., "error_msg": ..., "run_type": ..., "status": ...}`

Apply to: `market_open.py`, `morning.py`, `night.py` — at the point where `update_pipeline_run()` is called with a non-OK status.

### 2b. Rollover — Purge Resolved Alerts

Add `purge_resolved_alerts(conn)` to `run_rollover()`:
- Read `alerts.retention_days` from PARAMS (default 7)
- `DELETE FROM SYSTEM_ALERTS WHERE IS_RESOLVED = 1 AND RESOLVED_TS < SYSDATE - :days`

### 2c. PARAMS Seed

Add row: `alerts.retention_days`, value `7`, dtype `int`, description `"Days to keep resolved alerts before rollover purge"`.

### 2d. Alerts API — Simplify to DB-Only

Remove the dynamic pipeline failure query, stale pipeline detection, and stale observation queries from `/api/alerts/route.js`. Query only `SYSTEM_ALERTS`. The health pipeline (`health.py`) already inserts alerts for stale data and missed runs — verify those code paths produce `SYSTEM_ALERT` rows.

### 2e. Dashboard AlertsTab

- Every alert has a resolve button (they're all `SYSTEM_ALERTS` now)
- Remove `origin`-based grouping. Show a flat chronological list with severity filter and resolved toggle.
- Keep GitHub Actions section as a supplementary view for quick log links.

**Files changed:**
- `kalshicast/pipeline/market_open.py`
- `kalshicast/pipeline/morning.py`
- `kalshicast/pipeline/night.py`
- `kalshicast/pipeline/rollover.py`
- `kalshicast/db/schema.py` — seed new param
- `kalshicast/pipeline/health.py` — verify alert insertion
- `app/api/alerts/route.js`
- `app/page.jsx` — AlertsTab component

---

## 3. Models Tab — Data Flow Fix

### 3a. Ensemble Weights — Guard Initial Fetch

`useApiFetch` for ensemble weights should not fire until `selectedStation` is a real station from the loaded stations list. Guard: if `stationIds.length === 0`, don't fetch.

### 3b. Ensemble Weights API — Widen Window

Change `COMPUTED_AT >= SYSTIMESTAMP - INTERVAL '2' DAY` to `INTERVAL '7' DAY`. Add computed_at to the response so the frontend can show an age indicator if data is older than 2 days.

### 3c. Stale Data Indicator

When Kalman or weight data exists but is older than 2 days, show a yellow "stale" badge with the age, instead of the empty state message.

**Files changed:**
- `app/page.jsx` — ModelsTab component
- `app/api/ensemble-weights/route.js`

---

## 4. Paper Trades — Pipeline Fix

### 4a. Root Cause

In paper mode, `_step9_evaluate_gates_ibe()` joins `SHADOW_BOOK` with `MARKET_ORDERBOOK_SNAPSHOTS` and filters `mos.C_VWAP_COMPUTED IS NOT NULL`. In paper mode, no orderbook snapshots exist (steps 8-10 skipped), so the join produces zero rows. Paper positions are never created.

### 4b. Fix

Add a paper-mode code path: when `live_mode=False`, use a modified query in `_step9_evaluate_gates_ibe` that uses the shadow book's `P_WIN` as a synthetic `c_market` price instead of requiring orderbook data. This means changing the LEFT JOIN to be optional and coalescing `mos.C_VWAP_COMPUTED` with `sb.P_WIN`.

### 4c. Diagnostic Alert

If paper mode step 7.5 produces 0 positions, insert a `SYSTEM_ALERT` with type `PAPER_NO_POSITIONS` and severity 0.5, including the reason (no shadow book rows vs no gate-passing candidates).

**Files changed:**
- `kalshicast/pipeline/market_open.py`

---

## 5. Customize Screen — Per-User Preferences

### 5a. Auth Change

Modify `/api/auth` POST to store the username in the cookie value instead of `'admin'`. Middleware checks `authCookie.value` is non-empty.

### 5b. New DB Table: USER_PREFERENCES

```sql
USERNAME          VARCHAR2(100) PRIMARY KEY
PREFERENCES_JSON  CLOB
UPDATED_AT        TIMESTAMP DEFAULT SYSTIMESTAMP
```

Seeded with default preferences for each admin username on schema init.

### 5c. New API: /api/preferences

- `GET` — reads preferences for the current user (from cookie)
- `PUT` — writes preferences JSON for the current user

### 5d. Preferences JSON Structure

```json
{
  "accentColor": "amber",
  "fontSize": "medium",
  "theme": "dark",
  "defaultTab": "overview",
  "compactMode": false,
  "animations": true,
  "cardBorderRadius": "sharp",
  "topBarMetrics": ["bankroll", "daily_pnl", "cumulative_pnl", "mdd", "win_rate", "open_positions"],
  "topBarMetricsCap": 9
}
```

**Accent colors:** amber (default), cyan, green, red, violet, blue
**Font sizes:** small (10px base), medium (12px, default), large (14px)
**Card border radius:** sharp (2px, current), rounded (8px)
**Top bar metrics pool:** bankroll, daily_pnl, cumulative_pnl, mdd, win_rate, open_positions, sharpe_ratio, total_bets, paper_pnl — user toggles visibility, capped at 9.

### 5e. Customize Modal UI

- Right-side drawer (consistent with BSS drilldown pattern)
- Sections: Theme, Layout, Top Bar
- Live preview — changes apply immediately via CSS variables
- "Save" persists to DB, "Cancel" reverts to last saved state
- Light mode: CSS variables swap via `data-theme="light"` on `<html>`

### 5f. Light Mode CSS

`--bg0` through `--bg3` become light grays/whites. Text colors invert. Borders lighten. Accent colors stay the same. Applied via `data-theme="light"` attribute.

**Files changed:**
- `app/api/auth/route.js`
- `middleware.js`
- `app/api/preferences/route.js` (new)
- `app/page.jsx` — settings dropdown, new CustomizeDrawer component, CSS variables, top bar
- `app/login/page.jsx` — no changes needed
- `kalshicast/db/schema.py` — new table + seed
- `app/globals.css` or inline styles — light mode variables

---

## 6. Params Tab — Save Feedback

- Show success flash after save ("N params saved")
- Show error flash if save fails
- Trigger data refresh after successful save

**Files changed:**
- `app/page.jsx` — ParamsTab component
