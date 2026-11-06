import express from "express";
import helmet from "helmet";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { authRoutes } from "./routes/auth.js";
import { adminRoutes } from "./routes/admin.js";
import { csrf, requireAuth, rateLimit } from "./middlewares/security.js";
import { catalogRoutes } from "./routes/catalogs.js";
import { caseRoutes } from "./routes/cases.js";
import { notificationRoutes } from "./routes/notifications.js";
import { reportRoutes } from "./routes/reports.js";
import { attachmentRoutes } from "./routes/attachments.js";

export async function createApp(pool, config) {
  const app = express();
  app.disable("x-powered-by");
  if (config.TRUST_PROXY === "1") app.set("trust proxy", "loopback");
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.set("X-Request-ID", req.id);
    next();
  });
  app.use(
    helmet({
      strictTransportSecurity:
        config.NODE_ENV === "production" ? undefined : false,
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'"],
          "img-src": ["'self'", "data:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "upgrade-insecure-requests":
            config.NODE_ENV === "production" ? [] : null,
        },
      },
    }),
  );
  app.get("/health", async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit(pool, config, { scope: "api", limit: 300, seconds: 60 }),
  );
  app.use(express.json({ limit: "32kb" }));
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    pool,
    tableName: "sessoes",
    createTableIfMissing: false,
    pruneSessionInterval: false,
  });
  app.locals.sessionStore = store;
  app.use(
    "/api",
    session({
      store,
      name: config.NODE_ENV === "production" ? "__Host-sio.sid" : "sio.sid",
      secret: config.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: config.SESSION_IDLE_MINUTES * 60000,
      },
    }),
  );
  app.use("/api", csrf(config));
  app.use("/api/auth", await authRoutes(pool, config));
  app.use("/api/admin", requireAuth(pool, config), adminRoutes(pool));
  app.use("/api/catalogs", requireAuth(pool, config), catalogRoutes(pool));
  app.use(
    "/api/cases/:caseId/attachments",
    requireAuth(pool, config),
    attachmentRoutes(pool, config),
  );
  app.use("/api/cases", requireAuth(pool, config), caseRoutes(pool));
  app.use(
    "/api/notifications",
    requireAuth(pool, config),
    notificationRoutes(pool),
  );
  app.use("/api/reports", requireAuth(pool, config), reportRoutes(pool));
  app.use("/api", (req, res) =>
    res.status(404).json({ error: "Recurso não encontrado." }),
  );
  {
    // Frontend e API compartilham a mesma porta em todos os ambientes.
    const dist = fileURLToPath(new URL("../client/dist/", import.meta.url));
    app.use(express.static(dist, { index: false }));
    app.get("/{*path}", (req, res) => res.sendFile(`${dist}/index.html`));
  }
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err.status ||
      (["23505", "23503", "23514"].includes(err.code)
        ? 409
        : err.type === "entity.parse.failed"
          ? 400
          : 500);
    if (status >= 500)
      console.error(
        JSON.stringify({
          event: "request.failed",
          requestId: req.id,
          code: /^[A-Z0-9_]{1,40}$/.test(err.code || "")
            ? err.code
            : "INTERNAL",
        }),
      );
    res.status(status).json({
      error:
        status >= 500
          ? "Não foi possível concluir a solicitação."
          : ["23505", "23503", "23514"].includes(err.code)
            ? "Registro duplicado ou vínculo inválido. Confira os campos e cadastros relacionados."
            : err.message,
      requestId: req.id,
    });
  });
  return app;
}
