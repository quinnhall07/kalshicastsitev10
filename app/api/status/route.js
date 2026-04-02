import { NextResponse } from 'next/server';
import { getDbConnection } from '../../../lib/db';
 
export const dynamic = 'force-dynamic';
 
// Expected healthy row counts per calendar day
const EXPECTED = {
  forecast_rows: 720,   // 20 stations × 9 sources × 4 target days
  shadow_rows: 600,     // 20 stations × 2 types × 15 bins
  obs_rows: 20,         // 20 active stations
};
 
function scoreDay(d) {
  // If absolutely nothing was recorded, the system likely wasn't running yet
  const hasAnyData =
    d.forecast_rows > 0 || d.shadow_rows > 0 || d.obs_rows > 0 ||
    d.morning_status || d.night_status || d.market_status;
 
  if (!hasAnyData) {
    return {
      collection: 'no_data',
      pipeline_night: 'no_data',
      pricing: 'no_data',
      metar: 'no_data',
      evaluation: 'no_data',
      alerts: 'no_data',
    };
  }
 
  const pct = (actual, expected) => (expected > 0 ? actual / expected : 0);
 
  const healthFromPct = (p) => {
    if (p >= 0.85) return 'healthy';
    if (p >= 0.40) return 'degraded';
    if (p === 0)   return 'no_data';
    return 'failed';
  };
 

  const statusToHealth = (status) => {
    if (!status)              return 'no_data';
    if (status === 'OK')      return 'healthy';
    if (status === 'PARTIAL') return 'degraded';  // was falling through to 'failed'
    if (status === 'OFFLINE') return 'degraded';  // treat OFFLINE as degraded not failed
    return 'failed';
  };
 
  // Collection: prefer pipeline status, supplement with row-count ratio
  const collectionHealth = d.morning_status
    ? (d.morning_status === 'OK'
        ? healthFromPct(pct(d.forecast_rows, EXPECTED.forecast_rows))
        : statusToHealth(d.morning_status))
    : healthFromPct(pct(d.forecast_rows, EXPECTED.forecast_rows));
 
  // Pricing: prefer market_open status, supplement with shadow book row ratio
  const pricingHealth = d.market_status
    ? (d.market_status === 'OK'
        ? healthFromPct(pct(d.shadow_rows, EXPECTED.shadow_rows))
        : statusToHealth(d.market_status))
    : healthFromPct(pct(d.shadow_rows, EXPECTED.shadow_rows));
 
  // METAR: fraction of 20 stations with actual observations
  const metarFrac = d.metar_stations / 20;
  const metarHealth =
    d.metar_stations === 0 ? 'no_data'
    : metarFrac >= 0.85 ? 'healthy'
    : metarFrac >= 0.50 ? 'degraded'
    : 'failed';
 
  // Evaluation: Brier scores only get written after night pipeline grades them.
  // If the night pipeline ran but nothing was graded yet, call it degraded.
  const evalHealth =
    d.brier_rows > 0      ? 'healthy'
    : d.night_status === 'OK' ? 'degraded'
    : 'no_data';
 
  // Alerts: critical alerts = failed; many warnings = degraded; none = healthy
  const alertHealth =
    d.critical_alerts > 0 ? 'failed'
    : d.total_alerts >= 5  ? 'degraded'
    : 'healthy';
 
  return {
    collection: collectionHealth,
    pipeline_night: statusToHealth(d.night_status),
    pricing: pricingHealth,
    metar: metarHealth,
    evaluation: evalHealth,
    alerts: alertHealth,
  };
}
 
