import test from "node:test";
import assert from "node:assert/strict";
import {
  canAccessCase,
  canCreateCase,
} from "../server/services/authorization.js";
import { readConfig } from "../server/config/env.js";

const user = (role) => ({
  id: "user1",
  ativo: true,
  perfis: [role],
  permissoes: role === "OUVIDORIA" ? ["manifestacoes.criar"] : [],
});
const record = {
  id: "case1",
  stage: "sent",
  createdBy: "other",
  managerUserId: "other",
  restricted: false,
};
for (const role of ["MASTER", "GESTOR", "GERENTE", "DIRECAO"]) {
  test(`${role} não pode abrir manifestação`, () =>
    assert.equal(canCreateCase(user(role), {}), false));
}
test("Ouvidoria pode registrar terceiro, nunca a si própria", () => {
  assert.equal(
    canCreateCase(user("OUVIDORIA"), { contactUserId: "other" }),
    true,
  );
  assert.equal(
    canCreateCase(user("OUVIDORIA"), { contactUserId: "user1" }),
    false,
  );
  assert.equal(
    canCreateCase(user("OUVIDORIA"), { conflictUserIds: ["user1"] }),
    false,
  );
});
test("categoria sem homologação permanece bloqueada", () => {
  assert.equal(
    canCreateCase(user("OUVIDORIA"), { operationalBlocked: true }),
    false,
  );
  assert.equal(
    canAccessCase(user("OUVIDORIA"), { ...record, operationalBlocked: true }),
    false,
  );
});
test("conhecer UUID não concede acesso", () => {
  for (const role of ["MASTER", "GESTOR", "GERENTE", "DIRECAO"])
    assert.equal(canAccessCase(user(role), record), false);
});
test("gestor só acessa atribuição e não vê rascunhos", () => {
  assert.equal(
    canAccessCase(user("GESTOR"), { ...record, managerUserId: "user1" }),
    true,
  );
  assert.equal(
    canAccessCase(user("GESTOR"), {
      ...record,
      managerUserId: "user1",
      stage: "draft",
    }),
    false,
  );
});
test("sigilo exige autorização individual, mesmo para Ouvidoria e Master", () => {
  const restricted = { ...record, restricted: true };
  for (const role of ["MASTER", "OUVIDORIA", "GESTOR", "GERENTE", "DIRECAO"])
    assert.equal(canAccessCase(user(role), restricted), false);
  const grants = [{ userId: "user1", caseId: "case1" }];
  assert.equal(canAccessCase(user("DIRECAO"), restricted, grants), true);
  assert.equal(
    canAccessCase(user("DIRECAO"), restricted, [
      { ...grants[0], revoked: true },
    ]),
    false,
  );
  assert.equal(
    canAccessCase(
      user("DIRECAO"),
      { ...restricted, conflictUserIds: ["user1"] },
      grants,
    ),
    false,
  );
});
test("gerente somente acompanha subordinados e inativo é negado", () => {
  assert.equal(
    canAccessCase(user("GERENTE"), { ...record, supervisorUserId: "user1" }),
    true,
  );
  assert.equal(
    canAccessCase({ ...user("OUVIDORIA"), ativo: false }, record),
    false,
  );
});
test("configuração rejeita segredo padrão e HTTP em produção", () => {
  const env = {
    DATABASE_URL: "postgresql://localhost/sio",
    APP_ORIGIN: "http://localhost:5173",
    SESSION_SECRET: "x".repeat(64),
  };
  assert.equal(readConfig(env).PORT, 3000);
  assert.throws(() => readConfig({ ...env, SESSION_SECRET: "CHANGE_ME" }));
  assert.throws(() => readConfig({ ...env, NODE_ENV: "production" }));
});
