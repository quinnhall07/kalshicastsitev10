import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { ticker } = await params;
  if (!ticker) return NextResponse.json(null, { status: 400 });

  let connection;
  try {
    connection = await getDbConnection();

    const result = await connection.execute(
      `SELECT
         KCV_NORM, KCV_MOD,
         MPDS_K,   MPDS_MOD,
         HMAS,     HMAS_MOD,
         FCT,      FCT_MOD,
         SCAS,     SCAS_MOD,
         COMPOSITE,
         VETO_TRIGGERED,
         VETO_REASON,
         TO_CHAR(RECORDED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS RECORDED_AT,
         PIPELINE_RUN_ID
       FROM IBE_SIGNAL_LOG
       WHERE TICKER = :ticker
       ORDER BY RECORDED_AT DESC
       FETCH FIRST 1 ROWS ONLY`,
      { ticker }
    );

    if (!result.rows?.length) {
      return NextResponse.json(null, { status: 404 });
    }

    const r = result.rows[0];
    return NextResponse.json({
      kcv_norm:        r[0]  != null ? Number(r[0])  : null,
      kcv_mod:         r[1]  != null ? Number(r[1])  : null,
      mpds_k:          r[2]  != null ? Number(r[2])  : null,
      mpds_mod:        r[3]  != null ? Number(r[3])  : null,
      hmas:            r[4]  != null ? Number(r[4])  : null,
      hmas_mod:        r[5]  != null ? Number(r[5])  : null,
      fct:             r[6]  != null ? Number(r[6])  : null,
      fct_mod:         r[7]  != null ? Number(r[7])  : null,
      scas:            r[8]  != null ? Number(r[8])  : null,
      scas_mod:        r[9]  != null ? Number(r[9])  : null,
      composite:       r[10] != null ? Number(r[10]) : null,
      veto_triggered:  r[11] === 1,
      veto_reason:     r[12],
      recorded_at:     r[13],
      pipeline_run_id: r[14],
    });
  } catch (error) {
    console.error('IBE signals error:', error);
    return NextResponse.json(null, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}