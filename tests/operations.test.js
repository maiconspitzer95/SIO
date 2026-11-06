import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import request from "supertest";
import ExcelJS from "exceljs";
import { createPool } from "../server/config/database.js";
import { createApp } from "../server/app.js";
import { migrate } from "../server/services/migrations.js";
import { hashPassword } from "../server/services/passwords.js";
import { deadline } from "../server/services/deadlines.js";
import { processAlerts } from "../server/services/alerts.js";
test("prazos corridos, úteis com feriado e 24 horas judiciais", () => {
  const p = {
      aprovado: true,
      ativo: true,
      quantidade: 5,
      unidade: "dias",
      dias_uteis: false,
      feriados: [],
    },
    start = new Date("2026-11-06T13:00:00Z");
  assert.equal(deadline(start, p).toISOString(), "2026-11-11T13:00:00.000Z");
  assert.equal(
    deadline(start, {
      ...p,
      dias_uteis: true,
      feriados: ["2026-11-09"],
    }).toISOString(),
    "2026-11-16T13:00:00.000Z",
  );
  assert.equal(
    deadline(start, {
      ...p,
      quantidade: 24,
      unidade: "horas",
      continuo: true,
    }).toISOString(),
    "2026-11-07T13:00:00.000Z",
  );
  assert.throws(() => deadline(start, { ...p, aprovado: false }), /aprovar/);
  assert.throws(
    () => deadline(start, { ...p, unidade: "horas", continuo: false }),
    /Homologue/,
  );
});
const enabled = !!process.env.TEST_DATABASE_URL,
  it = (n, f) => test(n, { skip: !enabled }, f);
const config = {
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  STORAGE_PATH: process.env.TEST_STORAGE_PATH,
  ssl: false,
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5004",
  SESSION_SECRET: randomBytes(48).toString("hex"),
  SESSION_IDLE_MINUTES: 30,
  SESSION_ABSOLUTE_HOURS: 8,
  TRUST_PROXY: "0",
};
const password = randomBytes(24).toString("hex");
let pool,
  app,
  users = {},
  sessions = {},
  area,
  setor,
  motive,
  blocked,
  manager,
  manager2,
  supervisor,
  policy,
  base,
  caseId,
  draftId,
  restrictedId;
