import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // Selects active positions that haven't been settled yet
    const result = await connection.execute(
      `SELECT position_id, ticker, station_id, target_date, target_type, 
              bin_lower, bin_upper, entry_price, contracts, order_type, status 
       FROM positions 
       WHERE status IN ('OPEN', 'FILLED') AND outcome IS NULL
       ORDER BY target_date ASC`
    );
    
    const positions = result.rows.map(row => ({
      position_id: row[0],
      ticker: row[1],
      station_id: row[2],
      target_date: row[3] ? new Date(row[3]).toISOString().split('T')[0] : null,
      target_type: row[4],
      bin_lower: row[5],
      bin_upper: row[6],
      entry_price: row[7],
      contracts: row[8],
      order_type: row[9],
      status: row[10]
    }));

    return NextResponse.json(positions);
  } catch (error) {
    console.error("Oracle DB Error in /api/positions:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}