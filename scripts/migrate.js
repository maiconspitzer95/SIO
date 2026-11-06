import { readConfig } from "../server/config/env.js";
import { createPool } from "../server/config/database.js";
import { migrate } from "../server/services/migrations.js";
const pool = createPool(readConfig());
try {
  await migrate(pool);
  console.log("Migrations aplicadas.");
} finally {
  await pool.end();
}
