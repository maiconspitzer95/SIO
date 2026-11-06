import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import pg from "pg";
import { backup } from './backup.js';
import { restore } from './restore.js';

// Cluster descartável dedicado: nunca usa DATABASE_URL e nunca altera bancos existentes.
const root = await mkdtemp(join(tmpdir(), "sio-test-"));
const bin =
  process.env.PG_BIN ||
  (process.platform === "win32"
    ? "C:\\Program Files\\PostgreSQL\\17\\bin"
    : "/usr/bin");
const secret = randomBytes(24).toString("hex");
await writeFile(join(root, "pw"), secret, { mode: 0o600 });
const port = await new Promise((resolvePort) => {
  const s = createServer();
  s.listen(0, "127.0.0.1", () => {
    const p = s.address().port;
    s.close(() => resolvePort(p));
  });
});
const data = join(root, "data");
let started = false;
function pgRun(name, args, env = {}) {
  const r = spawnSync(
    join(bin, `${name}${process.platform === "win32" ? ".exe" : ""}`),
    args,
    {
      encoding: "utf8",
      env: { ...process.env, ...env },
      windowsHide: true,
      // Evita pipes herdados pelo serviço PostgreSQL no Windows.
      stdio: name === "pg_ctl" ? "ignore" : ["ignore", "pipe", "pipe"],
      timeout: 60000,
    },
  );
  if (r.status !== 0)
    throw new Error(`${name} falhou: ${r.stderr || r.error || r.stdout}`);
  return r.stdout;
}
const pgEnv = {
  PGHOST: "127.0.0.1",
  PGPORT: String(port),
  PGUSER: "sio_test",
  PGPASSWORD: secret,
};
try {
  pgRun("initdb", [
    "-D",
    data,
    "-U",
    "sio_test",
    "--pwfile",
    join(root, "pw"),
    "-A",
    "scram-sha-256",
    "--encoding=UTF8",
    "--locale=C",
  ]);
  await writeFile(
    join(data, "postgresql.auto.conf"),
    `listen_addresses='127.0.0.1'\nport=${port}\n`,
  );
  pgRun("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "postgres.log"),
    "-w",
    "start",
  ]);
  started = true;
  pgRun("createdb", ["sio_test"], pgEnv);
  const connectionString = `postgresql://sio_test:${secret}@127.0.0.1:${port}/sio_test`;
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-concurrency=1",
      "tests/authorization.test.js",
      "tests/integration.test.js",
      "tests/operations.test.js",
      "tests/ajustes-sio.test.js",
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        TEST_DATABASE_URL: connectionString,
        TEST_STORAGE_PATH: join(root, "storage"),
      },
      windowsHide: true,
    },
  );
  if (result.status !== 0) throw new Error("Testes falharam.");
  if (process.argv.includes("--ui")) {
    const { browserSmoke } = await import("../tests/browser-smoke.js");
    await browserSmoke(connectionString);
  }
  let pool = new pg.Pool({ connectionString });
  const usersBefore = (await pool.query("SELECT count(*)::int n FROM usuarios"))
    .rows[0].n;
  const countsBefore={};
  for(const table of ['manifestacoes','encaminhamentos','respostas','historico_manifestacoes','notificacoes','alertas','anexos','discussoes_direcao'])countsBefore[table]=(await pool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
  const before = (
    await pool.query("SELECT count(*)::int AS count FROM auditoria")
  ).rows[0].count;
  await pool.end();
  pgRun("pg_ctl", [
    "-D",
    data,
    "-l",
    join(root, "postgres.log"),
    "-w",
    "restart",
  ]);
  pool = new pg.Pool({ connectionString });
  const after = (
    await pool.query("SELECT count(*)::int AS count FROM auditoria")
  ).rows[0].count;
  if (before !== after || before === 0)
    throw new Error("Persistência após reinicialização falhou.");
  await pool.end();
  console.log("OK: dados preservados após reinicializar PostgreSQL.");
  pgRun("pg_dump", ["-Fc", "-f", join(root, "backup.dump"), "sio_test"], pgEnv);
  pgRun("createdb", ["sio_restore"], pgEnv);
  pgRun(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "-d",
      "sio_restore",
      join(root, "backup.dump"),
    ],
    pgEnv,
  );
  const restoreUrl = new URL(connectionString);
  restoreUrl.pathname = "/sio_restore";
  pool = new pg.Pool({ connectionString: restoreUrl.toString() });
  const restored = (
    await pool.query("SELECT count(*)::int AS count FROM auditoria")
  ).rows[0].count;
  const users = (
    await pool.query("SELECT count(*)::int AS count FROM usuarios")
  ).rows[0].count;
  if (restored !== before || users !== usersBefore)
    throw new Error("Restauração inconsistente.");
  await pool.end();
  console.log("OK: backup e restauração PostgreSQL verificados.");
  const backupConfig={DATABASE_URL:connectionString,ssl:false,STORAGE_PATH:join(root,'storage')};
  const directory=await backup(backupConfig,join(root,'full-backups'));
  await restore(backupConfig,directory,'sio_restore_full',join(root,'restored-storage'));
  const fullUrl=new URL(connectionString);fullUrl.pathname='/sio_restore_full';
  const restoredPool=new pg.Pool({connectionString:fullUrl.toString()});
  try{for(const [table,count] of Object.entries(countsBefore)){if((await restoredPool.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n!==count)throw new Error('Contagem divergente após restaurar '+table);}}finally{await restoredPool.end();}
  console.log('OK: backup completo restaurado com anexos, checksums e contagens de todas as entidades operacionais.');
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (started) pgRun("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
  // Remove somente o diretório temporário que este processo acabou de criar.
  if (
    resolve(root).startsWith(
      resolve(tmpdir()) + (process.platform === "win32" ? "\\" : "/"),
    ) &&
    /sio-test-[^/\\]+$/.test(root)
  )
    await rm(root, { recursive: true, force: true });
}
