import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT param_key, param_value, dtype, description 
       FROM params 
       ORDER BY param_key ASC`
    );
    
    const params = result.rows.map(row => ({
      key: row[0],
      value: row[1],
      dtype: row[2],
      description: row[3]
    }));

    return NextResponse.json(params);
  } catch (error) {
    console.error("Oracle DB Error:", error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (e) {}
  }
}