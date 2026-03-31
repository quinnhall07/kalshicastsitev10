import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT alert_id, alert_type, severity_score, alert_ts, 
              station_id, source_id, is_resolved, details_json 
       FROM system_alerts 
       ORDER BY alert_ts DESC 
       FETCH FIRST 50 ROWS ONLY`
    );
    
    const alerts = result.rows.map(row => ({
      id: row[0],
      type: row[1],
      severity: row[2] || 0,
      ts: row[3] ? new Date(row[3]).toISOString() : null,
      station: row[4],
      source: row[5],
      resolved: row[6] === 1,
      detail: row[7] ? String(row[7]) : "No details provided."
    }));

    return NextResponse.json(alerts);
  } catch (error) {
    console.error("Oracle DB Error in /api/alerts:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}