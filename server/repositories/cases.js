import { HttpError } from "../middlewares/security.js";
import { parse, uuid, date } from "../validators/operations.js";
export const joins = `FROM manifestacoes m JOIN motivos mot ON mot.id=m.motivo_id JOIN areas_tecnicas a ON a.id=m.area_id JOIN gestores g ON g.id=m.gestor_id JOIN gerentes ge ON ge.id=g.gerente_id JOIN setores s ON s.id=m.setor_id JOIN prazos p ON p.id=m.prazo_id`;
export const statusSql = `CASE WHEN m.etapa='concluida' THEN 'Concluído' WHEN m.etapa IN ('encaminhada','complementacao') AND m.vencimento<now() THEN 'Em atraso' ELSE 'Em andamento' END`;
export const columns = `m.*, 'OUV-'||lpad(m.numero::text,greatest(6,length(m.numero::text)),'0') registro, a.nome area_nome,mot.nome motivo_nome,g.nome gestor_nome,s.nome setor_nome,ge.nome gerente_nome,p.tipo prazo_tipo,${statusSql} status`;
/** Filtro único aplicado ANTES da paginação e agregação; concessões não contornam conflitos. */
export function scope(user, values = []) {
  if (!user.permissoes.includes("manifestacoes.acompanhar")) return "FALSE";
  const add = (v) => {
    values.push(v);
    return "$" + values.length;
  };
  const id = add(user.id),
    ouv = add(user.perfis.includes("OUVIDORIA")),
    gestor = add(user.perfis.includes("GESTOR")),
    gerente = add(user.perfis.includes("GERENTE"));
  const grant = `EXISTS(SELECT 1 FROM autorizacoes_restritas ar WHERE ar.manifestacao_id=m.id AND ar.usuario_id=${id} AND ar.revogado_em IS NULL)`;
  return `NOT mot.bloqueado AND NOT EXISTS(SELECT 1 FROM conflitos_manifestacao cf WHERE cf.manifestacao_id=m.id AND cf.usuario_id=${id})
 AND (NOT(m.restrito OR mot.restrito) OR ${grant})
 AND ((m.etapa='rascunho' AND ${ouv} AND m.criado_por=${id}) OR (m.etapa<>'rascunho' AND (${ouv} OR (${gestor} AND g.usuario_id=${id} AND g.ativo) OR (${gerente} AND ge.usuario_id=${id} AND ge.ativo) OR ${grant})))`;
}
export function filter(user, q = {}) {
  const values = [],
    where = [scope(user, values)];
  const add = (sql, v) => {
    values.push(v);
    where.push(sql.replace("?", `$${values.length}`));
  };
  if (q.inicio) add("m.data_manifestacao>=?", parse(date, q.inicio));
  if (q.fim) add("m.data_manifestacao<=?", parse(date, q.fim));
  for (const [key, col] of Object.entries({
    tipo: "m.tipo",
    canal: "m.canal",
    area_id: "m.area_id",
    motivo_id: "m.motivo_id",
    gestor_id: "m.gestor_id",
    gerente_id: "ge.id",
    prazo_id: "m.prazo_id",
  }))
    if (q[key])
      add(
        `${col}=?`,
        key.endsWith("_id") ? parse(uuid, q[key]) : String(q[key]).slice(0, 80),
      );
  if (q.status) add(`${statusSql}=?`, String(q.status));
  if (q.busca) {
    const term = String(q.busca).slice(0, 160);
    values.push("%" + term + "%");
    const param = "$" + values.length;
    where.push(
      `('OUV-'||lpad(m.numero::text,greatest(6,length(m.numero::text)),'0') ILIKE ${param}${user.perfis.includes("OUVIDORIA") ? ` OR EXISTS(SELECT 1 FROM contatos_manifestacao c WHERE c.manifestacao_id=m.id AND c.nome ILIKE ${param})` : ""})`,
    );
  }
  if (q.prazo === "proximo")
    where.push(
      "m.etapa IN ('encaminhada','complementacao') AND m.vencimento BETWEEN now() AND now()+interval '24 hours'",
    );
  if (q.prazo === "vencido")
    where.push(
      "m.etapa IN ('encaminhada','complementacao') AND m.vencimento<now()",
    );
  return { values, sql: where.join(" AND ") };
}
export async function getCase(db, user, id, lock = false) {
  parse(uuid, id);
  const values = [id];
  const access = scope(user, values);
  const { rows } = await db.query(
    `SELECT ${columns} ${joins} WHERE m.id=$1 AND ${access}${lock ? " FOR UPDATE OF m" : ""}`,
    values,
  );
  if (!rows[0])
    throw new HttpError(404, "Manifestação não encontrada ou não autorizada.");
  return rows[0];
}
export function assertOuvidoria(user, permission) {
  if (
    !user.perfis.includes("OUVIDORIA") ||
    !user.permissoes.includes(permission)
  )
    throw new HttpError(403, "Ação exclusiva da Ouvidoria autorizada.");
}
