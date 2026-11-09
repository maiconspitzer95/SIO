import { Router } from "express";
import { z } from "zod";
import {
  caseSchema,
  parse,
  uuid,
  text,
  date,
} from "../validators/operations.js";
import { transaction } from "../config/database.js";
import { HttpError } from "../middlewares/security.js";
import {
  getCase,
  filter,
  columns,
  joins,
  assertOuvidoria,
} from "../repositories/cases.js";
import {
  validateReferences,
  forward,
  notifyOuvidoria,
} from "../services/case-flow.js";
import { history, notify } from "../services/case-events.js";
import { audit } from "../services/audit.js";

export function caseRoutes(pool) {
  const r = Router();
  r.get("/", async (req, res) => {
    const { sql, values } = filter(req.user, req.query),
      page = parse(
        z.coerce.number().int().min(1).max(100000),
        req.query.page || 1,
      );
    const total = (
      await pool.query(
        `SELECT count(*)::int total ${joins} WHERE ${sql}`,
        values,
      )
    ).rows[0].total;
    const order =
      {
        numero: "m.numero",
        data: "m.data_manifestacao",
        vencimento: "m.vencimento",
      }[req.query.ordem] || "m.numero";
    const dir = req.query.direcao === "asc" ? "ASC" : "DESC";
    const rows = (
      await pool.query(
        `SELECT ${columns} ${joins} WHERE ${sql} ORDER BY ${order} ${dir},m.id LIMIT 25 OFFSET $${values.length + 1}`,
        [...values, (page - 1) * 25],
      )
    ).rows;
    res.json({
      items: rows.map(
        ({
          relato,
          resposta_final,
          procedimento_retorno,
          prazo_snapshot,
          ...row
        }) => row,
      ),
      total,
      page,
      pageSize: 25,
    });
  });
  r.post("/", async (req, res) => {
    assertOuvidoria(req.user, "manifestacoes.criar");
    const d = parse(caseSchema, req.body);
    const id = await transaction(pool, async (db) => {
      const refs = await validateReferences(db, d, req.user);
      const fields = [
        "data_manifestacao",
        "tipo",
        "canal",
        "area_id",
        "motivo_id",
        "setor_id",
        "prazo_id",
        "gestor_id",
        "local_complemento",
        "relato",
      ];
      const m = (
        await db.query(
          `INSERT INTO manifestacoes(${fields.join(",")},criado_por,restrito,ocultar_contato) VALUES(${fields.map((_, i) => "$" + (i + 1)).join(",")},$11,$12,$13) RETURNING *`,
          [...fields.map((k) => d[k]), req.user.id, refs.restricted, d.ocultar_contato],
        )
      ).rows[0];
      await db.query(
        "INSERT INTO contatos_manifestacao(manifestacao_id,nome,email,telefone,usuario_id) VALUES($1,$2,$3,$4,$5)",
        [
          m.id,
          d.contato_nome,
          d.contato_email,
          d.contato_telefone,
          d.contato_usuario_id,
        ],
      );
      for (const user of refs.conflicts)
        await db.query("INSERT INTO conflitos_manifestacao VALUES($1,$2)", [
          m.id,
          user,
        ]);
      await db.query(
        "INSERT INTO autorizacoes_restritas(manifestacao_id,usuario_id,concedido_por,justificativa) VALUES($1,$2,$2,$3)",
        [m.id, req.user.id, "Responsável pelo registro"],
      );
      await history(db, m.id, req.user.id, "registro");
      if (d.encaminhar)
        await forward(db, m, req.user, "Encaminhamento inicial");
      return m.id;
    });
    res.status(201).json({ id });
  });
  r.get("/:id", async (req, res) => {
    const m = await getCase(pool, req.user, req.params.id);
    const data = { manifestacao: m };
    const tables = {
      encaminhamentos: "enviado_em",
      respostas: "criado_em",
      historico_manifestacoes: "id",
      anexos: "criado_em",
      discussoes_direcao: "criado_em",
      autorizacoes_restritas: "criado_em",
    };
    for (const [table, order] of Object.entries(tables)) {
      if (
        table === "autorizacoes_restritas" &&
        !req.user.perfis.includes("OUVIDORIA")
      )
        continue;
      const select =
        table === "anexos" ? "id,nome,mime,tamanho,autor_id,criado_em" : "*";
      data[table] = (
        await pool.query(
          `SELECT ${select} FROM ${table} WHERE manifestacao_id=$1 ORDER BY ${order} DESC`,
          [m.id],
        )
      ).rows;
    }
    if (req.user.perfis.includes("OUVIDORIA")) {
      data.contato = (
        await pool.query(
          "SELECT * FROM contatos_manifestacao WHERE manifestacao_id=$1",
          [m.id],
        )
      ).rows[0];
      data.conflitos = (
        await pool.query(
          "SELECT usuario_id FROM conflitos_manifestacao WHERE manifestacao_id=$1",
          [m.id],
        )
      ).rows.map((r) => r.usuario_id);
    } else {
      data.historico_manifestacoes = data.historico_manifestacoes.map(
        ({ dados, ...h }) => h,
      );
      // Dados do contato só aparecem se a Ouvidoria não marcou "ocultar".
      if (!m.ocultar_contato)
        data.contato = (
          await pool.query(
            "SELECT nome,email,telefone FROM contatos_manifestacao WHERE manifestacao_id=$1",
            [m.id],
          )
        ).rows[0];
    }
    data.actions = {
      editar:
        req.user.perfis.includes("OUVIDORIA") &&
        req.user.permissoes.includes("manifestacoes.editar") &&
        m.etapa !== "concluida",
      operar: req.user.perfis.includes("OUVIDORIA"),
      escalar:
        req.user.perfis.includes("OUVIDORIA") &&
        req.user.permissoes.includes("manifestacoes.encaminhar") &&
        ["encaminhada", "complementacao"].includes(m.etapa) &&
        new Date(m.vencimento) < new Date() &&
        !m.escalado_gerente_em,
      responder:
        req.user.permissoes.includes("manifestacoes.responder") &&
        req.user.perfis.includes("GESTOR") &&
        (
          await pool.query(
            "SELECT 1 FROM gestores WHERE id=$1 AND usuario_id=$2",
            [m.gestor_id, req.user.id],
          )
        ).rowCount > 0,
      discutir: req.user.permissoes.includes("direcao.registrar"),
      responder_gerente:
        req.user.permissoes.includes("manifestacoes.responder_escalonada") &&
        req.user.perfis.includes("GERENTE") &&
        ["encaminhada", "complementacao"].includes(m.etapa) &&
        !!m.escalado_gerente_em &&
        (
          await pool.query(
            "SELECT 1 FROM gestores g JOIN gerentes ge ON ge.id=g.gerente_id WHERE g.id=$1 AND ge.usuario_id=$2",
            [m.gestor_id, req.user.id],
          )
        ).rowCount > 0,
      providenciar:
        req.user.permissoes.includes("manifestacoes.providenciar") &&
        (
          await pool.query(
            "SELECT 1 FROM autorizacoes_restritas WHERE manifestacao_id=$1 AND usuario_id=$2 AND revogado_em IS NULL",
            [m.id, req.user.id],
          )
        ).rowCount > 0,
    };
    await audit(pool, {
      actor: req.user.id,
      event: "manifestacao.consulta",
      entityId: m.id,
      requestId: req.id,
    });
    res.json(data);
  });
  r.put("/:id", async (req, res) => {
    assertOuvidoria(req.user, "manifestacoes.editar");
    const d = parse(caseSchema, req.body);
    if (!d.justificativa?.trim())
      throw new HttpError(400, "Justifique a alteração.");
    await transaction(pool, async (db) => {
      const m = await getCase(db, req.user, req.params.id, true);
      if (m.etapa === "concluida" || m.versao !== d.versao)
        throw new HttpError(
          409,
          "Registro concluído ou alterado por outro usuário. Atualize a página.",
        );
      // Atribuição e prazos só mudam pelo fluxo próprio; sigilo nunca diminui.
      if (
        m.gestor_id !== d.gestor_id ||
        m.prazo_id !== d.prazo_id ||
        m.area_id !== d.area_id ||
        m.motivo_id !== d.motivo_id
      )
        throw new HttpError(
          409,
          "Área, motivo e prazo não podem ser substituídos. Use a ação Trocar gestor para reatribuir.",
        );
      const refs = await validateReferences(db, d, req.user);
      const old = (
        await db.query(
          "SELECT * FROM contatos_manifestacao WHERE manifestacao_id=$1",
          [m.id],
        )
      ).rows[0];
      await db.query(
        "UPDATE manifestacoes SET data_manifestacao=$1,tipo=$2,canal=$3,setor_id=$4,local_complemento=$5,relato=$6,restrito=restrito OR $7,ocultar_contato=$9,versao=versao+1,atualizado_em=now() WHERE id=$8",
        [
          d.data_manifestacao,
          d.tipo,
          d.canal,
          d.setor_id,
          d.local_complemento,
          d.relato,
          refs.restricted,
          m.id,
          d.ocultar_contato,
        ],
      );
      await db.query(
        "UPDATE contatos_manifestacao SET nome=$1,email=$2,telefone=$3,usuario_id=$4 WHERE manifestacao_id=$5",
        [
          d.contato_nome,
          d.contato_email,
          d.contato_telefone,
          d.contato_usuario_id,
          m.id,
        ],
      );
      for (const user of refs.conflicts)
        await db.query(
          "INSERT INTO conflitos_manifestacao VALUES($1,$2) ON CONFLICT DO NOTHING",
          [m.id, user],
        );
      if (refs.restricted && !m.restrito && m.etapa !== "rascunho")
        await db.query(
          `INSERT INTO autorizacoes_restritas(manifestacao_id,usuario_id,concedido_por,justificativa) SELECT $1,usuario_id,$2,'Sigilo elevado em caso atribuído' FROM gestores WHERE id=$3 ON CONFLICT(manifestacao_id,usuario_id) DO UPDATE SET revogado_em=NULL`,
          [m.id, req.user.id, m.gestor_id],
        );
      await history(db, m.id, req.user.id, "edicao", {
        justificativa: d.justificativa,
        anterior: m,
        contato_anterior: old,
      });
    });
    res.json({ ok: true });
  });
  r.post("/:id/actions", async (req, res) => {
    const d = parse(
      z
        .object({
          acao: z.enum([
            "encaminhar",
            "trocar",
            "responder",
            "complementar",
            "aprovar",
            "concluir",
            "discutir",
            "autorizar",
            "revogar",
            "providenciar",
            "responder_gerente",
            "escalar",
          ]),
          versao: z.number().int(),
          justificativa: z.string().trim().max(10000).default(""),
          gestor_id: uuid.optional(),
          analise: z.string().trim().max(10000).optional(),
          providencias: z.string().trim().max(10000).default(""),
          resposta: z.string().trim().max(10000).optional(),
          procedimento: z.string().trim().max(1000).optional(),
          data: date.optional(),
          participantes: z.string().max(1000).default(""),
          usuario_id: uuid.optional(),
        })
        .strict(),
      req.body,
    );
    await transaction(pool, async (db) => {
      const m = await getCase(db, req.user, req.params.id, true);
      if (m.versao !== d.versao)
        throw new HttpError(
          409,
          "Registro alterado. Atualize a página antes de continuar.",
        );
      if (m.etapa === "concluida" && !["discutir", "revogar"].includes(d.acao))
        throw new HttpError(409, "Manifestação concluída.");
      const gestor = (
        await db.query("SELECT * FROM gestores WHERE id=$1", [m.gestor_id])
      ).rows[0];
      if (
        [
          "encaminhar",
          "trocar",
          "complementar",
          "aprovar",
          "concluir",
          "autorizar",
          "revogar",
          "escalar",
        ].includes(d.acao)
      )
        assertOuvidoria(
          req.user,
          d.acao === "concluir"
            ? "manifestacoes.concluir"
            : ["aprovar", "complementar"].includes(d.acao)
              ? "manifestacoes.validar"
              : "manifestacoes.encaminhar",
        );
      if (d.acao === "encaminhar" || d.acao === "trocar") {
        if (
          (d.acao === "encaminhar" && m.etapa !== "rascunho") ||
          (d.acao === "trocar" && m.etapa === "rascunho")
        )
          throw new HttpError(409, "Etapa incompatível com esta ação.");
        if (d.acao === "trocar" && (!d.gestor_id || !d.justificativa))
          throw new HttpError(400, "Informe gestor e justificativa.");
        await forward(
          db,
          m,
          req.user,
          d.justificativa || "Encaminhamento inicial",
          d.gestor_id || m.gestor_id,
        );
        return;
      }
      if (d.acao === "providenciar") {
        if (
          !req.user.perfis.includes("GERENTE") ||
          !req.user.permissoes.includes("manifestacoes.providenciar") ||
          !(
            await db.query(
              "SELECT 1 FROM autorizacoes_restritas WHERE manifestacao_id=$1 AND usuario_id=$2 AND revogado_em IS NULL",
              [m.id, req.user.id],
            )
          ).rowCount
        )
          throw new HttpError(
            403,
            "Providência gerencial exige autorização individual.",
          );
        if (!d.resposta) throw new HttpError(400, "Informe as providências.");
        await db.query(
          "INSERT INTO respostas(manifestacao_id,autor_id,analise,providencias,resposta) VALUES($1,$2,$3,$4,$4)",
          [m.id, req.user.id, "Providência gerencial autorizada", d.resposta],
        );
      }
      if (d.acao === "escalar") {
        if (!["encaminhada", "complementacao"].includes(m.etapa))
          throw new HttpError(409, "Não há solicitação aguardando resposta do gestor.");
        if (!(new Date(m.vencimento) < new Date()))
          throw new HttpError(
            409,
            "Só é possível encaminhar ao gerente depois que o prazo do gestor vencer.",
          );
        if (m.escalado_gerente_em)
          throw new HttpError(409, "Esta manifestação já foi encaminhada ao gerente.");
        const ger = (
          await db.query(
            "SELECT ge.id, ge.nome, ge.usuario_id, ge.ativo FROM gestores g JOIN gerentes ge ON ge.id=g.gerente_id WHERE g.id=$1",
            [m.gestor_id],
          )
        ).rows[0];
        if (!ger?.ativo)
          throw new HttpError(409, "O gestor não possui gerente responsável ativo.");
        if (
          ger.usuario_id &&
          (
            await db.query(
              "SELECT 1 FROM conflitos_manifestacao WHERE manifestacao_id=$1 AND usuario_id=$2",
              [m.id, ger.usuario_id],
            )
          ).rowCount
        )
          throw new HttpError(409, "O gerente possui conflito de interesses neste caso.");
        await db.query(
          "UPDATE manifestacoes SET escalado_gerente_em=now(),vencimento_gerente=now()+interval '24 hours',alerta_gerente_em=COALESCE(alerta_gerente_em,now()) WHERE id=$1",
          [m.id],
        );
        const sigiloso =
          m.restrito ||
          (await db.query("SELECT restrito FROM motivos WHERE id=$1", [m.motivo_id])).rows[0]?.restrito;
        // Casos não sigilosos já são visíveis ao gerente; nos sigilosos a autorização é concedida aqui.
        if (ger.usuario_id && sigiloso)
          await db.query(
            `INSERT INTO autorizacoes_restritas(manifestacao_id,usuario_id,concedido_por,justificativa)
             VALUES($1,$2,$3,$4)
             ON CONFLICT(manifestacao_id,usuario_id) DO UPDATE SET revogado_em=NULL,concedido_por=excluded.concedido_por,justificativa=excluded.justificativa`,
            [m.id, ger.usuario_id, req.user.id, "Encaminhado ao gerente por atraso do gestor"],
          );
        await notify(
          db,
          m.id,
          [ger.usuario_id, gestor.usuario_id],
          `Manifestação em atraso encaminhada ao gerente ${ger.nome} — 24h para responder`,
          `${m.id}:escalada:${m.versao}`,
        );
      }
      if (d.acao === "responder_gerente") {
        const isManager = (
          await db.query(
            "SELECT 1 FROM gerentes WHERE id=(SELECT gerente_id FROM gestores WHERE id=$1) AND usuario_id=$2 AND ativo",
            [m.gestor_id, req.user.id],
          )
        ).rowCount;
        if (
          !req.user.perfis.includes("GERENTE") ||
          !req.user.permissoes.includes("manifestacoes.responder_escalonada") ||
          !isManager
        )
          throw new HttpError(
            403,
            "Somente o gerente responsável pelo gestor pode responder.",
          );
        if (!["encaminhada", "complementacao"].includes(m.etapa))
          throw new HttpError(409, "Não há solicitação aguardando resposta.");
        if (!m.escalado_gerente_em)
          throw new HttpError(
            409,
            "O caso ainda não foi encaminhado pela Ouvidoria ao gerente.",
          );
        if (!d.resposta) throw new HttpError(400, "Informe a resposta.");
        await db.query(
          "INSERT INTO respostas(manifestacao_id,autor_id,analise,justificativa,providencias,resposta,origem) VALUES($1,$2,$3,$4,$5,$6,'gerente')",
          [m.id, req.user.id, d.analise || "", d.justificativa, d.providencias, d.resposta],
        );
        await db.query(
          "UPDATE manifestacoes SET etapa='validacao',resposta_gerente_em=now(),escalado_gerente_em=COALESCE(escalado_gerente_em,now()) WHERE id=$1",
          [m.id],
        );
        await notifyOuvidoria(
          db,
          m.id,
          "Resposta do gerente recebida (caso escalonado)",
          `${m.id}:resposta-gerente:${m.versao}`,
        );
      }
      if (d.acao === "responder") {
        if (
          !req.user.perfis.includes("GESTOR") ||
          !req.user.permissoes.includes("manifestacoes.responder") ||
          gestor.usuario_id !== req.user.id
        )
          throw new HttpError(
            403,
            "Somente o gestor atribuído pode responder.",
          );
        if (!["encaminhada", "complementacao"].includes(m.etapa))
          throw new HttpError(409, "Não há solicitação aguardando resposta.");
        if (!d.resposta) throw new HttpError(400, "Informe a resposta.");
        await db.query(
          "INSERT INTO respostas(manifestacao_id,autor_id,analise,justificativa,providencias,resposta) VALUES($1,$2,$3,$4,$5,$6)",
          [
            m.id,
            req.user.id,
            d.analise || "",
            d.justificativa,
            d.providencias,
            d.resposta,
          ],
        );
        await db.query(
          "UPDATE manifestacoes SET etapa='validacao',resposta_gestor_em=now() WHERE id=$1",
          [m.id],
        );
        await notifyOuvidoria(
          db,
          m.id,
          "Resposta recebida",
          `${m.id}:resposta:${m.versao}`,
        );
      }
      if (d.acao === "complementar") {
        if (!["validacao", "aprovada"].includes(m.etapa) || !d.justificativa)
          throw new HttpError(
            409,
            "Informe uma complementação após receber a resposta.",
          );
        await db.query(
          "UPDATE manifestacoes SET etapa='complementacao',resposta_gestor_em=NULL WHERE id=$1",
          [m.id],
        );
        await notify(
          db,
          m.id,
          [gestor.usuario_id],
          "Complementação solicitada",
          `${m.id}:complemento:${m.versao}`,
        );
      }
      if (d.acao === "aprovar") {
        if (m.etapa !== "validacao")
          throw new HttpError(409, "Resposta não está aguardando validação.");
        await db.query(
          "UPDATE manifestacoes SET etapa='aprovada' WHERE id=$1",
          [m.id],
        );
      }
      if (d.acao === "concluir") {
        if (!["validacao", "aprovada"].includes(m.etapa) || !d.resposta)
          throw new HttpError(
            409,
            "Finalize após receber a resposta e informe a devolutiva final.",
          );
        await db.query(
          "UPDATE manifestacoes SET etapa='concluida',resposta_final=$1,procedimento_retorno=$2,respondido_em=now(),concluido_em=now(),concluido_atraso=now()>vencimento WHERE id=$3",
          [d.resposta, d.procedimento || "", m.id],
        );
        await notify(
          db,
          m.id,
          [gestor.usuario_id, m.criado_por],
          "Manifestação concluída",
          `${m.id}:conclusao`,
        );
      }
      if (d.acao === "discutir") {
        if (!req.user.permissoes.includes("direcao.registrar"))
          throw new HttpError(403, "Sem permissão para discussões.");
        if (!d.data || !d.justificativa)
          throw new HttpError(400, "Informe data e observações.");
        await db.query(
          "INSERT INTO discussoes_direcao(manifestacao_id,data_discussao,participantes,observacoes,autor_id) VALUES($1,$2,$3,$4,$5)",
          [m.id, d.data, d.participantes, d.justificativa, req.user.id],
        );
      }
      if (["autorizar", "revogar"].includes(d.acao)) {
        if (!d.usuario_id || !d.justificativa || d.usuario_id === req.user.id)
          throw new HttpError(
            400,
            "Informe outro usuário e justifique a autorização/revogação.",
          );
        if (d.acao === "autorizar") {
          if (
            (
              await db.query(
                "SELECT 1 FROM conflitos_manifestacao WHERE manifestacao_id=$1 AND usuario_id=$2",
                [m.id, d.usuario_id],
              )
            ).rowCount
          )
            throw new HttpError(409, "Usuário possui conflito de interesses.");
          if (
            !(
              await db.query("SELECT id FROM usuarios WHERE id=$1 AND ativo", [
                d.usuario_id,
              ])
            ).rowCount
          )
            throw new HttpError(400, "Usuário inativo.");
          await db.query(
            `INSERT INTO autorizacoes_restritas(manifestacao_id,usuario_id,concedido_por,justificativa) VALUES($1,$2,$3,$4) ON CONFLICT(manifestacao_id,usuario_id) DO UPDATE SET revogado_em=NULL,concedido_por=excluded.concedido_por,justificativa=excluded.justificativa`,
            [m.id, d.usuario_id, req.user.id, d.justificativa],
          );
        } else
          await db.query(
            "UPDATE autorizacoes_restritas SET revogado_em=now() WHERE manifestacao_id=$1 AND usuario_id=$2",
            [m.id, d.usuario_id],
          );
      }
      await db.query(
        "UPDATE manifestacoes SET versao=versao+1,atualizado_em=now() WHERE id=$1",
        [m.id],
      );
      await history(db, m.id, req.user.id, d.acao, {
        justificativa: d.justificativa,
        usuario_id: d.usuario_id,
      });
    });
    res.json({ ok: true });
  });
  return r;
}
