import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Siren,
  Inbox,
  FolderOpen,
  Clock3,
  UserX,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useData } from "../hooks/useData.js";
import { api } from "../services/api.js";
import { useAuth } from "../hooks/useAuth.jsx";
import { PageTitle } from "../components/PageTitle.jsx";
import { CaseFilters, queryString } from "../components/CaseFilters.jsx";
import {
  Status,
  formatDate,
  Feedback,
  remaining,
} from "../components/Forms.jsx";

/** Barras horizontais de série única: rótulo + valor em texto, barra só como apoio. */
function Bars({ rows, value = "total", late, limit = 10, empty }) {
  const list = rows.slice(0, limit);
  const max = Math.max(...list.map((r) => r[value]), 1);
  if (!list.length) return <p className="empty-state">{empty || "Nenhum registro no período."}</p>;
  return list.map((r, i) => (
    <div className="bar-row" key={i} title={`${r.nome}: ${r[value]}`}>
      <div>
        <span>
          {limit <= 10 && <span className="rank">{i + 1}</span>}
          {r.nome}
        </span>
        <strong>
          {r[value]}
          {late && r[late] > 0 && <em>{r[late]} em atraso</em>}
        </strong>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div
          className={`bar-fill ${value !== "total" && value !== "recebidas" ? "late" : ""}`}
          style={{ width: `${(r[value] / max) * 100}%` }}
        />
      </div>
    </div>
  ));
}

