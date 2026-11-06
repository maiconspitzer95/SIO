import { Router } from "express";
import { randomBytes, createHash } from "node:crypto";
import { findUser, publicUser } from "../repositories/users.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import { audit } from "../services/audit.js";
import { transaction } from "../config/database.js";
import {
  HttpError,
  requireAuth,
  rateLimit,
  regenerateSession,
  saveSession,
  destroySession,
} from "../middlewares/security.js";
import { loginSchema, resetSchema, validate } from "../validators/auth.js";

export async function authRoutes(pool, config) {
  const router = Router();
  const dummyHash = await hashPassword(randomBytes(32).toString("hex"));
  router.get("/csrf", async (req, res) => {
    req.session.csrf ||= randomBytes(32).toString("hex");
    await saveSession(req);
    res.json({ csrfToken: req.session.csrf });
  });
  router.post(
    "/login",
    rateLimit(pool, config, { scope: "login-ip", limit: 30, seconds: 900 }),
    rateLimit(pool, config, {
      scope: "login-account",
      limit: 10,
      seconds: 900,
      key: (req) =>
        String(req.body?.login || "")
          .trim()
          .toLowerCase(),
    }),
    async (req, res) => {
      const { login, senha } = validate(loginSchema, req.body);
      const user = await findUser(pool, "login", login);
      const valid = await verifyPassword(user?.senha_hash || dummyHash, senha);
      if (!valid || !user?.ativo) {
        await audit(pool, {
          event: "auth.login",
          result: "negado",
          requestId: req.id,
        });
        throw new HttpError(401, "Usuário ou senha inválidos.");
      }
      await audit(pool, {
        actor: user.id,
        event: "auth.login",
        requestId: req.id,
      });
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.version = user.versao_sessao;
      req.session.startedAt = Date.now();
      req.session.csrf = randomBytes(32).toString("hex");
      await saveSession(req);
      res.json({ user: publicUser(user), csrfToken: req.session.csrf });
    },
  );
  router.get("/me", requireAuth(pool, config), (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  router.post("/logout", requireAuth(pool, config), async (req, res) => {
    await audit(pool, {
      actor: req.user.id,
      event: "auth.logout",
      requestId: req.id,
    });
    await destroySession(req);
    res.clearCookie(
      config.NODE_ENV === "production" ? "__Host-sio.sid" : "sio.sid",
      {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: config.NODE_ENV === "production",
      },
    );
    res.status(204).end();
  });
  router.post(
    "/reset",
    rateLimit(pool, config, { scope: "reset", limit: 10, seconds: 900 }),
    async (req, res) => {
      const { token, senha } = validate(resetSchema, req.body);
      const hash = await hashPassword(senha);
      await transaction(pool, async (db) => {
        const digest = createHash("sha256").update(token).digest("hex");
        const { rows } = await db.query(
          `SELECT r.* FROM recuperacoes_senha r JOIN usuarios u ON u.id=r.usuario_id
        WHERE r.token_hash=$1 AND r.usado_em IS NULL AND r.expira_em>now() AND u.ativo FOR UPDATE OF r,u`,
          [digest],
        );
        if (!rows.length)
          throw new HttpError(
            400,
            "Código inválido ou expirado. Solicite outro à administração.",
          );
        const id = rows[0].usuario_id;
        await db.query(
          "UPDATE usuarios SET senha_hash=$1, versao_sessao=versao_sessao+1, atualizado_em=now() WHERE id=$2",
          [hash, id],
        );
        await db.query(
          "UPDATE recuperacoes_senha SET usado_em=now() WHERE usuario_id=$1 AND usado_em IS NULL",
          [id],
        );
        await db.query("DELETE FROM sessoes WHERE sess->>'userId'=$1", [id]);
        await audit(db, {
          actor: id,
          event: "auth.password_reset",
          requestId: req.id,
        });
      });
      await destroySession(req);
      res.json({ message: "Senha atualizada. Entre com a nova senha." });
    },
  );
  return router;
}
