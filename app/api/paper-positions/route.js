import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT
         p.POSITION_ID,
         p.TICKER,
         p.STATION_ID,
         TO_CHAR(p.TARGET_DATE, 'YYYY-MM-DD')   AS TARGET_DATE,
         p.TARGET_TYPE,
         p.BIN_LOWER,
         p.BIN_UPPER,
         p.ENTRY_PRICE,
         p.CONTRACTS,
         p.ORDER_TYPE,
         TO_CHAR(p.SUBMITTED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS SUBMITTED_AT,
         sb.P_WIN                                AS CURRENT_P_WIN,
         sb.MU,
         sb.SIGMA_EFF,
         -- unrealized value at current model price
         (sb.P_WIN - p.ENTRY_PRICE) * p.CONTRACTS * 100 AS UNREALIZED_EDGE
       FROM POSITIONS p
       LEFT JOIN SHADOW_BOOK sb ON sb.TICKER = p.TICKER
       WHERE p.IS_PAPER = 1
         AND p.STATUS   = 'PAPER_OPEN'
       ORDER BY p.TARGET_DATE ASC, p.STATION_ID, p.TARGET_TYPE`
    );

    const rows = (result.rows || []).map(r => ({
      position_id:    r[0],
      ticker:         r[1],
      station_id:     r[2],
      target_date:    r[3],
      target_type:    r[4],
      bin_lower:      r[5] != null ? Number(r[5]) : null,
      bin_upper:      r[6] != null ? Number(r[6]) : null,
      entry_price:    r[7] != null ? Number(r[7]) : null,
      contracts:      Number(r[8]) || 0,
      order_type:     r[9],
      submitted_at:   r[10],
      current_p_win:  r[11] != null ? Number(r[11]) : null,
      mu:             r[12] != null ? Number(r[12]) : null,
      sigma_eff:      r[13] != null ? Number(r[13]) : null,
      unrealized_edge: r[14] != null ? Number(r[14]) : null,
    }));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Oracle DB Error in /api/paper-positions:', error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}