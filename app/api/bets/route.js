import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT ticker, station_id, target_date, target_type, 
              bin_lower, bin_upper, entry_price, contracts, outcome, pnl_net, order_type 
       FROM positions 
       WHERE status IN ('CLOSED', 'SETTLED') OR outcome IS NOT NULL
       ORDER BY target_date DESC 
       FETCH FIRST 100 ROWS ONLY`
    );
    
    const bets = result.rows.map(row => ({
      ticker: row[0],
      station: row[1],
      target_date: row[2] ? new Date(row[2]).toISOString().split('T')[0] : null,
      type: row[3],
      bin: `${row[4]}–${row[5]}°F`,
      entry_price: row[6] || 0,
      contracts: row[7] || 0,
      outcome: row[8],
      pnl_net: row[9] || 0,
      order_type: row[10],
      // Assuming p_win_at_entry is roughly the entry price for the scatter plot fallback
      // unless you join this with BEST_BETS in the future.
      p_win_at_entry: (row[6] || 0) + (row[9] > 0 ? 0.05 : -0.05) 
    }));

    return NextResponse.json(bets);
  } catch (error) {
    console.error("Oracle DB Error:", error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}