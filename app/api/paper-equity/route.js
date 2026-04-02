import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    // Daily settled paper P&L, with cumulative running total computed in JS
    const result = await connection.execute(
      `SELECT
         TO_CHAR(TRUNC(filled_at), 'YYYY-MM-DD')            AS day,
         SUM(COALESCE(pnl_net, 0))                          AS daily_pnl,
         COUNT(*)                                            AS n_bets,
         SUM(CASE WHEN outcome = 1 THEN 1 ELSE 0 END)       AS n_won,
         -- also grab today's open positions for "pending" display
         0                                                   AS n_open
       FROM positions
       WHERE is_paper   = 1
         AND status     = 'PAPER_SETTLED'
         AND filled_at >= TRUNC(SYSDATE) - 90
       GROUP BY TRUNC(filled_at)
       ORDER BY TRUNC(filled_at) ASC`
    );

    // Open paper positions count
    const openResult = await connection.execute(
      `SELECT COUNT(*) FROM positions WHERE is_paper = 1 AND status = 'PAPER_OPEN'`
    );
    const nOpen = openResult.rows?.[0]?.[0] || 0;

    let running = 0;
    const days = (result.rows || []).map(row => {
      const isObj  = !Array.isArray(row);
      const day    = isObj ? row.DAY     : row[0];
      const dpnl   = Number(isObj ? row.DAILY_PNL : row[1]) || 0;
      const nBets  = Number(isObj ? row.N_BETS    : row[2]) || 0;
      const nWon   = Number(isObj ? row.N_WON     : row[3]) || 0;

      running += dpnl;
      return {
        date:             day,
        daily_pnl:        +dpnl.toFixed(4),
        cumulative_pnl:   +running.toFixed(4),
        n_bets:           nBets,
        win_rate:         nBets > 0 ? +(nWon / nBets).toFixed(4) : 0,
      };
    });

    return NextResponse.json({ days, n_open: nOpen, total_days: days.length });
  } catch (error) {
    console.error('Oracle DB Error in /api/paper-equity:', error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}