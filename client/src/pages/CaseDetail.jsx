import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../services/api.js";
import { useData } from "../hooks/useData.js";
import { PageTitle } from "../components/PageTitle.jsx";
import {
  Field,
  Select,
  Feedback,
  Status,
  formatDate,
  day,
  today,
} from "../components/Forms.jsx";
const stages = {
  rascunho: "Rascunho",
  encaminhada: "Aguardando gestor",
  complementacao: "Complementação solicitada",
  validacao: "Aguardando validação",
  aprovada: "Resposta aprovada",
  concluida: "Concluída",
};
const actionNames = {
  providenciar: "Registrar providência gerencial",
  encaminhar: "Encaminhar",
  trocar: "Trocar gestor",
  responder: "Enviar resposta",
  complementar: "Solicitar complementação",
  aprovar: "Aprovar resposta",
  concluir: "Registrar resposta final e concluir",
  discutir: "Registrar discussão",
  autorizar: "Autorizar acesso",
  revogar: "Revogar acesso",
};
export function CaseDetail() {
  const { user } = useAuth();
  const { id } = useParams(),
    details = useData("/cases/" + id),
    lookups = useData("/catalogs/lookups");
  const [tab, setTab] = useState("Dados gerais"),
    [action, setAction] = useState(""),
    [form, setForm] = useState({}),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const d = details.data,
    m = d?.manifestacao;
  function begin(a) {
    setAction(a);
    setForm({
      justificativa: "",
      analise: "",
      resposta: "",
      procedimento: "",
      providencias: "",
      participantes: "",
      data: today(),
    });
    setError("");
    setSuccess("");
  }
  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  async function submit(e) {
    e.preventDefault();
    if (
      !confirm(
        `Confirmar: ${actionNames[action]}? A ação será registrada no histórico.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const body = { acao: action, versao: m.versao };
      for (const [k, v] of Object.entries(form)) if (v) body[k] = v;
      await api(`/cases/${id}/actions`, { method: "POST", body });
      setSuccess("Ação registrada.");
      setAction("");
      details.reload();
      window.dispatchEvent(new Event("sio:notifications"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function attach(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const formData = new FormData(e.currentTarget);
      await api(`/cases/${id}/attachments`, { method: "POST", body: formData });
      e.target.reset();
      details.reload();
      setSuccess("Arquivo anexado.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (details.loading && !d)
    return <p role="status">Carregando manifestação…</p>;
  if (!m) return <Feedback error={details.error} />;
  const actions = [];
  if (d.actions.operar) {
    if (m.etapa === "rascunho") actions.push("encaminhar");
    else if (m.etapa !== "concluida") actions.push("trocar");
    if (m.etapa === "validacao") actions.push("aprovar", "complementar");
    if (m.etapa === "aprovada") actions.push("complementar", "concluir");
    if (m.etapa !== "concluida") actions.push("autorizar");
    actions.push("revogar");
  }
  if (
    d.actions.responder &&
    ["encaminhada", "complementacao"].includes(m.etapa)
  )
    actions.push("responder");
  if (d.actions.discutir) actions.push("discutir");
  if (d.actions.providenciar && m.etapa !== "concluida")
    actions.push("providenciar");
  const permissionMap = {
    encaminhar: "manifestacoes.encaminhar",
    trocar: "manifestacoes.encaminhar",
    autorizar: "manifestacoes.encaminhar",
    revogar: "manifestacoes.encaminhar",
    aprovar: "manifestacoes.validar",
    complementar: "manifestacoes.validar",
    concluir: "manifestacoes.concluir",
  };
  const allowed = actions.filter(
    (a) => !permissionMap[a] || user.permissoes.includes(permissionMap[a]),
  );
  return (
    <>
      <div className="title-actions">
        <PageTitle eyebrow="MANIFESTAÇÃO" title={m.registro}>
          {m.tipo} · {m.area_nome} · {m.canal}
        </PageTitle>
        <Status value={m.status} />
      </div>
      <Feedback error={error || details.error} success={success} />
      <section className="card case-summary">
        <div>
          <small>Etapa</small>
          <strong>{stages[m.etapa]}</strong>
        </div>
        <div>
          <small>Prazo</small>
          <strong>{m.prazo_tipo}</strong>
        </div>
        <div>
          <small>Vencimento</small>
          <strong>{formatDate(m.vencimento)}</strong>
        </div>
        <div>
          <small>Gestor</small>
          <strong>{m.gestor_nome}</strong>
        </div>
        <div>
          <small>Classificação</small>
          <strong>{m.restrito ? "Restrita" : "Institucional"}</strong>
        </div>
      </section>
      <div className="tabs">
        {[
          "Dados gerais",
          "Encaminhamentos e respostas",
          "Histórico",
          "Anexos",
          "Discussão com a Direção",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="card detail-card">
        {tab === "Dados gerais" && (
          <>
            <dl className="data-grid">
              <div>
                <dt>Data da manifestação</dt>
                <dd>{day(m.data_manifestacao)}</dd>
              </div>
              <div>
                <dt>Cadastro efetivo</dt>
                <dd>{formatDate(m.criado_em)}</dd>
              </div>
              <div>
                <dt>Motivo</dt>
                <dd>{m.motivo_nome}</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>
                  {m.setor_nome} {m.local_complemento}
                </dd>
              </div>
              <div>
                <dt>Envio ao gestor</dt>
                <dd>{formatDate(m.enviado_em)}</dd>
              </div>
              <div>
                <dt>Resposta do gestor</dt>
                <dd>{formatDate(m.resposta_gestor_em)}</dd>
              </div>
              <div>
                <dt>Alerta ao gerente</dt>
                <dd>{formatDate(m.alerta_gerente_em)}</dd>
              </div>
              <div>
                <dt>Resposta da Ouvidoria</dt>
                <dd>{formatDate(m.respondido_em)}</dd>
              </div>
            </dl>
            {d.contato && (
              <div className="contact-box">
                <h3>Contato</h3>
                <p>
                  {d.contato.nome} · {d.contato.email || "Sem e-mail"} ·{" "}
                  {d.contato.telefone || "Sem telefone"}
                </p>
              </div>
            )}
            <h3>Relato recebido</h3>
            <p className="preserve-text">{m.relato}</p>
            {m.resposta_final && (
              <>
                <h3>Resposta institucional final</h3>
                <p className="preserve-text">{m.resposta_final}</p>
                <p>Retorno: {m.procedimento_retorno}</p>
                <p>
                  Concluída em {formatDate(m.concluido_em)}
                  {m.concluido_atraso ? " · Conclusão fora do prazo" : ""}
                </p>
              </>
            )}
            {d.actions.editar && (
              <Link className="inline-link" to={`/manifestacoes/${id}/editar`}>
                Editar registro com justificativa
              </Link>
            )}
            {d.autorizacoes_restritas && (
              <>
                <h3 className="section-gap">Autorizações individuais</h3>
                {d.autorizacoes_restritas.map((a) => (
                  <p key={a.id} className="small">
                    {lookups.data?.pessoas.find((p) => p.id === a.usuario_id)
                      ?.nome || a.usuario_id}{" "}
                    · {a.revogado_em ? "Revogada" : "Ativa"} · {a.justificativa}
                  </p>
                ))}
              </>
            )}
          </>
        )}
        {tab === "Encaminhamentos e respostas" && (
          <>
            <h3>Encaminhamentos</h3>
            {d.encaminhamentos.map((x) => (
              <article className="timeline-item" key={x.id}>
                <strong>{formatDate(x.enviado_em)}</strong>
                <p>
                  {lookups.data?.gestores.find((g) => g.id === x.gestor_id)
                    ?.nome || x.gestor_id}{" "}
                  · Vencimento: {formatDate(x.vencimento)}
                </p>
                <p className="preserve-text">{x.justificativa}</p>
              </article>
            ))}
            <h3>Respostas preservadas</h3>
            {d.respostas.map((x) => (
              <article className="timeline-item" key={x.id}>
                <strong>{formatDate(x.criado_em)}</strong>
                <h4>Análise</h4>
                <p className="preserve-text">{x.analise}</p>
                <h4>Justificativa e providências</h4>
                <p className="preserve-text">
                  {x.justificativa}
                  <br />
                  {x.providencias}
                </p>
                <h4>Resposta</h4>
                <p className="preserve-text">{x.resposta}</p>
              </article>
            ))}
            {!d.respostas.length && (
              <p className="empty-state">Nenhuma resposta recebida.</p>
            )}
          </>
        )}
        {tab === "Histórico" &&
          d.historico_manifestacoes.map((h) => (
            <article className="timeline-item" key={h.id}>
              <strong>{h.evento.replaceAll("_", " ")}</strong>
              <small className="cell-sub">
                {formatDate(h.criado_em)} ·{" "}
                {lookups.data?.pessoas.find((p) => p.id === h.autor_id)?.nome ||
                  "Serviço de prazos"}
              </small>
              {h.dados?.justificativa && (
                <p className="preserve-text">{h.dados.justificativa}</p>
              )}
              {h.dados?.anterior && (
                <details>
                  <summary>Versão anterior preservada</summary>
                  <pre>{JSON.stringify(h.dados, null, 2)}</pre>
                </details>
              )}
            </article>
          ))}
        {tab === "Anexos" && (
          <>
            <p>
              Documentos privados. Formatos permitidos: PDF, PNG e JPEG, até 10
              MB.
            </p>
            {d.anexos.map((a) => (
              <div className="attachment" key={a.id}>
                <a
                  className="inline-link"
                  href={`/api/cases/${id}/attachments/${a.id}`}
                >
                  {a.nome}
                </a>
                <small>
                  {Math.ceil(a.tamanho / 1024)} KB · {formatDate(a.criado_em)}
                </small>
              </div>
            ))}
            {!d.anexos.length && (
              <p className="empty-state">Nenhum documento anexado.</p>
            )}
            {m.etapa !== "concluida" &&
              (d.actions.operar ||
                (d.actions.responder &&
                  ["encaminhada", "complementacao"].includes(m.etapa))) && (
                <form onSubmit={attach} className="actions">
                  <input
                    aria-label="Arquivo para anexar"
                    type="file"
                    name="arquivo"
                    required
                    accept=".pdf,.png,.jpg,.jpeg"
                  />
                  <button className="primary" disabled={busy}>
                    Anexar documento
                  </button>
                </form>
              )}
          </>
        )}
        {tab === "Discussão com a Direção" && (
          <>
            {d.discussoes_direcao.map((x) => (
              <article className="timeline-item" key={x.id}>
                <strong>{day(x.data_discussao)}</strong>
                <p>Participantes: {x.participantes || "Não informados"}</p>
                <p className="preserve-text">{x.observacoes}</p>
                <small>Registrado em {formatDate(x.criado_em)}</small>
              </article>
            ))}
            {!d.discussoes_direcao.length && (
              <p className="empty-state">Nenhuma discussão registrada.</p>
            )}
          </>
        )}
      </section>
      <div className="actions">
        {allowed.map((a) => (
          <button
            key={a}
            className={a === "concluir" ? "primary" : "secondary"}
            onClick={() => begin(a)}
          >
            {actionNames[a]}
          </button>
        ))}
        <Link to="/manifestacoes" className="secondary">
          Voltar à lista
        </Link>
      </div>
      {action && (
        <form className="card form-card" onSubmit={submit}>
          <h2>{actionNames[action]}</h2>
          <div className="form-grid">
            {action === "trocar" && (
              <Field label="Novo gestor">
                <Select
                  required
                  items={lookups.data?.gestores.filter(
                    (g) => g.area_id === m.area_id && g.id !== m.gestor_id,
                  )}
                  value={form.gestor_id}
                  onChange={(e) => change("gestor_id", e.target.value)}
                />
              </Field>
            )}
            {["autorizar", "revogar"].includes(action) && (
              <Field label="Usuário">
                <Select
                  required
                  items={lookups.data?.pessoas}
                  value={form.usuario_id}
                  onChange={(e) => change("usuario_id", e.target.value)}
                />
              </Field>
            )}
            {action === "discutir" && (
              <>
                <Field label="Data da discussão">
                  <input
                    type="date"
                    required
                    value={form.data}
                    onChange={(e) => change("data", e.target.value)}
                  />
                </Field>
                <Field label="Participantes">
                  <input
                    value={form.participantes}
                    onChange={(e) => change("participantes", e.target.value)}
                  />
                </Field>
              </>
            )}
          </div>
          {action === "responder" && (
            <>
              <Field label="Análise">
                <textarea
                  required
                  rows={4}
                  value={form.analise}
                  onChange={(e) => change("analise", e.target.value)}
                />
              </Field>
              <Field label="Providências adotadas">
                <textarea
                  rows={3}
                  value={form.providencias}
                  onChange={(e) => change("providencias", e.target.value)}
                />
              </Field>
            </>
          )}
          {["responder", "concluir", "providenciar"].includes(action) && (
            <Field
              label={
                action === "concluir"
                  ? "Resposta institucional final"
                  : "Resposta do gestor"
              }
            >
              <textarea
                required
                rows={5}
                value={form.resposta}
                onChange={(e) => change("resposta", e.target.value)}
              />
            </Field>
          )}
          {action === "concluir" && (
            <Field label="Como a resposta foi disponibilizada ao manifestante?">
              <textarea
                required
                value={form.procedimento}
                onChange={(e) => change("procedimento", e.target.value)}
              />
            </Field>
          )}
          {!["concluir", "aprovar"].includes(action) && (
            <Field
              label={
                action === "discutir"
                  ? "Observações"
                  : "Justificativa / solicitação"
              }
            >
              <textarea
                required={!["responder", "encaminhar"].includes(action)}
                rows={3}
                value={form.justificativa}
                onChange={(e) => change("justificativa", e.target.value)}
              />
            </Field>
          )}
          <div className="actions">
            <button className="primary" disabled={busy}>
              {busy ? "Registrando…" : "Confirmar ação"}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setAction("")}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </>
  );
}
