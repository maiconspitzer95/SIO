import { transaction } from "../config/database.js";
import { history, notify } from "./case-events.js";
/** Bloqueio transacional + índice único: seguro em múltiplos workers e após reinicializações. */
export async function processAlerts(pool) {
  return transaction(pool, async (db) => {
    const locked = (
      await db.query("SELECT pg_try_advisory_xact_lock(73649104) ok")
    ).rows[0].ok;
    if (!locked) return;
    const rows = (
      await db.query(
        `SELECT m.*,g.usuario_id gestor_usuario,ge.usuario_id gerente_usuario FROM manifestacoes m JOIN gestores g ON g.id=m.gestor_id JOIN gerentes ge ON ge.id=g.gerente_id JOIN motivos mot ON mot.id=m.motivo_id WHERE (m.etapa IN ('encaminhada','complementacao') OR m.resposta_gestor_em>m.vencimento) AND NOT mot.bloqueado AND m.vencimento<=now()+COALESCE((m.prazo_snapshot->>'alerta_horas')::int,24)*interval '1 hour' FOR UPDATE OF m SKIP LOCKED`,
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
      await notify(
        db,
        m.id,
        late
          ? [m.gestor_usuario, m.gerente_usuario, m.criado_por]
          : [m.gestor_usuario, m.criado_por],
        late ? "Prazo vencido" : "Prazo próximo do vencimento",
        `${m.id}:alerta:${event}`,
      );
      await history(db, m.id, null, `alerta_${event}`);
    }
  });
}
