import { transaction } from "../config/database.js";
import { history, notify, operationalUsers } from "./case-events.js";

const caseSelect = `SELECT m.*,
        g.nome AS gestor_nome, g.usuario_id AS gestor_usuario,
        ge.id AS gerente_id, ge.nome AS gerente_nome, ge.usuario_id AS gerente_usuario,
        (m.restrito OR mot.restrito) AS sigiloso
 FROM manifestacoes m
 JOIN gestores g ON g.id=m.gestor_id
 JOIN gerentes ge ON ge.id=g.gerente_id
 JOIN motivos mot ON mot.id=m.motivo_id`;

async function direcaoUsers(db) {
  return (
    await db.query(
      "SELECT up.usuario_id FROM usuario_perfis up JOIN perfis p ON p.id=up.perfil_id JOIN usuarios u ON u.id=up.usuario_id WHERE p.codigo='DIRECAO' AND u.ativo",
    )
  ).rows.map((r) => r.usuario_id);
}

/**
 * Fluxo de prazos:
 *  1. "proximo"  — prazo do gestor perto de vencer: avisa gestor e Ouvidoria.
 *  2. "vencido"  — gestor não respondeu: caso fica vermelho ("Em atraso · com gestor")
 *                  e a Ouvidoria é avisada para, se quiser, ENCAMINHAR AO GERENTE.
 *  3. "gerente_vencido" — após o encaminhamento manual, o gerente não respondeu
 *                  em 24h: avisa Ouvidoria e Direção.
 * Bloqueio transacional + índice único: seguro em múltiplos workers e após reinicializações.
 */
export async function processAlerts(pool) {
  return transaction(pool, async (db) => {
    const locked = (
      await db.query("SELECT pg_try_advisory_xact_lock(73649104) ok")
    ).rows[0].ok;
    if (!locked) return;
    const rows = (
      await db.query(
        `${caseSelect}
         WHERE m.etapa IN ('encaminhada','complementacao')
           AND NOT mot.bloqueado
           AND m.vencimento<=now()+COALESCE((m.prazo_snapshot->>'alerta_horas')::int,24)*interval '1 hour'
         FOR UPDATE OF m SKIP LOCKED`,
      )
    ).rows;
    const ouvidoria = await operationalUsers(db);
    for (const m of rows) {
      const now = new Date();
      const late = new Date(m.vencimento) < now;
      const managerLate =
        late &&
        m.escalado_gerente_em &&
        m.vencimento_gerente &&
        new Date(m.vencimento_gerente) < now;
      // Já encaminhado ao gerente e ainda dentro das 24h: nada a alertar.
      if (late && m.escalado_gerente_em && !managerLate) continue;
      const event = managerLate ? "gerente_vencido" : late ? "vencido" : "proximo";
      if (event === "vencido")
        await db.query(
          "UPDATE manifestacoes SET alerta_gerente_em=COALESCE(alerta_gerente_em,now()) WHERE id=$1",
          [m.id],
        );
      const inserted = await db.query(
        "INSERT INTO alertas(manifestacao_id,evento) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING id",
        [m.id, event],
      );
      if (!inserted.rowCount) continue;
      let recipients, message;
      if (event === "proximo") {
        recipients = [m.gestor_usuario, m.criado_por, ...ouvidoria];
        message = `Prazo próximo do vencimento (Gestor: ${m.gestor_nome})`;
      } else if (event === "vencido") {
        recipients = [m.gestor_usuario, m.criado_por, ...ouvidoria];
        message = `Prazo vencido — gestor ${m.gestor_nome} não respondeu. A Ouvidoria pode encaminhar ao gerente ${m.gerente_nome}.`;
      } else {
        recipients = [m.gerente_usuario, m.criado_por, ...ouvidoria, ...(m.sigiloso ? [] : await direcaoUsers(db))];
        message = `Gerente ${m.gerente_nome} não respondeu em 24h (Gestor: ${m.gestor_nome})`;
      }
      await notify(db, m.id, recipients, message, `${m.id}:alerta:${event}`);
      await history(db, m.id, null, `alerta_${event}`, {
        gestor_id: m.gestor_id,
        gestor_nome: m.gestor_nome,
        gerente_id: m.gerente_id,
        gerente_nome: m.gerente_nome,
        vencimento: m.vencimento,
        vencimento_gerente: m.vencimento_gerente,
        alerta_em: now.toISOString(),
      });
    }
  });
}

