import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../services/api.js";
import { PageTitle } from "../components/PageTitle.jsx";
export function Audit() {
  const [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    api(`/admin/audit?page=${page}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [page]);
  return (
    <>
      <PageTitle eyebrow="SEGURANÇA" title="Auditoria técnica">
        Histórico de acesso e eventos administrativos, sem conteúdo das
        manifestações.
      </PageTitle>
      <section className="card audit-card">
        <div className="section-heading">
          <h2>Eventos registrados</h2>
          <span className="neutral-tag">Somente leitura</span>
        </div>
        {error && (
          <div role="alert" className="message error">
            {error}
          </div>
        )}
        {!data && !error && (
          <p className="loading" role="status">
            Carregando eventos…
          </p>
        )}
        {data && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th>Evento</th>
                    <th>Resultado</th>
                    <th>Identificador do ator</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        {new Date(row.criado_em).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </td>
                      <td>{row.evento}</td>
                      <td>
                        <span className={`result ${row.resultado}`}>
                          {row.resultado}
                        </span>
                      </td>
                      <td className="mono">
                        {row.ator_id || "Não autenticado / comando local"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.items.length && (
                <p className="empty-state">Nenhum evento nesta página.</p>
              )}
            </div>
            <div className="pagination">
              <span>{data.total} eventos · Horário de Brasília</span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Página anterior"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>Página {page}</span>
                <button
                  className="icon-button"
                  aria-label="Próxima página"
                  disabled={page * data.pageSize >= data.total}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
