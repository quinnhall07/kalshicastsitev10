# Dashboard Fixes & Customization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 6 dashboard/pipeline issues — BSS grid removal, alerts unification, models tab data flow, paper trade bug, customization screen with per-user preferences, and params save feedback.

**Architecture:** Two repos are modified in tandem. The Python pipeline (Kalshicast-v10) gets alert insertion on PARTIAL/ERROR, resolved alert purge in rollover, paper trade orderbook join fix, and a new USER_PREFERENCES table. The Next.js dashboard (kalshicastsitev10) gets simplified alerts API, cards-only BSS, models tab fixes, customize drawer with live preview, and params save feedback.

**Tech Stack:** Python 3.14 + oracledb (backend pipeline), Next.js 15 + React 19 (dashboard), Oracle Autonomous DB

---

## File Map

**Python (Kalshicast-v10):**
- Modify: `kalshicast/config/params_bootstrap.py` — add `alerts.retention_days` param
- Modify: `kalshicast/db/schema.py` — add USER_PREFERENCES table DDL + seed
- Modify: `kalshicast/pipeline/market_open.py` — catch-all alert on non-OK, paper mode orderbook fix
- Modify: `kalshicast/pipeline/morning.py` — catch-all alert on non-OK
- Modify: `kalshicast/pipeline/night.py` — catch-all alert on non-OK
- Modify: `kalshicast/pipeline/rollover.py` — purge resolved alerts

**Next.js (kalshicastsitev10):**
- Modify: `app/api/auth/route.js` — store username in cookie
- Modify: `middleware.js` — validate non-empty cookie value
- Create: `app/api/preferences/route.js` — GET/PUT user preferences
- Modify: `app/api/alerts/route.js` — simplify to DB-only
- Modify: `app/api/ensemble-weights/route.js` — widen time window
- Modify: `app/page.jsx` — BSS cards-only, alerts tab, models tab, customize drawer, params feedback, top bar metrics, light mode

---

### Task 1: Add alerts.retention_days Parameter

**Files:**
- Modify: `Kalshicast-v10/kalshicast/config/params_bootstrap.py:170` (after last ParamDef)

- [ ] **Step 1: Add the parameter definition**

In `kalshicast/config/params_bootstrap.py`, add this entry at the end of the `PARAM_DEFS` list (before the closing `]`):

```python
    # --- Alerts ---
    ParamDef("alerts.retention_days", "7", "int", "Days to keep resolved alerts before rollover purge"),
```

Insert after line 170 (`ParamDef("eval.pattern_check_interval_days", ...)`), before the closing `]` on line 171.

- [ ] **Step 2: Verify syntax**

Run: `python -c "from kalshicast.config.params_bootstrap import PARAM_DEFS; print(len(PARAM_DEFS))"`

Expected: prints a number (should be previous count + 1, likely 64).

---

### Task 2: Add USER_PREFERENCES Table and Seed

**Files:**
- Modify: `Kalshicast-v10/kalshicast/db/schema.py`

- [ ] **Step 1: Add DDL for USER_PREFERENCES table**

In `schema.py`, add this to the `ALL_DDL` list after the `SYSTEM_ALERTS` table DDL (after line 494):

```python
    """CREATE TABLE USER_PREFERENCES (
        USERNAME          VARCHAR2(100) NOT NULL,
        PREFERENCES_JSON  CLOB,
        UPDATED_AT        TIMESTAMP(6) DEFAULT SYSTIMESTAMP,
        CONSTRAINT PK_USER_PREFERENCES PRIMARY KEY (USERNAME)
    )""",
```

- [ ] **Step 2: Add seed logic for USER_PREFERENCES**

In the `seed_config_tables` function, add this block before the final `conn.commit()` (before line 651):

```python
    # Seed USER_PREFERENCES with defaults for known admin users
    import os
    default_prefs = json.dumps({
        "accentColor": "amber",
        "fontSize": "medium",
        "theme": "dark",
        "defaultTab": "overview",
        "compactMode": False,
        "animations": True,
        "cardBorderRadius": "sharp",
        "topBarMetrics": ["bankroll", "daily_pnl", "cumulative_pnl", "mdd", "win_rate", "open_positions"],
    })
    for env_key in ("SITE_ADMIN_1", "SITE_ADMIN_2"):
        username = os.environ.get(env_key)
        if username:
            with conn.cursor() as cur:
                cur.execute("""
                    MERGE INTO USER_PREFERENCES tgt USING DUAL
                    ON (tgt.USERNAME = :uname)
                    WHEN NOT MATCHED THEN INSERT (USERNAME, PREFERENCES_JSON)
                    VALUES (:uname, :prefs)
                """, {"uname": username, "prefs": default_prefs})
```

- [ ] **Step 3: Verify syntax**

Run: `python -c "from kalshicast.db.schema import ALL_DDL; print(len(ALL_DDL))"`

Expected: prints previous count + 1 (likely 33).

---

### Task 3: Pipeline Alert Insertion on PARTIAL/ERROR

