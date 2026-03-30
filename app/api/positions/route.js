import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    
    // Query your real POSITIONS table
    const result = await connection.execute(
      `SELECT target_date, station_id, target_type, contracts, entry_price 
       FROM positions 
       WHERE status = 'OPEN' 
       ORDER BY target_date ASC`
    );
    
    // Map the rows into an array of objects for the frontend
    const positions = result.rows.map(row => ({
      target_date: row[0],
      station_id: row[1],
      target_type: row[2],
      contracts: row[3],
      entry_price: row[4]
    }));

    return NextResponse.json(positions);
  } catch (error) {
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}