import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    // Get last market_open run ID
    const runRes = await connection.execute(
      `SELECT RUN_ID, STATUS,
              TO_CHAR(STARTED_UTC, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   AS STARTED,
              TO_CHAR(COMPLETED_UTC, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS COMPLETED
       FROM PIPELINE_RUNS
       WHERE RUN_TYPE = 'market_open'
       ORDER BY STARTED_UTC DESC
       FETCH FIRST 1 ROWS ONLY`
    );

    if (!runRes.rows?.length) {
      return NextResponse.json({ run: null, bets: [] });
    }

    const [runId, runStatus, runStarted, runCompleted] = runRes.rows[0];

    // All BEST_BETS from that run
    const bbRes = await connection.execute(
      `SELECT
         bb.TICKER,
         bb.STATION_ID,
         TO_CHAR(bb.TARGET_DATE, 'YYYY-MM-DD') AS TARGET_DATE,
         bb.TARGET_TYPE,
         bb.BIN_LOWER,
         bb.BIN_UPPER,
         bb.P_WIN,
         bb.CONTRACT_PRICE,
         bb.EV_NET,
         bb.EV_THRESHOLD_H,
         bb.IBE_COMPOSITE,
         bb.IBE_VETO,
         bb.F_STAR,
         bb.F_FINAL,
         bb.D_SCALE,
         bb.GAMMA_CONVERGENCE,
         bb.IS_SELECTED_FOR_EXECUTION,
         bb.ALL_GATE_FLAGS_JSON,
         bb.PIPELINE_RUN_STATUS
       FROM BEST_BETS bb
       WHERE bb.PIPELINE_RUN_ID = :run_id
       ORDER BY bb.IS_SELECTED_FOR_EXECUTION DESC, bb.EV_NET DESC NULLS LAST
       FETCH FIRST 300 ROWS ONLY`,
      { run_id: runId }
    );

    // Aggregate counts
    const countRes = await connection.execute(
      `SELECT
         COUNT(*)                                   AS total_evaluated,
         SUM(IS_SELECTED_FOR_EXECUTION)             AS total_selected,
         SUM(IBE_VETO)                              AS total_ibe_veto,
         AVG(CASE WHEN IS_SELECTED_FOR_EXECUTION = 1 THEN P_WIN END) AS avg_p_win_selected,
         AVG(CASE WHEN IS_SELECTED_FOR_EXECUTION = 1 THEN EV_NET END) AS avg_ev_selected
       FROM BEST_BETS
       WHERE PIPELINE_RUN_ID = :run_id`,
      { run_id: runId }
    );

    const counts = countRes.rows?.[0] || [];

    const bets = (bbRes.rows || []).map(r => {
      let gateFlags = null;
      try {
        gateFlags = r[17] ? JSON.parse(typeof r[17] === 'string' ? r[17] : String(r[17])) : null;
      } catch (_) {}
      return {
        ticker:           r[0],
        station_id:       r[1],
        target_date:      r[2],
        target_type:      r[3],
        bin_lower:        r[4]  != null ? Number(r[4])  : null,
        bin_upper:        r[5]  != null ? Number(r[5])  : null,
        p_win:            r[6]  != null ? Number(r[6])  : null,
        contract_price:   r[7]  != null ? Number(r[7])  : null,
        ev_net:           r[8]  != null ? Number(r[8])  : null,
        ev_threshold:     r[9]  != null ? Number(r[9])  : null,
        ibe_composite:    r[10] != null ? Number(r[10]) : null,
        ibe_veto:         r[11] === 1,
        f_star:           r[12] != null ? Number(r[12]) : null,
        f_final:          r[13] != null ? Number(r[13]) : null,
        d_scale:          r[14] != null ? Number(r[14]) : null,
        gamma:            r[15] != null ? Number(r[15]) : null,
        selected:         r[16] === 1,
        gate_flags:       gateFlags,
        run_status:       r[18],
      };
    });

    return NextResponse.json({
      run: {
        run_id:    runId,
        status:    runStatus,
        started:   runStarted,
        completed: runCompleted,
        total_evaluated: Number(counts[0]) || 0,
        total_selected:  Number(counts[1]) || 0,
        total_ibe_veto:  Number(counts[2]) || 0,
        avg_p_win_selected: counts[3] != null ? Number(counts[3]) : null,
        avg_ev_selected:    counts[4] != null ? Number(counts[4]) : null,
      },
      bets,
    });
  } catch (error) {
    console.error('Oracle DB Error in /api/paper-best-bets:', error);
    return NextResponse.json({ run: null, bets: [] }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}