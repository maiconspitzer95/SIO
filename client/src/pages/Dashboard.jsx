import { useState } from "react";
import { Link } from "react-router-dom";
import { useData } from "../hooks/useData.js";
import { PageTitle } from "../components/PageTitle.jsx";
import { CaseFilters, queryString } from "../components/CaseFilters.jsx";
import { Status, formatDate, Feedback } from "../components/Forms.jsx";
export function Dashboard({ reports = false }) {
  const [filters, setFilters] = useState({}),
    [downloadError, setDownloadError] = useState(""),
    [busy, setBusy] = useState(false),
    data = useData("/reports?" + queryString(filters)),
    lookups = useData("/catalogs/lookups");
  const d = data.data;
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
  return (
    <>
      <div className="title-actions">
        <PageTitle
          eyebrow="INDICADORES GERENCIAIS"
          title={reports ? "Relatórios" : "Visão geral"}
        >
          Indicadores do período, limitados às manifestações autorizadas para
          você.
        </PageTitle>
        {reports && (
          <div className="actions">
            <button
              className="secondary"
              disabled={busy}
              onClick={() => download("pdf")}
            >
              Exportar PDF
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => download("xlsx")}
            >
              Exportar Excel
            </button>
          </div>
        )}
      </div>
      <Feedback error={data.error || downloadError} />
      <section className="card filter-card">
        <CaseFilters
          search={false}
          value={filters}
          setValue={setFilters}
          lookups={lookups.data || {}}
        />
        <p className="small muted">
          O período filtra a data da manifestação. Tempo de resposta usa envio e
          resposta do gestor.
        </p>
      </section>
      {data.loading && <p role="status">Atualizando indicadores…</p>}
      {d && (
        <>
          <div className="metrics">
            {[
              ["Total de manifestações", "total"],
              ["Concluídas", "concluidas"],
              ["Em andamento", "andamento"],
              ["Em atraso", "atraso"],
            ].map(([label, key]) => (
              <article className={`card metric ${key}`} key={key}>
                <span>{label}</span>
                <strong>{d.totals[key]}</strong>
              </article>
            ))}
          </div>
          <div className="chart-grid">
            {Object.entries({
              tipo: "Por tipo de manifestação",
              area: "Por área técnica",
              periodo: "Por período",
              gestor: "Por gestor",
              motivo: "Por motivo",
              canal: "Por canal",
            }).map(([key, title]) => (
              <section className="card chart-card" key={key}>
                <h2>{title}</h2>
                {d.groups[key].length ? (
                  d.groups[key].map((g, i) => (
                    <div className="bar-row" key={i}>
                      <div>
                        <span>{g.nome}</span>
                        <strong>{g.total}</strong>
                      </div>
                      <progress
                        aria-label={g.nome}
                        max={Math.max(...d.groups[key].map((r) => r.total), 1)}
                        value={g.total}
                      />
                    </div>
                  ))
                ) : (
                  <p className="empty-state">Nenhum registro no período.</p>
                )}
              </section>
            ))}
          </div>
          <div className="metrics secondary-metrics">
            {[
              [
                "Resposta média do gestor",
                d.totals.media_resposta_horas === null
                  ? "—"
                  : d.totals.media_resposta_horas + " h",
              ],
              ["Judiciais", d.totals.judiciais],
              ["Discutidas com a Direção", d.totals.discutidas],
              ["Concluídas com atraso", d.totals.concluidas_atraso],
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
                    <th>Respondidas</th>
                    <th>No prazo</th>
                    <th>Fora do prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {d.groups.cumprimento.map((g, i) => (
                    <tr key={i}>
                      <td>{g.nome}</td>
                      <td>{g.respondidas}</td>
                      <td>{g.no_prazo}</td>
                      <td>{g.fora_prazo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="home-bottom section-gap">
            <section className="card">
              <div className="section-heading">
                <h2>Registros recentes</h2>
              </div>
              {d.recent.map((m) => (
                <Link
                  to={"/manifestacoes/" + m.id}
                  className="recent-item"
                  key={m.id}
                >
                  <div>
                    <strong>{m.registro}</strong>
                    <small>
                      {m.tipo} · {m.area_nome}
                    </small>
                  </div>
                  <Status value={m.status} />
                </Link>
              ))}
              {!d.recent.length && (
                <p className="empty-state">Nenhum registro.</p>
              )}
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>Vencimentos nas próximas 24h</h2>
              </div>
              {d.upcoming.map((m) => (
                <Link
                  className="recent-item"
                  key={m.id}
                  to={"/manifestacoes/" + m.id}
                >
                  <div>
                    <strong>{m.registro}</strong>
                    <small>{m.gestor_nome}</small>
                    <small>{formatDate(m.vencimento)}</small>
                  </div>
                </Link>
              ))}
              {!d.upcoming.length && (
                <p className="empty-state">Nenhum prazo próximo.</p>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}
