import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';

export async function POST(req) {
  let connection;
  try {
    const body = await req.json();
    const { halted, password } = body;

    // Define your password in .env.local as HALT_PASSWORD
    const validPassword = process.env.HALT_PASSWORD; 

    if (password !== validPassword) {
      return NextResponse.json({ error: 'Unauthorized: Incorrect password' }, { status: 401 });
    }

    connection = await getDbConnection();
    const haltedStr = halted ? 'true' : 'false';
    
    // Upsert the system.trading_halted parameter into the PARAMS table
    await connection.execute(`
      MERGE INTO params tgt USING DUAL
      ON (tgt.param_key = 'system.trading_halted')
      WHEN MATCHED THEN UPDATE SET 
        param_value = :val, 
        last_changed_at = SYSTIMESTAMP,
        changed_by = 'web_dashboard',
        change_reason = 'Manual toggle via dashboard'
      WHEN NOT MATCHED THEN INSERT (
        param_key, param_value, dtype, description
      ) VALUES (
        'system.trading_halted', :val, 'bool', 'Master switch to halt all trading execution'
      )
    `, { val: haltedStr });
    
    await connection.commit();
    return NextResponse.json({ success: true, halted });
    
  } catch (error) {
    console.error('Halt API error:', error);
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.close(); } catch (e) { console.error(e); }
    }
  }
}