**Files:**
- Modify: `Kalshicast-v10/kalshicast/pipeline/market_open.py:244-249`
- Modify: `Kalshicast-v10/kalshicast/pipeline/morning.py:340-348`
- Modify: `Kalshicast-v10/kalshicast/pipeline/night.py:188-193`

- [ ] **Step 1: Add catch-all alert to market_open.py**

In `market_open.py`, right before the `update_pipeline_run()` call at line 244, insert:

```python
        # Catch-all alert for non-OK pipeline completion
        if status != STATUS_OK:
            insert_system_alert(conn, {
                "alert_type": f"PIPELINE_MARKET_OPEN_{status}",
                "severity_score": 0.8 if status == STATUS_ERROR else 0.6,
                "details": {
                    "run_id": pipeline_run_id,
                    "status": status,
                    "mode": mode_str,
                    "ensemble_count": total_ensemble,
                    "shadow_book_count": total_shadow,
                    "bets_count": total_bets,
                    "orders_count": total_orders,
                },
            })
```

- [ ] **Step 2: Add catch-all alert to morning.py**

In `morning.py`, right before `update_pipeline_run()` at line 340, insert:

```python
        # Catch-all alert for non-OK pipeline completion
        if final_status != "OK":
            insert_system_alert(conn, {
                "alert_type": f"PIPELINE_MORNING_{final_status}",
                "severity_score": 0.8 if final_status == "ERROR" else 0.6,
                "details": {
                    "run_id": pipeline_run_id,
                    "status": final_status,
                    "stations_ok": stations_ok,
                    "stations_fail": stations_fail,
                    "rows_daily": total_daily,
                    "rows_hourly": total_hourly,
                    "fail_rate": round(fail_rate, 3),
                },
            })
```

- [ ] **Step 3: Add catch-all alert to night.py**

In `night.py`, right before `update_pipeline_run()` at line 188, insert:

```python
        # Catch-all alert for non-OK pipeline completion
        if status != STATUS_OK:
            insert_system_alert(conn, {
                "alert_type": f"PIPELINE_NIGHT_{status}",
                "severity_score": 0.8 if status == STATUS_ERROR else 0.6,
                "details": {
                    "run_id": pipeline_run_id,
                    "status": status,
                    "target_date": target_date,
                    "steps_ok": steps_ok,
                    "steps_failed": [s[0] for s in steps_failed],
                },
            })
```

- [ ] **Step 4: Verify all three files parse**

Run:
```bash
python -c "import kalshicast.pipeline.market_open; import kalshicast.pipeline.morning; import kalshicast.pipeline.night; print('OK')"
```

Expected: `OK`

---

### Task 4: Paper Trade Orderbook Join Fix

**Files:**
- Modify: `Kalshicast-v10/kalshicast/pipeline/market_open.py:311-355` (`_step9_evaluate_gates_ibe`)

- [ ] **Step 1: Add paper_mode parameter to _step9_evaluate_gates_ibe**

Change the function signature at line 311 from:

```python
def _step9_evaluate_gates_ibe(
    conn: Any,
    pipeline_run_id: str,
    bankroll: float,
    target_dates: list[str],
) -> list[dict]:
```

to:

```python
def _step9_evaluate_gates_ibe(
    conn: Any,
    pipeline_run_id: str,
    bankroll: float,
    target_dates: list[str],
    *,
    paper_mode: bool = False,
) -> list[dict]:
```

- [ ] **Step 2: Replace the candidate query with paper-aware version**

Replace the SQL query block (lines 325-355, the `cur.execute("""SELECT sb.TICKER...` block) with:

```python
        if paper_mode:
            # Paper mode: use Shadow Book P_WIN as synthetic market price
            cur.execute("""
                SELECT sb.TICKER, sb.STATION_ID, sb.TARGET_DATE, sb.TARGET_TYPE,
                       sb.BIN_LOWER, sb.BIN_UPPER, sb.P_WIN, sb.MU, sb.SIGMA_EFF,
                       sb.TOP_MODEL_ID,
                       sb.P_WIN AS C_VWAP_COMPUTED,
                       100 AS AVAILABLE_DEPTH
                FROM SHADOW_BOOK sb
                WHERE sb.PIPELINE_RUN_ID = :run_id
                  AND sb.P_WIN IS NOT NULL
            """, {"run_id": pipeline_run_id})
        else:
            cur.execute("""
                SELECT sb.TICKER, sb.STATION_ID, sb.TARGET_DATE, sb.TARGET_TYPE,
                       sb.BIN_LOWER, sb.BIN_UPPER, sb.P_WIN, sb.MU, sb.SIGMA_EFF,
                       sb.TOP_MODEL_ID,
                       mos.C_VWAP_COMPUTED, mos.AVAILABLE_DEPTH
                FROM SHADOW_BOOK sb
                LEFT JOIN (
                    SELECT TICKER, C_VWAP_COMPUTED, AVAILABLE_DEPTH,
                           ROW_NUMBER() OVER (PARTITION BY TICKER ORDER BY SNAPSHOT_UTC DESC) rn
                    FROM MARKET_ORDERBOOK_SNAPSHOTS
                ) mos ON mos.TICKER = sb.TICKER AND mos.rn = 1
                WHERE sb.PIPELINE_RUN_ID = :run_id
                  AND sb.P_WIN IS NOT NULL
                  AND mos.C_VWAP_COMPUTED IS NOT NULL
            """, {"run_id": pipeline_run_id})
```

