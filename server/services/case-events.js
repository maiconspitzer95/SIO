import { audit } from "./audit.js";
export async function history(db, id, user, event, data = {}) {
  await db.query(
    "INSERT INTO historico_manifestacoes(manifestacao_id,autor_id,evento,dados) VALUES($1,$2,$3,$4)",
    [id, user, event, JSON.stringify(data)],
  );
  await audit(db, {
    actor: user,
    event: `manifestacao.${event}`,
    entity: "manifestacoes",
    entityId: id,
  });
}
export async function notify(db, id, users, event, key) {
  await db.query(
    `INSERT INTO notificacoes(manifestacao_id,usuario_id,evento,chave) SELECT $1,u.id,$3,$4 FROM usuarios u WHERE u.id=ANY($2::uuid[]) AND u.ativo ON CONFLICT(usuario_id,chave) DO NOTHING`,
    [id, [...new Set(users.filter(Boolean))], event, key],
  );
}
export async function operationalUsers(db) {
  return (
    await db.query(
      "SELECT up.usuario_id FROM usuario_perfis up JOIN perfis p ON p.id=up.perfil_id JOIN usuarios u ON u.id=up.usuario_id WHERE p.codigo='OUVIDORIA' AND u.ativo",
    )
  ).rows.map((r) => r.usuario_id);
}
