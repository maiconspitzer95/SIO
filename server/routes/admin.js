import { Router } from "express";
import { requirePermission, HttpError } from "../middlewares/security.js";
import { audit } from "../services/audit.js";
import { roleCapabilities } from "../config/role-capabilities.js";
import { transaction } from "../config/database.js";
import { parse } from "../validators/operations.js";
import { z } from "zod";

export function adminRoutes(pool) {
  const router = Router();
  router.get(
    "/roles",
    requirePermission("usuarios.gerenciar"),
    async (req, res) => {
      const { rows } =
        await pool.query(`SELECT p.codigo,p.nome,COALESCE(jsonb_agg(m.codigo ORDER BY m.codigo) FILTER(WHERE m.id IS NOT NULL),'[]') AS permissoes
      FROM perfis p LEFT JOIN perfil_permissoes pp ON pp.perfil_id=p.id LEFT JOIN permissoes m ON m.id=pp.permissao_id GROUP BY p.id ORDER BY p.codigo`);
      res.json({
        items: rows.map((p) => ({
          ...p,
          disponiveis: roleCapabilities[p.codigo],
        })),
      });
    },
  );
  router.put(
    "/roles/:code",
    requirePermission("usuarios.gerenciar"),
    async (req, res) => {
      const available = roleCapabilities[req.params.code];
      if (!available) throw new HttpError(404, "Perfil inexistente.");
      const d = parse(
        z.object({ permissoes: z.array(z.string()).max(20) }).strict(),
        req.body,
      );
      if (d.permissoes.some((p) => !available.includes(p)))
        throw new HttpError(
          403,
          "Permissão incompatível com este perfil institucional.",
        );
      if (
        req.params.code === "MASTER" &&
        !d.permissoes.includes("usuarios.gerenciar")
      )
        throw new HttpError(
          409,
          "A gestão de usuários deve permanecer disponível para Master.",
        );
      await transaction(pool, async (db) => {
        const p = (
          await db.query("SELECT id FROM perfis WHERE codigo=$1 FOR UPDATE", [
            req.params.code,
          ])
        ).rows[0];
        await db.query("DELETE FROM perfil_permissoes WHERE perfil_id=$1", [
          p.id,
        ]);
        await db.query(
          "INSERT INTO perfil_permissoes(perfil_id,permissao_id) SELECT $1,id FROM permissoes WHERE codigo=ANY($2::text[])",
          [p.id, [...new Set(d.permissoes)]],
        );
        await db.query(
          "UPDATE usuarios SET versao_sessao=versao_sessao+1 WHERE id IN(SELECT usuario_id FROM usuario_perfis WHERE perfil_id=$1)",
          [p.id],
        );
        await audit(db, {
          actor: req.user.id,
          event: "perfil.permissoes_alteradas",
          entity: "perfis",
          entityId: p.id,
          requestId: req.id,
        });
      });
      res.json({ ok: true });
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
