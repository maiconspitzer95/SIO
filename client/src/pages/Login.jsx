import { useState } from "react";
import {
  ArrowRight,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowLeft,
  User,
  KeyRound,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../services/api.js";

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
    const run = () => {
      setRecovery(!recovery);
      setError("");
      setSuccess("");
    };
    // "Morphing" do cartão de vidro entre login e recuperação.
    if (document.startViewTransition) document.startViewTransition(run);
    else run();
  }
  return (
    <main className="login-page">
      <div className="login-stack">
        <header className="login-hero">
          {/* O logotipo já faz parte da imagem de fundo; mantido para leitores de tela */}
          <span className="visually-hidden">Santa Casa de Pelotas</span>
          <span className="system-tag">
            SIO <span>·</span> SISTEMA INTEGRADO DE OUVIDORIA
          </span>
          <h1>Escutar com atenção. Cuidar com propósito.</h1>
        </header>

        <section className="login-glass glass-interactive" aria-labelledby="login-title">
          <div className="login-glass-head">
            <h2 id="login-title">
              {recovery ? "Recuperar acesso" : "Entrar"}
            </h2>
            <p>
              {recovery
                ? "Use o código de uso único fornecido pela administração. Ele expira em 15 minutos."
                : "Use suas credenciais institucionais."}
            </p>
          </div>
          <form key={String(recovery)} onSubmit={submit}>
            {recovery ? (
              <label className="glass-field">
                <span>Código de recuperação</span>
                <div className="glass-input">
                  <KeyRound size={18} aria-hidden="true" />
                  <input
                    name="token"
                    autoComplete="off"
                    minLength={64}
                    maxLength={64}
                    required
                    placeholder="Cole o código recebido"
                  />
                </div>
              </label>
            ) : (
              <label className="glass-field">
                <span>Usuário</span>
                <div className="glass-input">
                  <User size={18} aria-hidden="true" />
                  <input
                    name="login"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={80}
                    placeholder="Seu usuário"
                    autoFocus
                  />
                </div>
              </label>
            )}
            <label className="glass-field">
              <span>{recovery ? "Nova senha (máx. 6 caracteres)" : "Senha"}</span>
              <div className="glass-input">
                <KeyRound size={18} aria-hidden="true" />
                <input
                  name="senha"
                  type={visible ? "text" : "password"}
                  autoComplete={recovery ? "new-password" : "current-password"}
                  minLength={1}
                  maxLength={recovery ? 6 : 128}
                  required
                  placeholder={recovery ? "Até 6 caracteres" : "Sua senha"}
                />
                <button
                  type="button"
                  className="reveal"
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
              {recovery && <ArrowLeft size={16} />}
              {recovery ? "Voltar para o login" : "Esqueci minha senha"}
            </button>
          </form>
        </section>

        <footer className="login-foot">
          <ShieldCheck size={16} /> Ambiente institucional protegido · acessos
          auditados
        </footer>
      </div>
    </main>
  );
}
