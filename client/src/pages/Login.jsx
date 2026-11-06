import { useState } from "react";
import { ArrowRight, ShieldCheck, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Brand } from "../components/Brand.jsx";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../services/api.js";
import logoUrl from "../assets/santacasalogo.png";

export function Login() {
  const auth = useAuth();
  const [recovery, setRecovery] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    const data = new FormData(event.currentTarget);
    try {
      if (recovery) {
        const novaSenha = String(data.get("senha") || "");
        if (novaSenha.length > 6) {
          setError("A senha deve ter no máximo 6 caracteres.");
          return;
        }
        await api("/auth/reset", {
          method: "POST",
          body: { token: data.get("token").trim(), senha: novaSenha },
        });
        setRecovery(false);
        setSuccess("Senha atualizada. Entre com a nova senha.");
      } else await auth.login(data.get("login"), data.get("senha"));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function switchMode() {
    setRecovery(!recovery);
    setError("");
    setSuccess("");
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="story-copy">
          <span className="eyebrow">OUVIDORIA INSTITUCIONAL</span>
          <h1>
            Escutar com atenção.
            <br />
            Cuidar com propósito.
          </h1>
          <p>
            Um espaço integrado para acolher manifestações e acompanhar cada
            resposta com responsabilidade.
          </p>
          <div className="story-rule" />
          <span>Santa Casa de Pelotas</span>
        </div>
        <div className="story-footer">
          <ShieldCheck size={18} /> Acesso exclusivo a profissionais autorizados
        </div>
      </section>
      <section className="login-panel">
        <div className="login-box">
          <div className="login-institution-header">
            <img
              src={logoUrl}
              alt="Santa Casa de Pelotas"
              className="login-institution-logo"
            />
            <div className="system-tag">
              SIO <span>/</span> OUVIDORIA
            </div>
          </div>
          <h2>{recovery ? "Recuperar acesso" : "Bem-vindo ao SIO"}</h2>
          <p className="muted">
            {recovery
              ? "Solicite à administração um código de uso único, após a verificação da sua identidade. O código expira em 15 minutos."
              : "Sistema Integrado de Ouvidoria. Entre com suas credenciais institucionais."}
          </p>
          <form key={String(recovery)} onSubmit={submit}>
            {recovery ? (
              <label>
                Código de recuperação
                <input
                  name="token"
                  autoComplete="off"
                  minLength={64}
                  maxLength={64}
                  required
                  placeholder="Cole o código fornecido pela administração"
                />
              </label>
            ) : (
              <label>
                Usuário
                <input
                  name="login"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={80}
                  placeholder="Seu usuário institucional"
                />
              </label>
            )}
            <label>
              {recovery ? "Nova senha (máx. 6 caracteres)" : "Senha"}
              <div className="password-field">
                <input
                  name="senha"
                  type={visible ? "text" : "password"}
                  autoComplete={recovery ? "new-password" : "current-password"}
                  minLength={1}
                  maxLength={recovery ? 6 : 128}
                  required
                  placeholder={
                    recovery ? "No máximo 6 caracteres" : "Digite sua senha"
                  }
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            {(error || auth.error) && (
              <div className="message error" role="alert">
                {error || auth.error}
              </div>
            )}
            {success && (
              <div className="message success" role="status">
                {success}
              </div>
            )}
            <button className="primary login-submit" disabled={busy}>
              {busy
                ? "Aguarde…"
                : recovery
                  ? "Atualizar senha"
                  : "Entrar no sistema"}
              <ArrowRight size={18} />
            </button>
            <button
              type="button"
              className="text-button recovery"
              onClick={switchMode}
            >
              {recovery && <ArrowLeft size={16} />}{" "}
              {recovery ? "Voltar para o login" : "Esqueci minha senha"}
            </button>
          </form>
          <div className="login-note">
            <ShieldCheck size={20} />
            <p>
              Ambiente institucional protegido.
              <br />
              As atividades de acesso são auditadas.
            </p>
          </div>
        </div>
        <footer>SIO · Santa Casa de Pelotas</footer>
      </section>
    </main>
  );
}
