import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import request from "supertest";
import { createPool } from "../server/config/database.js";
import { migrate } from "../server/services/migrations.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/services/passwords.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const config = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  ssl: false,
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 8,
  TRUST_PROXY: "0",
};
let pool, app, masterId;
const password = "p@123";
before(async () => {
  if (!enabled) return;
  pool = createPool(config);
  await migrate(pool);
  const hash = await hashPassword(password);
  for (const role of ["MASTER", "OUVIDORIA", "GESTOR", "GERENTE", "DIRECAO"]) {
    const { rows } = await pool.query(
      "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$2,$3,$4) RETURNING id",
      [
        `Teste ${role}`,
        role.toLowerCase(),
        `${role.toLowerCase()}@example.invalid`,
        hash,
      ],
    );
    await pool.query(
      "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo=$2",
      [rows[0].id, role],
    );
    if (role === "MASTER") masterId = rows[0].id;
  }
  app = await createApp(pool, config);
});
after(async () => {
  if (pool) await pool.end();
});
const it = (name, fn) => test(name, { skip: !enabled }, fn);
async function session(login = "master") {
  const agent = request.agent(app);
  const initial = await agent.get("/api/auth/csrf").expect(200);
  const response = await agent
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", initial.body.csrfToken)
    .send({ login, senha: password })
    .expect(200);
  return { agent, csrf: response.body.csrfToken, response };
}
it("migrations são idempotentes e perfis persistem", async () => {
  await migrate(pool);
  assert.equal((await pool.query("SELECT * FROM perfis")).rowCount, 5);
  assert.equal(
    (await pool.query("SELECT * FROM schema_migrations")).rowCount,
    3,
  );
});
it("produção serve a SPA e emite cookie Secure com CSP atrás do proxy local", async () => {
  const production = await createApp(pool, {
    ...config,
    NODE_ENV: "production",
    APP_ORIGIN: "https://sio.example.invalid",
    TRUST_PROXY: "1",
  });
  const response = await request(production)
    .get("/api/auth/csrf")
    .set("X-Forwarded-Proto", "https")
    .expect(200);
  assert.match(response.headers["set-cookie"][0], /__Host-sio.sid=/);
  assert.match(response.headers["set-cookie"][0], /; Secure/);
  assert.match(
    response.headers["content-security-policy"],
    /frame-ancestors 'none'/,
  );
  await request(production)
    .get("/perfis")
    .expect("Content-Type", /html/)
    .expect(200);
});
it("login válido rotaciona sessão; cookie HttpOnly e SameSite; senha nunca retornada", async () => {
  const { agent, response } = await session();
  assert.match(response.headers["set-cookie"][0], /HttpOnly/);
  assert.match(response.headers["set-cookie"][0], /SameSite=Strict/);
  assert.equal(response.body.user.senha_hash, undefined);
  const me = await agent.get("/api/auth/me").expect(200);
  assert.deepEqual(me.body.user.perfis, ["MASTER"]);
  assert.equal(me.body.user.permissoes.includes("manifestacoes.criar"), false);
  assert.equal(me.headers["cache-control"], "no-store");
});
it("login inválido e inexistente têm resposta genérica idêntica", async () => {
  const agent = request.agent(app);
  const { body } = await agent.get("/api/auth/csrf");
  for (const login of ["master", "' OR 1=1 --"]) {
    const r = await agent
      .post("/api/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", body.csrfToken)
      .send({ login, senha: "incorreta" })
      .expect(401);
    assert.equal(r.body.error, "Usuário ou senha inválidos.");
  }
});
it("CSRF exige token e origem; entrada Unicode não causa erro interno", async () => {
  const agent = request.agent(app);
  const { body } = await agent.get("/api/auth/csrf");
  await agent
    .post("/api/auth/login")
    .send({ login: "master", senha: password })
    .expect(403);
  await agent
    .post("/api/auth/login")
    .set("Origin", "http://evil.invalid")
    .set("X-CSRF-Token", body.csrfToken)
    .send({ login: "master", senha: password })
    .expect(403);
  await agent
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", "é".repeat(64))
    .send({})
    .expect(403);
});
it("todas as rotas administrativas exigem sessão; perfis sem permissão são negados", async () => {
  await request(app).get("/api/admin/audit").expect(401);
  for (const role of ["ouvidoria", "gestor", "gerente", "direcao"]) {
    const { agent } = await session(role);
    await agent.get("/api/admin/audit").expect(403);
    await agent.get("/api/admin/roles").expect(403);
  }
  const { agent } = await session();
  assert.equal(
    (await agent.get("/api/admin/roles").expect(200)).body.items.length,
    5,
  );
});
it("rotas operacionais não são publicadas nesta etapa", async () => {
  const { agent } = await session("gestor");
  await agent
    .get("/api/manifestacoes/00000000-0000-0000-0000-000000000001")
    .expect(404);
});
it("auditoria é paginada, imutável e não contém senhas", async () => {
  const { agent } = await session();
  const result = await agent.get("/api/admin/audit").expect(200);
  assert.ok(result.body.total > 0);
  assert.ok(result.body.items.length <= 25);
  assert.equal(JSON.stringify(result.body).includes(password), false);
  await agent.get("/api/admin/audit?page=-1").expect(400);
  await assert.rejects(
    pool.query("UPDATE auditoria SET evento='alterado'"),
    /imutável/,
  );
  await assert.rejects(pool.query("DELETE FROM auditoria"), /imutável/);
  await assert.rejects(pool.query("TRUNCATE auditoria"), /imutável/);
});
it("sessão persiste após recriar aplicação", async () => {
  const { response } = await session();
  const cookie = response.headers["set-cookie"][0].split(";")[0];
  const restarted = await createApp(pool, config);
  await request(restarted)
    .get("/api/auth/me")
    .set("Cookie", cookie)
    .expect(200);
});
it("logout invalida sessão e token antigo não permite reutilização", async () => {
  const { agent, csrf, response } = await session();
  const cookie = response.headers["set-cookie"][0].split(";")[0];
  await agent
    .post("/api/auth/logout")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", csrf)
    .expect(204);
  await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
});
it("inativação revoga acesso imediatamente", async () => {
  const { agent } = await session("gestor");
  await pool.query("UPDATE usuarios SET ativo=false WHERE login='gestor'");
  await agent.get("/api/auth/me").expect(401);
  await pool.query("UPDATE usuarios SET ativo=true WHERE login='gestor'");
});
it("expiração absoluta é verificada no backend", async () => {
  const { agent } = await session("gerente");
  await pool.query(
    "UPDATE sessoes SET sess=jsonb_set(sess::jsonb,'{startedAt}','0'::jsonb)::json WHERE sess->>'userId'=(SELECT id::text FROM usuarios WHERE login='gerente')",
  );
  await agent.get("/api/auth/me").expect(401);
});
it("recuperação usa hash, expira, é de uso único e revoga sessões", async () => {
  await pool.query("DELETE FROM limites_acesso");
  const { agent } = await session();
  const anonymous = request.agent(app);
  const { body } = await anonymous.get("/api/auth/csrf");
  const token = randomBytes(32).toString("hex");
  const expiredToken = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO recuperacoes_senha(usuario_id,token_hash,expira_em) VALUES($1,$2,now()-interval '1 minute')",
    [masterId, createHash("sha256").update(expiredToken).digest("hex")],
  );
  await anonymous
    .post("/api/auth/reset")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", body.csrfToken)
    .send({ token: expiredToken, senha: password })
    .expect(400);
  await pool.query(
    "INSERT INTO recuperacoes_senha(usuario_id,token_hash,expira_em) VALUES($1,$2,now()+interval '15 minutes')",
    [masterId, createHash("sha256").update(token).digest("hex")],
  );
  await anonymous.post("/api/auth/reset").set("Origin", config.APP_ORIGIN).set("X-CSRF-Token", body.csrfToken).send({ token, senha: "maisDe6" }).expect(400); const newPassword = "n#456";
  await anonymous
    .post("/api/auth/reset")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", body.csrfToken)
    .send({ token, senha: newPassword })
    .expect(200);
  await agent.get("/api/auth/me").expect(401);
  const nextToken = (await anonymous.get("/api/auth/csrf")).body.csrfToken;
  await anonymous
    .post("/api/auth/reset")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", nextToken)
    .send({ token, senha: newPassword })
    .expect(400);
  await anonymous
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", nextToken)
    .send({ login: "master", senha: newPassword })
    .expect(200);
});
it("limite de tentativas persiste após recriar aplicação", async () => {
  await pool.query("DELETE FROM limites_acesso");
  const agent = request.agent(app);
  const { body } = await agent.get("/api/auth/csrf");
  for (let i = 0; i < 10; i++)
    await agent
      .post("/api/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", body.csrfToken)
      .send({ login: "inexistente", senha: "errada" })
      .expect(401);
  const other = request.agent(await createApp(pool, config));
  const csrf = (await other.get("/api/auth/csrf")).body.csrfToken;
  const response = await other
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", csrf)
    .send({ login: "inexistente", senha: "errada" })
    .expect(429);
  assert.ok(response.headers["retry-after"]);
});
