/** Política preparada para os módulos seguintes. O repositório também deverá filtrar as consultas. */
export function canAccessCase(user, record, grants = []) {
  if (!user?.ativo || !record || record.operationalBlocked) return false;
  if (record.conflictUserIds?.includes(user.id)) return false;
  const explicit = grants.some(
    (g) => g.userId === user.id && g.caseId === record.id && !g.revoked,
  );
  if (record.restricted && !explicit) return false;
  if (record.stage === "draft")
    return user.perfis.includes("OUVIDORIA") && record.createdBy === user.id;
  if (explicit) return true;
  if (user.perfis.includes("OUVIDORIA")) return true;
  if (user.perfis.includes("GESTOR") && record.managerUserId === user.id)
    return true;
  return user.perfis.includes("GERENTE") && record.supervisorUserId === user.id;
}
export function canCreateCase(
  user,
  { contactUserId, conflictUserIds = [], operationalBlocked = false },
) {
  return Boolean(
    user?.ativo &&
    user.perfis.includes("OUVIDORIA") &&
    user.permissoes.includes("manifestacoes.criar") &&
    contactUserId !== user.id &&
    !conflictUserIds.includes(user.id) &&
    !operationalBlocked,
  );
}
