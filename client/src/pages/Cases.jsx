import { useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle.jsx";
import { CaseFilters, queryString } from "../components/CaseFilters.jsx";
import {
  Pager,
  Status,
  formatDate,
  day,
  Feedback,
} from "../components/Forms.jsx";
import { useData } from "../hooks/useData.js";
import { useAuth } from "../hooks/useAuth.jsx";
export function Cases() {
  const { user } = useAuth();
  const [filters, setFilters] = useState({}),
    [page, setPage] = useState(1),
    [order, setOrder] = useState("numero"),
    [direction, setDirection] = useState("desc");
  const lookups = useData("/catalogs/lookups");
  const data = useData(
    "/cases?" +
      queryString({ ...filters, page, ordem: order, direcao: direction }),
  );
  return (
    <>
      <div className="title-actions">
        <PageTitle eyebrow="ATENDIMENTO" title="Manifestações">
          Registre, encaminhe e acompanhe cada atendimento.
        </PageTitle>
        {user.perfis.includes("OUVIDORIA") &&
          user.permissoes.includes("manifestacoes.criar") && (
            <Link className="primary" to="/manifestacoes/nova">
              Nova manifestação
            </Link>
          )}
      </div>
      <Feedback error={data.error || lookups.error} />
      <section className="card filter-card">
        <CaseFilters
          value={filters}
          setValue={(f) => {
            setFilters(f);
            setPage(1);
          }}
          lookups={lookups.data || {}}
        />
        <p className="muted small">
          Pesquisa por nome do contato disponível apenas para a Ouvidoria.
        </p>
      </section>
      <section className="card">
        <div className="toolbar">
          <h2>Registros autorizados</h2>
          <select
            aria-label="Ordenar por"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
          >
            <option value="numero">Número</option>
            <option value="data">Data</option>
            <option value="vencimento">Vencimento</option>
          </select>
          <button
            className="secondary"
            onClick={() => setDirection(direction === "asc" ? "desc" : "asc")}
          >
            {direction === "asc" ? "Crescente" : "Decrescente"}
          </button>
        </div>
        {data.loading ? (
          <p className="loading" role="status">
            Carregando manifestações…
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "Registro",
                    "Data",
                    "Tipo",
                    "Área / motivo",
                    "Gestor",
                    "Vencimento",
                    "Status",
                    "",
                  ].map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data?.items.map((m) => (
                  <tr
                    key={m.id}
                    className={m.status === "Em atraso" ? "overdue-row" : ""}
                  >
                    <td>{m.registro}</td>
                    <td>{day(m.data_manifestacao)}</td>
                    <td>{m.tipo}</td>
                    <td>
                      {m.area_nome}
                      <small className="cell-sub">{m.motivo_nome}</small>
                    </td>
                    <td>{m.gestor_nome}</td>
                    <td>{formatDate(m.vencimento)}</td>
                    <td>
                      <Status value={m.status} />
                      {m.etapa === "rascunho" && (
                        <small className="cell-sub">Rascunho</small>
                      )}
                    </td>
                    <td>
                      <Link
                        className="inline-link"
                        to={"/manifestacoes/" + m.id}
                      >
                        Visualizar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.data?.items.length && (
              <p className="empty-state">
                Nenhuma manifestação encontrada para seu acesso e filtros.
              </p>
            )}
          </div>
        )}
        <Pager page={page} total={data.data?.total || 0} onChange={setPage} />
      </section>
    </>
  );
}