- [ ] **Step 3: Update paper mode call site to pass paper_mode=True**

In the paper mode step 7.5 section (around line 157), change:

```python
                best_bets_paper = _step9_evaluate_gates_ibe(
                    conn, pipeline_run_id,
                    bankroll=1000.0,        # paper bankroll
                    target_dates=target_dates,
                )
```

to:

```python
                best_bets_paper = _step9_evaluate_gates_ibe(
                    conn, pipeline_run_id,
                    bankroll=1000.0,
                    target_dates=target_dates,
                    paper_mode=True,
                )
```

- [ ] **Step 4: Add diagnostic alert for zero paper positions**

After the `create_paper_positions` call (around line 163), add:

```python
                if n_paper == 0:
                    insert_system_alert(conn, {
                        "alert_type": "PAPER_NO_POSITIONS",
                        "severity_score": 0.5,
                        "details": {
                            "pipeline_run_id": pipeline_run_id,
                            "reason": "no_gate_passing_candidates" if total_shadow > 0 else "no_shadow_book_data",
                            "shadow_book_rows": total_shadow,
                            "best_bets_count": len(best_bets_paper) if best_bets_paper else 0,
                        },
                    })
                    conn.commit()
```

- [ ] **Step 5: Verify syntax**

Run: `python -c "import kalshicast.pipeline.market_open; print('OK')"`

Expected: `OK`

---

### Task 5: Rollover — Purge Resolved Alerts

**Files:**
- Modify: `Kalshicast-v10/kalshicast/pipeline/rollover.py`

- [ ] **Step 1: Add purge_resolved_alerts function**

Add this function after the `settle_positions` function (after line 121):

```python
def purge_resolved_alerts(conn: Any) -> int:
    """Delete resolved alerts older than the configured retention period."""
    from kalshicast.config.params_bootstrap import get_param_int
    try:
        retention_days = get_param_int("alerts.retention_days")
    except KeyError:
        retention_days = 7

    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM SYSTEM_ALERTS
            WHERE IS_RESOLVED = 1
              AND RESOLVED_TS < SYSDATE - :days
        """, {"days": retention_days})
        count = cur.rowcount or 0
    conn.commit()
    log.info("[rollover] purged %d resolved alerts (retention=%d days)", count, retention_days)
    return count
```

- [ ] **Step 2: Call purge_resolved_alerts in run_rollover**

In the `run_rollover` function, add the call after `paper_settled` (around line 134):

```python
    purged_alerts = purge_resolved_alerts(conn)
```

And add it to the return dict:

```python
    return {
        "date":                    today,
        "metar_initialized":       metar_init,
        "shadow_book_finalized":   sb_final,
        "positions_settled":       settled,
        "paper_positions_settled": paper_settled,
        "alerts_purged":           purged_alerts,
    }
```

- [ ] **Step 3: Verify syntax**

Run: `python -c "import kalshicast.pipeline.rollover; print('OK')"`

Expected: `OK`

---

### Task 6: Auth — Store Username in Cookie

**Files:**
- Modify: `kalshicastsitev10/app/api/auth/route.js`

- [ ] **Step 1: Update cookie value to store username**

In `app/api/auth/route.js`, change line 18 from:

```javascript
      response.cookies.set({
        name: 'kalshicast-auth',
        value: 'admin', 
```

to:

```javascript
      response.cookies.set({
        name: 'kalshicast-auth',
        value: username,
```

No other changes needed — the middleware already just checks for cookie existence.

---

### Task 7: Preferences API

**Files:**
- Create: `kalshicastsitev10/app/api/preferences/route.js`

- [ ] **Step 1: Create the preferences route**

Create `app/api/preferences/route.js`:

```javascript
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

const DEFAULT_PREFS = {
  accentColor: 'amber',
  fontSize: 'medium',
  theme: 'dark',
  defaultTab: 'overview',
  compactMode: false,
  animations: true,
  cardBorderRadius: 'sharp',
  topBarMetrics: ['bankroll', 'daily_pnl', 'cumulative_pnl', 'mdd', 'win_rate', 'open_positions'],
};

export async function GET() {
  const cookieStore = await cookies();
  const username = cookieStore.get('kalshicast-auth')?.value;
  if (!username) {
    return NextResponse.json(DEFAULT_PREFS);
  }

  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT PREFERENCES_JSON FROM USER_PREFERENCES WHERE USERNAME = :uname`,
      { uname: username }
    );

    if (result.rows && result.rows.length > 0 && result.rows[0][0]) {
      const raw = result.rows[0][0];
      const prefs = JSON.parse(typeof raw === 'string' ? raw : String(raw));
      return NextResponse.json({ ...DEFAULT_PREFS, ...prefs });
    }

    return NextResponse.json(DEFAULT_PREFS);
  } catch (error) {
    console.error('Oracle DB Error in GET /api/preferences:', error);
    return NextResponse.json(DEFAULT_PREFS);
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}

