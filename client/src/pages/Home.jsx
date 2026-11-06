import { Link } from "react-router-dom";
import { ShieldCheck, ClipboardList, Settings } from "lucide-react";
import { PageTitle } from "../components/PageTitle.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
export function Home() {
  const { user } = useAuth();
  return (
    <>
      <PageTitle eyebrow="PAINEL INSTITUCIONAL" title="Visão geral">
        Bem-vindo, {user.nome.split(" ")[0]}. Acesse suas atividades e acompanhe
        as notificações no sino.
      </PageTitle>
      <section className="welcome-card">
        <div>
          <span className="pill">OUVIDORIA · SANTA CASA DE PELOTAS</span>
          <h2>Escutar, acompanhar e responder.</h2>
          <p>
            Cada atendimento possui responsáveis, prazos e histórico. Seu perfil
            determina as ações disponíveis.
          </p>
        </div>
        <ShieldCheck size={64} />
      </section>
      <div className="foundation-grid">
        {user.permissoes.includes("cadastros.gerenciar") && (
          <Link to="/cadastros" className="card feature-card">
            <Settings />
            <h3>Cadastros institucionais</h3>
            <p>
              Configure usuários, equipes, locais, motivos e regras de prazo.
            </p>
          </Link>
        )}
        {user.permissoes.includes("manifestacoes.acompanhar") && (
          <Link to="/manifestacoes" className="card feature-card">
            <ClipboardList />
            <h3>Minhas manifestações</h3>
            <p>Consulte os casos autorizados e registre suas tratativas.</p>
          </Link>
        )}
        {user.permissoes.includes("usuarios.gerenciar") && (
          <Link to="/perfis" className="card feature-card">
            <ShieldCheck />
            <h3>Perfis e permissões</h3>
            <p>Revise as responsabilidades de cada perfil institucional.</p>
          </Link>
        )}
      </div>
      <section className="card access-card">
        <h2>Seu acesso</h2>
        <div className="profile-tags">
          {user.perfis.map((p) => (
            <span className="profile-tag" key={p}>
              {p}
            </span>
          ))}
        </div>
        <p>
          A administração técnica não concede acesso automático ao conteúdo de
          manifestações. Casos restritos exigem autorização individual e
          ausência de conflitos de interesses.
        </p>
      </section>
    </>
  );
}
