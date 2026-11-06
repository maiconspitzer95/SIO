import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "../services/api.js";
import { PageTitle } from "../components/PageTitle.jsx";
import { Feedback } from "../components/Forms.jsx";
export function Roles() {
  const [items, setItems] = useState(null),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/admin/roles")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);
  async function save(p) {
    if (
      !confirm(
        "Salvar permissões e encerrar as sessões dos usuários deste perfil?",
      )
    )
      return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      await api("/admin/roles/" + p.codigo, {
        method: "PUT",
        body: { permissoes: p.permissoes },
      });
      setSuccess(
        "Permissões atualizadas. Os usuários afetados devem entrar novamente.",
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle eyebrow="ADMINISTRAÇÃO" title="Perfis e permissões">
        Ajuste o acesso dentro das responsabilidades de cada perfil
        institucional.
      </PageTitle>
      <div className="message info">
        <ShieldCheck size={20} />
        <span>
          Somente Ouvidoria permite abrir e concluir manifestações. As
          permissões disponíveis respeitam esse limite e não liberam acesso
          automático a denúncias restritas.
        </span>
      </div>
      <Feedback error={error} success={success} />
      {!items && !error && <p role="status">Carregando perfis…</p>}
      <div className="roles-grid">
        {items?.map((p) => (
          <section className="card role-card" key={p.codigo}>
            <span className="eyebrow">{p.codigo}</span>
            <h2>{p.nome}</h2>
            {p.disponiveis.map((code) => (
              <label className="check-field" key={code}>
                <input
                  type="checkbox"
                  checked={p.permissoes.includes(code)}
                  onChange={(e) =>
                    setItems(
                      items.map((x) =>
                        x.codigo === p.codigo
                          ? {
                              ...x,
                              permissoes: e.target.checked
                                ? [...x.permissoes, code]
                                : x.permissoes.filter((c) => c !== code),
                            }
                          : x,
                      ),
                    )
                  }
                />
                {code}
              </label>
            ))}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => save(p)}
            >
              Salvar permissões de {p.codigo}
            </button>
          </section>
        ))}
      </div>
      <p className="muted small">
        Atribua perfis no cadastro de usuários. O acesso por caso também depende
        de atribuição, sigilo e conflitos de interesses.
      </p>
    </>
  );
}