async function call(role, method, path, body, expected = 200) {
  const s = sessions[role],
    r = s.agent[method](path);
  if (method !== "get")
    r.set("Origin", config.APP_ORIGIN).set("X-CSRF-Token", s.csrf);
  if (body) r.send(body);
  const result = await r;
  assert.equal(
    result.status,
    expected,
    `${method} ${path}: ${JSON.stringify(result.body)}`,
  );
  return result.body;
}
async function action(role, id, acao, extra = {}, expected = 200) {
  const d = await call(role, "get", "/api/cases/" + id);
  return call(
    role,
    "post",
    `/api/cases/${id}/actions`,
    { acao, versao: d.manifestacao.versao, ...extra },
    expected,
  );
}
before(async () => {
  if (!enabled) return;
  pool = createPool(config);
  await migrate(pool);
  await pool.query("DELETE FROM limites_acesso");
  const hash = await hashPassword(password);
  for (const [key, role] of Object.entries({
    admin: "MASTER",
    ouv: "OUVIDORIA",
    gestor: "GESTOR",
    outro: "GESTOR",
    gerente: "GERENTE",
    direcao: "DIRECAO",
    ouv2: "OUVIDORIA",
  })) {
    users[key] = (
      await pool.query(
        "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$2,$3,$4) RETURNING id",
        [`Operação ${key}`, "ops_" + key, `ops_${key}@example.invalid`, hash],
      )
    ).rows[0].id;
    await pool.query(
      "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo=$2",
      [users[key], role],
    );
  }
  app = await createApp(pool, config);
  for (const key of Object.keys(users)) {
    const agent = request.agent(app),
      token = (await agent.get("/api/auth/csrf")).body.csrfToken;
    const login = await agent
      .post("/api/auth/login")
      .set("Origin", config.APP_ORIGIN)
      .set("X-CSRF-Token", token)
      .send({ login: "ops_" + key, senha: password })
      .expect(200);
    sessions[key] = { agent, csrf: login.body.csrfToken };
  }
});
after(async () => {
  if (pool) await pool.end();
});
it("cadastros persistem, vínculos são validados e apenas Master administra", async () => {
  area = (await call("admin", "get", "/api/catalogs/areas_tecnicas")).items[0]
    .id;
  setor = (
    await call(
      "admin",
      "post",
      "/api/catalogs/setores",
      { nome: "Setor de teste", area_id: area },
      201,
    )
  ).id;
  motive = (
    await call(
      "admin",
      "post",
      "/api/catalogs/motivos",
      { nome: "Qualidade de atendimento", area_id: area },
      201,
    )
  ).id;
  blocked = await call(
    "admin",
    "post",
    "/api/catalogs/motivos",
    { nome: "Assédio e violência", area_id: area },
    201,
  );
  assert.equal(blocked.bloqueado, true);
  supervisor = (
    await call(
      "admin",
      "post",
      "/api/catalogs/gerentes",
      { nome: "Gerência de teste", usuario_id: users.gerente, area_id: area },
      201,
    )
  ).id;
  manager = (
    await call(
      "admin",
      "post",
      "/api/catalogs/gestores",
      {
        nome: "Gestor de teste",
        usuario_id: users.gestor,
        area_id: area,
        setor_id: setor,
        gerente_id: supervisor,
      },
      201,
    )
  ).id;
  manager2 = (
    await call(
      "admin",
      "post",
      "/api/catalogs/gestores",
      {
        nome: "Outro gestor",
        usuario_id: users.outro,
        area_id: area,
        setor_id: setor,
        gerente_id: supervisor,
      },
      201,
    )
  ).id;
  await call(
    "gestor",
    "post",
    "/api/catalogs/motivos",
    { nome: "Proibido", area_id: area },
    403,
  );
  await call(
    "admin",
    "post",
    "/api/catalogs/gestores",
    {
      nome: "Inválido",
      usuario_id: users.direcao,
      area_id: area,
      setor_id: setor,
      gerente_id: supervisor,
    },
    400,
  );
  const l = await call("ouv", "get", "/api/catalogs/lookups");
  assert.ok(l.motivos.some((m) => m.id === motive && m.area_id === area));
  policy = l.prazos.find((p) => p.tipo === "Geral");
  base = {
    data_manifestacao: "2026-11-05",
    tipo: "Reclamação",
    canal: "Pessoal",
    area_id: area,
    motivo_id: motive,
    setor_id: setor,
    prazo_id: policy.id,
    gestor_id: manager,
    relato: "Relato de terceiro.",
    contato_nome: "Contato de teste",
    terceiro_confirmado: true,
  };
});
it("abertura exclusiva da Ouvidoria; impede anonimato, conflito e categorias bloqueadas", async () => {
  for (const role of ["admin", "gestor", "gerente", "direcao"])
    await call(role, "post", "/api/cases", base, 403);
  await call("ouv", "post", "/api/cases", { ...base, contato_nome: "" }, 400);
  await call(
    "ouv",
    "post",
    "/api/cases",
    { ...base, contato_usuario_id: users.ouv },
    403,
  );
  await call(
    "ouv",
    "post",
    "/api/cases",
    { ...base, contato_nome: "Operação ouv" },
    403,
  );
  await call(
    "ouv",
    "post",
    "/api/cases",
    { ...base, conflitos: [users.gestor] },
    409,
  );
  await call(
    "ouv",
    "post",
    "/api/cases",
    { ...base, motivo_id: blocked.id },
    409,
  );
  const changed = await call(
    "admin",
    "put",
    "/api/catalogs/motivos/" + blocked.id,
    { nome: "Outro nome", area_id: area, restrito: false, bloqueado: false },
  );
  assert.equal(changed.bloqueado, true);
});
it("rascunho é privado e encaminhamento exige prazo aprovado", async () => {
  draftId = (await call("ouv", "post", "/api/cases", base, 201)).id;
  await call("gestor", "get", "/api/cases/" + draftId, null, 404);
  await call("ouv2", "get", "/api/cases/" + draftId, null, 404);
  await action("ouv", draftId, "encaminhar", {}, 409);
  const { id, ...p } = policy;
  await call("admin", "put", "/api/catalogs/prazos/" + id, {
    ...p,
    aprovado: true,
    dias_uteis: true,
    feriados: [],
  });
  await action("ouv", draftId, "encaminhar");
  const d = await call("gestor", "get", "/api/cases/" + draftId);
  assert.equal(d.manifestacao.etapa, "encaminhada");
  assert.equal(d.contato, undefined);
});
it("numeração PostgreSQL é única em gravações concorrentes", async () => {
  const result = await Promise.all(
    Array.from({ length: 4 }, () =>
      call("ouv", "post", "/api/cases", base, 201),
    ),
  );
  const rows = (
    await pool.query(
      "SELECT numero FROM manifestacoes WHERE id=ANY($1::uuid[])",
      [result.map((x) => x.id)],
    )
  ).rows;
  assert.equal(new Set(rows.map((x) => x.numero)).size, 4);
  caseId = (
    await call("ouv", "post", "/api/cases", { ...base, encaminhar: true }, 201)
  ).id;
});
it("conhecer ID não concede acesso; gerência acompanha subordinados e Direção exige autorização", async () => {
  for (const role of ["outro", "admin", "direcao"])
    await call(role, "get", "/api/cases/" + caseId, null, 404);
  await call("gerente", "get", "/api/cases/" + caseId);
  await action("ouv", caseId, "autorizar", {
    usuario_id: users.direcao,
    justificativa: "Discussão autorizada",
  });
  await call("direcao", "get", "/api/cases/" + caseId);
  await action("ouv", caseId, "revogar", {
    usuario_id: users.direcao,
    justificativa: "Fim da autorização",
  });
  await call("direcao", "get", "/api/cases/" + caseId, null, 404);
});
it("edição exige justificativa e versão; preserva dados anteriores", async () => {
  const m = (await call("ouv", "get", "/api/cases/" + caseId)).manifestacao;
  await call(
    "ouv",
    "put",
    "/api/cases/" + caseId,
    { ...base, versao: m.versao },
    400,
  );
  await call("ouv", "put", "/api/cases/" + caseId, {
    ...base,
    relato: "Relato corrigido.",
    versao: m.versao,
    justificativa: "Correção solicitada",
  });
  await call(
    "ouv",
    "put",
    "/api/cases/" + caseId,
    { ...base, versao: m.versao, justificativa: "Versão antiga" },
    409,
  );
  const d = await call("ouv", "get", "/api/cases/" + caseId);
  assert.equal(
    d.historico_manifestacoes.find((h) => h.evento === "edicao").dados.anterior
      .relato,
    base.relato,
  );
});
it("troca de gestor preserva vencimento e remove acesso anterior", async () => {
  const before = (await call("ouv", "get", "/api/cases/" + caseId))
    .manifestacao;
  await action("ouv", caseId, "trocar", {
    gestor_id: manager2,
    justificativa: "Redistribuição",
  });
  const after = (await call("ouv", "get", "/api/cases/" + caseId)).manifestacao;
  assert.equal(before.vencimento, after.vencimento);
  assert.equal(before.enviado_em, after.enviado_em);
  await call("gestor", "get", "/api/cases/" + caseId, null, 404);
  await call("outro", "get", "/api/cases/" + caseId);
});
it("anexo valida conteúdo real e protege downloads", async () => {
  const s = sessions.outro,
    path = `/api/cases/${caseId}/attachments`;
  await s.agent
    .post(path)
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", s.csrf)
    .attach("arquivo", Buffer.from("<script>x</script>"), "falso.pdf")
    .expect(400);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC5kAAAAASUVORK5CYII=",
    "base64",
  );
  const a = await s.agent
    .post(path)
    .set("Origin", config.APP_ORIGIN)
    .set("X-CSRF-Token", s.csrf)
    .attach("arquivo", png, "evidencia.png")
    .expect(201);
  await sessions.admin.agent.get(path + "/" + a.body.id).expect(404);
  const download = await s.agent.get(path + "/" + a.body.id).expect(200);
  assert.match(download.headers["content-disposition"], /attachment/);
  assert.deepEqual(download.body, png);
});
it("resposta, complementação, aprovação, discussão e conclusão preservam versões", async () => {
  await action(
    "ouv",
    caseId,
    "concluir",
    { resposta: "Teste", procedimento: "Teste" },
    409,
  );
  await action("outro", caseId, "responder", {
    analise: "Análise inicial",
    providencias: "Ação inicial",
    resposta: "Resposta inicial",
  });
  await action("ouv", caseId, "complementar", {
    justificativa: "Detalhar ação",
  });
  await action("outro", caseId, "responder", {
    analise: "Complementação",
    providencias: "Nova providência",
    resposta: "Resposta completa",
  });
  await action("ouv", caseId, "aprovar");
  await action("ouv", caseId, "discutir", {
    data: "2026-11-05",
    participantes: "Direção e Ouvidoria",
    justificativa: "Discussão registrada",
  });
  await action(
    "outro",
    caseId,
    "concluir",
    { resposta: "Teste", procedimento: "Teste" },
    403,
  );
  await action("ouv", caseId, "concluir", {
    resposta: "Retorno institucional",
    procedimento: "Contato telefônico realizado",
  });
  const d = await call("ouv", "get", "/api/cases/" + caseId);
  assert.equal(d.manifestacao.status, "Concluído");
  assert.equal(d.respostas.length, 2);
  assert.ok(d.manifestacao.respondido_em);
  assert.equal(d.discussoes_direcao.length, 1);
  await assert.rejects(
    pool.query("DELETE FROM manifestacoes WHERE id=$1", [caseId]),
    /imutável/,
  );
  await assert.rejects(
    pool.query("UPDATE respostas SET resposta=$1 WHERE manifestacao_id=$2", [
      "apagar",
      caseId,
    ]),
    /imutável/,
  );
});
it("alertas não duplicam sob concorrência e notificam o gerente", async () => {
  await pool.query(
    "UPDATE manifestacoes SET vencimento=now()-interval '1 hour' WHERE id=$1",
    [draftId],
  );
  await Promise.all([processAlerts(pool), processAlerts(pool)]);
  await processAlerts(pool);
  assert.equal(
    (
      await pool.query(
        "SELECT * FROM alertas WHERE manifestacao_id=$1 AND evento='vencido'",
        [draftId],
      )
    ).rowCount,
    1,
  );
  const d = (await call("ouv", "get", "/api/cases/" + draftId)).manifestacao;
  assert.equal(d.status, "Em atraso");
  assert.ok(d.alerta_gerente_em);
  const n = await call("gerente", "get", "/api/notifications"),
    notice = n.items.find((n) => n.manifestacao_id === draftId);
  assert.ok(notice);
  await call("gerente", "post", `/api/notifications/${notice.id}/read`);
  assert.equal(
    (await call("gerente", "get", "/api/notifications")).unread,
    n.unread - 1,
  );
});
it("denúncia restrita não vaza por lista, notificações ou indicadores", async () => {
  restrictedId = (
    await call(
      "ouv",
      "post",
      "/api/cases",
      {
        ...base,
        tipo: "Denúncia",
        relato: "Conteúdo restrito exclusivo",
        encaminhar: true,
      },
      201,
    )
  ).id;
  for (const role of ["admin", "gerente", "direcao", "ouv2", "outro"])
    await call(role, "get", "/api/cases/" + restrictedId, null, 404);
  await call("gestor", "get", "/api/cases/" + restrictedId);
  assert.ok(
    !(await call("gerente", "get", "/api/cases")).items.some(
      (m) => m.id === restrictedId,
    ),
  );
  await pool.query(
    "UPDATE manifestacoes SET vencimento=now()-interval '1 hour' WHERE id=$1",
    [restrictedId],
  );
  await processAlerts(pool);
  assert.ok(
    !(await call("gerente", "get", "/api/notifications")).items.some(
      (n) => n.manifestacao_id === restrictedId,
    ),
  );
  assert.equal(
    (await call("gerente", "get", "/api/reports?tipo=Den%C3%BAncia")).totals
      .total,
    0,
  );
  await call("admin", "get", "/api/reports", null, 403);
});
it("relatórios por período e exportações PDF/Excel preservam o escopo", async () => {
  const d = await call(
    "ouv",
    "get",
    "/api/reports?inicio=2026-11-05&fim=2026-11-05",
  );
  assert.ok(d.totals.total >= 7);
  assert.equal(d.totals.concluidas, 1);
  assert.equal(d.totals.discutidas, 1);
  assert.equal(
    (await call("ouv", "get", "/api/reports?inicio=2000-01-01&fim=2000-01-02"))
      .totals.total,
    0,
  );
  const binary = (res, cb) => {
    const chunks = [];
    res.on("data", (x) => chunks.push(x));
    res.on("end", () => cb(null, Buffer.concat(chunks)));
  };
  const pdf = await sessions.ouv.agent
    .get("/api/reports/export/pdf")
    .buffer(true)
    .parse(binary)
    .expect(200);
  assert.equal(pdf.body.subarray(0, 4).toString(), "%PDF");
  const xlsx = await sessions.gerente.agent
    .get("/api/reports/export/xlsx")
    .buffer(true)
    .parse(binary)
    .expect(200);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(xlsx.body);
  const cells = JSON.stringify(book.getWorksheet(1).getSheetValues());
  assert.ok(!cells.includes("Conteúdo restrito exclusivo"));
  assert.ok(cells.includes("Retorno institucional"));
});
it("gestão de usuários impede autoelevação e permite inativação", async () => {
  const u = await call(
    "admin",
    "post",
    "/api/catalogs/users",
    {
      nome: "Novo usuário",
      login: "novo_usuario",
      email: "novo@example.invalid",
      senha: password,
      perfis: ["GESTOR"],
    },
    201,
  );
  await call(
    "admin",
    "put",
    "/api/catalogs/users/" + users.admin,
    {
      nome: "Autoelevação",
      login: "ops_admin",
      email: "ops_admin@example.invalid",
      perfis: ["MASTER", "OUVIDORIA"],
    },
    403,
  );
  await call("admin", "put", "/api/catalogs/users/" + u.id, {
    nome: "Novo usuário",
    login: "novo_usuario",
    email: "novo@example.invalid",
    perfis: ["GESTOR"],
    ativo: false,
  });
  assert.equal(
    (await pool.query("SELECT ativo FROM usuarios WHERE id=$1", [u.id])).rows[0]
      .ativo,
    false,
  );
});
it("permissões configuráveis mantêm limites dos perfis e revogam sessões afetadas", async () => {
  await call(
    "admin",
    "put",
    "/api/admin/roles/GESTOR",
    { permissoes: ["manifestacoes.criar"] },
    403,
  );
  const profiles = (await call("admin", "get", "/api/admin/roles")).items;
  const director = profiles.find((p) => p.codigo === "DIRECAO");
  await call("admin", "put", "/api/admin/roles/DIRECAO", {
    permissoes: ["manifestacoes.acompanhar"],
  });
  await call("direcao", "get", "/api/auth/me", null, 401);
  await call("admin", "put", "/api/admin/roles/DIRECAO", {
    permissoes: director.permissoes,
  });
});
it("providência gerencial exige autorização e não encerra o fluxo", async () => {
  await action(
    "gerente",
    draftId,
    "providenciar",
    { resposta: "Providência" },
    403,
  );
  await action("ouv", draftId, "autorizar", {
    usuario_id: users.gerente,
    justificativa: "Providência gerencial autorizada",
  });
  await action("gerente", draftId, "providenciar", {
    resposta: "Providência de acompanhamento",
  });
  assert.equal(
    (await call("ouv", "get", "/api/cases/" + draftId)).manifestacao.etapa,
    "encaminhada",
  );
});
it("conclusão tardia permanece identificada e resposta tardia gera alerta após reinício", async () => {
  await action("gestor", draftId, "responder", {
    analise: "Análise tardia",
    resposta: "Resposta tardia",
  });
  await action("ouv", draftId, "aprovar");
  await action("ouv", draftId, "concluir", {
    resposta: "Devolutiva",
    procedimento: "Retorno pessoal",
  });
  const m = (await call("ouv", "get", "/api/cases/" + draftId)).manifestacao;
  assert.equal(m.status, "Concluído");
  assert.equal(m.concluido_atraso, true);
  await processAlerts(pool);
  assert.equal(
    (
      await pool.query(
        "SELECT * FROM alertas WHERE manifestacao_id=$1 AND evento='vencido'",
        [draftId],
      )
    ).rowCount,
    1,
  );
});