export async function PUT(request) {
  const cookieStore = await cookies();
  const username = cookieStore.get('kalshicast-auth')?.value;
  if (!username) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  let connection;
  try {
    connection = await getDbConnection();
    const prefsJson = JSON.stringify(body);

    await connection.execute(
      `MERGE INTO USER_PREFERENCES tgt USING DUAL
       ON (tgt.USERNAME = :uname)
       WHEN MATCHED THEN UPDATE SET
         PREFERENCES_JSON = :prefs,
         UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (USERNAME, PREFERENCES_JSON)
         VALUES (:uname, :prefs)`,
      { uname: username, prefs: prefsJson }
    );
    await connection.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Oracle DB Error in PUT /api/preferences:', error);
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}
```

---

### Task 8: Simplify Alerts API to DB-Only

**Files:**
- Modify: `kalshicastsitev10/app/api/alerts/route.js`

- [ ] **Step 1: Replace the entire GET handler**

Replace the full content of `app/api/alerts/route.js` with:

```javascript
import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    const result = await connection.execute(
      `SELECT alert_id, alert_type, severity_score, alert_ts,
              station_id, source_id, is_resolved, details_json,
              resolved_ts, resolved_by
       FROM system_alerts
       ORDER BY alert_ts DESC
       FETCH FIRST 200 ROWS ONLY`
    );

    const alerts = (result.rows || []).map(row => {
      let detail = 'No details provided.';
      if (row[7]) {
        try {
          detail = typeof row[7] === 'object' ? JSON.stringify(row[7]) : String(row[7]);
        } catch (_) { detail = String(row[7]); }
      }
      return {
        id: row[0],
        type: row[1],
        severity: row[2] || 0,
        ts: row[3] ? new Date(row[3]).toISOString() : null,
        station: row[4],
        source: row[5],
        resolved: row[6] === 1,
        detail,
        resolved_ts: row[8] ? new Date(row[8]).toISOString() : null,
        resolved_by: row[9],
      };
    });

    const summary = {
      total: alerts.length,
      unresolved: alerts.filter(a => !a.resolved).length,
      critical: alerts.filter(a => !a.resolved && a.severity >= 0.8).length,
      warning: alerts.filter(a => !a.resolved && a.severity >= 0.5 && a.severity < 0.8).length,
      info: alerts.filter(a => !a.resolved && a.severity < 0.5).length,
    };

    return NextResponse.json({ alerts, summary });
  } catch (error) {
    console.error("Oracle DB Error in /api/alerts:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}
```

---

### Task 9: Widen Ensemble Weights API Window

**Files:**
- Modify: `kalshicastsitev10/app/api/ensemble-weights/route.js:26`

- [ ] **Step 1: Change interval from 2 to 7 days**

In `app/api/ensemble-weights/route.js`, change line 26 from:

```sql
         AND mw.COMPUTED_AT >= SYSTIMESTAMP - INTERVAL '2' DAY
```

to:

```sql
         AND mw.COMPUTED_AT >= SYSTIMESTAMP - INTERVAL '7' DAY
```

---

### Task 10: Dashboard page.jsx — All Frontend Changes

This is the largest task. It modifies `app/page.jsx` with 7 changes: BSS cards-only, alerts tab simplification, models tab guard, customize drawer, light mode CSS, top bar metrics from preferences, and params save feedback.

**Files:**
- Modify: `kalshicastsitev10/app/page.jsx`

Due to the file being 4000+ lines, this task is broken into sub-steps that each target a specific section.

- [ ] **Step 10a: BSS Matrix — Remove grid view**

In `BSSTab` (around line 1902), make these changes:

1. Remove `viewMode` state. Change line 1905 from:
```javascript
  const [viewMode,setViewMode]=useState('grid');
```
to: delete this line entirely.

2. Remove the grid/cards toggle buttons. In the section header div (around line 1937), remove:
```javascript
          {['grid','cards'].map(v=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{...}}>{v}</button>
          ))}
