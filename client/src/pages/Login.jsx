import { useEffect, useRef, useState } from "react";
import { useAuth } from "../hooks/useAuth.jsx";
import { api } from "../services/api.js";
import { iniciarFundoAgua } from "../services/fundoAgua.js";
import { version } from "../../../package.json";
import logoSantaCasa from "../assets/login/logo-santa-casa.png";
import fundoBase from "../assets/login/fundo-base.jpg";
import "./Login.css";

// Tela de login no padrão da T.I. (ver PADRAO-LOGIN-TI-SEMAVATAR.md).
// "Lembrar usuário" guarda só o nome de usuário, nunca a senha.
const CHAVE_USUARIO = "sio_usuario";
const TAMANHO_CODIGO = 64;
const SENHA_MAX_RECUPERACAO = 6;

function lerUsuarioSalvo() {
  try {
    return localStorage.getItem(CHAVE_USUARIO) || "";
  } catch {
    return "";
  }
}

function salvarUsuario(usuario) {
  try {
    if (usuario) localStorage.setItem(CHAVE_USUARIO, usuario);
    else localStorage.removeItem(CHAVE_USUARIO);
  } catch {
    /* localStorage indisponível: segue sem lembrar */
  }
}

// cx, cy, r, atraso (s), duração (s), deriva (px)
const PARTICULAS = [
  [743, 654, 3, -9.1, 11.5, 28],
  [968, 928, 1.5, -3.4, 14.9, -33],
  [1261, 906, 1.5, -13.7, 11.3, -23],
  [1751, 685, 1.5, -8.1, 15.5, 7],
  [1473, 1044, 3, -10.9, 14.3, 18],
  [247, 807, 3, -12.3, 16.1, -4],
  [391, 1000, 3, -0.5, 15.7, 31],
  [1712, 967, 1.5, -11.8, 17.6, 20],
  [1475, 956, 2.5, -10.0, 17.2, 4],
];

const TRILHAS = [
  "M0 420 H180 L230 470 H360",
  "M0 460 H140 L200 520 H300 L330 550",
  "M0 520 H110 L160 570 H250",
  "M0 240 H90 L140 190 H260",
  "M1920 300 H1760 L1710 250 H1590",
  "M1920 340 H1700 L1650 390 H1560",
  "M1920 880 H1780 L1730 830 H1640",
];

