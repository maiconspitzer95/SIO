import { z } from "zod";
export const loginSchema = z
  .object({
    login: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .transform((v) => v.toLowerCase()),
    senha: z.string().min(1).max(128),
  })
  .strict();
export const passwordSchema = z
  .string()
  .min(12, "Use pelo menos 12 caracteres.")
  .max(128);
export const resetSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/), senha: passwordSchema })
  .strict();
export function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const e = new Error(
      "Confira os campos informados. Senhas novas devem ter de 12 a 128 caracteres.",
    );
    e.status = 400;
    throw e;
  }
  return result.data;
}
