import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  let kalshiBalance = null;
  let kalshiError = null;

  // 1. Hit Kalshi for real-time balance using V2 ECDSA/RSA Auth
  try {
    const keyId = process.env.KALSHI_KEY_ID;
    let privateKey = process.env.KALSHI_PRIVATE_KEY;

    if (!keyId || !privateKey) {
      throw new Error("Missing KALSHI_KEY_ID or KALSHI_PRIVATE_KEY in environment variables.");
    }

    // Format the private key to handle escaped newlines if passed as a single line in .env
    privateKey = privateKey.replace(/\\n/g, '\n');

    const timestamp = Date.now().toString();
    const method = 'GET';
    const path = '/trade-api/v2/portfolio/balance';

    // Kalshi requires signing the concatenated string of: timestamp + method + path
    const msgString = timestamp + method + path;

    const sign = crypto.createSign('SHA256');
    sign.update(msgString);
    sign.end();
    
    // Generate base64 signature
    const signature = sign.sign(privateKey, 'base64');

    const res = await fetch(
      https://api.elections.kalshi.com${path}`,
      {
        headers: {
          'KALSHI-ACCESS-KEY': keyId,
          'KALSHI-ACCESS-SIGNATURE': signature,
          'KALSHI-ACCESS-TIMESTAMP': timestamp,
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }
    );

    if (res.ok) {
      const body = await res.json();
      kalshiBalance = (body.balance ?? 0) / 100;
    } else {
      const errorText = await res.text();
      kalshiError = `Kalshi API ${res.status}: ${errorText}`;
      console.error(kalshiError);
    }
  } catch (e) {
    kalshiError = e.message;
    console.error('Kalshi Auth/Fetch Error:', e);
  }

  // 2. Read DB balance as fallback + open positions tracking
  let connection;
  let dbBalance = null;
  let openPositionsValue = 0;

  try {
    connection = await getDbConnection();
    
    // Uses STATUS and OUTCOME to find unsettled positions
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
    // Uses COMPUTED_AT instead of last_updated
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