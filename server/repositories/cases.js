import { HttpError } from "../middlewares/security.js";
import { parse, uuid, date } from "../validators/operations.js";
export const joins = `FROM manifestacoes m JOIN motivos mot ON mot.id=m.motivo_id JOIN areas_tecnicas a ON a.id=m.area_id JOIN gestores g ON g.id=m.gestor_id JOIN gerentes ge ON ge.id=g.gerente_id JOIN setores s ON s.id=m.setor_id JOIN prazos p ON p.id=m.prazo_id`;
/** Prazo do gerente: 24h após a Ouvidoria encaminhar o caso atrasado a ele. */
export const gerenteDeadlineSql = `m.vencimento_gerente`;
export const statusSql = `CASE WHEN m.etapa='concluida' THEN 'Concluído' WHEN m.etapa='rascunho' THEN 'Rascunho' WHEN m.etapa IN ('encaminhada','complementacao') AND m.escalado_gerente_em IS NOT NULL AND m.vencimento_gerente<now() THEN 'Gerente em atraso' WHEN m.etapa IN ('encaminhada','complementacao') AND m.escalado_gerente_em IS NOT NULL THEN 'Com gerente' WHEN m.etapa IN ('encaminhada','complementacao') AND m.vencimento<now() THEN 'Em atraso' WHEN m.etapa IN ('validacao','aprovada') THEN 'Em validação' ELSE 'Em andamento' END`;
export const columns = `m.*, 'OUV-'||lpad(m.numero::text,greatest(6,length(m.numero::text)),'0') registro, a.nome area_nome,mot.nome motivo_nome,g.nome gestor_nome,s.nome setor_nome,ge.nome gerente_nome,p.tipo prazo_tipo,p.nome prazo_nome,ge.email gerente_email,g.email gestor_email,${gerenteDeadlineSql} prazo_gerente,${statusSql} status`;
/** Filtro único aplicado ANTES da paginação e agregação; concessões não contornam conflitos. */
export function scope(user, values = [], { aggregate = false } = {}) {
  if (!user.permissoes.includes("manifestacoes.acompanhar")) return "FALSE";
  const all = user.permissoes.includes("manifestacoes.acompanhar_todas");
  const add = (v) => {
    values.push(v);
    return "$" + values.length;
  };
  const id = add(user.id),
    ouv = add(user.perfis.includes("OUVIDORIA")),
    gestor = add(user.perfis.includes("GESTOR")),
    gerente = add(user.perfis.includes("GERENTE"));
  // Gerente: na listagem/detalhe só vê o que a Ouvidoria encaminhou a ele;
  // nos indicadores (aggregate) enxerga os números da sua área.
  const gerenteScope = aggregate
    ? `((ge.usuario_id=${id} AND ge.ativo) OR m.area_id IN (SELECT area_id FROM gerentes WHERE usuario_id=${id} AND ativo AND area_id IS NOT NULL))`
    : `(ge.usuario_id=${id} AND ge.ativo AND m.escalado_gerente_em IS NOT NULL)`;
  const grant = `EXISTS(SELECT 1 FROM autorizacoes_restritas ar WHERE ar.manifestacao_id=m.id AND ar.usuario_id=${id} AND ar.revogado_em IS NULL)`;
  return `NOT mot.bloqueado AND NOT EXISTS(SELECT 1 FROM conflitos_manifestacao cf WHERE cf.manifestacao_id=m.id AND cf.usuario_id=${id})
 AND (NOT(m.restrito OR mot.restrito) OR ${grant}${aggregate && all ? " OR TRUE" : ""})
 AND ((m.etapa='rascunho' AND ${ouv} AND m.criado_por=${id}) OR (m.etapa<>'rascunho' AND (${ouv}${all ? " OR TRUE" : ""} OR (${gestor} AND g.usuario_id=${id} AND g.ativo) OR (${gerente} AND ${gerenteScope}) OR ${grant})))`;
}
export function filter(user, q = {}, options = {}) {
  const values = [],
    where = [scope(user, values, options)];
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
  if (q.status === "Atrasadas")
    where.push(`${statusSql} IN ('Em atraso','Com gerente','Gerente em atraso')`);
  else if (q.status) add(`${statusSql}=?`, String(q.status).slice(0, 40));
  if (q.setor_id) add("m.setor_id=?", parse(uuid, q.setor_id));
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
  if (q.prazo === "gerente")
    where.push(
      "m.etapa IN ('encaminhada','complementacao') AND m.escalado_gerente_em IS NOT NULL",
    );
  if (q.prazo === "fora")
    where.push(
      "((m.resposta_gestor_em IS NOT NULL AND m.resposta_gestor_em>m.vencimento) OR (m.resposta_gestor_em IS NULL AND m.etapa IN ('encaminhada','complementacao') AND m.vencimento<now()))",
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
