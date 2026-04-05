import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    // Fetch all alert sources in parallel
    const [alertResult, pipelineResult, staleResult, coverageResult] = await Promise.all([
      // 1. System alerts from DB (last 100)
      connection.execute(
        `SELECT alert_id, alert_type, severity_score, alert_ts,
                station_id, source_id, is_resolved, details_json,
                resolved_ts, resolved_by
         FROM system_alerts
         ORDER BY alert_ts DESC
         FETCH FIRST 100 ROWS ONLY`
      ),
      // 2. Failed/partial pipeline runs (last 7 days)
      connection.execute(
        `SELECT run_id, run_type, status, started_utc, completed_utc,
                stations_fail, error_msg
         FROM pipeline_runs
         WHERE status NOT IN ('OK', 'SUCCESS')
           AND started_utc >= SYSDATE - 7
         ORDER BY started_utc DESC
         FETCH FIRST 30 ROWS ONLY`
      ),
      // 3. Stale pipeline detection — when was each pipeline type last successful?
      connection.execute(
        `SELECT run_type,
                MAX(started_utc) AS last_run,
                ROUND((SYSDATE - MAX(started_utc)) * 24, 1) AS hours_ago
         FROM pipeline_runs
         WHERE status = 'OK'
         GROUP BY run_type`
      ),
      // 4. Data coverage — stations missing recent observations
      connection.execute(
        `SELECT s.station_id, s.station_name,
                MAX(o.target_date) AS last_obs_date,
                ROUND(SYSDATE - MAX(o.target_date), 0) AS days_stale
         FROM stations s
         LEFT JOIN observations o ON o.station_id = s.station_id
         WHERE s.is_active = 1
         GROUP BY s.station_id, s.station_name
         HAVING MAX(o.target_date) IS NULL OR MAX(o.target_date) < SYSDATE - 3
         ORDER BY days_stale DESC NULLS FIRST`
      ),
    ]);

    // Parse system alerts
    const alerts = alertResult.rows.map(row => {
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
        origin: 'system_alert',
      };
    });

    // Convert failed pipeline runs into alert-shaped objects
    const pipelineAlerts = pipelineResult.rows.map(row => ({
      id: `pipeline_${row[0]}`,
      type: `PIPELINE_${(row[1] || 'UNKNOWN').toUpperCase()}_FAILURE`,
      severity: row[2] === 'ERROR' ? 0.8 : 0.6,
      ts: row[3] ? new Date(row[3]).toISOString() : null,
      station: row[5] > 0 ? `${row[5]} station(s) failed` : null,
      source: row[1],
      resolved: false,
      detail: row[6] || `Pipeline '${row[1]}' ended with status: ${row[2]}`,
      origin: 'pipeline_run',
      pipeline_status: row[2],
      completed: row[4] ? new Date(row[4]).toISOString() : null,
    }));

    // Generate stale pipeline alerts (real-time health check)
    const staleAlerts = [];
    const expectedIntervals = { morning: 6, night: 28, market_open: 28 };
    const lastRuns = {};
    for (const row of staleResult.rows) {
      lastRuns[row[0]] = { last_run: row[1], hours_ago: row[2] };
    }
    for (const [runType, maxHours] of Object.entries(expectedIntervals)) {
      const info = lastRuns[runType];
      if (!info) {
        staleAlerts.push({
          id: `stale_${runType}_never`,
          type: `STALE_PIPELINE`,
          severity: 0.85,
          ts: new Date().toISOString(),
          station: null,
          source: runType,
          resolved: false,
          detail: `Pipeline '${runType}' has NEVER completed successfully.`,
          origin: 'health_check',
        });
      } else if (info.hours_ago > maxHours) {
        staleAlerts.push({
          id: `stale_${runType}_${Date.now()}`,
          type: `STALE_PIPELINE`,
          severity: 0.7,
          ts: new Date().toISOString(),
          station: null,
          source: runType,
          resolved: false,
          detail: `Pipeline '${runType}' last succeeded ${info.hours_ago}h ago (expected every ${maxHours}h).`,
          origin: 'health_check',
        });
      }
    }

    // Generate stale station data alerts
    const staleStationAlerts = coverageResult.rows.map(row => ({
      id: `stale_obs_${row[0]}`,
      type: 'STALE_OBSERVATIONS',
      severity: row[3] === null ? 0.6 : (row[3] > 7 ? 0.7 : 0.5),
      ts: new Date().toISOString(),
      station: row[0],
      source: null,
      resolved: false,
      detail: row[2]
        ? `Station ${row[0]} (${row[1]}) last observation ${row[3]} days ago.`
        : `Station ${row[0]} (${row[1]}) has NO observations recorded.`,
      origin: 'health_check',
    }));

    // Merge all and sort by timestamp descending
    const merged = [...alerts, ...pipelineAlerts, ...staleAlerts, ...staleStationAlerts]
      .sort((a, b) => {
        const ta = a.ts ? new Date(a.ts).getTime() : 0;
        const tb = b.ts ? new Date(b.ts).getTime() : 0;
        return tb - ta;
      });

    // Summary counts
    const summary = {
      total: merged.length,
      unresolved: merged.filter(a => !a.resolved).length,
      critical: merged.filter(a => !a.resolved && a.severity >= 0.8).length,
      warning: merged.filter(a => !a.resolved && a.severity >= 0.5 && a.severity < 0.8).length,
      info: merged.filter(a => !a.resolved && a.severity < 0.5).length,
    };

    return NextResponse.json({ alerts: merged, summary });
  } catch (error) {
    console.error("Oracle DB Error in /api/alerts:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}
