import {
  ShieldCheck,
  Database,
  LockKeyhole,
  ClipboardList,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
export function Home() {
  const { user } = useAuth();
  return (
    <>
      <PageTitle eyebrow="PAINEL INSTITUCIONAL" title="Visão geral">
        Bem-vindo, {user.nome.split(" ")[0]}. Este é o seu ambiente de trabalho
        na Ouvidoria.
      </PageTitle>
      <section className="welcome-card">
        <div>
          <span className="pill">ETAPA 1 · FUNDAÇÃO</span>
          <h2>Uma base segura para cada atendimento.</h2>
          <p>
            Autenticação, perfis de acesso e auditoria disponíveis. Os módulos
            de atendimento serão habilitados nas próximas etapas.
          </p>
        </div>
        <div className="welcome-icon">
          <ShieldCheck size={68} strokeWidth={1} />
        </div>
      </section>
      <div className="foundation-grid">
        <article className="card feature-card">
          <div className="feature-icon">
            <LockKeyhole />
          </div>
          <h3>Acesso institucional</h3>
          <p>Sessões protegidas e permissões vinculadas ao seu perfil.</p>
          <span className="ready">
            <Check size={14} /> Disponível
          </span>
        </article>
        <article className="card feature-card">
          <div className="feature-icon">
            <Database />
          </div>
          <h3>Identificação individual</h3>
          <p>Uma conta institucional para cada profissional autorizado.</p>
          <span className="ready">
            <Check size={14} /> Disponível
          </span>
        </article>
        <article className="card feature-card">
          <div className="feature-icon">
            <ShieldCheck />
          </div>
          <h3>Rastreabilidade</h3>
          <p>Eventos de autenticação registrados em auditoria técnica.</p>
          <span className="ready">
            <Check size={14} /> Disponível
          </span>
        </article>
      </div>
      <div className="home-bottom">
        <section className="card module-placeholder">
          <div className="section-heading">
            <h2>Atendimento e indicadores</h2>
            <span className="neutral-tag">Próximas etapas</span>
          </div>
          <div className="empty-state">
            <ClipboardList size={38} strokeWidth={1.3} />
            <h3>O atendimento ainda não está habilitado</h3>
            <p>
              Manifestações, prazos e relatórios serão disponibilizados após a
              implementação e validação dos respectivos módulos.
            </p>
          </div>
        </section>
        <section className="card access-card">
          <h2>Seu acesso</h2>
          <span className="muted small">PERFIS ATRIBUÍDOS</span>
          <div className="profile-tags">
            {user.perfis.map((p) => (
              <span className="profile-tag" key={p}>
                {p}
              </span>
            ))}
          </div>
          <p>
            O acesso aos futuros casos também dependerá da atribuição e da
            classificação de sigilo.
          </p>
          {user.permissoes.includes("usuarios.gerenciar") && (
            <Link to="/perfis" className="inline-link">
              Consultar permissões <ArrowUpRight size={16} />
            </Link>
          )}
        </section>
      </div>
    </>
  );
}
