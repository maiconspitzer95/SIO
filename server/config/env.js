import "dotenv/config";
import { readFileSync } from "node:fs";
import { networkInterfaces, hostname } from "node:os";
import { z } from "zod";

export function readConfig(env = process.env) {
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5004),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
    // Uma ou mais origens separadas por vírgula. Os IPs da máquina são
    // adicionados automaticamente (ex.: http://192.168.2.214:5004).
    APP_ORIGIN: z.string().optional(),
    ALLOWED_HOSTS: z.string().optional(),
    SESSION_SECRET: z
      .string()
      .min(48)
      .refine((v) => !/REPLACE|CHANGE_ME/i.test(v)),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    TRUST_PROXY: z.enum(["0", "1"]).default("0"),
    PG_SSL: z.enum(["true", "false"]).default("false"),
    PG_CA_FILE: z.string().optional(),
    STORAGE_PATH: z.string().optional(),
  });
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Configuração inválida: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const c = parsed.data;
  const origins = allowedOrigins(c);
  if (
    c.NODE_ENV === "production" &&
    !origins.configured.some((o) => o.startsWith("https://"))
  )
    throw new Error("Produção exige APP_ORIGIN HTTPS.");
  return {
    ...c,
    APP_ORIGIN: origins.configured[0],
    allowedOrigins: origins.all,
    ssl:
      c.PG_SSL === "true"
        ? {
            rejectUnauthorized: true,
            ...(c.PG_CA_FILE ? { ca: readFileSync(c.PG_CA_FILE, "utf8") } : {}),
          }
        : false,
  };
}

/** IPv4 locais da máquina (rede interna), usados para liberar o acesso pelo IP. */
export function localAddresses() {
  const list = [];
  for (const items of Object.values(networkInterfaces()))
    for (const i of items || [])
      if (i.family === "IPv4" || i.family === 4) list.push(i.address);
  return [...new Set(["127.0.0.1", ...list])];
}

function normalizeOrigin(value) {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return null;
  }
}

export function allowedOrigins(c) {
  const port = c.PORT || 5004;
  const configured = String(c.APP_ORIGIN || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
  if (!configured.length) configured.push(`http://localhost:${port}`);
  const hosts = [
    "localhost",
    hostname().toLowerCase(),
    ...localAddresses(),
    ...String(c.ALLOWED_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  ];
  const automatic = hosts.flatMap((h) => [
    `http://${h}:${port}`,
    ...(port === 80 ? [`http://${h}`] : []),
  ]);
  return { configured, all: [...new Set([...configured, ...automatic])] };
}