export function Dashboard({ reports = false }) {
  const { user } = useAuth();
  const direcao = user.perfis.includes("DIRECAO");
  const [filters, setFilters] = useState({}),
    [downloadError, setDownloadError] = useState(""),
    [busy, setBusy] = useState(false),
    data = useData("/reports?" + queryString(filters)),
    lookups = useData("/catalogs/lookups");
  const d = data.data;
  const canEscalate =
    user.perfis.includes("OUVIDORIA") &&
    user.permissoes.includes("manifestacoes.encaminhar");
  const [notice, setNotice] = useState("");
  async function escalate(m) {
    if (
      !confirm(
        `Encaminhar ${m.registro} ao gerente ${m.gerente_nome}? Ele terá 24h para responder.`,
      )
    )
      return;
    setBusy(true);
    setDownloadError("");
    try {
      await api(`/cases/${m.id}/actions`, {
        method: "POST",
        body: { acao: "escalar", versao: m.versao },
      });
      setNotice(`${m.registro} encaminhada ao gerente ${m.gerente_nome}.`);
      data.reload();
      window.dispatchEvent(new Event("sio:notifications"));
    } catch (e) {
      setDownloadError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const { reload } = data;
  // Painel acompanha os prazos em tempo real (atualiza a cada minuto).
  useEffect(() => {
    const t = setInterval(reload, 60000);
    return () => clearInterval(t);
  }, [reload]);

  async function download(format) {
    setBusy(true);
    setDownloadError("");
    try {
      const r = await fetch(
        "/api/reports/export/" + format + "?" + queryString(filters),
      );
      if (!r.ok) throw new Error((await r.json()).error);
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "sio-manifestacoes." + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setDownloadError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const tiles = d
    ? [
        ["total", "Total de ouvidorias", d.totals.total, Inbox, "", "no período"],
        ["abertas", "Abertas", d.totals.abertas, FolderOpen, "", "aguardando conclusão"],
        ["aguardando", "Com gestor, no prazo", d.totals.aguardando_gestor, Clock3, "Em andamento", "dentro do prazo"],
        ["atraso", "Em atraso · com gestor", d.totals.atraso_gestor, AlertTriangle, "Em atraso", "prazo do gestor vencido"],
        ["gerente_atraso", "Gerente em atraso", d.totals.gerente_atraso, Siren, "Gerente em atraso", "passou das 24h"],
        ["fora_prazo", "Não responderam no prazo", d.totals.fora_prazo, UserX, null, "gestor fora do prazo"],
      ]
    : [];
  return (
    <>
      <div className="title-actions">
        <PageTitle
          eyebrow={direcao ? "DIREÇÃO · ACOMPANHAMENTO" : "PAINEL INDICADOR"}
          title={
            reports
              ? "Relatórios"
              : direcao
                ? "Painel da Direção"
                : "Painel indicador"
          }
        >
          {direcao
            ? "Todas as ouvidorias abertas, prazos, áreas e responsáveis. Casos sigilosos aparecem apenas nos totais."
            : "Totais, áreas, gestores e prazos das manifestações autorizadas para você."}
        </PageTitle>
        <div className="actions">
          <button className="secondary" onClick={reload} disabled={data.loading}>
            <RefreshCw size={16} /> Atualizar
          </button>
          {reports && (
            <>
              <button className="secondary" disabled={busy} onClick={() => download("pdf")}>
                Exportar PDF
              </button>
              <button className="primary" disabled={busy} onClick={() => download("xlsx")}>
                Exportar Excel
              </button>
            </>
          )}
        </div>
      </div>
      <Feedback error={data.error || downloadError} success={notice} />
      <section className="card filter-card">
        <CaseFilters
          search={false}
          value={filters}
          setValue={setFilters}
          lookups={lookups.data || {}}
        />
        <p className="small muted">
          O período filtra a data da manifestação. “Não responderam no prazo”
          soma gestores que responderam depois do vencimento e os que ainda não
          responderam.
        </p>
      </section>
      {data.loading && !d && <p role="status">Atualizando indicadores…</p>}
      {d && (
        <>
          <div className="metrics six">
            {tiles.map(([key, label, value, Icon, status, hint]) => {
              const query =
                key === "fora_prazo"
                  ? "prazo=fora"
                  : key === "abertas"
                    ? ""
                    : status
                      ? "status=" + encodeURIComponent(status)
                      : "";
              return (
                <Link
                  to={"/manifestacoes" + (query ? "?" + query : "")}
                  className={`card metric ${key}`}
                  key={key}
                >
                  <Icon size={20} className="metric-icon" />
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{hint}</small>
                </Link>
              );
            })}
          </div>

          <section className="card overdue-card">
            <div className="section-heading">
              <h2>
                <AlertTriangle size={20} /> Quem está em atraso
              </h2>
              <span className="overdue-badge">
                {d.overdue.length} {d.overdue.length === 1 ? "caso" : "casos"}
              </span>
            </div>
            <p className="muted small">
              Gestores que não responderam no prazo. A Ouvidoria pode encaminhar
              ao gerente responsável, que passa a ter 24h para responder.
            </p>
            {d.overdue.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Registro</th>
                      <th>Área / setor</th>
                      <th>Gestor</th>
                      <th>Venceu em</th>
                      <th>Gerente</th>
                      <th>Prazo do gerente</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {d.overdue.map((m) => (
                      <tr
                        key={m.id}
                        className={m.status === "Gerente em atraso" ? "critical-row" : "overdue-row"}
                      >
                        <td><strong>{m.registro}</strong><small className="cell-sub">{m.tipo}</small></td>
                        <td>{m.area_nome}<small className="cell-sub">{m.setor_nome}</small></td>
                        <td>{m.gestor_nome}</td>
                        <td>{formatDate(m.vencimento)}</td>
                        <td><strong>{m.gerente_nome || "—"}</strong></td>
                        <td>
                          {m.escalado_gerente_em ? (
                            <>
                              <span className={`countdown ${m.status === "Gerente em atraso" ? "critical" : "late"}`}>
                                {remaining(m.prazo_gerente)}
                              </span>
                              <small className="cell-sub">{formatDate(m.prazo_gerente)}</small>
                            </>
                          ) : canEscalate ? (
                            <button
                              className="primary small-button"
                              disabled={busy}
                              onClick={() => escalate(m)}
                            >
                              Encaminhar ao gerente
                            </button>
                          ) : (
                            <span className="muted small">Não encaminhado</span>
                          )}
                        </td>
                        <td><Status value={m.status} /></td>
                        <td><Link to={"/manifestacoes/" + m.id} className="text-button">Abrir</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-state">
                <CheckCircle2 size={18} /> Nenhuma ouvidoria em atraso.
              </p>
            )}
          </section>

          <div className="chart-grid">
            <section className="card chart-card">
              <h2>Ouvidorias por área <small>total</small></h2>
              <Bars rows={d.groups.area} late="atraso" limit={20} />
            </section>
            <section className="card chart-card">
              <h2>Gestores que mais receberam <small>top 10</small></h2>
              <Bars rows={d.groups.cumprimento} value="recebidas" />
            </section>
            <section className="card chart-card">
              <h2>Não responderam no prazo <small>por gestor</small></h2>
              <Bars
                rows={d.groups.cumprimento
                  .filter((g) => g.nao_cumpridas > 0)
                  .sort((a, b) => b.nao_cumpridas - a.nao_cumpridas)}
                value="nao_cumpridas"
                empty="Todos os gestores responderam dentro do prazo."
              />
            </section>
            <section className="card chart-card">
              <h2>Por setor <small>top 12</small></h2>
              <Bars rows={d.groups.setor} limit={12} />
            </section>
            <section className="card chart-card">
              <h2>Por tipo de manifestação</h2>
              <Bars rows={d.groups.tipo} late="atraso" limit={20} />
            </section>
            <section className="card chart-card">
              <h2>Por período <small>mês</small></h2>
              <Bars rows={d.groups.periodo} limit={24} />
            </section>
          </div>

          <div className="metrics secondary-metrics">
            {[
              ["Concluídas", d.totals.concluidas],
              ["Em validação na Ouvidoria", d.totals.em_validacao],
              ["Respondidas pelo gerente", d.totals.respondidas_gerente],
              [
                "Resposta média do gestor",
                d.totals.media_resposta_horas === null ? "—" : d.totals.media_resposta_horas + " h",
              ],
            ].map(([label, value]) => (
              <article className="card metric" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </div>

          <section className="card">
            <div className="section-heading">
              <h2>Cumprimento de prazo por gestor</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Gestor</th>
                    <th>Gerente</th>
                    <th>Recebidas</th>
                    <th>Respondidas</th>
                    <th>No prazo</th>
                    <th>Fora do prazo</th>
                    <th>Sem resposta (vencidas)</th>
                  </tr>
                </thead>
                <tbody>
                  {d.groups.cumprimento.map((g, i) => (
                    <tr key={i} className={g.sem_resposta > 0 ? "overdue-row" : ""}>
                      <td><strong>{g.nome}</strong></td>
                      <td>{g.gerente_nome}</td>
                      <td>{g.recebidas}</td>
                      <td>{g.respondidas}</td>
                      <td>{g.no_prazo}</td>
                      <td>{g.fora_prazo}</td>
                      <td>{g.sem_resposta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!d.groups.cumprimento.length && <p className="empty-state">Nenhum encaminhamento no período.</p>}
            </div>
          </section>

          <div className="home-bottom">
            <section className="card">
              <div className="section-heading">
                <h2>Respondidas fora do prazo</h2>
              </div>
              {d.lateResponses.map((m) => (
                <Link to={"/manifestacoes/" + m.id} className="recent-item" key={m.id}>
                  <div>
                    <strong>{m.registro}</strong>
                    <small>
                      {m.resposta_gerente_em
                        ? `Respondida pelo gerente ${m.gerente_nome} · ${formatDate(m.resposta_gerente_em)}`
                        : `Gestor ${m.gestor_nome} · ${formatDate(m.resposta_gestor_em)}`}
                    </small>
                  </div>
                  <Status value={m.status} />
                </Link>
              ))}
              {!d.lateResponses.length && <p className="empty-state">Nenhuma resposta fora do prazo.</p>}
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>Vencem nas próximas 24h</h2>
              </div>
              {d.upcoming.map((m) => (
                <Link className="recent-item" key={m.id} to={"/manifestacoes/" + m.id}>
                  <div>
                    <strong>{m.registro}</strong>
                    <small>{m.gestor_nome} · {formatDate(m.vencimento)}</small>
                  </div>
                  <span className="countdown">{remaining(m.vencimento)}</span>
                </Link>
              ))}
              {!d.upcoming.length && <p className="empty-state">Nenhum prazo próximo.</p>}
            </section>
          </div>
          <section className="card section-gap">
            <div className="section-heading">
              <h2>Registros recentes</h2>
              <Link to="/manifestacoes" className="text-button">Ver todos</Link>
            </div>
            {d.recent.map((m) => (
              <Link to={"/manifestacoes/" + m.id} className="recent-item" key={m.id}>
                <div>
                  <strong>{m.registro}</strong>
                  <small>{m.tipo} · {m.area_nome} · {m.gestor_nome}</small>
                </div>
                <Status value={m.status} />
              </Link>
            ))}
            {!d.recent.length && <p className="empty-state">Nenhum registro.</p>}
          </section>
        </>
      )}
    </>
  );
}
