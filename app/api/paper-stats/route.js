import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    const [overallRes, pipelineRes, brierRes, stationRes, shadowRes] = await Promise.all([

      // Overall paper position stats
      connection.execute(
        `SELECT
           COUNT(*)                                                    AS n_total,
           SUM(CASE WHEN outcome = 1 THEN 1 ELSE 0 END)               AS n_won,
           SUM(CASE WHEN outcome = 0 THEN 1 ELSE 0 END)               AS n_lost,
           SUM(COALESCE(pnl_net, 0))                                  AS cumulative_pnl,
           SUM(CASE WHEN TRUNC(filled_at) = TRUNC(SYSDATE)
               THEN COALESCE(pnl_net, 0) ELSE 0 END)                 AS daily_pnl,
           COUNT(CASE WHEN status = 'PAPER_OPEN' THEN 1 END)          AS n_open,
           COUNT(CASE WHEN status = 'PAPER_SETTLED' THEN 1 END)       AS n_settled,
           -- days with at least one bet
           COUNT(DISTINCT CASE WHEN status = 'PAPER_SETTLED'
               THEN TRUNC(filled_at) END)                             AS trading_days
         FROM POSITIONS
         WHERE IS_PAPER = 1`
      ),

      // Last 3 runs of each type for pipeline health
      connection.execute(
        `SELECT RUN_TYPE, STATUS,
                TO_CHAR(STARTED_UTC,   'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS STARTED,
                TO_CHAR(COMPLETED_UTC, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS COMPLETED,
                STATIONS_OK, ROWS_DAILY, ROWS_HOURLY,
                SUBSTR(ERROR_MSG, 1, 200) AS ERROR_MSG
         FROM (
           SELECT pr.*,
                  ROW_NUMBER() OVER (PARTITION BY RUN_TYPE ORDER BY STARTED_UTC DESC) rn
           FROM PIPELINE_RUNS pr
           WHERE RUN_TYPE IN ('morning', 'market_open', 'night')
         ) WHERE rn = 1`
      ),

      // Brier score stats on paper bets
      connection.execute(
        `SELECT
           COUNT(bs.TICKER)         AS n_scored,
           AVG(bs.BRIER_SCORE)      AS avg_brier,
           -- naive climatological baseline for 15 bins = 1/15 ≈ 0.0667
           1 - AVG(bs.BRIER_SCORE) / NULLIF(AVG(POWER(1.0/15.0 - bs.OUTCOME, 2)), 0) AS bss,
           -- calibration: mean |predicted - actual| across decile buckets
           AVG(ABS(bs.P_WIN_AT_GRADING - bs.OUTCOME))  AS cal_raw
         FROM BRIER_SCORES bs
         JOIN POSITIONS p ON p.TICKER = bs.TICKER
         WHERE p.IS_PAPER = 1`
      ),

      // Station-level breakdown
      connection.execute(
        `SELECT
           p.STATION_ID,
           COUNT(*)                                              AS n_total,
           SUM(CASE WHEN p.OUTCOME = 1 THEN 1 ELSE 0 END)       AS n_won,
           SUM(COALESCE(p.PNL_NET, 0))                          AS pnl,
           AVG(bs.BRIER_SCORE)                                  AS avg_brier,
           AVG(ABS(p.ENTRY_PRICE - bs.P_WIN_AT_GRADING))        AS avg_edge_delta
         FROM POSITIONS p
         LEFT JOIN BRIER_SCORES bs ON bs.TICKER = p.TICKER
         WHERE p.IS_PAPER = 1 AND p.STATUS = 'PAPER_SETTLED'
         GROUP BY p.STATION_ID
         ORDER BY SUM(COALESCE(p.PNL_NET, 0)) DESC`
      ),

      // Shadow book coverage (did pricing run?)
      connection.execute(
        `SELECT COUNT(*) AS n_priced,
                COUNT(DISTINCT TARGET_DATE) AS n_dates,
                TO_CHAR(MAX(CREATED_AT), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_priced
         FROM SHADOW_BOOK`
      ),
    ]);

    // Parse overall
    const ov = overallRes.rows?.[0] || [];
    const overall = {
      n_total:      Number(ov[0]) || 0,
      n_won:        Number(ov[1]) || 0,
      n_lost:       Number(ov[2]) || 0,
      cumulative_pnl: Number(ov[3]) || 0,
      daily_pnl:    Number(ov[4]) || 0,
      n_open:       Number(ov[5]) || 0,
      n_settled:    Number(ov[6]) || 0,
      trading_days: Number(ov[7]) || 0,
    };

    // Parse pipeline
    const pipeline = {};
    for (const r of pipelineRes.rows || []) {
      pipeline[r[0]] = {
        status:     r[1],
        started:    r[2],
        completed:  r[3],
        stations_ok: Number(r[4]) || 0,
        rows_daily:  Number(r[5]) || 0,
        rows_hourly: Number(r[6]) || 0,
        error_msg:   r[7],
      };
    }

    // Parse brier
    const br = brierRes.rows?.[0] || [];
    const brier = {
      n_scored:  Number(br[0]) || 0,
      avg_brier: br[1] != null ? Number(br[1]) : null,
      bss:       br[2] != null ? Number(br[2]) : null,
      cal_raw:   br[3] != null ? Number(br[3]) : null,
    };

    // Parse stations
    const stations = (stationRes.rows || []).map(r => ({
      station_id:    r[0],
      n_total:       Number(r[1]) || 0,
      n_won:         Number(r[2]) || 0,
      pnl:           Number(r[3]) || 0,
      avg_brier:     r[4] != null ? Number(r[4]) : null,
      avg_edge_delta: r[5] != null ? Number(r[5]) : null,
    }));

    // Parse shadow book
    const sb = shadowRes.rows?.[0] || [];
    const shadow = {
      n_priced:   Number(sb[0]) || 0,
      n_dates:    Number(sb[1]) || 0,
      last_priced: sb[2],
    };

    return NextResponse.json({ overall, pipeline, brier, stations, shadow });
  } catch (error) {
    console.error('Oracle DB Error in /api/paper-stats:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}