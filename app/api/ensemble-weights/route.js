import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('station') || 'KNYC';

  let connection;
  try {
    connection = await getDbConnection();

    // Latest run's weights for this station — aggregate across lead brackets
    const result = await connection.execute(
      `SELECT
         mw.SOURCE_ID,
         mw.LEAD_BRACKET,
         AVG(mw.W_M)                 AS W_M,
         AVG(mw.BSS_M)               AS BSS_M,
         MAX(mw.IS_STALE)            AS IS_STALE,
         AVG(mw.STALE_DECAY_FACTOR)  AS STALE_DECAY_FACTOR,
         TO_CHAR(MAX(mw.COMPUTED_AT), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS COMPUTED_AT
       FROM MODEL_WEIGHTS mw
       WHERE mw.STATION_ID  = :sid
         AND mw.COMPUTED_AT >= SYSTIMESTAMP - INTERVAL '7' DAY
       GROUP BY mw.SOURCE_ID, mw.LEAD_BRACKET
       ORDER BY AVG(mw.W_M) DESC`,
      { sid: stationId }
    );

    // Also grab the latest ensemble state for this station (any target date)
    const ensResult = await connection.execute(
      `SELECT
         es.TARGET_TYPE,
         TO_CHAR(es.TARGET_DATE, 'YYYY-MM-DD') AS TARGET_DATE,
         es.TOP_MODEL_ID,
         es.M_K,
         es.F_TK_TOP,
         es.F_BAR_TK,
         es.S_TK,
         es.SIGMA_EFF,
         es.WEIGHT_JSON,
         es.STALE_MODEL_IDS
       FROM ENSEMBLE_STATE es
       WHERE es.STATION_ID = :sid
       ORDER BY es.TARGET_DATE DESC, es.TARGET_TYPE
       FETCH FIRST 2 ROWS ONLY`,
      { sid: stationId }
    );

    const weights = (result.rows || []).map(r => ({
      source_id:          r[0],
      lead_bracket:       r[1],
      w_m:                Number(r[2]) || 0,
      bss_m:              r[3] != null ? Number(r[3]) : null,
      is_stale:           r[4] === 1,
      stale_decay_factor: r[5] != null ? Number(r[5]) : 1.0,
      computed_at:        r[6],
    }));

    const ensemble = (ensResult.rows || []).map(r => {
      let weight_json = null;
      try {
        weight_json = r[8] ? JSON.parse(typeof r[8] === 'string' ? r[8] : String(r[8])) : null;
      } catch (_) {}
      return {
        target_type:     r[0],
        target_date:     r[1],
        top_model_id:    r[2],
        m_k:             Number(r[3]) || 0,
        f_tk_top:        r[4] != null ? Number(r[4]) : null,
        f_bar_tk:        r[5] != null ? Number(r[5]) : null,
        s_tk:            r[6] != null ? Number(r[6]) : null,
        sigma_eff:       r[7] != null ? Number(r[7]) : null,
        weight_json,
        stale_model_ids: r[9],
      };
    });

    return NextResponse.json({ station_id: stationId, weights, ensemble });
  } catch (error) {
    console.error('Oracle DB Error in /api/ensemble-weights:', error);
    return NextResponse.json({ station_id: stationId, weights: [], ensemble: [] }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}