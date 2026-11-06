import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createPool } from "../server/config/database.js";
import { migrate } from "../server/services/migrations.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/services/passwords.js";
import { processAlerts } from "../server/services/alerts.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const config = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  STORAGE_PATH: process.env.TEST_STORAGE_PATH,
  ssl: false,
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5173",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 8,
  TRUST_PROXY: "0",
};

let pool, app, masterAgent, ouvAgent;

before(async () => {
  if (!enabled) return;
  pool = createPool(config);
  await migrate(pool);
  app = await createApp(pool, config);

  // Criar Master e Ouvidoria para os testes
  const masterHash = await hashPassword("m123");
  const ouvHash = await hashPassword("o123");

  const mUser = (
    await pool.query(
      "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$2,$3,$4) RETURNING id",
      ["Master SIO", "master_sio", "master_sio@example.invalid", masterHash],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo='MASTER'",
    [mUser.id],
  );

  const oUser = (
    await pool.query(
      "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$2,$3,$4) RETURNING id",
      ["Ouvidoria SIO", "ouvidoria_sio", "ouv_sio@example.invalid", ouvHash],
    )
  ).rows[0];
  await pool.query(
    "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo='OUVIDORIA'",
    [oUser.id],
  );

  masterAgent = request.agent(app);
  const mCsrf = (await masterAgent.get("/api/auth/csrf")).body.csrfToken;
  await masterAgent
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", mCsrf)
    .send({ login: "master_sio", senha: "m123" })
    .expect(200);

  ouvAgent = request.agent(app);
  const oCsrf = (await ouvAgent.get("/api/auth/csrf")).body.csrfToken;
  await ouvAgent
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", oCsrf)
    .send({ login: "ouvidoria_sio", senha: "o123" })
    .expect(200);
});

after(async () => {
  if (pool) await pool.end();
});

const it = (name, fn) => test(name, { skip: !enabled }, fn);

it("1. Cadastro de usuário com senha de até 6 caracteres", async () => {
  const csrf = (await masterAgent.get("/api/auth/csrf")).body.csrfToken;
  const res = await masterAgent
    .post("/api/catalogs/users")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", csrf)
    .send({
      nome: "Usuário 6 Caracteres",
      login: "user_6char",
      email: "user6@example.invalid",
      senha: "123456",
      perfis: ["OUVIDORIA"],
      ativo: true,
    })
    .expect(201);
  assert.ok(res.body.id);
});

it("2. Bloqueio de senha com mais de 6 caracteres", async () => {
  const csrf = (await masterAgent.get("/api/auth/csrf")).body.csrfToken;
  const res = await masterAgent
    .post("/api/catalogs/users")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", csrf)
    .send({
      nome: "Usuário Senha Longa",
      login: "user_long",
      email: "userlong@example.invalid",
      senha: "1234567",
      perfis: ["OUVIDORIA"],
      ativo: true,
    })
    .expect(400);
  assert.ok(res.body.error.includes("6 caracteres"));
});

it("3. Login de usuário existente com senha longa (>6 chars) é preservado", async () => {
  const longHash = await hashPassword("senhaLongaAntiga123");
  await pool.query(
    "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$2,$3,$4)",
    ["Usuário Legado", "user_legado", "legado@example.invalid", longHash],
  );
  const anon = request.agent(app);
  const csrf = (await anon.get("/api/auth/csrf")).body.csrfToken;
  await anon
    .post("/api/auth/login")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", csrf)
    .send({ login: "user_legado", senha: "senhaLongaAntiga123" })
    .expect(200);
});

it("4. Cadastro e edição de Gerente institucional sem usuário vinculado e com setor", async () => {
  const csrf = (await masterAgent.get("/api/auth/csrf")).body.csrfToken;
  const area = (await pool.query("SELECT id FROM areas_tecnicas WHERE ativo LIMIT 1")).rows[0].id;
  const setor = (
    await masterAgent
      .post("/api/catalogs/setores")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({ nome: "UTI Geral", area_id: area, ativo: true })
      .expect(201)
  ).body.id;

  // Criar gerente institucional (sem usuario_id)
  const gerente = (
    await masterAgent
      .post("/api/catalogs/gerentes")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({
        nome: "Dr. Gerente Institucional",
        setor_id: setor,
        ativo: true,
      })
      .expect(201)
  ).body;

  assert.ok(gerente.id);
  assert.equal(gerente.setor_id, setor);
  assert.equal(gerente.usuario_id, null);

  // Edição do gerente
  const editado = (
    await masterAgent
      .put(`/api/catalogs/gerentes/${gerente.id}`)
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({
        nome: "Dr. Gerente Institucional Atualizado",
        setor_id: setor,
        ativo: true,
      })
      .expect(200)
  ).body;
  assert.equal(editado.nome, "Dr. Gerente Institucional Atualizado");
});

it("5. Cadastro de Gestor institucional com área, setor e gerente responsável", async () => {
  const csrf = (await masterAgent.get("/api/auth/csrf")).body.csrfToken;
  const area = (await pool.query("SELECT id FROM areas_tecnicas WHERE ativo LIMIT 1")).rows[0].id;
  const setor = (
    await masterAgent
      .post("/api/catalogs/setores")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({ nome: "Emergência Adulto", area_id: area, ativo: true })
      .expect(201)
  ).body.id;

  const gerente = (
    await masterAgent
      .post("/api/catalogs/gerentes")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({
        nome: "Gerente da Emergência",
        setor_id: setor,
        ativo: true,
      })
      .expect(201)
  ).body.id;

  const gestor = (
    await masterAgent
      .post("/api/catalogs/gestores")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", csrf)
      .send({
        nome: "Gestor Clínico Institucional",
        area_id: area,
        setor_id: setor,
        gerente_id: gerente,
        ativo: true,
      })
      .expect(201)
  ).body;

  assert.ok(gestor.id);
  assert.equal(gestor.usuario_id, null);
  assert.equal(gestor.gerente_id, gerente);
  assert.equal(gestor.setor_id, setor);
  assert.equal(gestor.area_id, area);
});

it("6. Listagem de gerentes e gestores inclui dados relacionados", async () => {
  const resGerentes = await masterAgent
    .get("/api/catalogs/gerentes")
    .expect(200);
  assert.ok(Array.isArray(resGerentes.body.items));
  assert.ok(resGerentes.body.items.some((g) => g.setor_nome));

  const resGestores = await masterAgent
    .get("/api/catalogs/gestores")
    .expect(200);
  assert.ok(Array.isArray(resGestores.body.items));
  assert.ok(resGestores.body.items.some((g) => g.gerente_nome && g.setor_nome && g.area_nome));
});

it("7. Encaminhamento de manifestação a gestor institucional e alerta de atraso ao gerente", async () => {
  const ouvCsrf = (await ouvAgent.get("/api/auth/csrf")).body.csrfToken;
  const masterCsrf = (await masterAgent.get("/api/auth/csrf")).body.csrfToken;

  const area = (await pool.query("SELECT id FROM areas_tecnicas WHERE ativo LIMIT 1")).rows[0].id;
  const setor = (
    await masterAgent
      .post("/api/catalogs/setores")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", masterCsrf)
      .send({ nome: "Cardiologia", area_id: area, ativo: true })
      .expect(201)
  ).body.id;

  const motivo = (
    await masterAgent
      .post("/api/catalogs/motivos")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", masterCsrf)
      .send({ nome: "Tempo de espera", area_id: area, ativo: true })
      .expect(201)
  ).body.id;

  const gerente = (
    await masterAgent
      .post("/api/catalogs/gerentes")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", masterCsrf)
      .send({ nome: "Gerente de Cardiologia", setor_id: setor, ativo: true })
      .expect(201)
  ).body.id;

  const gestor = (
    await masterAgent
      .post("/api/catalogs/gestores")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", masterCsrf)
      .send({
        nome: "Gestor da Cardiologia",
        area_id: area,
        setor_id: setor,
        gerente_id: gerente,
        ativo: true,
      })
      .expect(201)
  ).body.id;

  // Criar prazo dedicado aprovado para este teste sem alterar o prazo Geral padrão
  const prazo = (
    await pool.query(
      "INSERT INTO prazos(nome,tipo,quantidade,unidade,aprovado) VALUES('Prazo Ajustes Institucionais','Geral',5,'dias',true) RETURNING id",
    )
  ).rows[0].id;

  // Ouvidoria cria e encaminha manifestação
  const resCaso = await ouvAgent
    .post("/api/cases")
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", ouvCsrf)
    .send({
      data_manifestacao: new Date().toISOString().slice(0, 10),
      tipo: "Reclamação",
      canal: "Pessoal",
      area_id: area,
      motivo_id: motivo,
      setor_id: setor,
      prazo_id: prazo,
      gestor_id: gestor,
      relato: "Relato de teste com gestor institucional.",
      contato_nome: "Cidadão Paciente",
      terceiro_confirmado: true,
      encaminhar: true,
    });

  if (resCaso.status !== 201) {
    console.error("FALHA AO CRIAR CASO:", resCaso.status, resCaso.body);
  }
  assert.equal(resCaso.status, 201);
  const caso = resCaso.body;
  assert.ok(caso.id);

  // Simula vencimento do prazo para disparar alerta
  await pool.query(
    "UPDATE manifestacoes SET vencimento=now()-interval '1 hour' WHERE id=$1",
    [caso.id],
  );

  // Processa alertas
  await processAlerts(pool);

  // Verifica que o alerta foi registrado com timestamp e vinculado ao caso
  const mAtualizado = (
    await pool.query("SELECT alerta_gerente_em FROM manifestacoes WHERE id=$1", [caso.id])
  ).rows[0];
  assert.ok(mAtualizado.alerta_gerente_em);

  const alertaRow = (
    await pool.query("SELECT * FROM alertas WHERE manifestacao_id=$1 AND evento='vencido'", [caso.id])
  ).rows[0];
  assert.ok(alertaRow);

  // Verifica histórico com identificação do gestor e gerente
  const hist = (
    await pool.query(
      "SELECT * FROM historico_manifestacoes WHERE manifestacao_id=$1 AND evento='alerta_vencido'",
      [caso.id],
    )
  ).rows[0];
  assert.ok(hist);
  assert.equal(hist.dados.gestor_id, gestor);
  assert.equal(hist.dados.gerente_id, gerente);
  assert.equal(hist.dados.gerente_nome, "Gerente de Cardiologia");

  // Verifica que o caso vencido aparece nos relatórios/painel da Ouvidoria
  const reportsRes = await ouvAgent.get("/api/reports").expect(200);
  assert.ok(reportsRes.body.overdue.some((item) => item.id === caso.id));
});
