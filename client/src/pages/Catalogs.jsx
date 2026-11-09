import { useState } from "react";
import { useData } from "../hooks/useData.js";
import { api } from "../services/api.js";
import { PageTitle } from "../components/PageTitle.jsx";
import { morph } from "../services/glass.js";
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
      email: "E-mail",
      setor_id: "Setor",
      usuario_id: "Login de acesso (opcional)",
    },
  },
  gestores: {
    label: "Gestores",
    fields: {
      nome: "Nome",
      email: "E-mail",
      gerente_id: "Gerente responsável",
      usuario_id: "Login de acesso (opcional)",
      setores: "Setores vinculados",
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

/** Monta somente os campos aceitos pelo cadastro (evita enviar colunas calculadas). */
function payloadFrom(row, extra = {}) {
  const tab = row.__tab;
  const keys = Object.keys(definitions[tab].fields).filter((k) => k !== "senha");
  const body = { ativo: row.ativo };
  for (const k of keys) {
    let v = row[k];
    if (k === "setores") v = (v || []).map((x) => x.id ?? x);
    if (k === "usuario_id") v = v || null;
    if (k === "email" && v == null) v = "";
    if (v !== undefined && v !== null) body[k] = v;
    else if (k === "usuario_id") body[k] = null;
  }
  return { ...body, ...extra };
}

export function Catalogs() {
  const [tab, setTab] = useState("areas_tecnicas"),
    [editing, setEditing] = useState(null),
    [form, setForm] = useState(null),
    [search, setSearch] = useState(""),
    [filterArea, setFilterArea] = useState(""),
    [filterSetor, setFilterSetor] = useState(""),
    [filterStatus, setFilterStatus] = useState("todos"),
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
    if (tab === "gestores")
      d.setores = (row?.setores || []).map((x) => x.id ?? x);
    if ("usuario_id" in d) d.usuario_id = row?.usuario_id || "";
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
    setForm((f) => {
      const next = { ...f, [key]: value };
      return next;
    });
  }

  async function toggleActive(row) {
    const actionLabel = row.ativo ? "inativar" : "ativar";
    if (!confirm(`Deseja realmente ${actionLabel} "${row.nome}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/catalogs/${tab}/${row.id}`, {
        method: "PUT",
        body: payloadFrom(row, { ativo: !row.ativo }),
      });
      setSuccess(`Cadastro ${row.ativo ? "inativado" : "ativado"} com sucesso.`);
      records.reload();
      lookups.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
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
      if (tab === "users") {
        if (!body.senha) delete body.senha;
        else if (body.senha.length > 6) {
          setError("A senha deve ter no máximo 6 caracteres.");
          setBusy(false);
          return;
        }
      }
      if ("usuario_id" in body && !body.usuario_id) body.usuario_id = null;
      if (tab === "gerentes" && !body.setor_id) {
        setError("Selecione o setor do gerente.");
        setBusy(false);
        return;
      }
      if (tab === "gestores") {
        if (!body.setores?.length) {
          setError("Selecione pelo menos um setor para o gestor.");
          setBusy(false);
          return;
        }
        if (!body.gerente_id) {
          setError("Selecione o gerente responsável.");
          setBusy(false);
          return;
        }
      }
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
      setSuccess("Cadastro salvo com sucesso.");
      records.reload();
      lookups.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const all = (records.data?.items || [])
    .map((r) => ({ ...r, __tab: tab }))
    .filter((r) => {
      const matchText = (
        (r.nome || "") +
        " " +
        (r.login || "") +
        " " +
        (r.area_nome || "") +
        " " +
        (r.setor_nome || "") +
        " " +
        (r.gerente_nome || "") +
        " " +
        (r.email || "") +
        " " +
        (r.setores || []).map((x) => x.nome).join(" ")
      )
        .toLowerCase()
        .includes(search.toLowerCase());
      if (!matchText) return false;
      if (tab === "gestores") {
        const sectors = r.setores || [];
        if (filterArea && !sectors.some((x) => x.area_id === filterArea))
          return false;
        if (filterSetor && !sectors.some((x) => x.id === filterSetor))
          return false;
      }
      if (filterStatus === "ativo" && !r.ativo) return false;
      if (filterStatus === "inativo" && r.ativo) return false;
      return true;
    })
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
            onClick={() =>
              morph(() => {
              setTab(key);
              setForm(null);
              setPage(1);
              setSearch("");
              setFilterArea("");
              setFilterSetor("");
              setFilterStatus("todos");
              setError("");
              setSuccess("");
              })
            }
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
                if (key === "setores")
                  return (
                    <div className="field wide" key={key}>
                      <label>
                        {label} · {form.setores.length} selecionado(s)
                      </label>
                      <SectorPicker
                        areas={lookups.data?.areas_tecnicas || []}
                        sectors={lookups.data?.setores || []}
                        value={form.setores}
                        onChange={(v) => change("setores", v)}
                      />
                      <small className="muted">
                        Um gestor pode responder por vários setores. O primeiro
                        selecionado é o setor principal.
                      </small>
                    </div>
                  );
                if (key === "usuario_id")
                  return (
                    <Field
                      key={key}
                      label={label}
                      help={`O usuário precisa ter o perfil ${tab === "gestores" ? "GESTOR" : "GERENTE"} para acessar e responder.`}
                    >
                      <Select
                        empty="Sem login vinculado"
                        items={lookups.data?.pessoas || []}
                        value={form.usuario_id}
                        onChange={(e) => change(key, e.target.value)}
                      />
                    </Field>
                  );
                if (relations[key]) {
                  let items = lookups.data?.[relations[key]] || [];
                  if (key === "setor_id") {
                    if (tab === "gestores" && form.area_id) {
                      items = items.filter((r) => r.area_id === form.area_id);
                    }
                  } else if (key === "gerente_id") {
                    items = items.filter((r) => r.ativo);
                  } else if (key === "area_id") {
                    items = items.filter((r) => r.ativo);
                  }
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
                      required={
                        key === "senha"
                          ? !editing
                          : !(key === "email" && tab !== "users")
                      }
                      type={
                        key === "senha"
                          ? "password"
                          : key === "email"
                            ? "email"
                            : ["quantidade", "alerta_horas"].includes(key)
                              ? "number"
                              : "text"
                      }
                      maxLength={key === "senha" ? 6 : undefined}
                      placeholder={
                        key === "senha"
                          ? "Máximo de 6 caracteres"
                          : key === "email"
                            ? "nome@santacasadepelotas.com.br"
                            : undefined
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
        <div className="toolbar catalogs-toolbar">
          <input
            aria-label="Pesquisar cadastro"
            placeholder="Pesquisar por nome…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {tab === "gestores" && (
            <>
              <select
                aria-label="Filtrar por área"
                value={filterArea}
                onChange={(e) => {
                  setFilterArea(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todas as áreas</option>
                {(lookups.data?.areas_tecnicas || []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filtrar por setor"
                value={filterSetor}
                onChange={(e) => {
                  setFilterSetor(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Todos os setores</option>
                {(lookups.data?.setores || [])
                  .filter((s) => !filterArea || s.area_id === filterArea)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
              </select>
            </>
          )}
          <select
            aria-label="Filtrar por situação"
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="todos">Todas as situações</option>
            <option value="ativo">Somente ativos</option>
            <option value="inativo">Somente inativos</option>
          </select>
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
            {tab === "gerentes" ? (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Setor</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {all.slice((page - 1) * 25, page * 25).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.nome}</strong>
                        {row.usuario_id && (
                          <small className="cell-sub">Com login de acesso</small>
                        )}
                      </td>
                      <td>{row.email || "—"}</td>
                      <td>
                        {row.setor_nome ||
                          lookups.data?.setores?.find(
                            (s) => s.id === row.setor_id,
                          )?.nome ||
                          "—"}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${row.ativo ? "active" : "inactive"}`}
                        >
                          {row.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="text-button"
                            onClick={() => open(row)}
                          >
                            Editar
                          </button>
                          <button
                            className={`text-button ${row.ativo ? "danger" : ""}`}
                            onClick={() => toggleActive(row)}
                          >
                            {row.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : tab === "gestores" ? (
              <table>
                <thead>
                  <tr>
                    <th>Gestor</th>
                    <th>E-mail</th>
                    <th>Setores</th>
                    <th>Gerente responsável</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {all.slice((page - 1) * 25, page * 25).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.nome}</strong>
                        {row.usuario_id && (
                          <small className="cell-sub">Com login de acesso</small>
                        )}
                      </td>
                      <td>{row.email || "—"}</td>
                      <td>
                        <div className="chip-list">
                          {(row.setores || []).map((x) => (
                            <span key={x.id}>{x.nome}</span>
                          ))}
                          {!row.setores?.length && "—"}
                        </div>
                      </td>
                      <td>
                        {row.gerente_nome ||
                          lookups.data?.gerentes?.find(
                            (g) => g.id === row.gerente_id,
                          )?.nome ||
                          "—"}
                      </td>
                      <td>
                        <span
                          className={`status-badge ${row.ativo ? "active" : "inactive"}`}
                        >
                          {row.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="text-button"
                            onClick={() => open(row)}
                          >
                            Editar
                          </button>
                          <button
                            className={`text-button ${row.ativo ? "danger" : ""}`}
                            onClick={() => toggleActive(row)}
                          >
                            {row.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Situação</th>
                    <th>Informações</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {all.slice((page - 1) * 25, page * 25).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.nome}</strong>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${row.ativo ? "active" : "inactive"}`}
                        >
                          {row.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td>
                        {row.login || row.descricao || row.tipo || ""}
                        {row.bloqueado ? " · Bloqueado" : ""}
                        {row.perfis?.join(" · ")}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="text-button"
                            onClick={() => open(row)}
                          >
                            Editar
                          </button>
                          <button
                            className={`text-button ${row.ativo ? "danger" : ""}`}
                            onClick={() => toggleActive(row)}
                          >
                            {row.ativo ? "Inativar" : "Ativar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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

function SectorPicker({ areas, sectors, value, onChange }) {
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  const active = sectors.filter((s) => s.ativo !== false);
  const groups = areas
    .map((a) => ({ area: a, items: active.filter((s) => s.area_id === a.id) }))
    .filter((g) => g.items.length);
  if (!groups.length)
    return <p className="muted small">Cadastre setores antes de vincular gestores.</p>;
  return (
    <div className="chip-picker" role="group" aria-label="Setores vinculados">
      {groups.map((g) => (
        <div key={g.area.id} style={{ display: "contents" }}>
          <span className="chip-group">{g.area.nome}</span>
          {g.items.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`chip ${value.includes(s.id) ? "selected" : ""}`}
              aria-pressed={value.includes(s.id)}
              onClick={() => toggle(s.id)}
            >
              {s.nome}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
