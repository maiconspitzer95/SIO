/** Somente metadados técnicos: nunca senha, token, relato, contato ou corpo da requisição. */
export async function audit(
  db,
  {
    actor = null,
    event,
    entity = null,
    entityId = null,
    result = "sucesso",
    requestId = null,
  },
) {
  await db.query(
    "INSERT INTO auditoria(ator_id,evento,entidade,entidade_id,resultado,request_id) VALUES($1,$2,$3,$4,$5,$6)",
    [actor, event, entity, entityId, result, requestId],
  );
}
