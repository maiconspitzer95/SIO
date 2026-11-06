import { transaction } from "../config/database.js";
import { history, notify, operationalUsers } from "./case-events.js";
/** Bloqueio transacional + índice único: seguro em múltiplos workers e após reinicializações. */
export async function processAlerts(pool) {
  return transaction(pool, async (db) => {
    const locked = (
      await db.query("SELECT pg_try_advisory_xact_lock(73649104) ok")
    ).rows[0].ok;
    if (!locked) return;
    const rows = (
      await db.query(
        `SELECT m.*,
                g.id AS gestor_id, g.nome AS gestor_nome, g.usuario_id AS gestor_usuario,
                ge.id AS gerente_id, ge.nome AS gerente_nome, ge.usuario_id AS gerente_usuario
         FROM manifestacoes m
         JOIN gestores g ON g.id=m.gestor_id
         JOIN gerentes ge ON ge.id=g.gerente_id
         JOIN motivos mot ON mot.id=m.motivo_id
         WHERE (m.etapa IN ('encaminhada','complementacao') OR m.resposta_gestor_em>m.vencimento)
           AND NOT mot.bloqueado
           AND m.vencimento<=now()+COALESCE((m.prazo_snapshot->>'alerta_horas')::int,24)*interval '1 hour'
         FOR UPDATE OF m SKIP LOCKED`,
      )
    ).rows;
    for (const m of rows) {
      const late = new Date(m.vencimento) < new Date(),
        event = late ? "vencido" : "proximo";
      const inserted = await db.query(
        "INSERT INTO alertas(manifestacao_id,evento) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
        [m.id, event],
      );
      if (!inserted.rowCount) continue;
      if (late)
        await db.query(
          "UPDATE manifestacoes SET alerta_gerente_em=COALESCE(alerta_gerente_em,now()) WHERE id=$1",
          [m.id],
        );
      const ouvidoriaUsers = await operationalUsers(db);
      await notify(
        db,
        m.id,
        late
          ? [m.gestor_usuario, m.gerente_usuario, m.criado_por, ...ouvidoriaUsers]
          : [m.gestor_usuario, m.criado_por, ...ouvidoriaUsers],
        late
          ? `Prazo vencido (Gestor: ${m.gestor_nome} · Gerente: ${m.gerente_nome})`
          : `Prazo próximo do vencimento (Gestor: ${m.gestor_nome})`,
        `${m.id}:alerta:${event}`,
      );
      await history(db, m.id, null, `alerta_${event}`, {
        gestor_id: m.gestor_id,
        gestor_nome: m.gestor_nome,
        gerente_id: m.gerente_id,
        gerente_nome: m.gerente_nome,
        vencimento: m.vencimento,
        alerta_em: new Date().toISOString(),
      });
    }
  });
}
