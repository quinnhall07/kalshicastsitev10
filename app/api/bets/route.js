import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // Joins BRIER_SCORES (b) with POSITIONS (p) to return graded bets
    const result = await connection.execute(
      `SELECT p.ticker, p.station_id, p.target_date, p.target_type, 
              p.bin_lower, p.bin_upper, p.entry_price, p.actual_fill_price, 
              p.contracts, p.pnl_net, b.outcome, b.brier_score, b.graded_at,
              b.p_win_at_grading
       FROM positions p
       JOIN brier_scores b ON p.ticker = b.ticker
       ORDER BY b.graded_at DESC 
       FETCH FIRST 100 ROWS ONLY`
    );
    
    const bets = result.rows.map(row => ({
      ticker: row[0],
      station_id: row[1],
      target_date: row[2] ? new Date(row[2]).toISOString().split('T')[0] : null,
      target_type: row[3],
      bin: `${row[4]}–${row[5]}°F`,
      entry_price: row[6] || 0,
      actual_fill_price: row[7] || 0,
      contracts: row[8] || 0,
      pnl_net: row[9] || 0,
      outcome: row[10],
      brier_score: row[11],
      graded_at: row[12] ? new Date(row[12]).toISOString() : null,
      p_win_at_grading: row[13] || 0
    }));

    return NextResponse.json(bets);
  } catch (error) {
    console.error("Oracle DB Error in /api/bets:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}