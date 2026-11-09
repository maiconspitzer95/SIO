import { useState } from "react";
import { Link, useParams, useLocation } from "react-router-dom";
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
  remaining,
} from "../components/Forms.jsx";
import { AlertTriangle } from "lucide-react";
import { morph } from "../services/glass.js";
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
  responder_gerente: "Responder como gerente",
  escalar: "Encaminhar ao gerente (24h)",
  encaminhar: "Encaminhar",
  trocar: "Trocar gestor",
  responder: "Responder",
  complementar: "Pedir nova justificativa ao gestor",
  aprovar: "Aprovar resposta",
  concluir: "Finalizar manifestação",
  discutir: "Registrar discussão",
  autorizar: "Autorizar acesso",
  revogar: "Revogar acesso",
};
export function CaseDetail() {
  const { user } = useAuth();
  const attachError = useLocation().state?.attachError;
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
    // Resposta recebida: a Ouvidoria finaliza ou pede nova justificativa.
    if (["validacao", "aprovada"].includes(m.etapa))
      actions.unshift("concluir", "complementar");
  }
  if (
    d.actions.responder &&
    ["encaminhada", "complementacao"].includes(m.etapa)
  )
    actions.push("responder");
  if (d.actions.responder_gerente) actions.unshift("responder_gerente");
  if (d.actions.escalar) actions.unshift("escalar");
  if (d.actions.discutir) actions.push("discutir");
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
      <Feedback
        error={
          error ||
          details.error ||
          (attachError && `Alguns anexos não foram enviados: ${attachError}`)
        }
        success={success}
      />
      {m.status === "Em atraso" && (
        <div className="escalation-banner">
          <AlertTriangle size={28} />
          <div>
            <strong>
              Gestor {m.gestor_nome} não respondeu no prazo
            </strong>
            <p>
              O prazo venceu em {formatDate(m.vencimento)} ({remaining(m.vencimento)}).
              {d.actions.escalar
                ? ` Você pode encaminhar ao gerente responsável, ${m.gerente_nome}, que terá 24h para responder.`
                : ` Gerente responsável: ${m.gerente_nome}.`}
            </p>
          </div>
          {d.actions.escalar && (
            <button className="secondary banner-action" onClick={() => begin("escalar")}>
              Encaminhar ao gerente
            </button>
          )}
        </div>
      )}
      {["Com gerente", "Gerente em atraso"].includes(m.status) && (
        <div className={`escalation-banner ${m.status === "Com gerente" ? "warn" : ""}`}>
          <AlertTriangle size={28} />
          <div>
            <strong>
              {m.status === "Gerente em atraso"
                ? `Gerente ${m.gerente_nome} não respondeu em 24h`
                : `Encaminhada ao gerente ${m.gerente_nome} por atraso do gestor ${m.gestor_nome}`}
            </strong>
            <p>
              Encaminhada em {formatDate(m.escalado_gerente_em)}. Prazo do
              gerente: {formatDate(m.prazo_gerente)} ({remaining(m.prazo_gerente)}).
            </p>
          </div>
        </div>
      )}
      {m.status === "Em andamento" && m.vencimento && (
        <div className="message info">
          Prazo do gestor: {formatDate(m.vencimento)} · {remaining(m.vencimento)}
        </div>
      )}
      <section className="card case-summary">
        <div>
          <small>Etapa</small>
          <strong>{stages[m.etapa]}</strong>
        </div>
        <div>
          <small>Prazo</small>
          <strong>{m.prazo_nome || m.prazo_tipo}</strong>
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
          <small>Gerente</small>
          <strong>{m.gerente_nome}</strong>
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
          ...(user.perfis.some((p) => ["OUVIDORIA", "DIRECAO"].includes(p))
            ? ["Discussão com a Direção"]
            : []),
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => morph(() => setTab(t))}
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
              {m.escalado_gerente_em && (
                <>
              <div>
                <dt>Encaminhada ao gerente</dt>
                <dd>{formatDate(m.escalado_gerente_em)}</dd>
              </div>
              <div>
                <dt>Prazo do gerente (24h)</dt>
                <dd>{formatDate(m.prazo_gerente)}</dd>
              </div>
              <div>
                <dt>Resposta do gerente</dt>
                <dd>{formatDate(m.resposta_gerente_em)}</dd>
              </div>
                </>
              )}
              <div>
                <dt>Resposta da Ouvidoria</dt>
                <dd>{formatDate(m.respondido_em)}</dd>
              </div>
            </dl>
            {!d.contato && (
              <div className="contact-box muted">
                <h3>Contato</h3>
                <p>Dados do contato ocultos pela Ouvidoria.</p>
              </div>
            )}
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
              <article className={`timeline-item ${x.origem === "gerente" ? "gerente" : ""}`} key={x.id}>
                <strong>
                  {formatDate(x.criado_em)} ·{" "}
                  {x.origem === "gerente" ? "Resposta do gerente" : "Resposta do gestor"}
                </strong>
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
              Documentos privados. Formatos permitidos: PDF, DOCX e imagens (PNG, JPEG, WEBP), até 10
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
                d.actions.responder_gerente ||
                (d.actions.responder &&
                  ["encaminhada", "complementacao"].includes(m.etapa))) && (
                <form onSubmit={attach} className="actions">
                  <input
                    aria-label="Arquivo para anexar"
                    type="file"
                    name="arquivo"
                    required
                    accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
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
            className={["concluir", "responder_gerente", "responder", "escalar"].includes(a) ? "primary" : "secondary"}
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
          {action === "escalar" && (
            <p className="message info">
              O gerente {m.gerente_nome} será notificado e terá 24h para
              responder à Ouvidoria. A observação abaixo é opcional.
            </p>
          )}
          <div className="form-grid">
            {action === "trocar" && (
              <Field label="Novo gestor">
                <Select
                  required
                  items={lookups.data?.gestores.filter(
                    (g) =>
                      g.id !== m.gestor_id &&
                      (g.area_id === m.area_id ||
                        (g.setores || []).some((s) => s.area_id === m.area_id)),
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
          {["responder", "responder_gerente", "concluir", "providenciar"].includes(action) && (
            <Field
              label={
                action === "concluir"
                  ? "Resposta institucional final"
                  : "Resposta"
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
            <Field label="Como o retorno foi dado ao manifestante? (opcional)">
              <textarea
                value={form.procedimento}
                onChange={(e) => change("procedimento", e.target.value)}
              />
            </Field>
          )}
          {!["concluir", "aprovar", "responder", "responder_gerente"].includes(action) && (
            <Field
              label={
                action === "discutir"
                  ? "Observações"
                  : "Justificativa / solicitação"
              }
            >
              <textarea
                required={!["responder", "responder_gerente", "encaminhar", "escalar"].includes(action)}
                rows={3}
                value={form.justificativa}
                onChange={(e) => change("justificativa", e.target.value)}
              />
            </Field>
          )}
          <div className="actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "Registrando…"
                : ["responder", "responder_gerente"].includes(action)
                  ? "Enviar resposta"
                  : action === "concluir"
                    ? "Finalizar"
                    : "Confirmar ação"}
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
