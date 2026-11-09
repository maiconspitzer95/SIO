import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useData } from "../hooks/useData.js";
import { api } from "../services/api.js";
import { Field, Select, Feedback, today } from "../components/Forms.jsx";
import { PageTitle } from "../components/PageTitle.jsx";
import { Paperclip, FileText } from "lucide-react";
export function CaseForm() {
  const { id } = useParams(),
    navigate = useNavigate(),
    lookups = useData("/catalogs/lookups"),
    existing = useData(id ? "/cases/" + id : null);
  const [form, setForm] = useState({
      data_manifestacao: today(),
      tipo: "Reclamação",
      canal: "Pessoal",
      area_id: "",
      motivo_id: "",
      setor_id: "",
      prazo_id: "",
      gestor_id: "",
      local_complemento: "",
      relato: "",
      contato_nome: "",
      contato_email: "",
      contato_telefone: "",
      contato_usuario_id: null,
      conflitos: [],
      ocultar_contato: false,
      terceiro_confirmado: false,
    }),
    [error, setError] = useState(""),
    [files, setFiles] = useState([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (existing.data) {
      const { manifestacao: m, contato: c, conflitos } = existing.data;
      setForm((f) =>
        Object.fromEntries([
          ...Object.keys(f).map((k) => [k, m[k] ?? f[k]]),
          ["data_manifestacao", String(m.data_manifestacao).slice(0, 10)],
          ["contato_nome", c?.nome || ""],
          ["contato_email", c?.email || ""],
          ["contato_telefone", c?.telefone || ""],
          ["contato_usuario_id", c?.usuario_id || null],
          ["conflitos", conflitos || []],
          ["ocultar_contato", !!m.ocultar_contato],
          ["versao", m.versao],
          ["justificativa", ""],
        ]),
      );
    }
  }, [existing.data]);
  const change = (k, v) =>
    setForm((f) => {
      const next = {
        ...f,
        [k]: v,
        ...(k === "area_id"
          ? { motivo_id: "", setor_id: "", gestor_id: "" }
          : {}),
      };
      // Ao escolher o local, sugere o gestor quando há apenas um responsável.
      if (k === "setor_id" && !id) {
        const options = gestoresFor(lookups.data?.gestores, next);
        if (!options.some((g) => g.id === next.gestor_id))
          next.gestor_id = options.length === 1 ? options[0].id : "";
      }
      return next;
    });
  async function submit(e) {
    e.preventDefault();
    const send = e.nativeEvent.submitter?.value === "send";
    if (
      !confirm(
        id
          ? "Salvar edição e justificativa no histórico?"
          : send
            ? "Salvar e encaminhar ao gestor agora?"
            : "Salvar como rascunho?",
      )
    )
      return;
    setError("");
    setBusy(true);
    try {
      const result = await api("/cases" + (id ? "/" + id : ""), {
        method: id ? "PUT" : "POST",
        body: { ...form, encaminhar: send },
      });
      const caseId = id || result.id;
      // Envia os anexos um a um depois de salvar o registro.
      const failed = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append("arquivo", file);
        try {
          await api(`/cases/${caseId}/attachments`, { method: "POST", body: fd });
        } catch (e) {
          failed.push(`${file.name}: ${e.message}`);
        }
      }
      navigate("/manifestacoes/" + caseId, {
        state: failed.length ? { attachError: failed.join(" · ") } : undefined,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (lookups.loading || (id && existing.loading))
    return <p role="status">Carregando formulário…</p>;
  const l = lookups.data || {};
  return (
    <>
      <PageTitle
        eyebrow="OUVIDORIA"
        title={id ? "Editar manifestação" : "Nova manifestação"}
      >
        O número é gerado automaticamente. O prazo do gestor começa no
        encaminhamento; se ele não responder, o caso fica em vermelho e vai ao
        gerente, que tem 24h para responder.
      </PageTitle>
      <Feedback error={error || lookups.error || existing.error} />
      <form className="card form-card" onSubmit={submit}>
        <h2>Dados do atendimento</h2>
        <div className="form-grid">
          <Field label="Data da manifestação">
            <input
              type="date"
              required
              value={form.data_manifestacao}
              onChange={(e) => change("data_manifestacao", e.target.value)}
            />
          </Field>
          {[
            [
              "tipo",
              "Tipo",
              ["Elogio", "Reclamação", "Denúncia", "Informação", "Sugestão"],
            ],
            ["canal", "Canal", ["E-mail", "Pessoal", "Telefone"]],
            ["area_id", "Área", l.areas_tecnicas],
            [
              "motivo_id",
              "Motivo",
              l.motivos?.filter((x) => x.area_id === form.area_id),
            ],
            [
              "setor_id",
              "Local da ocorrência",
              l.setores?.filter((x) => x.area_id === form.area_id),
            ],
            ["prazo_id", "Prazo para o gestor responder", l.prazos],
            ["gestor_id", "Gestor responsável", gestoresFor(l.gestores, form)],
          ].map(([k, label, items]) => (
            <Field key={k} label={label}>
              <Select
                required
                disabled={
                  !!id &&
                  ["area_id", "motivo_id", "prazo_id", "gestor_id"].includes(k)
                }
                items={items || []}
                value={form[k]}
                onChange={(e) => change(k, e.target.value)}
              />
            </Field>
          ))}
          <Field label="Complemento do local">
            <input
              value={form.local_complemento}
              onChange={(e) => change("local_complemento", e.target.value)}
            />
          </Field>
        </div>
        <h2>Contato e relato</h2>
        <div className="form-grid">
          <Field label="Nome do contato">
            <input
              required
              maxLength={160}
              value={form.contato_nome}
              onChange={(e) => change("contato_nome", e.target.value)}
            />
          </Field>
          <Field label="E-mail de retorno">
            <input
              type="email"
              required={form.canal === "E-mail"}
              value={form.contato_email}
              onChange={(e) => change("contato_email", e.target.value)}
            />
          </Field>
          <Field label="Telefone de retorno">
            <input
              required={form.canal === "Telefone"}
              value={form.contato_telefone}
              onChange={(e) => change("contato_telefone", e.target.value)}
            />
          </Field>
          <label className="check-field hide-contact wide">
            <input
              type="checkbox"
              checked={form.ocultar_contato}
              onChange={(e) => change("ocultar_contato", e.target.checked)}
            />
            <span>
              <strong>Ocultar dados do contato</strong>
              <small className="muted">
                {form.ocultar_contato
                  ? "Nome, e-mail e telefone ficam visíveis só para a Ouvidoria."
                  : "O gestor responsável verá nome, e-mail e telefone do contato."}
              </small>
            </span>
          </label>
        </div>
        <Field label="Descritivo da manifestação">
          <textarea
            required
            rows={7}
            maxLength={10000}
            value={form.relato}
            onChange={(e) => change("relato", e.target.value)}
          />
        </Field>
        <div className="field">
          <label htmlFor="case-files">Anexar documentos</label>
          <label className="file-drop" htmlFor="case-files">
            <Paperclip size={20} />
            <span>
              <strong>Selecionar arquivos</strong>
              <small>PDF, DOCX ou imagem (PNG, JPEG, WEBP) · até 10 MB cada</small>
            </span>
          </label>
          <input
            id="case-files"
            className="visually-hidden"
            type="file"
            multiple
            accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const picked = [...e.target.files];
              const tooBig = picked.filter((f) => f.size > 10 * 1024 * 1024);
              if (tooBig.length)
                setError(`Arquivo acima de 10 MB: ${tooBig.map((f) => f.name).join(", ")}`);
              setFiles((list) => [...list, ...picked.filter((f) => f.size <= 10 * 1024 * 1024)]);
              e.target.value = "";
            }}
          />
          {files.length > 0 && (
            <ul className="file-list">
              {files.map((f, i) => (
                <li key={i}>
                  <FileText size={16} />
                  <span>{f.name}</span>
                  <small>{Math.ceil(f.size / 1024)} KB</small>
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => setFiles((list) => list.filter((_, j) => j !== i))}
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {id && (
          <Field label="Justificativa da edição">
            <textarea
              required
              value={form.justificativa || ""}
              onChange={(e) => change("justificativa", e.target.value)}
            />
          </Field>
        )}
        <label className="check-field">
          <input
            type="checkbox"
            required
            checked={form.terceiro_confirmado}
            onChange={(e) => change("terceiro_confirmado", e.target.checked)}
          />
          Confirmo que este relato é de terceiro.
        </label>
        <div className="actions">
          <button className="primary" disabled={busy} value="draft">
            {busy ? "Salvando…" : id ? "Salvar edição" : "Salvar rascunho"}
          </button>
          {!id && (
            <button className="primary" disabled={busy} value="send">
              Salvar e encaminhar
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={() =>
              navigate(id ? "/manifestacoes/" + id : "/manifestacoes")
            }
          >
            Cancelar
          </button>
        </div>
      </form>
    </>
  );
}

/** Gestores do setor escolhido; sem setor, todos que atuam na área. */
function gestoresFor(gestores = [], form) {
  const inArea = gestores.filter(
    (g) =>
      g.area_id === form.area_id ||
      (g.setores || []).some((s) => s.area_id === form.area_id),
  );
  if (!form.setor_id) return inArea;
  const inSector = inArea.filter((g) =>
    (g.setores || []).some((s) => s.id === form.setor_id),
  );
  const rest = inArea.filter((g) => !inSector.includes(g));
  return [
    ...inSector.map((g) => ({ ...g, nome: `${g.nome} · ${g.gerente_nome || "sem gerente"}` })),
    ...rest,
  ];
}
