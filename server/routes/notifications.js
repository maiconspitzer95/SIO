import { Router } from "express";
import { scope, joins } from "../repositories/cases.js";
import { parse, uuid } from "../validators/operations.js";
export function notificationRoutes(pool) {
  const r = Router();
  r.get("/", async (req, res) => {
    const values = [req.user.id],
      acl = scope(req.user, values);
    const query = `${joins} JOIN notificacoes n ON n.manifestacao_id=m.id WHERE n.usuario_id=$1 AND ${acl}`;
    const items = (
      await pool.query(
        `SELECT n.id,n.manifestacao_id,n.evento,n.criado_em,n.lida_em ${query} ORDER BY n.criado_em DESC LIMIT 100`,
        values,
      )
    ).rows;
    const unread = (
      await pool.query(
        `SELECT count(*)::int total ${query} AND n.lida_em IS NULL`,
        values,
      )
    ).rows[0].total;
    res.json({ items, unread });
  });
  r.post("/:id/read", async (req, res) => {
    await pool.query(
      "UPDATE notificacoes SET lida_em=COALESCE(lida_em,now()) WHERE id=$1 AND usuario_id=$2",
      [parse(uuid, req.params.id), req.user.id],
    );
    res.json({ ok: true });
  });
  return r;
}
