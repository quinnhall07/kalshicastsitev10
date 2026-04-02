import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT STATION_ID, TARGET_TYPE, LEAD_BRACKET,
              BSS_1, BSS_2, IS_QUALIFIED,
              BS_MODEL, BS_BASELINE_1, N_OBSERVATIONS,
              TO_CHAR(COMPUTED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS COMPUTED_AT
       FROM BSS_MATRIX
       ORDER BY STATION_ID, TARGET_TYPE, LEAD_BRACKET`
    );

    const rows = (result.rows || []).map(r => ({
      station:      r[0],
      type:         r[1],
      bracket:      r[2],
      bss:          r[3] != null ? Number(r[3]) : null,
      bss_2:        r[4] != null ? Number(r[4]) : null,
      qualified:    r[5] === 1,
      bs_model:     r[6] != null ? Number(r[6]) : null,
      bs_baseline_1:r[7] != null ? Number(r[7]) : null,
      n_observations:r[8] != null ? Number(r[8]) : 0,
      computed_at:  r[9],
    }));

    return NextResponse.json(rows);
  } catch (error) {
    console.error('Oracle DB Error in /api/bss:', error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}