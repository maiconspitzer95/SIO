import { createHmac, timingSafeEqual } from "node:crypto";
import { findUser } from "../repositories/users.js";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const saveSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.save((e) => (e ? reject(e) : resolve())),
  );
export const regenerateSession = (req) =>
  new Promise((resolve, reject) =>
    req.session.regenerate((e) => (e ? reject(e) : resolve())),
  );
export const destroySession = (req) =>
  new Promise((resolve, reject) =>
    req.session.destroy((e) => (e ? reject(e) : resolve())),
  );

export function csrf(config) {
  return (req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const supplied = req.get("x-csrf-token") || "";
    const expected = req.session.csrf || "";
    if (
      req.get("origin") !== new URL(config.APP_ORIGIN).origin ||
      !expected ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      return next(
        new HttpError(
          403,
          "Solicitação inválida. Atualize a página e tente novamente.",
        ),
      );
    }
    next();
  };
}
export function requireAuth(pool, config) {
  return async (req, res, next) => {
    if (!req.session.userId) throw new HttpError(401, "Entre para continuar.");
    const user = await findUser(pool, "id", req.session.userId);
    if (
      !user?.ativo ||
      user.versao_sessao !== req.session.version ||
      Date.now() - req.session.startedAt >
        config.SESSION_ABSOLUTE_HOURS * 3600000
    ) {
      await destroySession(req);
      throw new HttpError(401, "Sua sessão expirou. Entre novamente.");
    }
    req.user = user;
    next();
  };
}
export function requirePermission(code) {
  return (req, res, next) => {
    if (!req.user?.permissoes.includes(code))
      return next(new HttpError(403, "Você não tem permissão para esta ação."));
    next();
  };
}
/** Contadores atômicos persistidos: sobrevivem ao restart e são compartilhados no PM2. */
export function rateLimit(
  pool,
  config,
  { scope, limit, seconds, key = (req) => req.ip },
) {
  return async (req, res, next) => {
    const digest = createHmac("sha256", config.SESSION_SECRET)
      .update(`${scope}:${key(req)}`)
      .digest("hex");
    const { rows } = await pool.query(
      `INSERT INTO limites_acesso(chave,tentativas,reinicia_em) VALUES($1,1,now()+$2*interval '1 second')
      ON CONFLICT(chave) DO UPDATE SET
      tentativas=CASE WHEN limites_acesso.reinicia_em<=now() THEN 1 ELSE limites_acesso.tentativas+1 END,
      reinicia_em=CASE WHEN limites_acesso.reinicia_em<=now() THEN now()+$2*interval '1 second' ELSE limites_acesso.reinicia_em END
      RETURNING tentativas,reinicia_em`,
      [digest, seconds],
    );
    if (rows[0].tentativas > limit) {
      res.set(
        "Retry-After",
        String(
          Math.max(1, Math.ceil((rows[0].reinicia_em - Date.now()) / 1000)),
        ),
      );
      throw new HttpError(429, "Muitas tentativas. Aguarde e tente novamente.");
    }
    next();
  };
}
