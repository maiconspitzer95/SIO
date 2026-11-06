import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

/** Serializa migrations entre processos e rejeita alterações em versões já aplicadas. */
export async function migrate(pool) {
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock(73649102)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (versao text PRIMARY KEY, checksum text NOT NULL, aplicado_em timestamptz NOT NULL DEFAULT now())",
    );
    const dir = new URL("../migrations/", import.meta.url);
    for (const file of (await readdir(dir))
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort()) {
      const sql = await readFile(new URL(file, dir), "utf8");
      const hash = createHash("sha256").update(sql).digest("hex");
      const previous = await db.query(
        "SELECT checksum FROM schema_migrations WHERE versao=$1",
        [file],
      );
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== hash)
          throw new Error(`Migration aplicada foi alterada: ${file}`);
        continue;
      }
      try {
        await db.query("BEGIN");
        await db.query(sql);
        await db.query(
          "INSERT INTO schema_migrations(versao,checksum) VALUES($1,$2)",
          [file, hash],
        );
        await db.query("COMMIT");
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(73649102)");
    db.release();
  }
}