```

3. Remove the entire grid view conditional block (lines 1948-1986, the `viewMode==='grid'` branch including the `<table className="bss-grid">`, the legend, and the outer fragment).

4. Remove the `viewMode==='cards'` conditional — just keep the cards content unconditionally. Change `{matrix.length > 0 && viewMode==='cards' && (` to `{matrix.length > 0 && (`.

- [ ] **Step 10b: Alerts tab — Unified flat list**

In `AlertsTab` (around line 1518), simplify the rendering:

1. Remove the `origin`-based grouping. Delete the three `const` lines:
```javascript
  const systemAlerts = filtered.filter(a => a.origin === 'system_alert');
  const pipelineAlerts = filtered.filter(a => a.origin === 'pipeline_run');
  const healthAlerts = filtered.filter(a => a.origin === 'health_check');
```

2. Remove the separate Pipeline Failures section (lines 1653-1681) and Health Check Issues section (lines 1683-1710).

3. Replace the System Alerts section header (line 1712-1714) and its rendering with a single unified list. Replace everything from `<div className="section-header">` (line 1712) through the end of the `systemAlerts.map` block (line 1751) with:

```jsx
      <div className="section-header">
        <span className="section-title">System Alerts</span>
        <span className="section-sub">{filtered.filter(a=>!a.resolved).length} unresolved</span>
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state"><div className="icon">✅</div>No alerts matching filters.</div>
      ) : filtered.map(a=>(
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
          <div style={{fontSize:10,color:'var(--text-dim)'}}>
            {typeof a.detail === 'string' ? a.detail : JSON.stringify(a.detail)}
          </div>
          {a.resolved&&<div style={{fontSize:9,color:'var(--muted)',marginTop:3}}>RESOLVED {a.resolved_by ? `by ${a.resolved_by}` : ''} {a.resolved_ts ? fmt.ts(a.resolved_ts) : ''}</div>}
        </div>
      ))}
```

4. Also remove the `useEffect` that logs pipelineAlerts (lines 1589-1591) since `pipelineAlerts` no longer exists. Keep the one logging `unresolved`.

- [ ] **Step 10c: Models tab — Guard initial fetch**

In `ModelsTab` (around line 2090), fix the data flow:

1. Change the `useApiFetch` call (line 2103) to guard against empty station list:

```javascript
  const fetchUrl = stationIds.length > 0 ? `/api/ensemble-weights?station=${selectedStation}` : null;
  const { loading: weightsLoading, data: weightsData } = useApiFetch(fetchUrl);
```

2. In the empty state check for weights (line 2177), add staleness awareness. Replace:
```javascript
        if(weights.length===0) return <div className="empty-state"><div className="icon">⚖️</div>No weight data for this station — populates after the first market-open pipeline run.</div>;
```
with:
```javascript
        if(weights.length===0) return <div className="empty-state"><div className="icon">⚖️</div>No weight data for {selectedStation} in the last 7 days — populates after a successful market-open pipeline run.</div>;
```

3. After the weights summary bar (around line 2229), add a staleness indicator. After the concentration line, check computed_at age:

```javascript
              {weights[0]?.computed_at && (() => {
                const age = (Date.now() - new Date(weights[0].computed_at).getTime()) / 3600000;
                return age > 48 ? (
                  <span style={{color:'var(--amber)',fontSize:10,marginLeft:12}}>⚠ Data is {Math.round(age)}h old</span>
                ) : null;
              })()}
```

- [ ] **Step 10d: Params tab — Save feedback**

In `ParamsTab` (around line 1756), add save feedback:

1. Add a `saveMsg` state after the existing state declarations (around line 1761):

```javascript
  const [saveMsg,setSaveMsg]=useState(null);
```

2. Update `saveChanges` to show feedback. Replace the existing function (lines 1773-1788) with:

```javascript
  const saveChanges=async()=>{
    setSaving(true);
    setSaveMsg(null);
    const changed=Object.keys(dirty).map(k=>({key:k,value:values[k]}));
    try {
      const res = await fetch('/api/params', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changed),
      });
      if (!res.ok) throw new Error('Save failed');
      setDirty({});
      setSaveMsg({ type: 'ok', text: `${changed.length} param(s) saved` });
      setTimeout(() => setSaveMsg(null), 4000);
    } catch(e) {
      console.error('Params save error:', e);
      setSaveMsg({ type: 'err', text: 'Save failed — check console' });
    }
    setSaving(false);
  };
```

3. Add the feedback message display after the Save/Discard buttons (around line 1812):

```jsx
            {saveMsg && (
              <span style={{fontSize:10,fontWeight:600,color:saveMsg.type==='ok'?'var(--green)':'var(--red)',marginLeft:8}}>
                {saveMsg.text}
              </span>
            )}
```

- [ ] **Step 10e: Add preferences loading + customize drawer + light mode**

This is the largest sub-step. Add the following to `page.jsx`:

**1. Add preferences fetch hook (after `useApiFetch` around line 560):**

```javascript
function usePreferences() {
  const [prefs, setPrefs] = useState({
    accentColor: 'amber',
    fontSize: 'medium',
    theme: 'dark',
    defaultTab: 'overview',
    compactMode: false,
    animations: true,
    cardBorderRadius: 'sharp',
    topBarMetrics: ['bankroll', 'daily_pnl', 'cumulative_pnl', 'mdd', 'win_rate', 'open_positions'],
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/preferences')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPrefs(p => ({ ...p, ...d })); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const save = async (newPrefs) => {
    setPrefs(newPrefs);
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPrefs),
      });
    } catch (e) {
      console.error('Preferences save error:', e);
    }
  };

  return { prefs, setPrefs, save, loaded };
}
```

**2. Add ACCENT_COLORS and FONT_SIZES constants (near the top constants):**

```javascript
const ACCENT_COLORS = {
  amber:  { primary: '#f5a623', dim: 'rgba(245,166,35,0.15)', glow: 'rgba(245,166,35,0.25)' },
  cyan:   { primary: '#00d4d8', dim: 'rgba(0,212,216,0.15)', glow: 'rgba(0,212,216,0.25)' },
  green:  { primary: '#2ec07a', dim: 'rgba(46,192,122,0.15)', glow: 'rgba(46,192,122,0.25)' },
  red:    { primary: '#e84040', dim: 'rgba(232,64,64,0.15)', glow: 'rgba(232,64,64,0.25)' },
  violet: { primary: '#a78bfa', dim: 'rgba(167,139,250,0.15)', glow: 'rgba(167,139,250,0.25)' },
  blue:   { primary: '#3b82f6', dim: 'rgba(59,130,246,0.15)', glow: 'rgba(59,130,246,0.25)' },
};

