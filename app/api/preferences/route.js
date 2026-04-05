import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

function getUsername(request) {
  const cookie = request.cookies.get('kalshicast-auth');
  return cookie?.value || null;
}

export async function GET(request) {
  const username = getUsername(request);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let connection;
  try {
    connection = await getDbConnection();
    const result = await connection.execute(
      `SELECT PREFERENCES_JSON FROM USER_PREFERENCES WHERE USERNAME = :uname`,
      { uname: username }
    );

    if (result.rows && result.rows.length > 0) {
      const raw = result.rows[0][0];
      const prefs = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(String(raw));
      return NextResponse.json({ preferences: prefs });
    }

    return NextResponse.json({ preferences: null });
  } catch (error) {
    console.error('Oracle DB Error in /api/preferences GET:', error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}

export async function PUT(request) {
  const username = getUsername(request);
  if (!username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let connection;
  try {
    const { preferences } = await request.json();
    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json({ error: 'Invalid preferences payload' }, { status: 400 });
    }

    const prefsJson = JSON.stringify(preferences);
    connection = await getDbConnection();
    await connection.execute(
      `MERGE INTO USER_PREFERENCES tgt USING DUAL
       ON (tgt.USERNAME = :uname)
       WHEN MATCHED THEN UPDATE SET
         PREFERENCES_JSON = :prefs,
         UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (USERNAME, PREFERENCES_JSON)
         VALUES (:uname, :prefs)`,
      { uname: username, prefs: prefsJson }
    );
    await connection.commit();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Oracle DB Error in /api/preferences PUT:', error);
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}
