import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT PARAM_KEY, PARAM_VALUE, DTYPE, DESCRIPTION,
              TO_CHAR(LAST_CHANGED_AT, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS LAST_CHANGED_AT,
              CHANGED_BY
       FROM PARAMS
       ORDER BY PARAM_KEY ASC`
    );

    const params = (result.rows || []).map(r => ({
      key:            r[0],
      value:          r[1],
      dtype:          r[2],
      description:    r[3],
      last_changed_at: r[4],
      changed_by:     r[5],
    }));

    return NextResponse.json(params);
  } catch (error) {
    console.error('Oracle DB Error in GET /api/params:', error);
    return NextResponse.json([], { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}

export async function PUT(request) {
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!Array.isArray(body) || body.length === 0) {
    return NextResponse.json({ error: 'Expected array of {key, value} objects' }, { status: 400 });
  }

  let connection;
  try {
    connection = await getDbConnection();

    for (const { key, value } of body) {
      if (!key) continue;
      await connection.execute(
        `MERGE INTO PARAMS tgt USING DUAL ON (tgt.PARAM_KEY = :key)
         WHEN MATCHED THEN UPDATE SET
           PARAM_VALUE     = :val,
           LAST_CHANGED_AT = SYSTIMESTAMP,
           CHANGED_BY      = 'web_dashboard',
           CHANGE_REASON   = 'Manual edit via dashboard'
         WHEN NOT MATCHED THEN INSERT (PARAM_KEY, PARAM_VALUE, CHANGED_BY, LAST_CHANGED_AT)
           VALUES (:key, :val, 'web_dashboard', SYSTIMESTAMP)`,
        { key, val: String(value) }
      );
    }

    await connection.commit();
    return NextResponse.json({ success: true, updated: body.length });
  } catch (error) {
    console.error('Oracle DB Error in PUT /api/params:', error);
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}