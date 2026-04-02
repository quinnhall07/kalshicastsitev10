import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    // Run all queries in parallel
    const [metricsResult, livePosResult, paperPosResult, paramResult] =
      await Promise.all([

        // 1. financial_metrics — populated by night pipeline
        connection.execute(
          `SELECT bankroll, portfolio_value, daily_pnl, cumulative_pnl,
                  mdd_alltime, mdd_rolling_90, cal,
                  n_bets_total, n_bets_won, n_bets_lost,
                  sr_dollar, sr_simple, sharpe_rolling_30, fdr, eur, market_cal
           FROM financial_metrics
           ORDER BY metric_date DESC
           FETCH FIRST 1 ROWS ONLY`
        ),

        // 2. Live position stats (settled real bets)
        connection.execute(
          `SELECT
             COUNT(*)                                                      AS n_total,
             SUM(CASE WHEN outcome = 1 THEN 1 ELSE 0 END)                 AS n_won,
             SUM(CASE WHEN outcome = 0 THEN 1 ELSE 0 END)                 AS n_lost,
             SUM(COALESCE(pnl_net, 0))                                    AS cumulative_pnl,
             SUM(CASE
                   WHEN TRUNC(filled_at) = TRUNC(SYSDATE)
                   THEN COALESCE(pnl_net, 0) ELSE 0
                 END)                                                      AS daily_pnl
           FROM positions
           WHERE status = 'SETTLED' AND (is_paper = 0 OR is_paper IS NULL)`
        ),

        // 3. Paper position stats
        connection.execute(
          `SELECT
             COUNT(*)                                                      AS n_total,
             SUM(CASE WHEN outcome = 1 THEN 1 ELSE 0 END)                 AS n_won,
             SUM(CASE WHEN outcome = 0 THEN 1 ELSE 0 END)                 AS n_lost,
             SUM(COALESCE(pnl_net, 0))                                    AS cumulative_pnl,
             SUM(CASE
                   WHEN TRUNC(filled_at) = TRUNC(SYSDATE)
                   THEN COALESCE(pnl_net, 0) ELSE 0
                 END)                                                      AS daily_pnl,
             COUNT(CASE WHEN status = 'PAPER_OPEN' THEN 1 END)            AS n_open
           FROM positions
           WHERE is_paper = 1
             AND status IN ('PAPER_OPEN', 'PAPER_SETTLED')`
        ),

        // 4. System state flags
        connection.execute(
          `SELECT param_key, param_value FROM params
           WHERE param_key IN (
             'system.trading_halted',
             'system.trading_offline',
             'system.offline_reason'
           )`
        ),
      ]);

    // ── Helper: safely read array or object row ────────────────────
    const g = (row, key, idx) =>
      row && !Array.isArray(row) ? row[key] : (row ? row[idx] : null);

    // ── Base defaults ──────────────────────────────────────────────
    let systemData = {
      trading_halted: false,
      trading_offline: false,
      offline_reason: 'Algorithmic Stop',
      db_connected: true,
      last_checked: new Date().toISOString(),
      // live metrics
      bankroll: 0, portfolio_value: 0,
      daily_pnl: 0, cumulative_pnl: 0,
      mdd_alltime: 0, mdd_rolling_90: 0, cal: 0,
      n_bets_total: 0, n_bets_won: 0, n_bets_lost: 0,
      sr_dollar: 0, sr_simple: 0, sharpe_rolling_30: 0,
      fdr: 0, eur: 0, market_cal: 0,
      // paper metrics (separate so UI can display both)
      paper_n_total: 0, paper_n_won: 0, paper_n_lost: 0,
      paper_cumulative_pnl: 0, paper_daily_pnl: 0, paper_n_open: 0,
    };

    // ── Apply financial_metrics ────────────────────────────────────
    if (metricsResult.rows?.length) {
      const r = metricsResult.rows[0];
      systemData = {
        ...systemData,
        bankroll:          Number(g(r,'BANKROLL',0))          || 0,
        portfolio_value:   Number(g(r,'PORTFOLIO_VALUE',1))   || 0,
        daily_pnl:         Number(g(r,'DAILY_PNL',2))         || 0,
        cumulative_pnl:    Number(g(r,'CUMULATIVE_PNL',3))    || 0,
        mdd_alltime:       Number(g(r,'MDD_ALLTIME',4))       || 0,
        mdd_rolling_90:    Number(g(r,'MDD_ROLLING_90',5))    || 0,
        cal:               Number(g(r,'CAL',6))               || 0,
        n_bets_total:      Number(g(r,'N_BETS_TOTAL',7))      || 0,
        n_bets_won:        Number(g(r,'N_BETS_WON',8))        || 0,
        n_bets_lost:       Number(g(r,'N_BETS_LOST',9))       || 0,
        sr_dollar:         Number(g(r,'SR_DOLLAR',10))        || 0,
        sr_simple:         Number(g(r,'SR_SIMPLE',11))        || 0,
        sharpe_rolling_30: Number(g(r,'SHARPE_ROLLING_30',12))|| 0,
        fdr:               Number(g(r,'FDR',13))              || 0,
        eur:               Number(g(r,'EUR',14))              || 0,
        market_cal:        Number(g(r,'MARKET_CAL',15))       || 0,
      };
    }

    // ── Override live P&L / counts from POSITIONS when fresher ────
    if (livePosResult.rows?.length) {
      const r = livePosResult.rows[0];
      const liveTotal  = Number(g(r,'N_TOTAL',0))        || 0;
      const liveWon    = Number(g(r,'N_WON',1))          || 0;
      const liveLost   = Number(g(r,'N_LOST',2))         || 0;
      const liveCumPnl = Number(g(r,'CUMULATIVE_PNL',3)) || 0;
      const liveDayPnl = Number(g(r,'DAILY_PNL',4))      || 0;

      if (liveTotal > systemData.n_bets_total) {
        systemData.n_bets_total = liveTotal;
        systemData.n_bets_won   = liveWon;
        systemData.n_bets_lost  = liveLost;
      }
      if (liveTotal > 0) {
        systemData.cumulative_pnl = liveCumPnl;
        systemData.daily_pnl      = liveDayPnl;
      }
    }

    // ── Paper stats ────────────────────────────────────────────────
    if (paperPosResult.rows?.length) {
      const r = paperPosResult.rows[0];
      systemData.paper_n_total        = Number(g(r,'N_TOTAL',0))        || 0;
      systemData.paper_n_won          = Number(g(r,'N_WON',1))          || 0;
      systemData.paper_n_lost         = Number(g(r,'N_LOST',2))         || 0;
      systemData.paper_cumulative_pnl = Number(g(r,'CUMULATIVE_PNL',3)) || 0;
      systemData.paper_daily_pnl      = Number(g(r,'DAILY_PNL',4))      || 0;
      systemData.paper_n_open         = Number(g(r,'N_OPEN',5))         || 0;
    }

    // ── System flags ───────────────────────────────────────────────
    if (paramResult.rows?.length) {
      for (const pRow of paramResult.rows) {
        const key = g(pRow,'PARAM_KEY',0);
        const val = g(pRow,'PARAM_VALUE',1);
        if (key === 'system.trading_halted')  systemData.trading_halted  = (val === 'true');
        if (key === 'system.trading_offline') systemData.trading_offline = (val === 'true');
        if (key === 'system.offline_reason')  systemData.offline_reason  = val;
      }
    }

    return NextResponse.json(systemData);
  } catch (error) {
    console.error('Oracle DB Error in /api/system:', error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}