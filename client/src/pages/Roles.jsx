import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../services/api.js";
import { PageTitle } from "../components/PageTitle.jsx";
export function Roles() {
  const [items, setItems] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/admin/roles")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <PageTitle eyebrow="ADMINISTRAÇÃO" title="Perfis e permissões">
        Permissões de acesso de cada perfil institucional.
      </PageTitle>
      <div className="message info">
        <ShieldCheck size={20} />
        <span>
          O perfil Master administra a base técnica. Ele não concede abertura de
          manifestações nem acesso automático a conteúdo sigiloso.
        </span>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {!items && !error && <p role="status">Carregando perfis…</p>}
      <div className="roles-grid">
        {items?.map((p) => (
          <section className="card role-card" key={p.codigo}>
            <span className="eyebrow">{p.codigo}</span>
            <h2>{p.nome}</h2>
            <ul>
              {p.permissoes.map((code) => (
                <li key={code}>
                  <CheckPermission />
                  {code}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="muted small">
        A gestão de usuários e atribuições será disponibilizada na Etapa 2.
      </p>
    </>
  );
}
function CheckPermission() {
  return <span className="permission-dot" aria-hidden="true" />;
}
