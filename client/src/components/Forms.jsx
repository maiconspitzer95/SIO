import { Children,cloneElement,isValidElement,useId } from 'react';
export function Field({ label, children, help }) {
  const id=useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children,child=>isValidElement(child)&&(['input','select','textarea'].includes(child.type)||child.type===Select)?cloneElement(child,{id,'aria-label':label}):child)}
      {help && <small className="muted">{help}</small>}
    </div>
  );
}
export function Select({
  items = [],
  value,
  onChange,
  empty = "Selecione",
  ...props
}) {
  return (
    <select value={value ?? ""} onChange={onChange} {...props}>
      <option value="">{empty}</option>
      {items.map((o) => (
        <option key={o.id ?? o} value={o.id ?? o} disabled={o.bloqueado}>
          {o.nome ?? o}
          {o.bloqueado ? " — bloqueado para uso operacional" : ""}
        </option>
      ))}
    </select>
  );
}
export function Feedback({ error, success }) {
  return (
    <>
      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="message success" role="status">
          {success}
        </div>
      )}
    </>
  );
}
export const formatDate = (v) =>
  v
    ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : "—";
export const day = (v) =>
  v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
const statusClass = {
  Concluído: "done",
  "Em andamento": "pending",
  "Em validação": "validation",
  "Em atraso": "late",
  "Com gerente": "manager",
  "Gerente em atraso": "critical",
  Rascunho: "draft",
};
export function Status({ value }) {
  return (
    <span className={`status-badge ${statusClass[value] || "pending"}`}>
      {value === "Em atraso"
        ? "Em atraso · com gestor"
        : value === "Com gerente"
          ? "Com gerente · 24h"
          : value}
    </span>
  );
}
/** Tempo restante (ou excedido) até uma data, em texto curto. */
export function remaining(date) {
  if (!date) return "—";
  const diff = new Date(date) - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3600000),
    m = Math.floor((abs % 3600000) / 60000);
  const txt = h >= 48 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${m}min`;
  return diff >= 0 ? `faltam ${txt}` : `atrasado há ${txt}`;
}
export function Pager({ page, total, onChange, size = 25 }) {
  return (
    <div className="pagination">
      <span>{total} registros</span>
      <div>
        <button
          className="secondary"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Anterior
        </button>
        <span>Página {page}</span>
        <button
          className="secondary"
          disabled={page * size >= total}
          onClick={() => onChange(page + 1)}
        >
          Próxima
        </button>
      </div>
    </div>
  );
}
