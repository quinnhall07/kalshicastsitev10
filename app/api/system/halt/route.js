import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../lib/db';

export async function POST(req) {
  let connection;
  try {
    const body = await req.json();
    const { halted, password } = body;

    const validPassword = process.env.HALT_PASSWORD || 'admin123'; 
    if (password !== validPassword) {
      return NextResponse.json({ error: 'Unauthorized: Incorrect password' }, { status: 401 });
    }

    connection = await getDbConnection();
    const haltedStr = halted ? 'true' : 'false';
    
    // Bulletproof PL/SQL Upsert
    await connection.execute(`
      DECLARE
        v_count NUMBER;
      BEGIN
        SELECT COUNT(*) INTO v_count FROM params WHERE param_key = 'system.trading_halted';
        IF v_count > 0 THEN
          UPDATE params SET 
            param_value = :val, 
            last_changed_at = SYSTIMESTAMP,
            changed_by = 'web_dashboard',
            change_reason = 'Manual toggle via dashboard'
          WHERE param_key = 'system.trading_halted';
        ELSE
          INSERT INTO params (param_key, param_value, dtype, description)
          VALUES ('system.trading_halted', :val, 'bool', 'Master switch to halt all trading execution');
        END IF;
      END;
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