const FONT_SIZES = { small: 10, medium: 12, large: 14 };

const TOP_BAR_METRIC_POOL = [
  { id: 'bankroll', label: 'Bankroll' },
  { id: 'daily_pnl', label: 'Daily P&L' },
  { id: 'cumulative_pnl', label: 'Cumulative' },
  { id: 'mdd', label: 'MDD' },
  { id: 'win_rate', label: 'Win Rate' },
  { id: 'open_positions', label: 'Open Pos.' },
  { id: 'sharpe_ratio', label: 'Sharpe' },
  { id: 'total_bets', label: 'Total Bets' },
  { id: 'paper_pnl', label: 'Paper P&L' },
];
```

**3. Add the CustomizeDrawer component (before the main DashboardPage component):**

```javascript
function CustomizeDrawer({ prefs, onChange, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...prefs });
  const update = (key, val) => {
    const next = { ...draft, [key]: val };
    setDraft(next);
    onChange(next); // live preview
  };

  return (
    <>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',zIndex:200}} onClick={onCancel} />
      <div style={{
        position:'fixed',top:0,right:0,bottom:0,width:340,
        background:'var(--bg1)',borderLeft:'1px solid var(--border2)',
        zIndex:201,overflowY:'auto',padding:'20px 16px',
        fontFamily:'var(--font-mono)',fontSize:11,
      }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <span style={{fontSize:14,fontWeight:700,color:'var(--text-bright)',letterSpacing:'0.06em'}}>CUSTOMIZE</span>
          <button onClick={onCancel} style={{background:'none',border:'none',color:'var(--text-dim)',cursor:'pointer',fontSize:16}}>✕</button>
        </div>

        {/* Theme Section */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:9,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Theme</div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--text-mid)',marginBottom:6}}>Accent Color</div>
            <div style={{display:'flex',gap:6}}>
              {Object.entries(ACCENT_COLORS).map(([name, c]) => (
                <button key={name} onClick={() => update('accentColor', name)}
                  style={{
                    width:28,height:28,borderRadius:3,background:c.primary,border:draft.accentColor===name?'2px solid var(--text-bright)':'2px solid transparent',
                    cursor:'pointer',transition:'border 0.15s',
                  }}
                  title={name}
                />
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--text-mid)',marginBottom:6}}>Mode</div>
            <div style={{display:'flex',gap:6}}>
              {['dark','light'].map(m => (
                <button key={m} onClick={() => update('theme', m)}
                  style={{
                    padding:'4px 14px',borderRadius:2,fontSize:9,fontWeight:600,cursor:'pointer',
                    textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)',
                    background:draft.theme===m?'var(--accent)':'transparent',
                    color:draft.theme===m?'#000':'var(--text-dim)',
                    border:`1px solid ${draft.theme===m?'var(--accent)':'var(--border2)'}`,
                  }}>{m}</button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--text-mid)',marginBottom:6}}>Font Size</div>
            <div style={{display:'flex',gap:6}}>
              {['small','medium','large'].map(s => (
                <button key={s} onClick={() => update('fontSize', s)}
                  style={{
                    padding:'4px 14px',borderRadius:2,fontSize:9,fontWeight:600,cursor:'pointer',
                    textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)',
                    background:draft.fontSize===s?'var(--accent)':'transparent',
                    color:draft.fontSize===s?'#000':'var(--text-dim)',
                    border:`1px solid ${draft.fontSize===s?'var(--accent)':'var(--border2)'}`,
                  }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--text-mid)',marginBottom:6}}>Card Corners</div>
            <div style={{display:'flex',gap:6}}>
              {['sharp','rounded'].map(s => (
                <button key={s} onClick={() => update('cardBorderRadius', s)}
                  style={{
                    padding:'4px 14px',borderRadius:2,fontSize:9,fontWeight:600,cursor:'pointer',
                    textTransform:'uppercase',letterSpacing:'0.08em',fontFamily:'var(--font-mono)',
                    background:draft.cardBorderRadius===s?'var(--accent)':'transparent',
                    color:draft.cardBorderRadius===s?'#000':'var(--text-dim)',
                    border:`1px solid ${draft.cardBorderRadius===s?'var(--accent)':'var(--border2)'}`,
                  }}>{s}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Layout Section */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:9,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>Layout</div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--text-mid)',marginBottom:6}}>Default Tab</div>
            <select value={draft.defaultTab} onChange={e => update('defaultTab', e.target.value)}
              style={{width:'100%',background:'var(--bg2)',border:'1px solid var(--border2)',color:'var(--text-bright)',padding:'6px 8px',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:10}}>
              {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>

          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:8}}>
            <input type="checkbox" checked={draft.compactMode} onChange={e => update('compactMode', e.target.checked)} />
            <span style={{fontSize:10,color:'var(--text-mid)'}}>Compact Mode</span>
          </label>

          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',marginBottom:8}}>
            <input type="checkbox" checked={draft.animations} onChange={e => update('animations', e.target.checked)} />
            <span style={{fontSize:10,color:'var(--text-mid)'}}>Animations</span>
          </label>
        </div>

        {/* Top Bar Metrics Section */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:9,fontWeight:700,color:'var(--text-dim)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>
            Top Bar Metrics <span style={{fontWeight:400}}>({(draft.topBarMetrics||[]).length}/9)</span>
          </div>
          {TOP_BAR_METRIC_POOL.map(m => {
            const active = (draft.topBarMetrics||[]).includes(m.id);
            const atCap = (draft.topBarMetrics||[]).length >= 9 && !active;
            return (
              <label key={m.id} style={{display:'flex',alignItems:'center',gap:8,cursor:atCap?'not-allowed':'pointer',marginBottom:6,opacity:atCap?0.4:1}}>
                <input type="checkbox" checked={active} disabled={atCap}
                  onChange={() => {
                    const current = draft.topBarMetrics || [];
                    const next = active ? current.filter(x => x !== m.id) : [...current, m.id];
                    update('topBarMetrics', next);
                  }}
                />
                <span style={{fontSize:10,color:'var(--text-mid)'}}>{m.label}</span>
              </label>
            );
          })}
        </div>

        {/* Save/Cancel */}
        <div style={{display:'flex',gap:8,paddingTop:12,borderTop:'1px solid var(--border)'}}>
          <button onClick={() => onSave(draft)}
            style={{flex:1,padding:'8px',background:'var(--accent)',color:'#000',border:'none',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:10,fontWeight:700,cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            Save
          </button>
          <button onClick={onCancel}
            style={{flex:1,padding:'8px',background:'transparent',color:'var(--text-dim)',border:'1px solid var(--border2)',borderRadius:2,fontFamily:'var(--font-mono)',fontSize:10,cursor:'pointer',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
```

**4. In the main DashboardPage component, integrate preferences:**

Near the top of the component (around where `useData()` is called), add:

```javascript
  const { prefs, setPrefs, save: savePrefs, loaded: prefsLoaded } = usePreferences();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [savedPrefs, setSavedPrefs] = useState(null); // for cancel revert
```

**5. Set default tab from preferences** — change the `useState('overview')` for tab to:

```javascript
  const [tab, setTab] = useState('overview');
  
  // Set default tab from preferences (once loaded)
  useEffect(() => {
    if (prefsLoaded && prefs.defaultTab) {
      setTab(prefs.defaultTab);
    }
  }, [prefsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
```

**6. Apply CSS variables from preferences** — add a `useEffect` that sets CSS variables on `<html>`:

```javascript
  useEffect(() => {
    const root = document.documentElement;
    const accent = ACCENT_COLORS[prefs.accentColor] || ACCENT_COLORS.amber;
    root.style.setProperty('--accent', accent.primary);
    root.style.setProperty('--accent-dim', accent.dim);
    root.style.setProperty('--accent-glow', accent.glow);
    root.style.setProperty('--font-base', `${FONT_SIZES[prefs.fontSize] || 12}px`);
    root.style.setProperty('--card-radius', prefs.cardBorderRadius === 'rounded' ? '8px' : '2px');

    if (prefs.theme === 'light') {
      root.setAttribute('data-theme', 'light');
    } else {
      root.removeAttribute('data-theme');
    }

    if (!prefs.animations) {
      root.style.setProperty('--transition-speed', '0s');
    } else {
      root.style.removeProperty('--transition-speed');
    }

    if (prefs.compactMode) {
      root.setAttribute('data-compact', '');
    } else {
      root.removeAttribute('data-compact');
    }
  }, [prefs]);
```

**7. Wire up Customize button** — replace the TODO onClick (around line 3875) with:

```javascript
                    <button className="dropdown-item" onClick={() => {
                      setSettingsOpen(false);
                      setSavedPrefs({ ...prefs });
                      setCustomizeOpen(true);
                    }}>
                      Customize
                    </button>
```

**8. Render the drawer** — at the end of the JSX, before the closing `</>`, add:

```jsx
        {customizeOpen && (
          <CustomizeDrawer
            prefs={prefs}
            onChange={setPrefs}
            onSave={(newPrefs) => { savePrefs(newPrefs); setCustomizeOpen(false); }}
            onCancel={() => { if (savedPrefs) setPrefs(savedPrefs); setCustomizeOpen(false); }}
          />
        )}
```

- [ ] **Step 10f: Add light mode CSS variables**

In the CSS string at the top of `page.jsx`, add light mode overrides. After the `:root { ... }` block, add:

```css
[data-theme="light"] {
  --bg0: #f5f5f7; --bg1: #ffffff; --bg2: #f0f0f3; --bg3: #e8e8ed;
  --border: #d1d5db; --border2: #c0c4cc;
  --text-dim: #6b7280; --text-mid: #4b5563; --text: #1f2937; --text-bright: #111827;
  --muted: #9ca3af;
}
[data-theme="light"] .shell { background: var(--bg0); color: var(--text); }
[data-theme="light"] .topbar { background: var(--bg1); border-color: var(--border); }
[data-theme="light"] .card { background: var(--bg1); border-color: var(--border); }
[data-theme="light"] .tab.active { border-color: var(--accent); color: var(--accent); }
[data-theme="light"] .dropdown-menu { background: var(--bg1); border-color: var(--border); }
[data-theme="light"] .section { color: var(--text); }
```

Also add compact mode CSS:

```css
[data-compact] .section { padding: 8px 12px; }
[data-compact] .card { padding: 6px 10px; }
[data-compact] .tmet { padding: 2px 8px; }
```

And add accent variable usage. Replace all hardcoded `var(--amber)` references in the CSS that refer to accent colors (logo dot, tab active, buttons) with `var(--accent)`. The existing amber-specific colors for data display (like BSS qualified, severity) should stay as-is — only UI chrome should use `var(--accent)`.

Also add `font-size: var(--font-base, 12px);` to the `.shell` CSS class.

Also ensure `.card` uses `border-radius: var(--card-radius, 2px);`.

- [ ] **Step 10g: Top bar metrics from preferences**

Replace the hardcoded top bar metrics block (lines 3819-3855) with a dynamic version that reads from `prefs.topBarMetrics`. Create a metric renderer map:

```javascript
  const metricRenderers = {
    bankroll: () => ({ label: `Bankroll${s.paper_mode ? ' · Paper' : ' · Live'}`, value: `$${displayBankroll.toFixed(2)}`, cls: 'amber' }),
    daily_pnl: () => ({ label: 'Daily P&L', value: fmt.usd(s.daily_pnl||0), cls: (s.daily_pnl||0)>=0?'pos':'neg' }),
    cumulative_pnl: () => ({ label: 'Cumulative', value: fmt.usd(s.cumulative_pnl||0), cls: (s.cumulative_pnl||0)>=0?'pos':'neg' }),
    mdd: () => ({ label: 'MDD', value: fmt.pct2(s.mdd_alltime||0), cls: 'warn' }),
    win_rate: () => ({ label: 'Win Rate', value: fmt.pct(winRate), cls: '' }),
    open_positions: () => ({ label: 'Open Pos.', value: (data.open_positions||[]).length, cls: '' }),
    sharpe_ratio: () => ({ label: 'Sharpe', value: (s.sharpe_30||0).toFixed(2), cls: '' }),
    total_bets: () => ({ label: 'Total Bets', value: s.n_bets_total||0, cls: '' }),
    paper_pnl: () => ({ label: 'Paper P&L', value: fmt.usd(s.paper_cumulative_pnl||0), cls: (s.paper_cumulative_pnl||0)>=0?'pos':'neg' }),
  };
```

Then replace the hardcoded `<div className="tmet">` blocks with:

```jsx
          <div className="topbar-metrics">
            {(prefs.topBarMetrics || []).map(id => {
              const renderer = metricRenderers[id];
              if (!renderer) return null;
              const m = renderer();
              return (
                <div key={id} className="tmet">
                  <div className="tmet-label">{m.label}</div>
                  <div className={`tmet-val ${m.cls}`}>{m.value}</div>
                </div>
              );
            })}
            <div className="tmet">
              <div className="tmet-label">LOCAL</div>
              <div className="tmet-val" style={{fontSize:11}}><LocalClock /></div>
            </div>
            <div className="tmet">
              <div className="tmet-label">UTC</div>
              <div className="tmet-val" style={{fontSize:11}}><UTCClock /></div>
            </div>
          </div>
```

(LOCAL and UTC clocks always show, not configurable.)

- [ ] **Step 11: Smoke test**

Run the Next.js dev server and verify:
```bash
cd kalshicastsitev10 && npm run dev
```

Check:
1. BSS tab shows cards only (no grid toggle)
2. Alerts tab shows flat list with resolve buttons on all alerts
3. Models tab loads weights when stations are available
4. Settings > Customize opens the drawer
5. Accent color, font size, theme toggle work with live preview
6. Params tab shows save confirmation feedback
7. Light mode applies correctly

---

### Summary of Changes by File

| File | Change |
|------|--------|
| `params_bootstrap.py` | +1 ParamDef for alerts.retention_days |
| `schema.py` | +1 table (USER_PREFERENCES), seed logic |
| `market_open.py` | Catch-all alert, paper_mode param, paper query fix, diagnostic alert |
| `morning.py` | Catch-all alert before update_pipeline_run |
| `night.py` | Catch-all alert before update_pipeline_run |
| `rollover.py` | purge_resolved_alerts function + call |
| `auth/route.js` | Cookie value = username |
| `preferences/route.js` | New file — GET/PUT user prefs |
| `alerts/route.js` | Simplified to DB-only query |
| `ensemble-weights/route.js` | 2 day → 7 day window |
| `page.jsx` | BSS cards-only, alerts flat list, models guard, customize drawer, light mode, top bar metrics, params feedback |
