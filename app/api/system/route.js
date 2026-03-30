import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

// Tell Next.js to NEVER cache or pre-render this file at build time
export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // Example query pulling system stats
    const result = await connection.execute(
      `SELECT bankroll, daily_pnl FROM system_stats WHERE id = 1`
    );
    
    // Map Oracle's array output to the JSON structure your dashboard expects
    const data = {
      system: {
        bankroll: result.rows[0][0],
        daily_pnl: result.rows[0][1],
        db_connected: true
      }
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("Oracle DB Error:", error);
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}