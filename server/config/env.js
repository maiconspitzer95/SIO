import "dotenv/config";
import { readFileSync } from "node:fs";
import { z } from "zod";

export function readConfig(env = process.env) {
  const schema = z.object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//),
    APP_ORIGIN: z.url(),
    SESSION_SECRET: z
      .string()
      .min(48)
      .refine((v) => !/REPLACE|CHANGE_ME/i.test(v)),
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(120).default(30),
    SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(8),
    TRUST_PROXY: z.enum(["0", "1"]).default("0"),
    PG_SSL: z.enum(["true", "false"]).default("false"),
    PG_CA_FILE: z.string().optional(),
  });
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Configuração inválida: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  const c = parsed.data;
  if (c.NODE_ENV === "production" && !c.APP_ORIGIN.startsWith("https://"))
    throw new Error("Produção exige APP_ORIGIN HTTPS.");
  return {
    ...c,
    ssl:
      c.PG_SSL === "true"
        ? {
            rejectUnauthorized: true,
            ...(c.PG_CA_FILE ? { ca: readFileSync(c.PG_CA_FILE, "utf8") } : {}),
          }
        : false,
  };
}
