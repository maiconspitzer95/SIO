import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useData } from "../hooks/useData.js";
import { api } from "../services/api.js";
import { Field, Select, Feedback, today } from "../components/Forms.jsx";
import { PageTitle } from "../components/PageTitle.jsx";
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
      terceiro_confirmado: false,
    }),
    [error, setError] = useState(""),
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
          ["versao", m.versao],
          ["justificativa", ""],
        ]),
      );
    }
  }, [existing.data]);
  const change = (k, v) =>
    setForm((f) => ({
      ...f,
      [k]: v,
      ...(k === "area_id"
        ? { motivo_id: "", setor_id: "", gestor_id: "" }
        : {}),
    }));
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
      navigate("/manifestacoes/" + (id || result.id));
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
        O número será gerado automaticamente. O prazo começa no encaminhamento
        efetivo.
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
            ["prazo_id", "Tempo de resposta", l.prazos],
            [
              "gestor_id",
              "Gestor responsável",
              l.gestores?.filter((x) => x.area_id === form.area_id),
            ],
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
          <Field
            label="Contato é usuário do sistema?"
            help="Vincule quando aplicável para prevenir conflitos de interesses."
          >
            <Select
              empty="Não é usuário cadastrado"
              items={l.pessoas}
              value={form.contato_usuario_id || ""}
              onChange={(e) =>
                change("contato_usuario_id", e.target.value || null)
              }
            />
          </Field>
          <Field
            label="Usuários com conflito de interesses"
            help="Selecione os envolvidos que não devem acessar este caso."
          >
            <select
              multiple
              value={form.conflitos}
              onChange={(e) =>
                change(
                  "conflitos",
                  [...e.target.selectedOptions].map((o) => o.value),
                )
              }
            >
              {l.pessoas?.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Field>
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
          Confirmo que este relato é de terceiro e que revisei os conflitos de
          interesses.
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
