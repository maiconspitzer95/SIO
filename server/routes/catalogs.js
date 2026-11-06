import { Router } from "express";
import { z } from "zod";
import {
  parse,
  uuid,
  catalogSchemas,
  userSchema,
} from "../validators/operations.js";
import { HttpError, requirePermission } from "../middlewares/security.js";
import { transaction } from "../config/database.js";
import { audit } from "../services/audit.js";
import { hashPassword } from "../services/passwords.js";

export function catalogRoutes(pool) {
  const r = Router();
  r.get("/lookups", async (req, res) => {
    const result = {};
    for (const table of Object.keys(catalogSchemas)) {
      let q = `SELECT * FROM ${table} WHERE ativo ORDER BY nome`;
      if (table === "gerentes") {
        q = `SELECT ge.*, s.nome AS setor_nome FROM gerentes ge LEFT JOIN setores s ON s.id=ge.setor_id WHERE ge.ativo ORDER BY ge.nome`;
      } else if (table === "gestores") {
        q = `SELECT g.*, a.nome AS area_nome, s.nome AS setor_nome, ge.nome AS gerente_nome FROM gestores g LEFT JOIN areas_tecnicas a ON a.id=g.area_id LEFT JOIN setores s ON s.id=g.setor_id LEFT JOIN gerentes ge ON ge.id=g.gerente_id WHERE g.ativo ORDER BY g.nome`;
      }
      result[table] = (await pool.query(q)).rows;
    }
    // Diretório mínimo necessário para atribuição e prevenção de conflitos; sem logins/e-mails.
    result.pessoas = (
      await pool.query("SELECT id,nome FROM usuarios WHERE ativo ORDER BY nome")
    ).rows;
    res.json(result);
  });
  r.get("/users", requirePermission("usuarios.gerenciar"), async (req, res) => {
    const { rows } = await pool.query(
      `SELECT u.id,u.nome,u.login,u.email,u.ativo,COALESCE(jsonb_agg(p.codigo) FILTER(WHERE p.id IS NOT NULL),'[]') perfis FROM usuarios u LEFT JOIN usuario_perfis up ON up.usuario_id=u.id LEFT JOIN perfis p ON p.id=up.perfil_id GROUP BY u.id ORDER BY u.nome`,
    );
    res.json({ items: rows });
  });
  const saveUser = async (req, res) => {
    const d = parse(userSchema, req.body),
      id = req.params.id ? parse(uuid, req.params.id) : null;
    if (id === req.user.id)
      throw new HttpError(
        403,
        "Peça a outro administrador para alterar sua conta ou seus perfis.",
      );
    if (!id && !d.senha)
      throw new HttpError(
        400,
        "Informe uma senha inicial de até 6 caracteres.",
      );
    const hash = d.senha ? await hashPassword(d.senha) : null;
    const saved = await transaction(pool, async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(73649103)");
      if (id) {
        const old = (
          await db.query("SELECT id FROM usuarios WHERE id=$1 FOR UPDATE", [id])
        ).rows[0];
        if (!old) throw new HttpError(404, "Usuário não encontrado.");
        const n = (
          await db.query(
            `SELECT count(*)::int n FROM usuarios u JOIN usuario_perfis up ON up.usuario_id=u.id JOIN perfis p ON p.id=up.perfil_id WHERE p.codigo='MASTER' AND u.ativo AND u.id<>$1`,
            [id],
          )
        ).rows[0].n;
        if (!n && (!d.ativo || !d.perfis.includes("MASTER")))
          throw new HttpError(409, "Mantenha pelo menos um Master ativo.");
      }
      const values = [d.nome, d.login, d.email, d.ativo];
      const row = id
        ? (
            await db.query(
              "UPDATE usuarios SET nome=$1,login=$2,email=$3,ativo=$4,senha_hash=COALESCE($5,senha_hash),versao_sessao=versao_sessao+1,atualizado_em=now() WHERE id=$6 RETURNING id",
              [...values, hash, id],
            )
          ).rows[0]
        : (
            await db.query(
              "INSERT INTO usuarios(nome,login,email,ativo,senha_hash) VALUES($1,$2,$3,$4,$5) RETURNING id",
              [...values, hash],
            )
          ).rows[0];
      await db.query("DELETE FROM usuario_perfis WHERE usuario_id=$1", [
        row.id,
      ]);
      await db.query(
        "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo=ANY($2::text[])",
        [row.id, d.perfis],
      );
      await audit(db, {
        actor: req.user.id,
        event: id ? "usuario.alterado" : "usuario.criado",
        entity: "usuarios",
        entityId: row.id,
        requestId: req.id,
      });
      return row;
    });
    res.status(id ? 200 : 201).json(saved);
  };
  r.post("/users", requirePermission("usuarios.gerenciar"), saveUser);
  r.put("/users/:id", requirePermission("usuarios.gerenciar"), saveUser);
  r.get(
    "/settings",
    requirePermission("parametros.gerenciar"),
    async (req, res) =>
      res.json({
        items: (await pool.query("SELECT * FROM parametros ORDER BY chave"))
          .rows,
      }),
  );
  r.put(
    "/settings",
    requirePermission("parametros.gerenciar"),
    async (req, res) => {
      const d = parse(
        z
          .object({ retencao_aprovada: z.string().trim().min(10).max(4000) })
          .strict(),
        req.body,
      );
      await transaction(pool, async (db) => {
        await db.query(
          "UPDATE parametros SET valor=$1,atualizado_em=now() WHERE chave='retencao_aprovada'",
          [d.retencao_aprovada],
        );
        await audit(db, {
          actor: req.user.id,
          event: "parametros.atualizados",
          requestId: req.id,
        });
      });
      res.json({ ok: true });
    },
  );
  r.get(
    "/:table",
    requirePermission("cadastros.gerenciar"),
    async (req, res) => {
      const table = req.params.table;
      if (!catalogSchemas[table])
        throw new HttpError(404, "Cadastro inexistente.");
      let q = `SELECT * FROM ${table} ORDER BY nome`;
      if (table === "gerentes") {
        q = `SELECT ge.*, s.nome AS setor_nome FROM gerentes ge LEFT JOIN setores s ON s.id=ge.setor_id ORDER BY ge.nome`;
      } else if (table === "gestores") {
        q = `SELECT g.*, a.nome AS area_nome, s.nome AS setor_nome, ge.nome AS gerente_nome FROM gestores g LEFT JOIN areas_tecnicas a ON a.id=g.area_id LEFT JOIN setores s ON s.id=g.setor_id LEFT JOIN gerentes ge ON ge.id=g.gerente_id ORDER BY g.nome`;
      }
      res.json({
        items: (await pool.query(q)).rows,
      });
    },
  );
  const save = async (req, res) => {
    const table = req.params.table,
      schema = catalogSchemas[table];
    if (!schema) throw new HttpError(404, "Cadastro inexistente.");
    const d = parse(schema, req.body),
      id = req.params.id ? parse(uuid, req.params.id) : null;
    // Categorias de assédio/violência não têm desbloqueio operacional nesta versão.
    if (
      table === "motivos" &&
      /assedio|violencia/i.test(
        d.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      )
    ) {
      d.restrito = true;
      d.bloqueado = true;
    }
    const result = await transaction(pool, async (db) => {
      if (table === "motivos" && id) {
        const old = (
          await db.query(
            "SELECT bloqueado,restrito FROM motivos WHERE id=$1 FOR UPDATE",
            [id],
          )
        ).rows[0];
        if (old?.bloqueado) {
          d.bloqueado = true;
          d.restrito = true;
        }
        if (old?.restrito) d.restrito = true;
      }
      if (
        d.area_id &&
        !(
          await db.query(
            "SELECT id FROM areas_tecnicas WHERE id=$1 AND ativo",
            [d.area_id],
          )
        ).rowCount
      )
        throw new HttpError(400, "Área inativa ou inválida.");

      if (table === "gerentes") {
        if (d.usuario_id) {
          const userCheck = await db.query(
            "SELECT u.id FROM usuarios u JOIN usuario_perfis up ON up.usuario_id=u.id JOIN perfis p ON p.id=up.perfil_id WHERE u.id=$1 AND u.ativo AND p.codigo='GERENTE'",
            [d.usuario_id],
          );
          if (!userCheck.rowCount)
            throw new HttpError(400, "Usuário vinculado deve estar ativo e possuir perfil GERENTE.");
        }
        if (d.setor_id) {
          const sRow = (
            await db.query("SELECT id, area_id FROM setores WHERE id=$1 AND ativo", [d.setor_id])
          ).rows[0];
          if (!sRow) throw new HttpError(400, "Setor selecionado não encontrado ou inativo.");
          d.area_id = sRow.area_id;
        } else if (d.area_id) {
          const aRow = (
            await db.query("SELECT id FROM areas_tecnicas WHERE id=$1 AND ativo", [d.area_id])
          ).rowCount;
          if (!aRow) throw new HttpError(400, "Área técnica inativa ou inválida.");
        }
      }

      if (table === "gestores") {
        if (d.usuario_id) {
          const userCheck = await db.query(
            "SELECT u.id FROM usuarios u JOIN usuario_perfis up ON up.usuario_id=u.id JOIN perfis p ON p.id=up.perfil_id WHERE u.id=$1 AND u.ativo AND p.codigo='GESTOR'",
            [d.usuario_id],
          );
          if (!userCheck.rowCount)
            throw new HttpError(400, "Usuário vinculado deve estar ativo e possuir perfil GESTOR.");
        }
        if (
          !(
            await db.query(
              "SELECT id FROM setores WHERE id=$1 AND area_id=$2 AND ativo",
              [d.setor_id, d.area_id],
            )
          ).rowCount
        )
          throw new HttpError(400, "Setor deve pertencer à área selecionada e estar ativo.");
        const gerente = (
          await db.query(
            "SELECT id, area_id, setor_id FROM gerentes WHERE id=$1 AND ativo",
            [d.gerente_id],
          )
        ).rows[0];
        if (!gerente)
          throw new HttpError(400, "Gerente responsável deve estar cadastrado e ativo.");
        if (gerente.area_id && gerente.area_id !== d.area_id)
          throw new HttpError(400, "Gerente responsável deve pertencer à mesma área técnica.");
      }

      const keys = Object.keys(d),
        values = keys.map((k) =>
          k === "feriados" ? JSON.stringify(d[k]) : d[k],
        );
      const sql = id
        ? `UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 1}`).join(",")} WHERE id=$${values.length + 1} RETURNING *`
        : `INSERT INTO ${table}(${keys.join(",")}) VALUES(${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`;
      const row = (await db.query(sql, id ? [...values, id] : values)).rows[0];
      if (!row) throw new HttpError(404, "Registro não encontrado.");
      await audit(db, {
        actor: req.user.id,
        event: `cadastro.${id ? "alterado" : "criado"}`,
        entity: table,
        entityId: row.id,
        requestId: req.id,
      });
      return row;
    });
    res.status(id ? 200 : 201).json(result);
  };
  r.post("/:table", requirePermission("cadastros.gerenciar"), save);
  r.put("/:table/:id", requirePermission("cadastros.gerenciar"), save);
  return r;
}
