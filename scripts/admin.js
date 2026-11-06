import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { readConfig } from "../server/config/env.js";
import { createPool, transaction } from "../server/config/database.js";
import { hashPassword } from "../server/services/passwords.js";
import { passwordSchema } from "../server/validators/auth.js";
import { audit } from "../server/services/audit.js";
const pool = createPool(readConfig());
try {
  if (process.argv[2] === "create") {
    const data = z
      .object({
        ADMIN_LOGIN: z.string().regex(/^[a-z0-9._-]{3,80}$/),
        ADMIN_NAME: z.string().min(3).max(160),
        ADMIN_EMAIL: z.email(),
        ADMIN_PASSWORD: passwordSchema,
      })
      .parse(process.env);
    const hash = await hashPassword(data.ADMIN_PASSWORD);
    await transaction(pool, async (db) => {
      const { rows } = await db.query(
        "INSERT INTO usuarios(nome,login,email,senha_hash) VALUES($1,$2,$3,$4) RETURNING id",
        [data.ADMIN_NAME, data.ADMIN_LOGIN, data.ADMIN_EMAIL, hash],
      );
      await db.query(
        "INSERT INTO usuario_perfis(usuario_id,perfil_id) SELECT $1,id FROM perfis WHERE codigo='MASTER'",
        [rows[0].id],
      );
      await audit(db, {
        actor: rows[0].id,
        event: "admin.provisionado",
        entity: "usuarios",
        entityId: rows[0].id,
      });
    });
    console.log(
      "Administrador MASTER criado, sem perfil operacional. Remova ADMIN_PASSWORD do ambiente.",
    );
  } else if (process.argv[2] === "reset") {
    const login = z
      .string()
      .min(3)
      .parse(process.env.RESET_LOGIN)
      .toLowerCase();
    const token = randomBytes(32).toString("hex");
    await transaction(pool, async (db) => {
      const { rows } = await db.query(
        "SELECT id FROM usuarios WHERE login=$1 AND ativo FOR UPDATE",
        [login],
      );
      if (!rows.length) throw new Error("Usuário ativo não encontrado.");
      await db.query(
        "UPDATE recuperacoes_senha SET usado_em=now() WHERE usuario_id=$1 AND usado_em IS NULL",
        [rows[0].id],
      );
      await db.query(
        "INSERT INTO recuperacoes_senha(usuario_id,token_hash,expira_em) VALUES($1,$2,now()+interval '15 minutes')",
        [rows[0].id, createHash("sha256").update(token).digest("hex")],
      );
      await audit(db, {
        event: "admin.recuperacao_emitida",
        entity: "usuarios",
        entityId: rows[0].id,
      });
    });
    console.log(
      `Código de uso único (15 minutos): ${token}\nEntregue ao titular após verificar sua identidade pelo procedimento institucional. Não registre o código em chamados ou logs.`,
    );
  } else throw new Error("Comando administrativo inválido.");
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? `Revise as variáveis: ${error.issues.map((i) => i.path.join(".")).join(", ")}`
      : error.code === "23505"
        ? "Login já cadastrado; nenhum usuário foi alterado."
        : "Comando falhou. Verifique a configuração e o usuário informado.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
