import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ShieldCheck,
  ScrollText,
  LogOut,
  Menu,
  X,
  LockKeyhole,
  ClipboardList,
  Settings,
  ChartColumn,
} from "lucide-react";
import { Brand } from "../components/Brand.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { Notifications } from "../components/Notifications.jsx";
export function AppLayout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 800px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 800px)");
    const change = () => {
      setMobile(media.matches);
      setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    media.addEventListener("change", change);
    window.addEventListener("keydown", escape);
    return () => {
      media.removeEventListener("change", change);
      window.removeEventListener("keydown", escape);
    };
  }, []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const links = [
    { path: "/", label: "Visão geral", icon: LayoutDashboard },
    ...(user.permissoes.includes("manifestacoes.acompanhar")
      ? [
          {
            path: "/manifestacoes",
            label: "Manifestações",
            icon: ClipboardList,
          },
        ]
      : []),
    ...(user.permissoes.includes("indicadores.consultar")
      ? [{ path: "/relatorios", label: "Relatórios", icon: ChartColumn }]
      : []),
    ...(user.permissoes.includes("cadastros.gerenciar")
      ? [{ path: "/cadastros", label: "Cadastros", icon: Settings }]
      : []),
    ...(user.permissoes.includes("usuarios.gerenciar")
      ? [{ path: "/perfis", label: "Perfis e permissões", icon: ShieldCheck }]
      : []),
    ...(user.permissoes.includes("auditoria.consultar")
      ? [{ path: "/auditoria", label: "Auditoria", icon: ScrollText }]
      : []),
  ];
  async function signOut() {
    setBusy(true);
    try {
      await logout();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="main-navigation"
        className={`sidebar ${open ? "open" : ""}`}
        inert={mobile && !open}
      >
        <Brand light />
        <button
          className="mobile-close icon-button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="sidebar-heading">AMBIENTE INSTITUCIONAL</div>
        <nav aria-label="Menu principal">
          {links.map(({ path, label, icon: Icon }) => (
            <NavLink
              end={path === "/"}
              key={path}
              to={path}
              onClick={() => setOpen(false)}
            >
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <LockKeyhole size={18} />
          <div>
            Acesso protegido<small>Informações de uso interno</small>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
            aria-expanded={open}
            aria-controls="main-navigation"
          >
            <Menu />
          </button>
          <div>
            <strong>SIO</strong>
            <span className="header-divider" />{" "}
            <span>Sistema Integrado de Ouvidoria</span>
          </div>
          <div className="user-menu">
            <Notifications />
            <div className="avatar">{user.nome.slice(0, 1).toUpperCase()}</div>
            <div className="user-info">
              <strong>{user.nome}</strong>
              <small>{user.perfis.join(" · ")}</small>
            </div>
            <button
              className="icon-button"
              disabled={busy}
              onClick={signOut}
              aria-label="Sair do sistema"
            >
              <LogOut size={19} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {error && (
            <div className="message error" role="alert">
              {error}
            </div>
          )}
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>Santa Casa de Pelotas · Ouvidoria</span>
          <span>SIO · Uso institucional</span>
        </footer>
      </div>
    </div>
  );
}
