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
  .min(1, "Informe a senha.")
  .max(6, "A senha deve ter no máximo 6 caracteres.");
export const resetSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/), senha: passwordSchema })
  .strict();
export function validate(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join("; ");
    const e = new Error(
      msg || "Confira os campos informados. A senha deve ter no máximo 6 caracteres.",
    );
    e.status = 400;
    throw e;
  }
  return result.data;
}
