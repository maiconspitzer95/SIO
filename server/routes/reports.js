import { Router } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { filter, joins, columns, statusSql } from "../repositories/cases.js";
import { requirePermission, HttpError } from "../middlewares/security.js";
import { audit } from "../services/audit.js";
const dimensions = {
  tipo: "m.tipo",
  area: "a.nome",
  motivo: "mot.nome",
  gestor: "g.nome",
  canal: "m.canal",
  periodo: "to_char(m.data_manifestacao,'YYYY-MM')",
};
export function reportRoutes(pool) {
  const r = Router();
  r.use(requirePermission("indicadores.consultar"));
  r.get("/", async (req, res) => {
    const { sql, values } = filter(req.user, req.query);
    const totals = (
      await pool.query(
        `SELECT count(*)::int total,count(*) FILTER(WHERE m.etapa='concluida')::int concluidas,count(*) FILTER(WHERE m.etapa<>'concluida')::int andamento,count(*) FILTER(WHERE ${statusSql}='Em atraso')::int atraso,count(*) FILTER(WHERE m.concluido_atraso)::int concluidas_atraso,count(*) FILTER(WHERE p.tipo='Judicial')::int judiciais,count(*) FILTER(WHERE EXISTS(SELECT 1 FROM discussoes_direcao d WHERE d.manifestacao_id=m.id))::int discutidas,round(avg(extract(epoch FROM(m.resposta_gestor_em-m.enviado_em))/3600)::numeric,2) media_resposta_horas ${joins} WHERE ${sql}`,
        values,
      )
    ).rows[0];
    const groups = {};
    for (const [key, expression] of Object.entries(dimensions))
      groups[key] = (
        await pool.query(
          `SELECT ${expression} nome,count(*)::int total ${joins} WHERE ${sql} GROUP BY ${expression} ORDER BY ${key === "periodo" ? expression : "total DESC"}`,
          values,
        )
      ).rows;
    groups.cumprimento = (
      await pool.query(
        `SELECT g.nome,count(*) FILTER(WHERE m.resposta_gestor_em IS NOT NULL)::int respondidas,count(*) FILTER(WHERE m.resposta_gestor_em<=m.vencimento)::int no_prazo,count(*) FILTER(WHERE m.resposta_gestor_em>m.vencimento)::int fora_prazo ${joins} WHERE ${sql} GROUP BY g.id ORDER BY g.nome`,
        values,
      )
    ).rows;
    const recent = (
      await pool.query(
        `SELECT m.id,'OUV-'||lpad(m.numero::text,greatest(6,length(m.numero::text)),'0') registro,m.tipo,a.nome area_nome,g.nome gestor_nome,m.vencimento,${statusSql} status ${joins} WHERE ${sql} ORDER BY m.numero DESC LIMIT 8`,
        values,
      )
    ).rows;
    const upcoming = (
      await pool.query(
        `SELECT m.id,'OUV-'||lpad(m.numero::text,greatest(6,length(m.numero::text)),'0') registro,g.nome gestor_nome,m.vencimento ${joins} WHERE ${sql} AND m.etapa IN ('encaminhada','complementacao') AND m.vencimento BETWEEN now() AND now()+interval '24 hours' ORDER BY m.vencimento LIMIT 20`,
        values,
      )
    ).rows;
    await audit(pool, {
      actor: req.user.id,
      event: "indicadores.consulta",
      requestId: req.id,
    });
    res.json({ totals, groups, recent, upcoming });
  });
  r.get("/export/:format", async (req, res) => {
    if (!["pdf", "xlsx"].includes(req.params.format))
      throw new HttpError(400, "Formato inválido.");
    const { sql, values } = filter(req.user, req.query);
    const rows = (
      await pool.query(
        `SELECT ${columns} ${joins} WHERE ${sql} ORDER BY m.numero LIMIT 10001`,
        values,
      )
    ).rows;
    if (rows.length > 10000)
      throw new HttpError(
        400,
        "Selecione um período menor: limite de 10.000 registros por exportação.",
      );
    await audit(pool, {
      actor: req.user.id,
      event: `relatorio.${req.params.format}`,
      requestId: req.id,
    });
    const fields = {
      registro: "Registro",
      data_manifestacao: "Data da manifestação",
      tipo: "Tipo",
      canal: "Canal",
      area_nome: "Área",
      motivo_nome: "Motivo",
      gestor_nome: "Gestor",
      gerente_nome: "Gerente",
      status: "Status",
      prazo_tipo: "Prazo",
      enviado_em: "Encaminhamento",
      vencimento: "Vencimento",
      resposta_gestor_em: "Resposta do gestor",
      respondido_em: "Resposta da Ouvidoria",
      concluido_em: "Conclusão",
      concluido_atraso: "Concluído com atraso",
      relato: "Relato",
      resposta_final: "Resposta final",
    };
    const value = (v) =>
      v instanceof Date
        ? v.toISOString()
        : v === null || v === undefined
          ? ""
          : typeof v === "boolean"
            ? v
              ? "Sim"
              : "Não"
            : String(v);
    if (req.params.format === "xlsx") {
      const book = new ExcelJS.Workbook();
      book.creator = "SIO";
      const sheet = book.addWorksheet("Manifestações");
      sheet.columns = Object.entries(fields).map(([key, header]) => ({
        key,
        header,
        width: key === "relato" || key === "resposta_final" ? 60 : 24,
      }));
      for (const row of rows)
        sheet.addRow(
          Object.fromEntries(
            Object.keys(fields).map((k) => [k, value(row[k])]),
          ),
        );
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF122D4A" },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];
      sheet.autoFilter = { from: "A1", to: "R1" };
      res.type(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.attachment("sio-manifestacoes.xlsx");
      await book.xlsx.write(res);
      res.end();
    } else {
      const doc = new PDFDocument({
        size: "A4",
        margin: 40,
        bufferPages: true,
      });
      res.type("application/pdf");
      res.attachment("sio-manifestacoes.pdf");
      doc.pipe(res);
      doc.fontSize(18).text("SIO — Relatório de manifestações");
      doc
        .fontSize(10)
        .text(`Santa Casa de Pelotas | ${rows.length} registros autorizados`);
      doc.text(
        `Período de ocorrência: ${req.query.inicio || "início"} a ${req.query.fim || "hoje"}`,
      );
      doc.moveDown();
      if (!rows.length)
        doc.text("Nenhum registro para os filtros selecionados.");
      for (const row of rows) {
        if (doc.y > 650) doc.addPage();
        doc.font("Helvetica-Bold").fontSize(12).text(row.registro);
        doc.font("Helvetica").fontSize(9);
        for (const [key, label] of Object.entries(fields))
          if (key !== "registro")
            doc.text(`${label}: ${value(row[key])}`, { lineGap: 2 });
        doc.moveDown();
      }
      doc.end();
    }
  });
  return r;
}