/** Camada SVG do fundo: luz nas trilhas de circuito e partículas. */
function FundoCamadas() {
  return (
    <svg
      className="sl-fundo-camadas"
      viewBox="0 0 1920 1080"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <filter id="sl-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g className="sl-camada-longe">
        <g
          fill="none"
          stroke="#9ff0ff"
          strokeWidth="3"
          strokeLinecap="round"
          filter="url(#sl-glow)"
        >
          {TRILHAS.map((d, i) => (
            <path
              key={d}
              className={`sl-pulso sl-p${i + 1}`}
              pathLength={1000}
              d={d}
            />
          ))}
        </g>
        <g fill="#9fe9ff">
          {PARTICULAS.map(([cx, cy, r, atraso, dur, deriva], i) => (
            <circle
              key={i}
              className="sl-particula"
              cx={cx}
              cy={cy}
              r={r}
              style={{
                "--atraso": `${atraso}s`,
                "--dur": `${dur}s`,
                "--deriva": `${deriva}px`,
              }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
}

const iconeProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};
const IconeUsuario = () => (
  <svg className="sl-icone" {...iconeProps}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
const IconeCadeado = () => (
  <svg className="sl-icone" {...iconeProps}>
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);
const IconeChave = () => (
  <svg className="sl-icone" {...iconeProps}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l9-9M16 7l3 3" />
  </svg>
);

export function Login() {
  const auth = useAuth();

  const [usuarioSalvo] = useState(lerUsuarioSalvo);
  const [usuario, setUsuario] = useState(usuarioSalvo);
  const [senha, setSenha] = useState("");
  const [codigo, setCodigo] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [lembrar, setLembrar] = useState(Boolean(usuarioSalvo));
  const [recuperando, setRecuperando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const raizRef = useRef(null);
  const canvasRef = useRef(null);
  const cartaoRef = useRef(null);
  const usuarioRef = useRef(null);
  const codigoRef = useRef(null);
  const senhaRef = useRef(null);

  // Foco inicial: com usuário lembrado, vai direto para a senha
  useEffect(() => {
    if (recuperando) codigoRef.current?.focus();
    else (usuario ? senhaRef : usuarioRef).current?.focus();
    // só ao entrar na tela ou trocar de modo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recuperando]);

  // Efeito de água (WebGL) no fundo; para ao sair da tela
  useEffect(() => {
    if (!canvasRef.current) return;
    return iniciarFundoAgua({
      canvas: canvasRef.current,
      imagem: fundoBase,
      intensidade: 1.5,
    });
  }, []);

  // Ponteiro: brilho de vidro que acompanha o mouse no cartão + parallax suave do fundo
  useEffect(() => {
    const raiz = raizRef.current;
    const cartao = cartaoRef.current;
    if (!raiz || !cartao) return;
    const comParallax = !window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    const ponteiro = { x: 0, y: 0 };
    const alvo = { x: 0, y: 0 };
    const atual = { x: 0, y: 0 };
    let quadro = 0;

    const passo = () => {
      const r = cartao.getBoundingClientRect();
      cartao.style.setProperty("--gx", `${(ponteiro.x - r.left).toFixed(1)}px`);
      cartao.style.setProperty("--gy", `${(ponteiro.y - r.top).toFixed(1)}px`);
      if (!comParallax) {
        quadro = 0;
        return;
      }
      atual.x += (alvo.x - atual.x) * 0.06;
      atual.y += (alvo.y - atual.y) * 0.06;
      raiz.style.setProperty("--mx", atual.x.toFixed(3));
      raiz.style.setProperty("--my", atual.y.toFixed(3));
      // para quando alcança o ponteiro; volta a rodar no próximo movimento
      const parado =
        Math.abs(alvo.x - atual.x) < 0.001 &&
        Math.abs(alvo.y - atual.y) < 0.001;
      quadro = parado ? 0 : requestAnimationFrame(passo);
    };
    const aoMover = (e) => {
      ponteiro.x = e.clientX;
      ponteiro.y = e.clientY;
      alvo.x = (e.clientX / window.innerWidth) * 2 - 1;
      alvo.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!quadro) quadro = requestAnimationFrame(passo);
    };

    window.addEventListener("pointermove", aoMover, { passive: true });
    return () => {
      window.removeEventListener("pointermove", aoMover);
      cancelAnimationFrame(quadro);
    };
  }, []);

  function trocarModo(paraRecuperacao) {
    setRecuperando(paraRecuperacao);
    setSenha("");
    setCodigo("");
    setVerSenha(false);
    setErro("");
    setSucesso("");
  }

  async function entrar() {
    const nome = usuario.trim();
    if (!nome || !senha) {
      setErro("Preencha usuário e senha para entrar.");
      (nome ? senhaRef : usuarioRef).current?.focus();
      return;
    }
    salvarUsuario(lembrar ? nome : null);
    setCarregando(true);
    try {
      await auth.login(nome, senha);
    } catch (e) {
      setErro(e.message || "Falha na autenticação.");
    } finally {
      setCarregando(false);
    }
  }

  async function redefinir() {
    const token = codigo.trim();
    if (!token || !senha) {
      setErro("Preencha o código de recuperação e a nova senha.");
      (token ? senhaRef : codigoRef).current?.focus();
      return;
    }
    if (token.length !== TAMANHO_CODIGO) {
      setErro(`O código de recuperação tem ${TAMANHO_CODIGO} caracteres.`);
      codigoRef.current?.focus();
      return;
    }
    if (senha.length > SENHA_MAX_RECUPERACAO) {
      setErro(`A senha deve ter no máximo ${SENHA_MAX_RECUPERACAO} caracteres.`);
      senhaRef.current?.focus();
      return;
    }
    setCarregando(true);
    try {
      await api("/auth/reset", { method: "POST", body: { token, senha } });
      trocarModo(false);
      setSucesso("Senha atualizada. Entre com a nova senha.");
    } catch (e) {
      setErro(e.message || "Não foi possível atualizar a senha.");
    } finally {
      setCarregando(false);
    }
  }

  function aoEnviar(evento) {
    evento.preventDefault();
    if (carregando) return;
    setErro("");
    setSucesso("");
    if (recuperando) redefinir();
    else entrar();
  }

  const mensagemErro = erro || auth.error;

  return (
    <div className="sio-login" ref={raizRef}>
      <canvas className="sl-fundo-agua" ref={canvasRef} aria-hidden="true" />
      <div className="sl-fundo-veu" aria-hidden="true" />
      <FundoCamadas />

      <main className="sl-conjunto">
        <section
          className="sl-cartao"
          ref={cartaoRef}
          aria-labelledby="sl-titulo"
        >
          <div className="sl-cartao-form">
            <img
              className="sl-logo"
              src={logoSantaCasa}
              alt="Santa Casa de Pelotas"
            />
            <h1 className="sl-titulo" id="sl-titulo">
              SIO
            </h1>
            <p className="sl-nome-sistema">Sistema Integrado de Ocorrências</p>
            <p className="sl-subtitulo">Acesso institucional</p>

            <form className="sl-form" onSubmit={aoEnviar} noValidate>
              {recuperando ? (
                <>
                  <p className="sl-dica">
                    Use o código de uso único fornecido pela administração. Ele
                    expira em 15 minutos.
                  </p>
                  <label className="sl-rotulo" htmlFor="sl-codigo">
                    Código de recuperação
                  </label>
                  <div className="sl-campo">
                    <IconeChave />
                    <input
                      id="sl-codigo"
                      ref={codigoRef}
                      type="text"
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value)}
                      placeholder="Cole o código recebido"
                      autoComplete="off"
                      maxLength={TAMANHO_CODIGO}
                    />
                  </div>
                </>
              ) : (
                <>
                  <label className="sl-rotulo" htmlFor="sl-usuario">
                    Usuário
                  </label>
                  <div className="sl-campo">
                    <IconeUsuario />
                    <input
                      id="sl-usuario"
                      ref={usuarioRef}
                      type="text"
                      value={usuario}
                      onChange={(e) => setUsuario(e.target.value)}
                      placeholder="Seu usuário"
                      autoComplete="username"
                      maxLength={80}
                    />
                  </div>
                </>
              )}

              <label className="sl-rotulo" htmlFor="sl-senha">
                {recuperando
                  ? `Nova senha (máx. ${SENHA_MAX_RECUPERACAO} caracteres)`
                  : "Senha"}
              </label>
              <div className="sl-campo">
                <IconeCadeado />
                <input
                  id="sl-senha"
                  ref={senhaRef}
                  type={verSenha ? "text" : "password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={
                    recuperando
                      ? `Até ${SENHA_MAX_RECUPERACAO} caracteres`
                      : "Sua senha"
                  }
                  autoComplete={
                    recuperando ? "new-password" : "current-password"
                  }
                  maxLength={recuperando ? SENHA_MAX_RECUPERACAO : 128}
                />
                <button
                  type="button"
                  className="sl-ver-senha"
                  onClick={() => setVerSenha((v) => !v)}
                  aria-label={verSenha ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={verSenha}
                >
                  <svg {...iconeProps}>
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                    {verSenha && <path d="M4 4l16 16" />}
                  </svg>
                </button>
              </div>

              {recuperando ? (
                <div className="sl-opcoes sl-so-voltar">
                  <button
                    type="button"
                    className="sl-esqueci"
                    onClick={() => trocarModo(false)}
                  >
                    Voltar para o login
                  </button>
                </div>
              ) : (
                <div className="sl-opcoes">
                  <label className="sl-lembrar">
                    <input
                      type="checkbox"
                      checked={lembrar}
                      onChange={(e) => {
                        setLembrar(e.target.checked);
                        if (!e.target.checked) salvarUsuario(null);
                      }}
                    />
                    Lembrar usuário
                  </label>
                  <button
                    type="button"
                    className="sl-esqueci"
                    onClick={() => trocarModo(true)}
                  >
                    Esqueceu a senha?
                  </button>
                </div>
              )}

              <button className="sl-entrar" type="submit" disabled={carregando}>
                {carregando
                  ? recuperando
                    ? "Atualizando..."
                    : "Autenticando..."
                  : recuperando
                    ? "Atualizar senha"
                    : "Entrar"}
              </button>
              <div role="alert">
                {mensagemErro ? (
                  <p className="sl-mensagem">{mensagemErro}</p>
                ) : (
                  sucesso && <p className="sl-mensagem sl-ok">{sucesso}</p>
                )}
              </div>
            </form>
          </div>

        </section>

        <p className="sl-rodape">
          <strong>Santa Casa de Pelotas</strong>
          <br />
          Tecnologia da Informação, versão {version}
        </p>
      </main>
    </div>
  );
}
