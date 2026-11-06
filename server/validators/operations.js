import { z } from "zod";
import { HttpError } from "../middlewares/security.js";
export const uuid = z.uuid();
export const text = z.string().trim().min(1).max(10000);
export const date = z.iso.date();
export function parse(schema, value) {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new HttpError(
      400,
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  return r.data;
}
const base = {
  nome: z.string().trim().min(2).max(160),
  ativo: z.boolean().default(true),
};
const description = { descricao: z.string().trim().max(1000).default("") };
export const catalogSchemas = {
  areas_tecnicas: z.object({ ...base, ...description }).strict(),
  setores: z.object({ ...base, ...description, area_id: uuid }).strict(),
  motivos: z
    .object({
      ...base,
      ...description,
      area_id: uuid,
      restrito: z.boolean().default(false),
      bloqueado: z.boolean().default(false),
    })
    .strict(),
  gerentes: z.object({ ...base, usuario_id: uuid, area_id: uuid }).strict(),
  gestores: z
    .object({
      ...base,
      usuario_id: uuid,
      area_id: uuid,
      setor_id: uuid,
      gerente_id: uuid,
    })
    .strict(),
  prazos: z
    .object({
      ...base,
      tipo: z.enum(["Geral", "Judicial"]),
      quantidade: z.number().int(),
      unidade: z.enum(["dias", "horas"]),
      dias_uteis: z.boolean(),
      continuo: z.boolean(),
      feriados: z.array(date).max(1000),
      alerta_horas: z.number().int().min(1).max(168),
      aprovado: z.boolean(),
    })
    .strict()
    .superRefine((v, c) => {
      if (v.tipo === "Geral" && (v.quantidade !== 5 || v.unidade !== "dias"))
        c.addIssue({ code: "custom", message: "Geral deve ter 5 dias." });
      if (
        v.tipo === "Judicial" &&
        (v.quantidade !== 24 ||
          v.unidade !== "horas" ||
          v.dias_uteis ||
          (v.aprovado && !v.continuo))
      )
        c.addIssue({
          code: "custom",
          message: "Judicial exige 24 horas contínuas homologadas.",
        });
    }),
};
export const userSchema = z
  .object({
    ...base,
    login: z
      .string()
      .trim()
      .regex(/^[a-z0-9._-]{3,80}$/),
    email: z.email(),
    senha: z.string().min(12).max(128).optional(),
    perfis: z
      .array(z.enum(["MASTER", "OUVIDORIA", "GESTOR", "GERENTE", "DIRECAO"]))
      .min(1),
  })
  .strict();
export const caseSchema = z
  .object({
    data_manifestacao: date,
    tipo: z.enum([
      "Elogio",
      "Reclamação",
      "Denúncia",
      "Informação",
      "Sugestão",
    ]),
    canal: z.enum(["E-mail", "Pessoal", "Telefone"]),
    area_id: uuid,
    motivo_id: uuid,
    setor_id: uuid,
    prazo_id: uuid,
    gestor_id: uuid,
    local_complemento: z.string().max(1000).default(""),
    relato: text,
    contato_nome: z.string().trim().min(2).max(160),
    contato_email: z.union([z.email(), z.literal("")]).default(""),
    contato_telefone: z.string().max(40).default(""),
    contato_usuario_id: uuid.nullable().default(null),
    conflitos: z.array(uuid).max(50).default([]),
    terceiro_confirmado: z.literal(true),
    encaminhar: z.boolean().default(false),
    justificativa: z.string().max(1000).optional(),
    versao: z.number().int().optional(),
  })
  .strict();
