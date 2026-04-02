import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { ticker } = await params;
  if (!ticker) return NextResponse.json(null, { status: 400 });

  let connection;
  try {
    connection = await getDbConnection();

    // Fetch the anchor row for this ticker
    const anchor = await connection.execute(
      `SELECT STATION_ID, TARGET_DATE, TARGET_TYPE,
              MU, SIGMA_EFF, G1_S, ALPHA_S, XI_S, OMEGA_S,
              METAR_TRUNCATED, T_OBS_MAX, TOP_MODEL_ID
       FROM SHADOW_BOOK WHERE TICKER = :ticker`,
      { ticker }
    );

    if (!anchor.rows?.length) {
      return NextResponse.json(null, { status: 404 });
    }

    const [sid, td, tt, mu, sigma, g1, alpha, xi, omega, trunc, tobs, topModel] = anchor.rows[0];

    // Fetch all bins for the same station/date/type
    const binsResult = await connection.execute(
      `SELECT TICKER, BIN_LOWER, BIN_UPPER, P_WIN, METAR_TRUNCATED
       FROM SHADOW_BOOK
       WHERE STATION_ID  = :sid
         AND TARGET_DATE = :td
         AND TARGET_TYPE = :tt
       ORDER BY COALESCE(BIN_LOWER, -9999) ASC`,
      { sid, td, tt }
    );

    const bins = (binsResult.rows || []).map(r => {
      const bl = r[1] != null ? Number(r[1]) : null;
      const bu = r[2] != null ? Number(r[2]) : null;
      return {
        ticker:           r[0],
        bin_lower:        bl != null && bl <= -999 ? null : bl,
        bin_upper:        bu != null && bu >= 999  ? null : bu,
        p_win:            Number(r[3]) || 0,
        metar_truncated:  r[4] === 1,
        is_active:        r[0] === ticker,
      };
    });

    return NextResponse.json({
      ticker,
      station_id:      sid,
      target_type:     tt,
      mu:              mu  != null ? Number(mu)    : null,
      sigma_eff:       sigma != null ? Number(sigma) : null,
      g1_s:            g1  != null ? Number(g1)   : 0,
      alpha_s:         alpha != null ? Number(alpha) : 0,
      xi_s:            xi  != null ? Number(xi)   : null,
      omega_s:         omega != null ? Number(omega) : null,
      metar_truncated: trunc === 1,
      t_obs_max:       tobs != null ? Number(tobs) : null,
      top_model_id:    topModel,
      bins,
    });
  } catch (error) {
    console.error('Shadow book error:', error);
    return NextResponse.json(null, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}