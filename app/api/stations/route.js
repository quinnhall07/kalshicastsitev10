import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT
         s.STATION_ID,
         s.NAME,
         s.CITY,
         s.STATE_CODE,
         s.TIMEZONE,
         s.WFO_ID,
         s.LAT,
         s.LON,
         m.T_OBS_MAX_F,
         m.T_OBS_MIN_F,
         m.OBS_COUNT,
         TO_CHAR(m.LAST_OBS_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS LAST_OBS_AT,
         CASE
           WHEN m.LAST_OBS_AT IS NULL THEN 9999
           ELSE ROUND((SYSDATE - CAST(m.LAST_OBS_AT AS DATE)) * 24 * 60)
         END AS METAR_AGE_MIN,
         (SELECT COUNT(*) FROM OBSERVATIONS o
          WHERE o.STATION_ID = s.STATION_ID
            AND o.TARGET_DATE >= TRUNC(SYSDATE) - 30) AS OBS_COUNT_30D,
         s.IS_RELIABLE,
         s.RELIABILITY_NOTE
       FROM STATIONS s
       LEFT JOIN METAR_DAILY_MAX m
         ON m.STATION_ID = s.STATION_ID
        AND m.LOCAL_DATE = TRUNC(SYSDATE)
       WHERE s.IS_ACTIVE = 1
       ORDER BY s.STATION_ID`
    );

    const stations = (result.rows || []).map(r => ({
      id:               r[0],
      name:             r[1],
      city:             r[2],
      state:            r[3],
      timezone:         r[4],
      wfo_id:           r[5],
      lat:              r[6] != null ? Number(r[6]) : null,
      lon:              r[7] != null ? Number(r[7]) : null,
      t_obs_max:        r[8] != null ? Number(r[8]) : null,
      t_obs_min:        r[9] != null ? Number(r[9]) : null,
      obs_count:        Number(r[10]) || 0,
      last_obs_at:      r[11],
      metar_age_min:    Number(r[12]) || 9999,
      obs_count_30d:    Number(r[13]) || 0,
      is_reliable:      r[14] !== 0,
      reliability_note: r[15],
    }));

    return NextResponse.json(stations);
  } catch (error) {
    console.error('Oracle DB Error in /api/stations:', error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}