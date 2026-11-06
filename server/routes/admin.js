import { Router } from "express";
import { requirePermission, HttpError } from "../middlewares/security.js";
import { audit } from "../services/audit.js";

export function adminRoutes(pool) {
  const router = Router();
  router.get(
    "/roles",
    requirePermission("usuarios.gerenciar"),
    async (req, res) => {
      const { rows } =
        await pool.query(`SELECT p.codigo,p.nome,COALESCE(jsonb_agg(m.codigo ORDER BY m.codigo) FILTER(WHERE m.id IS NOT NULL),'[]') AS permissoes
      FROM perfis p LEFT JOIN perfil_permissoes pp ON pp.perfil_id=p.id LEFT JOIN permissoes m ON m.id=pp.permissao_id GROUP BY p.id ORDER BY p.codigo`);
      res.json({ items: rows });
    },
  );
  router.get(
    "/audit",
    requirePermission("auditoria.consultar"),
    async (req, res) => {
      const page = Number(req.query.page || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000)
        throw new HttpError(400, "Página inválida.");
      await audit(pool, {
        actor: req.user.id,
        event: "auditoria.consulta",
        requestId: req.id,
      });
      const { rows } = await pool.query(
        "SELECT id,ator_id,evento,entidade,entidade_id,resultado,request_id,criado_em FROM auditoria ORDER BY id DESC LIMIT 25 OFFSET $1",
        [(page - 1) * 25],
      );
      const count = await pool.query(
        "SELECT count(*)::integer AS total FROM auditoria",
      );
      res.json({ items: rows, total: count.rows[0].total, page, pageSize: 25 });
    },
  );
  return router;
}