export async function GET() {
  let connection;
  try {
    connection = await getDbConnection();
 
    // Single CTE-based query covering all 6 health dimensions over 90 days.
    // Oracle's CONNECT BY generates the full date spine so missing days appear
    // as zeros rather than being omitted.
    const sql = `
      WITH date_range AS (
        SELECT TRUNC(SYSDATE) - LEVEL + 1 AS day_date
        FROM DUAL
        CONNECT BY LEVEL <= 90
      ),
      pipeline_agg AS (
        SELECT
          TRUNC(STARTED_UTC) AS day_date,
          MAX(CASE WHEN RUN_TYPE = 'morning'     THEN STATUS END) AS morning_status,
          MAX(CASE WHEN RUN_TYPE = 'night'       THEN STATUS END) AS night_status,
          MAX(CASE WHEN RUN_TYPE = 'market_open' THEN STATUS END) AS market_status,
          MAX(CASE WHEN RUN_TYPE = 'morning'     THEN STATIONS_OK   END) AS morning_stations_ok,
          MAX(CASE WHEN RUN_TYPE = 'morning'     THEN STATIONS_FAIL END) AS morning_stations_fail,
          MAX(CASE WHEN RUN_TYPE = 'morning'     THEN ROWS_DAILY    END) AS morning_rows,
          MAX(CASE WHEN RUN_TYPE = 'morning'     THEN SUBSTR(ERROR_MSG, 1, 200) END) AS morning_error,
          MAX(CASE WHEN RUN_TYPE = 'night'       THEN SUBSTR(ERROR_MSG, 1, 200) END) AS night_error,
          MAX(CASE WHEN RUN_TYPE = 'market_open' THEN SUBSTR(ERROR_MSG, 1, 200) END) AS market_error
        FROM PIPELINE_RUNS
        WHERE STARTED_UTC >= TRUNC(SYSDATE) - 90
        GROUP BY TRUNC(STARTED_UTC)
      ),
      forecast_agg AS (
        SELECT TRUNC(CREATED_AT) AS day_date, COUNT(*) AS row_count
        FROM FORECASTS_DAILY
        WHERE CREATED_AT >= TRUNC(SYSDATE) - 90
        GROUP BY TRUNC(CREATED_AT)
      ),
      shadow_agg AS (
        SELECT TARGET_DATE AS day_date, COUNT(*) AS row_count
        FROM SHADOW_BOOK
        WHERE TARGET_DATE >= TRUNC(SYSDATE) - 90
        GROUP BY TARGET_DATE
      ),
      obs_agg AS (
        SELECT
          TRUNC(INGESTED_AT) AS day_date,
          COUNT(*)                                             AS row_count,
          COUNT(CASE WHEN AMENDED = 1 THEN 1 END)             AS amendment_count
        FROM OBSERVATIONS
        WHERE INGESTED_AT >= TRUNC(SYSDATE) - 90
        GROUP BY TRUNC(INGESTED_AT)
      ),
      brier_agg AS (
        SELECT TRUNC(GRADED_AT) AS day_date, COUNT(*) AS row_count
        FROM BRIER_SCORES
        WHERE GRADED_AT >= TRUNC(SYSDATE) - 90
        GROUP BY TRUNC(GRADED_AT)
      ),
      alert_agg AS (
        SELECT
          TRUNC(ALERT_TS) AS day_date,
          COUNT(*)                                                            AS total_alerts,
          SUM(CASE WHEN SEVERITY_SCORE >= 0.8 THEN 1 ELSE 0 END)            AS critical_count,
          LISTAGG(
            CASE WHEN SEVERITY_SCORE >= 0.7 THEN SUBSTR(ALERT_TYPE, 1, 40) END,
            '; '
          ) WITHIN GROUP (ORDER BY SEVERITY_SCORE DESC)                      AS alert_types
        FROM SYSTEM_ALERTS
        WHERE ALERT_TS >= TRUNC(SYSDATE) - 90
        GROUP BY TRUNC(ALERT_TS)
      ),
      metar_agg AS (
        SELECT
          LOCAL_DATE AS day_date,
          COUNT(CASE WHEN T_OBS_MAX_F IS NOT NULL THEN 1 END) AS stations_covered
        FROM METAR_DAILY_MAX
        WHERE LOCAL_DATE >= TRUNC(SYSDATE) - 90
        GROUP BY LOCAL_DATE
      )
      SELECT
        dr.day_date,
        pa.morning_status,
        pa.night_status,
        pa.market_status,
        COALESCE(pa.morning_stations_ok,   0) AS stations_ok,
        COALESCE(pa.morning_stations_fail, 0) AS stations_fail,
        COALESCE(pa.morning_rows,          0) AS morning_rows,
        pa.morning_error,
        pa.night_error,
        pa.market_error,
        COALESCE(fa.row_count, 0) AS forecast_rows,
        COALESCE(sa.row_count, 0) AS shadow_rows,
        COALESCE(oa.row_count, 0) AS obs_rows,
        COALESCE(oa.amendment_count, 0) AS amendments,
        COALESCE(ba.row_count, 0) AS brier_rows,
        COALESCE(aa.total_alerts,   0) AS total_alerts,
        COALESCE(aa.critical_count, 0) AS critical_alerts,
        aa.alert_types,
        COALESCE(ma.stations_covered, 0) AS metar_stations
      FROM date_range dr
      LEFT JOIN pipeline_agg pa ON pa.day_date = dr.day_date
      LEFT JOIN forecast_agg fa ON fa.day_date = dr.day_date
      LEFT JOIN shadow_agg   sa ON sa.day_date = dr.day_date
      LEFT JOIN obs_agg      oa ON oa.day_date = dr.day_date
      LEFT JOIN brier_agg    ba ON ba.day_date = dr.day_date
      LEFT JOIN alert_agg    aa ON aa.day_date = dr.day_date
      LEFT JOIN metar_agg    ma ON ma.day_date = dr.day_date
      ORDER BY dr.day_date ASC
    `;
 
    const result = await connection.execute(sql);
 
    const days = result.rows.map(row => {
      const d = {
        date:              row[0] ? new Date(row[0]).toISOString().split('T')[0] : null,
        morning_status:    row[1] || null,
        night_status:      row[2] || null,
        market_status:     row[3] || null,
        stations_ok:       Number(row[4])  || 0,
        stations_fail:     Number(row[5])  || 0,
        morning_rows:      Number(row[6])  || 0,
        morning_error:     row[7]  ? String(row[7])  : null,
        night_error:       row[8]  ? String(row[8])  : null,
        market_error:      row[9]  ? String(row[9])  : null,
        forecast_rows:     Number(row[10]) || 0,
        shadow_rows:       Number(row[11]) || 0,
        obs_rows:          Number(row[12]) || 0,
        amendments:        Number(row[13]) || 0,
        brier_rows:        Number(row[14]) || 0,
        total_alerts:      Number(row[15]) || 0,
        critical_alerts:   Number(row[16]) || 0,
        alert_types:       row[17] ? String(row[17]) : null,
        metar_stations:    Number(row[18]) || 0,
      };
      return { ...d, health: scoreDay(d) };
    });
 
    return NextResponse.json(days);
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) try { await connection.close(); } catch (_) {}
  }
}