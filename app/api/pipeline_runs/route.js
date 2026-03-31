import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT run_id, run_type, status, started_utc, completed_utc, rows_daily, 
              rows_hourly, stations_ok, stations_fail, error_msg 
       FROM pipeline_runs 
       ORDER BY started_utc DESC 
       FETCH FIRST 10 ROWS ONLY`
    );
    
    const runs = result.rows.map(row => ({
      run_id: row[0],
      type: row[1],
      status: row[2],
      started: row[3] ? new Date(row[3]).toISOString() : null,
      completed: row[4] ? new Date(row[4]).toISOString() : null,
      rows_daily: row[5] || 0,
      rows_hourly: row[6] || 0,
      stations_ok: row[7] || 0,
      stations_fail: row[8] || 0,
      error_msg: row[9] || null
    }));

    return NextResponse.json(runs);
  } catch (error) {
    console.error("Oracle DB Error in /api/pipeline_runs:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}