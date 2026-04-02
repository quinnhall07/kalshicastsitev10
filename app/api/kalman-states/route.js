import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT
         ks.STATION_ID,
         ks.TARGET_TYPE,
         ks.B_K,
         ks.U_K,
         ks.Q_BASE,
         ks.STATE_VERSION,
         ks.TOP_MODEL_ID,
         TO_CHAR(ks.LAST_OBSERVATION_DATE, 'YYYY-MM-DD') AS LAST_OBS_DATE,
         TO_CHAR(ks.LAST_UPDATED_UTC, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS LAST_UPDATED,
         -- recent innovation for sparkline (last 7 days)
         (SELECT ROUND(AVG(ABS(kh.EPSILON_K)), 4)
          FROM KALMAN_HISTORY kh
          WHERE kh.STATION_ID  = ks.STATION_ID
            AND kh.TARGET_TYPE = ks.TARGET_TYPE
            AND kh.CREATED_AT >= SYSTIMESTAMP - INTERVAL '7' DAY) AS AVG_INNOVATION_7D
       FROM KALMAN_STATES ks
       ORDER BY ks.STATION_ID, ks.TARGET_TYPE`
    );

    const states = (result.rows || []).map(r => ({
      station_id:         r[0],
      target_type:        r[1],
      b_k:                r[2] != null ? Number(r[2]) : 0,
      u_k:                r[3] != null ? Number(r[3]) : 4,
      q_base:             r[4] != null ? Number(r[4]) : 0,
      state_version:      Number(r[5]) || 0,
      top_model_id:       r[6],
      last_observation_date: r[7],
      last_updated:       r[8],
      avg_innovation_7d:  r[9] != null ? Number(r[9]) : null,
    }));

    return NextResponse.json(states);
  } catch (error) {
    console.error('Oracle DB Error in /api/kalman-states:', error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}