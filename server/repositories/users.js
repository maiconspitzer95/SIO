export async function findUser(db, field, value) {
  if (!["id", "login"].includes(field)) throw new Error("Campo inválido");
  const { rows } = await db.query(
    `SELECT u.*,
    COALESCE((SELECT jsonb_agg(p.codigo ORDER BY p.codigo) FROM usuario_perfis up JOIN perfis p ON p.id=up.perfil_id WHERE up.usuario_id=u.id),'[]') AS perfis,
    COALESCE((SELECT jsonb_agg(DISTINCT m.codigo) FROM usuario_perfis up JOIN perfil_permissoes pp ON pp.perfil_id=up.perfil_id JOIN permissoes m ON m.id=pp.permissao_id WHERE up.usuario_id=u.id),'[]') AS permissoes
    FROM usuarios u WHERE u.${field}=$1`,
    [value],
  );
  return rows[0];
}
export function publicUser(u) {
  return {
    id: u.id,
    nome: u.nome,
    login: u.login,
    perfis: u.perfis,
    permissoes: u.permissoes,
  };
}
