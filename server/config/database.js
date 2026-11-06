import pg from "pg";

export function createPool(config) {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.ssl,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 15000,
  });
}

export async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
