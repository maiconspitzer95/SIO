import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useData } from "../hooks/useData.js";
import { api } from "../services/api.js";
import { formatDate } from "./Forms.jsx";
export function Notifications() {
  const [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    { data, reload } = useData("/notifications");
  useEffect(() => {
    const timer = setInterval(reload, 60000);
    window.addEventListener("sio:notifications", reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener("sio:notifications", reload);
    };
  }, [reload]);
  return (
    <div className="notification-wrap">
      <button
        className="icon-button"
        aria-label={`Notificações (${data?.unread || 0} não lidas)`}
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          reload();
        }}
      >
        <Bell size={19} />
        {!!data?.unread && (
          <span className="notification-count">{data.unread}</span>
        )}
      </button>
      {open && (
        <section className="notification-panel">
          <div className="section-heading">
            <h2>Notificações</h2>
            <button className="text-button" onClick={() => setOpen(false)}>
              Fechar
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {data?.items.map((n) => (
            <div
              key={n.id}
              className={`notification-item ${n.lida_em ? "read" : ""}`}
            >
              <Link
                to={"/manifestacoes/" + n.manifestacao_id}
                onClick={() => setOpen(false)}
              >
                {n.evento}
                <small>{formatDate(n.criado_em)}</small>
              </Link>
              {!n.lida_em && (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await api(`/notifications/${n.id}/read`, {
                        method: "POST",
                      });
                      reload();
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                >
                  Marcar como lida
                </button>
              )}
            </div>
          ))}
          {!data?.items.length && (
            <p className="empty-state">Nenhuma notificação autorizada.</p>
          )}
        </section>
      )}
    </div>
  );
}
