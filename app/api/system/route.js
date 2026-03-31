import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // Add the new metrics to the SELECT statement
    const result = await connection.execute(
      `SELECT bankroll, portfolio_value, daily_pnl, cumulative_pnl, 
              mdd_alltime, mdd_rolling_90, cal, 
              n_bets_total, n_bets_won, n_bets_lost,
              sr_dollar, sr_simple, sharpe_rolling_30, fdr, eur, market_cal
       FROM financial_metrics 
       ORDER BY metric_date DESC 
       FETCH FIRST 1 ROWS ONLY`
    );
    
    // Default fallback state with new metrics included
    let systemData = {
      trading_halted: false, 
      db_connected: true, 
      last_checked: new Date().toISOString(),
      bankroll: 0, portfolio_value: 0, daily_pnl: 0, cumulative_pnl: 0,
      mdd_alltime: 0, mdd_rolling_90: 0, cal: 0, 
      n_bets_total: 0, n_bets_won: 0, n_bets_lost: 0,
      sr_dollar: 0, sr_simple: 0, sharpe_rolling_30: 0, fdr: 0, eur: 0, market_cal: 0
    };

    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      systemData = {
        ...systemData,
        bankroll: row[0] || 0,
        portfolio_value: row[1] || 0,
        daily_pnl: row[2] || 0,
        cumulative_pnl: row[3] || 0,
        mdd_alltime: row[4] || 0,
        mdd_rolling_90: row[5] || 0,
        cal: row[6] || 0,
        n_bets_total: row[7] || 0,
        n_bets_won: row[8] || 0,
        n_bets_lost: row[9] || 0,
        // Map the new fields based on index
        sr_dollar: row[10] || 0,
        sr_simple: row[11] || 0,
        sharpe_rolling_30: row[12] || 0,
        fdr: row[13] || 0,
        eur: row[14] || 0,
        market_cal: row[15] || 0,
      };
    }

    return NextResponse.json(systemData);
  } catch (error) {
    console.error("Oracle DB Error:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}