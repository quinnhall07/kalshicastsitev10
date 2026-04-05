import oracledb from 'oracledb';

let pool = null;

async function getPool() {
  if (!pool) {
    pool = await oracledb.createPool({
      user: process.env.ORACLE_USER,
      password: process.env.ORACLE_PASSWORD,
      connectString: process.env.ORACLE_CONNECTION_STRING,
      poolMin: 2,
      poolMax: 10,
      poolIncrement: 1,
      poolTimeout: 60,
      queueTimeout: 30000,
    });
  }
  return pool;
}

export async function getDbConnection() {
  try {
    const p = await getPool();
    return await p.getConnection();
  } catch (err) {
    // If pool is broken (e.g. DB restarted), recreate it
    if (pool) {
      try { await pool.close(0); } catch (_) { /* ignore */ }
      pool = null;
    }
    const p = await getPool();
    return await p.getConnection();
  }
}
