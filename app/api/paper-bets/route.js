import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT
         p.TICKER,
         p.STATION_ID,
         TO_CHAR(p.TARGET_DATE, 'YYYY-MM-DD')   AS TARGET_DATE,
         p.TARGET_TYPE,
         p.BIN_LOWER,
         p.BIN_UPPER,
         p.ENTRY_PRICE,
         p.CONTRACTS,
         p.ORDER_TYPE,
         p.OUTCOME,
         p.PNL_GROSS,
         p.PNL_NET,
         TO_CHAR(p.FILLED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS FILLED_AT,
         bs.P_WIN_AT_GRADING,
         bs.BRIER_SCORE
       FROM POSITIONS p
       LEFT JOIN BRIER_SCORES bs ON bs.TICKER = p.TICKER
       WHERE p.IS_PAPER = 1
         AND p.STATUS   = 'PAPER_SETTLED'
       ORDER BY p.FILLED_AT DESC
       FETCH FIRST 200 ROWS ONLY`
    );

    const rows = (result.rows || []).map(r => ({
      ticker:           r[0],
      station_id:       r[1],
      target_date:      r[2],
      target_type:      r[3],
      bin_lower:        r[4]  != null ? Number(r[4])  : null,
      bin_upper:        r[5]  != null ? Number(r[5])  : null,
      entry_price:      r[6]  != null ? Number(r[6])  : null,
      contracts:        Number(r[7]) || 0,
      order_type:       r[8],
      outcome:          r[9]  != null ? Number(r[9])  : null,
      pnl_gross:        r[10] != null ? Number(r[10]) : null,
      pnl_net:          r[11] != null ? Number(r[11]) : null,
      filled_at:        r[12],
      p_win_at_grading: r[13] != null ? Number(r[13]) : null,
      brier_score:      r[14] != null ? Number(r[14]) : null,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Oracle DB Error in /api/paper-bets:', error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}