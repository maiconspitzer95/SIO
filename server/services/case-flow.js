import { HttpError } from "../middlewares/security.js";
import { deadline } from "./deadlines.js";
import { history, notify, operationalUsers } from "./case-events.js";

export async function validateReferences(db, d, user) {
  if (
    d.tipo === "Denúncia" &&
    /assedio|violencia/i.test(
      d.relato.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    )
  )
    throw new HttpError(
      409,
      "Denúncias de assédio ou violência aguardam homologação institucional e não podem ser operacionalizadas.",
    );
  const motive = (
    await db.query(
      "SELECT * FROM motivos WHERE id=$1 AND area_id=$2 AND ativo",
      [d.motivo_id, d.area_id],
    )
  ).rows[0];
  if (!motive || motive.bloqueado)
    throw new HttpError(
      409,
      "Motivo indisponível ou bloqueado até homologação institucional.",
    );
  if (
    !(
      await db.query("SELECT id FROM areas_tecnicas WHERE id=$1 AND ativo", [
        d.area_id,
      ])
    ).rowCount
  )
    throw new HttpError(400, "Área inativa.");
  if (
    !(
      await db.query(
        "SELECT id FROM setores WHERE id=$1 AND area_id=$2 AND ativo",
        [d.setor_id, d.area_id],
      )
    ).rowCount
  )
    throw new HttpError(400, "Local inválido para esta área.");
  const gestor = await validManager(db, d.gestor_id, d.area_id);
  if (
    !(
      await db.query("SELECT id FROM prazos WHERE id=$1 AND ativo", [
        d.prazo_id,
      ])
    ).rowCount
  )
    throw new HttpError(400, "Prazo inativo.");
  const normalized = (v) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  if (
    d.contato_usuario_id === user.id ||
    normalized(d.contato_nome) === normalized(user.nome) ||
    (d.contato_email &&
      normalized(d.contato_email) === normalized(user.email)) ||
    d.conflitos.includes(user.id)
  )
    throw new HttpError(
      403,
      "Não é permitido registrar manifestação própria ou com conflito de interesses.",
    );
  if (
    (d.canal === "E-mail" && !d.contato_email) ||
    (d.canal === "Telefone" && !d.contato_telefone)
  )
    throw new HttpError(
      400,
      "Informe o contato correspondente ao canal selecionado.",
    );
  const matched = (
    await db.query(
      "SELECT id FROM usuarios WHERE lower(email)=lower($1) OR id=$2 OR lower(trim(nome))=lower(trim($3))",
      [d.contato_email || "__none__", d.contato_usuario_id, d.contato_nome],
    )
  ).rows.map((x) => x.id);
  const conflicts = [...new Set([...d.conflitos, ...matched])];
  if (gestor.usuario_id && conflicts.includes(gestor.usuario_id))
    throw new HttpError(
      409,
      "O gestor selecionado possui conflito de interesses.",
    );
  return { restricted: motive.restrito || d.tipo === "Denúncia", conflicts };
}
export async function validManager(db, id, area) {
  const row = (
    await db.query(
      `SELECT g.*, ge.nome as gerente_nome, ge.ativo as gerente_ativo
       FROM gestores g
       JOIN gerentes ge ON ge.id=g.gerente_id
       LEFT JOIN usuarios u ON u.id=g.usuario_id
       LEFT JOIN usuarios gu ON gu.id=ge.usuario_id
       WHERE g.id=$1 AND g.area_id=$2 AND g.ativo AND ge.ativo
         AND (g.usuario_id IS NULL OR (u.ativo AND EXISTS(SELECT 1 FROM usuario_perfis up JOIN perfis p ON p.id=up.perfil_id WHERE up.usuario_id=u.id AND p.codigo='GESTOR')))`,
      [id, area],
    )
  ).rows[0];
  if (!row)
    throw new HttpError(409, "Gestor ou gerente indisponível para esta área.");
  return row;
}
export async function forward(
  db,
  m,
  user,
  justification,
  managerId = m.gestor_id,
) {
  const g = await validManager(db, managerId, m.area_id);
  if (
    g.usuario_id &&
    (
      await db.query(
        "SELECT 1 FROM conflitos_manifestacao WHERE manifestacao_id=$1 AND usuario_id=$2",
        [m.id, g.usuario_id],
      )
    ).rowCount
  )
    throw new HttpError(409, "Gestor em conflito de interesses.");
  const policy =
    m.prazo_snapshot ||
    (await db.query("SELECT * FROM prazos WHERE id=$1", [m.prazo_id])).rows[0];
  const due = m.vencimento || deadline(new Date(), policy);
  await db.query(
    "UPDATE manifestacoes SET gestor_id=$1,enviado_em=COALESCE(enviado_em,now()),vencimento=$2,prazo_snapshot=$3,etapa='encaminhada',resposta_gestor_em=NULL,versao=versao+1,atualizado_em=now() WHERE id=$4",
    [g.id, due, JSON.stringify(policy), m.id],
  );
  await db.query(
    "INSERT INTO encaminhamentos(manifestacao_id,gestor_id,setor_id,enviado_por,vencimento,justificativa,prazo_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      m.id,
      g.id,
      g.setor_id,
      user.id,
      due,
      justification,
      JSON.stringify(policy),
    ],
  );
  if (m.restrito && g.usuario_id)
    await db.query(
      `INSERT INTO autorizacoes_restritas(manifestacao_id,usuario_id,concedido_por,justificativa) VALUES($1,$2,$3,$4) ON CONFLICT(manifestacao_id,usuario_id) DO UPDATE SET revogado_em=NULL,concedido_por=excluded.concedido_por,justificativa=excluded.justificativa`,
      [
        m.id,
        g.usuario_id,
        user.id,
        "Atribuição pela Ouvidoria: " + justification,
      ],
    );
  if (managerId !== m.gestor_id) {
    const old = (
      await db.query("SELECT usuario_id FROM gestores WHERE id=$1", [
        m.gestor_id,
      ])
    ).rows[0];
    if (old?.usuario_id) {
      await db.query(
        "UPDATE autorizacoes_restritas SET revogado_em=now() WHERE manifestacao_id=$1 AND usuario_id=$2",
        [m.id, old.usuario_id],
      );
    }
  }
  await history(db, m.id, user.id, "encaminhamento", {
    gestor_id: g.id,
    vencimento: due,
    justificativa: justification,
  });
  await notify(
    db,
    m.id,
    [g.usuario_id],
    "Novo encaminhamento",
    `${m.id}:envio:${m.versao}`,
  );
}
export async function notifyOuvidoria(db, id, event, key) {
  await notify(db, id, await operationalUsers(db), event, key);
}
