import { NextResponse } from 'next/server';
import crypto from 'crypto';
 
export const dynamic = 'force-dynamic';
 
export async function GET() {
  try {
    const keyId = process.env.KALSHI_KEY_ID;
    let privateKey = process.env.KALSHI_PRIVATE_KEY;
 
    if (!keyId || !privateKey) {
      return NextResponse.json(
        { error: 'Kalshi API credentials not configured', positions: [] },
        { status: 200 }
      );
    }
 
    privateKey = privateKey.replace(/\\n/g, '\n');
 
    const timestamp = Date.now().toString();
    const method = 'GET';
    const path = '/trade-api/v2/portfolio/positions';
    const query = '?limit=200';
 
    // Kalshi signs: timestamp + method + path (no query string in signature)
    const msgString = timestamp + method + path;
 
    const signature = crypto.sign('sha256', Buffer.from(msgString), {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    }).toString('base64');
 
    const res = await fetch(
      `https://api.elections.kalshi.com${path}${query}`,
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
 
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Kalshi positions API ${res.status}: ${errorText}`);
      return NextResponse.json(
        { error: `Kalshi API ${res.status}`, positions: [] },
        { status: 200 }
      );
    }
 
    const body = await res.json();
    const positions = (body.market_positions || []).map(p => ({
      ticker: p.ticker,
      market_id: p.market_id,
      position: p.position,             // number of contracts
      market_exposure: p.market_exposure, // cents at risk
      resting_orders_count: p.resting_orders_count,
      total_traded: p.total_traded,
      realized_pnl: p.realized_pnl != null ? p.realized_pnl / 100 : null, // convert cents to dollars
      fees_paid: p.fees_paid != null ? p.fees_paid / 100 : null,
    })).filter(p => p.position !== 0); // Only return positions with non-zero contracts
 
    return NextResponse.json({
      positions,
      count: positions.length,
      source: 'kalshi_live',
      fetched_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Kalshi positions fetch error:', e);
    return NextResponse.json(
      { error: e.message, positions: [] },
      { status: 200 }
    );
  }
}