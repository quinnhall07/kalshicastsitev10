import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();

    const result = await connection.execute(
      `SELECT ALERT_ID, ALERT_TYPE, SEVERITY_SCORE, ALERT_TS,
              STATION_ID, SOURCE_ID, IS_RESOLVED, DETAILS_JSON,
              RESOLVED_TS, RESOLVED_BY
       FROM SYSTEM_ALERTS
       ORDER BY IS_RESOLVED ASC, ALERT_TS DESC
       FETCH FIRST 200 ROWS ONLY`
    );

    const alerts = (result.rows || []).map(row => {
      let detail = 'No details provided.';
      if (row[7]) {
        try {
          detail = typeof row[7] === 'object' ? JSON.stringify(row[7]) : String(row[7]);
        } catch (_) { detail = String(row[7]); }
      }
      return {
        id: row[0],
        type: row[1],
        severity: row[2] || 0,
        ts: row[3] ? new Date(row[3]).toISOString() : null,
        station: row[4],
        source: row[5],
        resolved: row[6] === 1,
        detail,
        resolved_ts: row[8] ? new Date(row[8]).toISOString() : null,
        resolved_by: row[9],
      };
    });

    const summary = {
      total: alerts.length,
      unresolved: alerts.filter(a => !a.resolved).length,
      critical: alerts.filter(a => !a.resolved && a.severity >= 0.8).length,
      warning: alerts.filter(a => !a.resolved && a.severity >= 0.5 && a.severity < 0.8).length,
      info: alerts.filter(a => !a.resolved && a.severity < 0.5).length,
    };

    return NextResponse.json({ alerts, summary });
  } catch (error) {
    console.error('Oracle DB Error in /api/alerts:', error);
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}

export async function PATCH(request) {
  let connection;
  try {
    const { alertId, resolved } = await request.json();
    if (!alertId) {
      return NextResponse.json({ error: 'alertId required' }, { status: 400 });
    }

    const cookie = request.cookies.get('kalshicast-auth');
    const username = cookie?.value || 'unknown';

    connection = await getDbConnection();

    if (resolved) {
      await connection.execute(
        `UPDATE SYSTEM_ALERTS
         SET IS_RESOLVED = 1, RESOLVED_TS = SYSTIMESTAMP, RESOLVED_BY = :who
         WHERE ALERT_ID = :aid`,
        { who: username, aid: alertId }
      );
    } else {
      await connection.execute(
        `UPDATE SYSTEM_ALERTS
         SET IS_RESOLVED = 0, RESOLVED_TS = NULL, RESOLVED_BY = NULL
         WHERE ALERT_ID = :aid`,
        { aid: alertId }
      );
    }

    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Oracle DB Error in /api/alerts PATCH:', error);
    return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}
