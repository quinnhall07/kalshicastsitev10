import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { ticker } = await params;
  if (!ticker) return NextResponse.json(null, { status: 400 });

  let connection;
  try {
    connection = await getDbConnection();

    // L3: Shadow book pricing params
    const sbRes = await connection.execute(
      `SELECT STATION_ID, TARGET_DATE, TARGET_TYPE,
              MU, SIGMA_EFF, G1_S, ALPHA_S, XI_S, OMEGA_S,
              P_WIN, METAR_TRUNCATED, T_OBS_MAX, TOP_MODEL_ID,
              PIPELINE_RUN_ID
       FROM SHADOW_BOOK WHERE TICKER = :ticker`,
      { ticker }
    );

    if (!sbRes.rows?.length) {
      return NextResponse.json(null, { status: 404 });
    }

    const sb = sbRes.rows[0];
    const sid      = sb[0];
    const td       = sb[1];
    const tt       = sb[2];
    const runId    = sb[13];

    // L2: Ensemble state for same station/date/type from the same run
    const ensRes = await connection.execute(
      `SELECT F_TK_TOP, TOP_MODEL_ID, F_BAR_TK, S_TK, S_WEIGHTED_TK,
              SIGMA_EFF, M_K, WEIGHT_JSON, STALE_MODEL_IDS
       FROM ENSEMBLE_STATE
       WHERE RUN_ID      = :run_id
         AND STATION_ID  = :sid
         AND TARGET_DATE = :td
         AND TARGET_TYPE = :tt`,
      { run_id: runId, sid, td, tt }
    );

    // Kalman state
    const ksRes = await connection.execute(
      `SELECT B_K, U_K, Q_BASE, STATE_VERSION, TOP_MODEL_ID, LAST_OBSERVATION_DATE
       FROM KALMAN_STATES
       WHERE STATION_ID = :sid AND TARGET_TYPE = :tt`,
      { sid, tt }
    );

    // L4: Best bet execution data
    const bbRes = await connection.execute(
      `SELECT P_WIN, CONTRACT_PRICE, EV_NET, F_STAR, F_OP, F_FINAL,
              IBE_COMPOSITE, IBE_VETO, D_SCALE, GAMMA_CONVERGENCE,
              ORDER_TYPE, IS_SELECTED_FOR_EXECUTION, ALL_GATE_FLAGS_JSON
       FROM BEST_BETS WHERE TICKER = :ticker`,
      { ticker }
    );

    // BSS for the relevant lead bracket (default h3)
    const bssRes = await connection.execute(
      `SELECT BSS_1, IS_QUALIFIED, N_OBSERVATIONS, BS_MODEL, BS_BASELINE_1
       FROM BSS_MATRIX
       WHERE STATION_ID = :sid AND TARGET_TYPE = :tt AND LEAD_BRACKET = 'h3'`,
      { sid, tt }
    );

    // Assemble L2
    const ens = ensRes.rows?.[0] || [];
    const ks  = ksRes.rows?.[0]  || [];
    let weightJson = null;
    try { weightJson = ens[7] ? JSON.parse(String(ens[7])) : null; } catch (_) {}

    const l2 = {
      top_model_id:   ens[1] || ks[4] || null,
      m_k:            ens[6] != null ? Number(ens[6]) : null,
      f_tk_top:       ens[0] != null ? Number(ens[0]) : null,
      f_bar_tk:       ens[2] != null ? Number(ens[2]) : null,
      s_tk:           ens[3] != null ? Number(ens[3]) : null,
      s_weighted_tk:  ens[4] != null ? Number(ens[4]) : null,
      sigma_eff:      ens[5] != null ? Number(ens[5]) : (sb[4] != null ? Number(sb[4]) : null),
      b_k:            ks[0]  != null ? Number(ks[0])  : 0,
      u_k:            ks[1]  != null ? Number(ks[1])  : 4,
      weight_json:    weightJson,
      stale_model_ids: ens[8] || null,
    };

    // Assemble L3
    const l3 = {
      mu:              sb[3]  != null ? Number(sb[3])  : null,
      sigma_eff:       sb[4]  != null ? Number(sb[4])  : null,
      g1_s:            sb[5]  != null ? Number(sb[5])  : 0,
      alpha_s:         sb[6]  != null ? Number(sb[6])  : 0,
      xi_s:            sb[7]  != null ? Number(sb[7])  : null,
      omega_s:         sb[8]  != null ? Number(sb[8])  : null,
      p_win:           sb[9]  != null ? Number(sb[9])  : null,
      metar_truncated: sb[10] === 1,
      t_obs_max:       sb[11] != null ? Number(sb[11]) : null,
    };

    // Assemble L4
    let gateFlags = null;
    const bb = bbRes.rows?.[0] || [];
    if (bb[12]) {
      try { gateFlags = JSON.parse(typeof bb[12] === 'string' ? bb[12] : String(bb[12])); } catch (_) {}
    }
    const l4 = {
      p_win:              bb[0]  != null ? Number(bb[0])  : null,
      contract_price:     bb[1]  != null ? Number(bb[1])  : null,
      ev_net:             bb[2]  != null ? Number(bb[2])  : null,
      f_star:             bb[3]  != null ? Number(bb[3])  : 0,
      f_op:               bb[4]  != null ? Number(bb[4])  : 0,
      f_final:            bb[5]  != null ? Number(bb[5])  : 0,
      ibe_composite:      bb[6]  != null ? Number(bb[6])  : null,
      ibe_veto:           bb[7]  === 1,
      d_scale:            bb[8]  != null ? Number(bb[8])  : 1,
      gamma_convergence:  bb[9]  != null ? Number(bb[9])  : 1,
      order_type:         bb[10],
      selected:           bb[11] === 1,
      gate_flags:         gateFlags,
    };

    // BSS
    const bssRow = bssRes.rows?.[0] || [];
    const bss    = bssRow[0] != null ? Number(bssRow[0]) : null;

    return NextResponse.json({
      ticker,
      station_id:  sid,
      target_type: tt,
      l2_ensemble: l2,
      l3_pricing:  l3,
      l4_execution: l4,
      bss,
      phi: bss != null ? Math.max(0.1, Math.min(1.0, bss / 0.25)) : null,
    });
  } catch (error) {
    console.error('Decision audit error:', error);
    return NextResponse.json(null, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}