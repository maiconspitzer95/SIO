import { readConfig } from "./config/env.js";
import { createPool } from "./config/database.js";
import { createApp } from "./app.js";

const config = readConfig();
const pool = createPool(config);
pool.on("error", () =>
  console.error("Falha na conexão ociosa com PostgreSQL."),
);
await pool.query("SELECT versao FROM schema_migrations LIMIT 1");
const app = await createApp(pool, config);
const server = app.listen(config.PORT, config.HOST, () =>
  console.log(`SIO disponível na porta ${config.PORT}.`),
);
// Limpeza somente de registros transitórios. Auditoria e dados institucionais são preservados.
const cleanup = setInterval(
  () =>
    pool
      .query(
        "DELETE FROM limites_acesso WHERE reinicia_em<now()-interval '1 day'; DELETE FROM sessoes WHERE expire<now()",
      )
      .catch(() => console.error("Falha na limpeza de sessões.")),
  3600000,
);
cleanup.unref();
let closing = false;
function stop() {
  if (closing) return;
  closing = true;
  clearInterval(cleanup);
  const timer = setTimeout(() => process.exit(1), 9000);
  timer.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timer);
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("message", (msg) => {
  if (msg === "shutdown") stop();
});
