import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT run_type, status, started_utc, rows_daily, 
              rows_hourly, stations_ok, stations_fail 
       FROM pipeline_runs 
       ORDER BY started_utc DESC 
       FETCH FIRST 10 ROWS ONLY`
    );
    
    const runs = result.rows.map(row => ({
      type: row[0],
      status: row[1],
      started: row[2] ? new Date(row[2]).toISOString() : null,
      rows_daily: row[3] || 0,
      rows_hourly: row[4] || 0,
      stations_ok: row[5] || 0,
      stations_fail: row[6] || 0
    }));

    return NextResponse.json(runs);
  } catch (error) {
    console.error("Oracle DB Error:", error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}