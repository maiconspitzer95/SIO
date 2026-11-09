import { Field, Select } from "./Forms.jsx";
export function CaseFilters({ value, setValue, lookups = {}, search = true }) {
  const change = (k, v) => setValue({ ...value, [k]: v });
  return (
    <div className="filters">
      {search && (
        <Field label="Registro / contato">
          <input
            value={value.busca || ""}
            placeholder="Pesquisar…"
            onChange={(e) => change("busca", e.target.value)}
          />
        </Field>
      )}
      <Field label="De">
        <input
          type="date"
          value={value.inicio || ""}
          onChange={(e) => change("inicio", e.target.value)}
        />
      </Field>
      <Field label="Até">
        <input
          type="date"
          value={value.fim || ""}
          onChange={(e) => change("fim", e.target.value)}
        />
      </Field>
      {[
        [
          "tipo",
          "Tipo",
          ["Elogio", "Reclamação", "Denúncia", "Informação", "Sugestão"],
        ],
        ["area_id", "Área", lookups.areas_tecnicas],
        [
          "motivo_id",
          "Motivo",
          lookups.motivos?.filter(
            (r) => !value.area_id || r.area_id === value.area_id,
          ),
        ],
        ["gestor_id", "Gestor", lookups.gestores],
        ["gerente_id", "Gerente", lookups.gerentes],
        [
          "setor_id",
          "Setor",
          lookups.setores?.filter(
            (r) => !value.area_id || r.area_id === value.area_id,
          ),
        ],
        [
          "status",
          "Status",
          [
            "Em andamento",
            "Em validação",
            "Atrasadas",
            "Em atraso",
            "Com gerente",
            "Gerente em atraso",
            "Concluído",
            "Rascunho",
          ],
        ],
        ["prazo_id", "Prazo", lookups.prazos],
        ["canal", "Canal", ["E-mail", "Pessoal", "Telefone"]],
      ].map(([k, label, items]) => (
        <Field key={k} label={label}>
          <Select
            empty="Todos"
            items={items || []}
            value={value[k]}
            onChange={(e) => change(k, e.target.value)}
          />
        </Field>
      ))}
      <Field label="Vencimento">
        <select
          value={value.prazo || ""}
          onChange={(e) => change("prazo", e.target.value)}
        >
          <option value="">Todos</option>
          <option value="proximo">Próximas 24h</option>
          <option value="vencido">Vencido</option>
          <option value="gerente">Encaminhadas ao gerente</option>
          <option value="fora">Gestor não respondeu no prazo</option>
        </select>
      </Field>
      <button className="secondary" onClick={() => setValue({})}>
        Limpar filtros
      </button>
    </div>
  );
}
export function queryString(filters) {
  return new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v !== "" && v !== undefined),
  ).toString();
}
