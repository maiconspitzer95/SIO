// Novas regras: e-mail de gerente/gestor, gestor com vários setores,
// escalonamento ao gerente (24h), painel da Direção e acesso pelo IP da máquina.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { createPool } from "../server/config/database.js";
import { migrate } from "../server/services/migrations.js";
import { createApp } from "../server/app.js";
import { hashPassword } from "../server/services/passwords.js";
import { processAlerts } from "../server/services/alerts.js";
import { readConfig, allowedOrigins } from "../server/config/env.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const config = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  ssl: false,
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5004",
  allowedOrigins: ["http://localhost:5004", "http://192.168.2.214:5004"],
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 8,
  TRUST_PROXY: "0",
};
const it = (name, fn) => test(name, { skip: !enabled }, fn);
let pool, app;
const s = {};
const ids = {};

async function login(loginName, origin = config.APP_ORIGIN) {
  const agent = request.agent(app);
  const csrf = (await agent.get("/api/auth/csrf")).body.csrfToken;
  const res = await agent
    .post("/api/auth/login")
    .set("Origin", origin)
    .set("X-CSRF-Token", csrf)
    .send({ login: loginName, senha: "a1" });
  return { agent, csrf: res.body.csrfToken, status: res.status };
}
async function call(who, method, path, body, expected = 200) {
  const r = await s[who].agent[method](path)
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", s[who].csrf)
    .send(body);
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(r.body)}`);
  return r.body;
}

before(async () => {
  if (!enabled) return;
  pool = createPool(config);
  await migrate(pool);
  app = await createApp(pool, config);
  const hash = await hashPassword("a1");
  for (const [user, role] of [
    ["adm", "MASTER"],
    ["ouv", "OUVIDORIA"],
    ["gestor1", "GESTOR"],
    ["gerente1", "GERENTE"],
    ["diretor", "DIRECAO"],
  ]) {
    const id = (
      await pool.query(
        "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$1,$1||'@example.invalid',$2) RETURNING id",
        [user, hash],
      )
    ).rows[0].id;
    ids[user] = id;
    await pool.query(
      "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo=$2",
      [id, role],
    );
    s[user] = await login(user);
  }
});
after(async () => {
  if (pool) await pool.end();
});

it("acesso pelo IP da máquina é aceito; origem desconhecida é bloqueada", async () => {
  const viaIp = await login("ouv", "http://192.168.2.214:5004");
  assert.equal(viaIp.status, 200);
  const foreign = await login("ouv", "http://10.9.9.9:5004");
  assert.equal(foreign.status, 403);
  const o = allowedOrigins({ PORT: 5004, APP_ORIGIN: "http://sio.santacasa.local:5004" });
  assert.ok(o.all.includes("http://sio.santacasa.local:5004"));
  assert.ok(o.all.includes("http://127.0.0.1:5004"));
  const c = readConfig({
    DATABASE_URL: "postgresql://x@localhost/x",
    SESSION_SECRET: randomBytes(48).toString("hex"),
  });
  assert.equal(c.HOST, "0.0.0.0");
  assert.ok(c.allowedOrigins.includes("http://localhost:5004"));
});

it("gerente e gestor com e-mail; gestor com vários setores", async () => {
  const [a1, a2] = (await pool.query("SELECT id FROM areas_tecnicas ORDER BY nome LIMIT 2")).rows.map((r) => r.id);
  ids.area = a1;
  ids.setorA = (await call("adm", "post", "/api/catalogs/setores", { nome: "Emergência", area_id: a1 }, 201)).id;
  ids.setorB = (await call("adm", "post", "/api/catalogs/setores", { nome: "Recepção", area_id: a1 }, 201)).id;
  ids.setorC = (await call("adm", "post", "/api/catalogs/setores", { nome: "Faturamento", area_id: a2 }, 201)).id;
  ids.motivo = (await call("adm", "post", "/api/catalogs/motivos", { nome: "Demora", area_id: a1 }, 201)).id;
  await call("adm", "post", "/api/catalogs/gerentes", { nome: "Gerente X", email: "invalido", setor_id: ids.setorA }, 400);
  const ger = await call("adm", "post", "/api/catalogs/gerentes", {
    nome: "Gerente Assistencial",
    email: "gerente@santacasadepelotas.com.br",
    setor_id: ids.setorA,
    usuario_id: ids.gerente1,
  }, 201);
  assert.equal(ger.email, "gerente@santacasadepelotas.com.br");
  ids.gerente = ger.id;
  await call("adm", "post", "/api/catalogs/gestores", { nome: "Sem setor", gerente_id: ger.id, setores: [] }, 400);
  const gest = await call("adm", "post", "/api/catalogs/gestores", {
    nome: "Gestor Multissetor",
    email: "gestor@santacasadepelotas.com.br",
    gerente_id: ger.id,
    usuario_id: ids.gestor1,
    setores: [ids.setorA, ids.setorB, ids.setorC],
  }, 201);
  ids.gestor = gest.id;
  const list = (await call("adm", "get", "/api/catalogs/gestores")).items;
  const row = list.find((g) => g.id === gest.id);
  assert.equal(row.email, "gestor@santacasadepelotas.com.br");
  assert.equal(row.setores.length, 3);
  // Edição mantém e troca vínculos
  await call("adm", "put", "/api/catalogs/gestores/" + gest.id, {
    nome: "Gestor Multissetor",
    email: "gestor@santacasadepelotas.com.br",
    gerente_id: ger.id,
    usuario_id: ids.gestor1,
    setores: [ids.setorB, ids.setorC],
    ativo: true,
  });
  const after = (await call("adm", "get", "/api/catalogs/gestores")).items.find((g) => g.id === gest.id);
  assert.deepEqual(after.setores.map((x) => x.nome).sort(), ["Faturamento", "Recepção"]);
  // Lookups (todos os perfis) não expõem e-mails
  const lk = await call("ouv", "get", "/api/catalogs/lookups");
  assert.ok(!("email" in lk.gestores[0]));
  assert.equal(lk.gestores.find((g) => g.id === gest.id).setores.length, 2);
});

it("gestor não responde no prazo → vermelho; Ouvidoria encaminha ao gerente (24h); gerente responde", async () => {
  ids.prazo = (await pool.query("INSERT INTO prazos(nome,tipo,quantidade,unidade,aprovado) VALUES('Geral aprovado','Geral',5,'dias',true) RETURNING id")).rows[0].id;
  const { id } = await call("ouv", "post", "/api/cases", {
    data_manifestacao: new Date().toISOString().slice(0, 10),
    tipo: "Reclamação",
    canal: "Pessoal",
    area_id: ids.area,
    motivo_id: ids.motivo,
    setor_id: ids.setorB,
    prazo_id: ids.prazo,
    gestor_id: ids.gestor,
    relato: "Demora no atendimento da recepção.",
    contato_nome: "Paciente Teste",
    terceiro_confirmado: true,
    encaminhar: true,
  }, 201);
  ids.case = id;
  let m = (await call("ouv", "get", "/api/cases/" + id)).manifestacao;
  assert.equal(m.status, "Em andamento");
  // Gerente não acessa a manifestação antes do encaminhamento da Ouvidoria
  await call("gerente1", "get", "/api/cases/" + id, null, 404);
  await call("gerente1", "post", `/api/cases/${id}/actions`, { acao: "responder_gerente", versao: m.versao, resposta: "y" }, 404);
  // Contato visível ao gestor (não marcado como oculto)
  assert.equal((await call("gestor1", "get", "/api/cases/" + id)).contato.nome, "Paciente Teste");

  // Ouvidoria não consegue encaminhar ao gerente antes do vencimento
  await call("ouv", "post", `/api/cases/${id}/actions`, { acao: "escalar", versao: m.versao }, 409);

  await pool.query("UPDATE manifestacoes SET vencimento=now()-interval '2 hours' WHERE id=$1", [id]);
  await processAlerts(pool);
  let det0 = await call("ouv", "get", "/api/cases/" + id);
  m = det0.manifestacao;
  // Venceu: fica "Em atraso" com o gestor, sem encaminhamento automático
  assert.equal(m.status, "Em atraso");
  assert.equal(m.escalado_gerente_em, null);
  assert.equal(det0.actions.escalar, true);
  await call("gerente1", "get", "/api/cases/" + id, null, 404);
  // Painel do gerente mostra os números da área mesmo sem acesso ao caso
  assert.ok((await call("gerente1", "get", "/api/reports")).totals.total >= 1);
  let r = await call("ouv", "get", "/api/reports");
  assert.equal(r.totals.atraso_gestor, 1);
  assert.equal(r.totals.com_gerente, 0);
  assert.equal(r.totals.fora_prazo, 1);
  assert.ok(r.overdue.some((x) => x.id === id && x.gerente_nome === "Gerente Assistencial" && !x.escalado_gerente_em));
  assert.equal(r.groups.cumprimento.find((g) => g.nome === "Gestor Multissetor").sem_resposta, 1);
  // Somente a Ouvidoria encaminha
  await call("gerente1", "post", `/api/cases/${id}/actions`, { acao: "escalar", versao: m.versao }, 404);

  // Ouvidoria encaminha ao gerente → 24h
  await call("ouv", "post", `/api/cases/${id}/actions`, { acao: "escalar", versao: m.versao, justificativa: "Gestor sem retorno" });
  m = (await call("ouv", "get", "/api/cases/" + id)).manifestacao;
  assert.equal(m.status, "Com gerente");
  const hours = (new Date(m.vencimento_gerente) - new Date(m.escalado_gerente_em)) / 3600000;
  assert.ok(Math.abs(hours - 24) < 0.01);
  await call("ouv", "post", `/api/cases/${id}/actions`, { acao: "escalar", versao: m.versao }, 409);
  const notes = (await call("gerente1", "get", "/api/notifications")).items;
  assert.ok(notes.some((n) => n.manifestacao_id === id && /gerente/i.test(n.evento)));
  r = await call("ouv", "get", "/api/reports");
  assert.equal(r.totals.atraso_gestor, 0);
  assert.equal(r.totals.com_gerente, 1);

  // Gerente passa das 24h → "Gerente em atraso"
  await pool.query("UPDATE manifestacoes SET vencimento_gerente=now()-interval '1 minute' WHERE id=$1", [id]);
  await processAlerts(pool);
  m = (await call("ouv", "get", "/api/cases/" + id)).manifestacao;
  assert.equal(m.status, "Gerente em atraso");
  const dirNotes = (await call("diretor", "get", "/api/notifications")).items;
  assert.ok(dirNotes.some((n) => n.manifestacao_id === id));

  // Gerente responde → volta para validação da Ouvidoria
  const det = await call("gerente1", "get", "/api/cases/" + id);
  assert.equal(det.actions.responder_gerente, true);
  await call("gerente1", "post", `/api/cases/${id}/actions`, {
    acao: "responder_gerente",
    versao: det.manifestacao.versao,
    resposta: "Providências tomadas pela gerência.",
  });
  const done = await call("ouv", "get", "/api/cases/" + id);
  assert.equal(done.manifestacao.etapa, "validacao");
  assert.equal(done.manifestacao.status, "Em validação");
  assert.ok(done.manifestacao.resposta_gerente_em);
  assert.equal(done.respostas[0].origem, "gerente");
});

it("dados do contato ocultos não chegam ao gestor; resposta só com texto; Ouvidoria finaliza direto", async () => {
  const { id } = await call("ouv", "post", "/api/cases", {
    data_manifestacao: new Date().toISOString().slice(0, 10),
    tipo: "Reclamação",
    canal: "Telefone",
    area_id: ids.area,
    motivo_id: ids.motivo,
    setor_id: ids.setorB,
    prazo_id: ids.prazo,
    gestor_id: ids.gestor,
    relato: "Contato prefere sigilo.",
    contato_nome: "Pessoa Reservada",
    contato_telefone: "53 99999-0000",
    ocultar_contato: true,
    terceiro_confirmado: true,
    encaminhar: true,
  }, 201);
  const g = await call("gestor1", "get", "/api/cases/" + id);
  assert.equal(g.contato, undefined);
  assert.equal((await call("ouv", "get", "/api/cases/" + id)).contato.nome, "Pessoa Reservada");
  await call("gestor1", "post", `/api/cases/${id}/actions`, { acao: "responder", versao: g.manifestacao.versao, resposta: "Resolvido com a equipe." });
  let o = await call("ouv", "get", "/api/cases/" + id);
  assert.equal(o.manifestacao.etapa, "validacao");
  // Pede nova justificativa → volta ao gestor
  await call("ouv", "post", `/api/cases/${id}/actions`, { acao: "complementar", versao: o.manifestacao.versao, justificativa: "Detalhe as providências." });
  const g2 = await call("gestor1", "get", "/api/cases/" + id);
  assert.equal(g2.manifestacao.etapa, "complementacao");
  await call("gestor1", "post", `/api/cases/${id}/actions`, { acao: "responder", versao: g2.manifestacao.versao, resposta: "Equipe treinada." });
  o = await call("ouv", "get", "/api/cases/" + id);
  // Finaliza sem etapa de aprovação intermediária
  await call("ouv", "post", `/api/cases/${id}/actions`, { acao: "concluir", versao: o.manifestacao.versao, resposta: "Retorno dado ao contato." });
  assert.equal((await call("ouv", "get", "/api/cases/" + id)).manifestacao.status, "Concluído");
});

it("Direção acompanha todas as ouvidorias pelo painel", async () => {
  const list = await call("diretor", "get", "/api/cases");
  assert.ok(list.items.some((m) => m.id === ids.case));
  const r = await call("diretor", "get", "/api/reports");
  assert.ok(r.totals.total >= 1);
  assert.ok(r.groups.area.length >= 1);
  const v = (await call("diretor", "get", "/api/cases/" + ids.case)).manifestacao.versao;
  await call("diretor", "post", `/api/cases/${ids.case}/actions`, { acao: "aprovar", versao: v }, 403);
});
