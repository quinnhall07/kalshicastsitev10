import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // Fetch system alerts AND failed pipeline runs in parallel
    const [alertResult, pipelineResult] = await Promise.all([
      connection.execute(
        `SELECT alert_id, alert_type, severity_score, alert_ts,
                station_id, source_id, is_resolved, details_json
         FROM system_alerts
         ORDER BY alert_ts DESC
         FETCH FIRST 50 ROWS ONLY`
      ),
      connection.execute(
        `SELECT run_id, run_type, status, started_utc, completed_utc,
                stations_fail, error_msg
         FROM pipeline_runs
         WHERE status NOT IN ('OK', 'SUCCESS')
           AND started_utc >= SYSDATE - 7
         ORDER BY started_utc DESC
         FETCH FIRST 30 ROWS ONLY`
      ),
    ]);

    const alerts = alertResult.rows.map(row => ({
      id: row[0],
      type: row[1],
      severity: row[2] || 0,
      ts: row[3] ? new Date(row[3]).toISOString() : null,
      station: row[4],
      source: row[5],
      resolved: row[6] === 1,
      detail: row[7] ? String(row[7]) : "No details provided.",
      origin: 'system_alert',
    }));

    // Convert failed pipeline runs into alert-shaped objects
    const pipelineAlerts = pipelineResult.rows.map(row => ({
      id: `pipeline_${row[0]}`,
      type: `PIPELINE_${(row[1] || 'UNKNOWN').toUpperCase()}_FAILURE`,
      severity: row[2] === 'FAILURE' ? 0.8 : 0.6,
      ts: row[3] ? new Date(row[3]).toISOString() : null,
      station: row[5] > 0 ? `${row[5]} station(s) failed` : null,
      source: row[1],
      resolved: false,
      detail: row[6] || `Pipeline '${row[1]}' ended with status: ${row[2]}`,
      origin: 'pipeline_run',
      pipeline_status: row[2],
      completed: row[4] ? new Date(row[4]).toISOString() : null,
    }));

    // Merge and sort by timestamp descending
    const merged = [...alerts, ...pipelineAlerts].sort((a, b) => {
      const ta = a.ts ? new Date(a.ts).getTime() : 0;
      const tb = b.ts ? new Date(b.ts).getTime() : 0;
      return tb - ta;
    });

    return NextResponse.json(merged);
  } catch (error) {
    console.error("Oracle DB Error in /api/alerts:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}