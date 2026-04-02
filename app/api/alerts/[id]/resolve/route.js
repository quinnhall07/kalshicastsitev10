import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../../../lib/db';

export async function PATCH(request, { params }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing alert ID' }, { status: 400 });

  let connection;
  try {
    connection = await getDbConnection();
    await connection.execute(
      `UPDATE SYSTEM_ALERTS
       SET IS_RESOLVED  = 1,
           RESOLVED_TS  = SYSTIMESTAMP,
           RESOLVED_BY  = 'web_dashboard'
       WHERE ALERT_ID = :id`,
      { id }
    );
    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Alert resolve error:', error);
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}