import { useState } from "react";
import { useData } from "../hooks/useData.js";
import { api } from "../services/api.js";
import { PageTitle } from "../components/PageTitle.jsx";
import { Field, Select, Feedback, Pager } from "../components/Forms.jsx";
const definitions = {
  areas_tecnicas: {
    label: "Áreas técnicas",
    fields: { nome: "Nome", descricao: "Descrição" },
  },
  motivos: {
    label: "Motivos",
    fields: {
      nome: "Nome",
      descricao: "Descrição",
      area_id: "Área",
      restrito: "Restrito",
      bloqueado: "Bloqueado para operação",
    },
  },
  setores: {
    label: "Setores e locais",
    fields: { nome: "Nome", descricao: "Descrição", area_id: "Área" },
  },
  gerentes: {
    label: "Gerentes",
    fields: {
      nome: "Nome",
      usuario_id: "Usuário vinculado",
      area_id: "Área de responsabilidade",
    },
  },
  gestores: {
    label: "Gestores",
    fields: {
      nome: "Nome",
      usuario_id: "Usuário vinculado",
      area_id: "Área",
      setor_id: "Setor",
      gerente_id: "Gerente superior",
    },
  },
  users: {
    label: "Usuários",
    fields: {
      nome: "Nome",
      login: "Login",
      email: "E-mail",
      senha: "Senha inicial / nova senha",
      perfis: "Perfis",
    },
  },
  prazos: {
    label: "Prazos",
    fields: {
      nome: "Nome",
      tipo: "Tipo",
      quantidade: "Quantidade",
      unidade: "Unidade",
      dias_uteis: "Contar somente dias úteis",
      continuo: "Horas contínuas homologadas",
      feriados: "Feriados (AAAA-MM-DD, um por linha)",
      alerta_horas: "Alerta prévio em horas",
      aprovado: "Regra aprovada pela instituição",
    },
  },
};
const booleanFields = [
  "ativo",
  "restrito",
  "bloqueado",
  "dias_uteis",
  "continuo",
  "aprovado",
];
const relations = {
  area_id: "areas_tecnicas",
  usuario_id: "pessoas",
  setor_id: "setores",
  gerente_id: "gerentes",
};
export function Catalogs() {
  const [tab, setTab] = useState("areas_tecnicas"),
    [editing, setEditing] = useState(null),
    [form, setForm] = useState(null),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [descending, setDescending] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  const records = useData(`/catalogs/${tab}`),
    lookups = useData("/catalogs/lookups");
  const def = definitions[tab];
  function open(row) {
    setEditing(row?.id || null);
    const d = { ativo: row?.ativo ?? true };
    for (const key of Object.keys(def.fields))
      d[key] =
        key === "feriados"
          ? (row?.feriados || []).join("\n")
          : key === "senha"
            ? ""
            : (row?.[key] ??
              (booleanFields.includes(key)
                ? false
                : key === "perfis"
                  ? []
                  : ""));
    if (tab === "prazos" && !row)
      Object.assign(d, {
        tipo: "Geral",
        quantidade: 5,
        unidade: "dias",
        alerta_horas: 24,
      });
    setForm(d);
    setError("");
    setSuccess("");
  }
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save(e) {
    e.preventDefault();
    if (
      !confirm(
        editing
          ? "Salvar as alterações deste cadastro?"
          : "Criar este cadastro?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const body = { ...form };
      if (tab === "users" && !body.senha) delete body.senha;
      if (tab === "prazos") {
        body.feriados = body.feriados.split(/\s+/).filter(Boolean);
        for (const k of ["quantidade", "alerta_horas"])
          body[k] = Number(body[k]);
      }
      await api(`/catalogs/${tab}${editing ? "/" + editing : ""}`, {
        method: editing ? "PUT" : "POST",
        body,
      });
      setForm(null);
      setSuccess("Cadastro salvo.");
      records.reload();
      lookups.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const all = (records.data?.items || [])
    .filter((r) =>
      (r.nome + " " + (r.login || ""))
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort(
      (a, b) => a.nome.localeCompare(b.nome, "pt-BR") * (descending ? -1 : 1),
    );
  return (
    <>
      <PageTitle eyebrow="ADMINISTRAÇÃO" title="Cadastros institucionais">
        Mantenha os responsáveis, os locais e as regras de atendimento.
      </PageTitle>
      <div className="tabs">
        {Object.entries(definitions).map(([key, d]) => (
          <button
            key={key}
            className={key === tab ? "active" : ""}
            onClick={() => {
              setTab(key);
              setForm(null);
              setPage(1);
              setSearch("");
              setError("");
              setSuccess("");
            }}
          >
            {d.label}
          </button>
        ))}
      </div>
      <Feedback
        error={error || records.error || lookups.error}
        success={success}
      />
      {tab === "motivos" && (
        <p className="message info">
          Motivos de assédio ou violência permanecem bloqueados. Uma categoria
          bloqueada não pode ser liberada nesta versão.
        </p>
      )}
      {tab === "prazos" && (
        <p className="message info">
          Aprovar uma regra confirma a política institucional de contagem.
          Alterações valem para novos encaminhamentos; prazos já enviados são
          preservados.
        </p>
      )}
      {form && (
        <form className="card form-card" onSubmit={save}>
          <h2>
            {editing ? "Editar" : "Novo registro"} · {def.label}
          </h2>
          <div className="form-grid">
            {Object.entries({ ...def.fields, ativo: "Ativo" }).map(
              ([key, label]) => {
                if (booleanFields.includes(key))
                  return (
                    <label className="check-field" key={key}>
                      <input
                        type="checkbox"
                        checked={!!form[key]}
                        onChange={(e) => change(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  );
                if (key === "perfis")
                  return (
                    <Field label={label} key={key}>
                      <select
                        multiple
                        required
                        value={form.perfis}
                        onChange={(e) =>
                          change(
                            key,
                            [...e.target.selectedOptions].map((o) => o.value),
                          )
                        }
                      >
                        {[
                          "MASTER",
                          "OUVIDORIA",
                          "GESTOR",
                          "GERENTE",
                          "DIRECAO",
                        ].map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                      <small>
                        Ctrl/clique para selecionar mais de um perfil. Apenas
                        Ouvidoria permite abertura.
                      </small>
                    </Field>
                  );
                if (relations[key]) {
                  let items = lookups.data?.[relations[key]] || [];
                  if (["setor_id", "gerente_id"].includes(key))
                    items = items.filter((r) => r.area_id === form.area_id);
                  return (
                    <Field key={key} label={label}>
                      <Select
                        required
                        items={items}
                        value={form[key]}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </Field>
                  );
                }
                if (["tipo", "unidade"].includes(key))
                  return (
                    <Field key={key} label={label}>
                      <Select
                        required
                        items={
                          key === "tipo"
                            ? ["Geral", "Judicial"]
                            : ["dias", "horas"]
                        }
                        value={form[key]}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </Field>
                  );
                if (["descricao", "feriados"].includes(key))
                  return (
                    <Field key={key} label={label}>
                      <textarea
                        value={form[key]}
                        onChange={(e) => change(key, e.target.value)}
                        rows={3}
                      />
                    </Field>
                  );
                return (
                  <Field key={key} label={label}>
                    <input
                      required={!["senha"].includes(key) || !editing}
                      type={
                        key === "senha"
                          ? "password"
                          : key === "email"
                            ? "email"
                            : ["quantidade", "alerta_horas"].includes(key)
                              ? "number"
                              : "text"
                      }
                      value={form[key]}
                      onChange={(e) => change(key, e.target.value)}
                      autoComplete={key === "senha" ? "new-password" : "off"}
                    />
                  </Field>
                );
              },
            )}
          </div>
          <div className="actions">
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar cadastro"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setForm(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <section className="card">
        <div className="toolbar">
          <input
            aria-label="Pesquisar cadastro"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button
            className="secondary"
            onClick={() => setDescending(!descending)}
          >
            Nome {descending ? "Z–A" : "A–Z"}
          </button>
          <button className="primary" onClick={() => open(null)}>
            Novo cadastro
          </button>
        </div>
        {records.loading ? (
          <p className="loading">Carregando…</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Situação</th>
                  <th>Informações</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {all.slice((page - 1) * 25, page * 25).map((row) => (
                  <tr key={row.id}>
                    <td>{row.nome}</td>
                    <td>{row.ativo ? "Ativo" : "Inativo"}</td>
                    <td>
                      {row.login || row.descricao || row.tipo || ""}
                      {row.bloqueado ? " · Bloqueado" : ""}
                      {row.perfis?.join(" · ")}
                    </td>
                    <td>
                      <button className="text-button" onClick={() => open(row)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!all.length && (
              <p className="empty-state">Nenhum cadastro encontrado.</p>
            )}
          </div>
        )}
        <Pager page={page} total={all.length} onChange={setPage} />
      </section>
      <Settings />
    </>
  );
}
function Settings() {
  const data = useData("/catalogs/settings"),
    [value, setValue] = useState(null),
    [message, setMessage] = useState("");
  return (
    <section className="card form-card">
      <h2>Política de retenção</h2>
      <p className="muted">
        Registre a política aprovada. O sistema não apaga manifestações
        automaticamente.
      </p>
      <textarea
        aria-label="Política de retenção"
        rows={3}
        value={
          value ??
          data.data?.items.find((r) => r.chave === "retencao_aprovada")
            ?.valor ??
          ""
        }
        onChange={(e) => setValue(e.target.value)}
      />
      <button
        className="secondary"
        onClick={async () => {
          try {
            await api("/catalogs/settings", {
              method: "PUT",
              body: { retencao_aprovada: value },
            });
            setMessage("Política registrada.");
          } catch (e) {
            setMessage(e.message);
          }
        }}
      >
        Salvar política
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
