import { Router } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getCase } from "../repositories/cases.js";
import { HttpError } from "../middlewares/security.js";
import { transaction } from "../config/database.js";
import { history } from "../services/case-events.js";
import { audit } from "../services/audit.js";
import { parse, uuid } from "../validators/operations.js";
export function attachmentRoutes(pool, config) {
  const r = Router({ mergeParams: true });
  const storage = resolve(
    config.STORAGE_PATH ||
      fileURLToPath(new URL("../../storage/private/", import.meta.url)),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
  }).single("arquivo");
  r.post(
    "/",
    async (req, res, next) => {
      await getCase(pool, req.user, req.params.caseId);
      next();
    },
    (req, res, next) =>
      upload(req, res, (e) =>
        next(
          e
            ? new HttpError(
                400,
                "Envie um único arquivo PDF, DOCX ou imagem (PNG, JPEG, WEBP) de até 10 MB.",
              )
            : undefined,
        ),
      ),
    async (req, res) => {
      if (!req.file) throw new HttpError(400, "Selecione um arquivo.");
      const type = await fileTypeFromBuffer(req.file.buffer);
      if (
        !type ||
        ![
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "image/png",
          "image/jpeg",
          "image/webp",
        ].includes(type.mime)
      )
        throw new HttpError(
          400,
          "Formato real do arquivo não permitido. Use PDF, DOCX ou imagem (PNG, JPEG, WEBP).",
        );
      const key = randomUUID() + "." + type.ext,
        path = resolve(storage, key);
      let written = false;
      try {
        const result = await transaction(pool, async (db) => {
          const m = await getCase(db, req.user, req.params.caseId, true);
          if (m.etapa === "concluida")
            throw new HttpError(409, "Manifestação concluída.");
          const manager = (
            await db.query(
              "SELECT g.usuario_id, ge.usuario_id AS gerente_usuario FROM gestores g JOIN gerentes ge ON ge.id=g.gerente_id WHERE g.id=$1",
              [m.gestor_id],
            )
          ).rows[0];
          const waiting = ["encaminhada", "complementacao"].includes(m.etapa);
          if (
            !req.user.perfis.includes("OUVIDORIA") &&
            !(
              req.user.perfis.includes("GESTOR") &&
              manager?.usuario_id === req.user.id &&
              waiting
            ) &&
            !(
              req.user.perfis.includes("GERENTE") &&
              manager?.gerente_usuario === req.user.id &&
              m.escalado_gerente_em &&
              waiting
            )
          )
            throw new HttpError(403, "Sem permissão para anexar neste caso.");
          await mkdir(storage, { recursive: true });
          await writeFile(path, req.file.buffer, { flag: "wx", mode: 0o600 });
          written = true;
          const row = (
            await db.query(
              "INSERT INTO anexos(manifestacao_id,nome,armazenamento,mime,tamanho,sha256,autor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
              [
                m.id,
                req.file.originalname
                  .replace(/[\\/\x00-\x1f]/g, "_")
                  .slice(0, 180),
                key,
                type.mime,
                req.file.size,
                createHash("sha256").update(req.file.buffer).digest("hex"),
                req.user.id,
              ],
            )
          ).rows[0];
          await history(db, m.id, req.user.id, "anexo", { anexo_id: row.id });
          return row;
        });
        res.status(201).json(result);
      } catch (e) {
        if (written) await unlink(path).catch(() => {});
        throw e;
      }
    },
  );
  r.get("/:id", async (req, res) => {
    const m = await getCase(pool, req.user, req.params.caseId);
    const a = (
      await pool.query(
        "SELECT * FROM anexos WHERE id=$1 AND manifestacao_id=$2",
        [parse(uuid, req.params.id), m.id],
      )
    ).rows[0];
    if (!a) throw new HttpError(404, "Anexo não encontrado.");
    const path = resolve(storage, a.armazenamento);
    if (dirname(path) !== storage)
      throw new HttpError(404, "Anexo não encontrado.");
    await audit(pool, {
      actor: req.user.id,
      event: "anexo.download",
      entityId: a.id,
      requestId: req.id,
    });
    res.set("Content-Type", a.mime);
    res.download(path, a.nome);
  });
  return r;
}
