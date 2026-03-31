import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let kalshiBalance = null;
  let kalshiError = null;

  // 1. Hit Kalshi for real-time balance
  try {
    const res = await fetch(
      'https://trading-api.kalshi.com/trade-api/rest/v2/portfolio/balance',
      {
        headers: {
          'Authorization': `Bearer ${process.env.KALSHI_API_TOKEN}`,
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (res.ok) {
      const body = await res.json();
      kalshiBalance = (body.balance ?? 0) / 100;
    } else {
      kalshiError = `Kalshi API ${res.status}`;
    }
  } catch (e) {
    kalshiError = e.message;
  }

  // 2. Read DB balance as fallback + open positions tracking
  let connection;
  let dbBalance = null;
  let openPositionsValue = 0;

  try {
    connection = await getDbConnection();
    
    // CORRECTED SQL: Uses STATUS and OUTCOME to find unsettled positions
    const [metricsResult, posResult] = await Promise.all([
      connection.execute(
        `SELECT bankroll, portfolio_value 
         FROM financial_metrics 
         ORDER BY metric_date DESC 
         FETCH FIRST 1 ROWS ONLY`
      ),
      connection.execute(
        `SELECT SUM(contracts * entry_price * 100) AS open_notional 
         FROM positions 
         WHERE status IN ('OPEN', 'FILLED') AND outcome IS NULL`
      ),
    ]);

    if (metricsResult.rows?.length) {
      dbBalance = parseFloat(metricsResult.rows[0][0]) || 0;
    }
    openPositionsValue = parseFloat(posResult.rows?.[0]?.[0]) || 0;

    // 3. Write back to DB (Upsert)
    // CORRECTED SQL: Uses COMPUTED_AT instead of last_updated
    if (kalshiBalance !== null) {
      await connection.execute(
        `MERGE INTO financial_metrics tgt USING DUAL 
         ON (tgt.metric_date = TRUNC(SYSDATE)) 
         WHEN MATCHED THEN UPDATE SET 
           bankroll = :bal, 
           portfolio_value = :pv, 
           computed_at = SYSTIMESTAMP 
         WHEN NOT MATCHED THEN INSERT 
           (metric_date, bankroll, portfolio_value) 
         VALUES (TRUNC(SYSDATE), :bal, :pv)`,
        {
          bal: kalshiBalance,
          pv: kalshiBalance + openPositionsValue,
        }
      );
      await connection.commit();
    }
  } catch (dbErr) {
    console.error('DB error in /api/kalshi/balance:', dbErr);
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }

  return NextResponse.json({
    balance: kalshiBalance ?? dbBalance ?? 0,
    source: kalshiBalance !== null ? 'kalshi_live' : 'db_cached',
    open_positions_notional: openPositionsValue,
    portfolio_value: (kalshiBalance ?? dbBalance ?? 0) + openPositionsValue,
    kalshi_error: kalshiError,
    fetched_at: new Date().toISOString(),
  });
}