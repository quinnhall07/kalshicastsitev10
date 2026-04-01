import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // 1. Fetch financial metrics
    const result = await connection.execute(
      `SELECT bankroll, portfolio_value, daily_pnl, cumulative_pnl, 
              mdd_alltime, mdd_rolling_90, cal, 
              n_bets_total, n_bets_won, n_bets_lost,
              sr_dollar, sr_simple, sharpe_rolling_30, fdr, eur, market_cal
       FROM financial_metrics 
       ORDER BY metric_date DESC 
       FETCH FIRST 1 ROWS ONLY`
    );
    
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
      // Determine if Oracle returned an Object or Array
      const isObj = typeof row === 'object' && !Array.isArray(row);
      
      systemData = {
        ...systemData,
        bankroll: isObj ? row.BANKROLL : row[0] || 0,
        portfolio_value: isObj ? row.PORTFOLIO_VALUE : row[1] || 0,
        daily_pnl: isObj ? row.DAILY_PNL : row[2] || 0,
        cumulative_pnl: isObj ? row.CUMULATIVE_PNL : row[3] || 0,
        mdd_alltime: isObj ? row.MDD_ALLTIME : row[4] || 0,
        mdd_rolling_90: isObj ? row.MDD_ROLLING_90 : row[5] || 0,
        cal: isObj ? row.CAL : row[6] || 0,
        n_bets_total: isObj ? row.N_BETS_TOTAL : row[7] || 0,
        n_bets_won: isObj ? row.N_BETS_WON : row[8] || 0,
        n_bets_lost: isObj ? row.N_BETS_LOST : row[9] || 0,
        sr_dollar: isObj ? row.SR_DOLLAR : row[10] || 0,
        sr_simple: isObj ? row.SR_SIMPLE : row[11] || 0,
        sharpe_rolling_30: isObj ? row.SHARPE_ROLLING_30 : row[12] || 0,
        fdr: isObj ? row.FDR : row[13] || 0,
        eur: isObj ? row.EUR : row[14] || 0,
        market_cal: isObj ? row.MARKET_CAL : row[15] || 0,
      };
    }

    // 2. Fetch Halt Status SAFELY
    const paramResult = await connection.execute(
      `SELECT param_value FROM params WHERE param_key = 'system.trading_halted'`
    );
    
    if (paramResult.rows && paramResult.rows.length > 0) {
      const pRow = paramResult.rows[0];
      // Safely extract the boolean whether it's an object or array
      const val = (typeof pRow === 'object' && !Array.isArray(pRow)) ? pRow.PARAM_VALUE : pRow[0];
      systemData.trading_halted = (val === 'true');
    }

    return NextResponse.json(systemData);
  } catch (error) {
    console.error("Oracle DB Error in /api/system:", error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}