/*
 * fundoAgua.js — fundo animado com efeito de água (Santa Casa de Pelotas, T.I.)
 * Módulo com função de limpeza para uso em SPA (padrão de login da T.I.).
 *
 * Uso:
 *   const parar = iniciarFundoAgua({ canvas, imagem });
 *   ...
 *   parar(); // ao desmontar a tela
 *
 * Opções:
 *   intensidade   força das ondas do mouse (padrão 1)
 *   ondulacao     movimento suave contínuo do fundo (padrão 1; 0 desliga)
 *   brilho        cor do reflexo das ondas em [r,g,b] 0–1 (padrão ciano)
 *   escala        resolução interna do canvas (padrão 0.75 — mais leve em PCs fracos)
 *
 * Se o navegador não tiver WebGL, a imagem fica parada como fundo do canvas.
 * Se o usuário preferir menos movimento, a ondulação contínua é desligada e
 * o fundo só reage ao mouse.
 */

const MAX_GOTAS = 24;

const VERT = [
  'attribute vec2 p;',
  'varying vec2 v;',
  'void main(){ v = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }',
].join('\n');

const FRAG = [
  'precision mediump float;',
  'varying vec2 v;',
  'uniform sampler2D img;',
  'uniform vec2 tela;', // tamanho do canvas em px
  'uniform vec2 imgTam;', // tamanho da imagem em px
  'uniform float t;',
  'uniform float forca;',
  'uniform float ondulacao;',
  'uniform vec3 brilho;',
  `uniform vec4 gotas[${MAX_GOTAS}];`, // x, y (0–1 da tela), idade (s), força
  'uniform int nGotas;',
  '',
  'vec2 cobrir(vec2 uv){', // mesmo enquadramento de background-size: cover
  '  float rt = tela.x / tela.y, ri = imgTam.x / imgTam.y;',
  '  vec2 s = rt > ri ? vec2(1.0, ri / rt) : vec2(rt / ri, 1.0);',
  '  return (uv - 0.5) * s + 0.5;',
  '}',
  '',
  'void main(){',
  '  vec2 uv = v;',
  '  float asp = tela.x / tela.y;',
  '  vec2 desl = vec2(0.0);',
  '  float luz = 0.0;',
  '',
  '  // ondulação contínua, bem lenta',
  '  desl += ondulacao * 0.0018 * vec2(',
  '    sin(uv.y * 9.0 + t * 0.55) + 0.6 * sin(uv.y * 17.0 - t * 0.35 + uv.x * 4.0),',
  '    cos(uv.x * 8.0 + t * 0.45) + 0.6 * cos(uv.x * 15.0 + t * 0.3 - uv.y * 3.0)',
  '  );',
  '',
  '  // ondas das gotas (mouse)',
  `  for (int i = 0; i < ${MAX_GOTAS}; i++) {`,
  '    if (i >= nGotas) break;',
  '    vec4 g = gotas[i];',
  '    vec2 d = uv - g.xy; d.x *= asp;',
  '    float r = length(d);',
  '    float frente = g.z * 0.32;', // raio da frente da onda
  '    float anel = exp(-pow((r - frente) * 14.0, 2.0));', // só perto da frente
  '    float onda = sin((r - frente) * 90.0) * anel * exp(-g.z * 1.6) * g.w;',
  '    vec2 dir = r > 0.0001 ? d / r : vec2(0.0);',
  '    dir.x /= asp;',
  '    desl += dir * onda * 0.016 * forca;',
  '    luz += max(onda, 0.0) * 0.26 * forca;',
  '  }',
  '',
  '  vec3 cor = texture2D(img, cobrir(uv + desl)).rgb;',
  '  cor += brilho * luz;',
  '  gl_FragColor = vec4(cor, 1.0);',
  '}',
].join('\n');

function compilar(gl, tipo, src) {
  const s = gl.createShader(tipo);
  if (!s) throw new Error('não foi possível criar o shader');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'erro ao compilar o shader');
  }
  return s;
}

/** Inicia o efeito e devolve uma função que para tudo e remove os ouvintes. */
export function iniciarFundoAgua(op) {
  const canvas = op.canvas;
  const intensidade = op.intensidade ?? 1;
  const brilho = op.brilho ?? [0.37, 0.9, 1.0];
  let escala = op.escala ?? 0.75;
  // Com "reduzir movimento" ligado, o fundo não ondula sozinho: só reage ao mouse.
  const poucoMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ondulacao = poucoMovimento ? 0 : (op.ondulacao ?? 1);

  // reserva: se algo falhar, a imagem fica parada como fundo do canvas
  const fundoParado = `url("${op.imagem}") center / cover no-repeat`;
  canvas.style.background = fundoParado;

  const semEfeito = () => {};

  const gl = canvas.getContext('webgl', {
    antialias: false,
    alpha: false,
    powerPreference: 'low-power',
  });
  if (!gl) return semEfeito;

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'erro ao ligar o programa');
    }
  } catch (e) {
    console.warn('fundo-agua: usando imagem parada', e);
    return semEfeito;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = (nome) => gl.getUniformLocation(prog, nome);
  const U = {
    img: u('img'),
    tela: u('tela'),
    imgTam: u('imgTam'),
    t: u('t'),
    gotas: u('gotas'),
    nGotas: u('nGotas'),
  };
  gl.uniform1f(u('forca'), intensidade);
  gl.uniform1f(u('ondulacao'), ondulacao);
  gl.uniform3fv(u('brilho'), brilho);

  let gotas = [];
  const dadosGotas = new Float32Array(MAX_GOTAS * 4);
  const inicio = performance.now();
  let pronto = false;
  let quadro = 0;
  let visivel = !document.hidden;
  let parado = false;

  function redimensionar() {
    const w = Math.round(window.innerWidth * escala);
    const h = Math.round(window.innerHeight * escala);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.tela, w, h);
  }

  function soltarGota(cx, cy, forca) {
    gotas.push({
      x: cx / window.innerWidth,
      y: 1 - cy / window.innerHeight,
      nasceu: performance.now(),
      forca,
    });
    if (gotas.length > MAX_GOTAS) gotas.shift();
  }

  let ultimo = { x: -999, y: -999, t: 0 };
  function aoMover(e) {
    const agora = performance.now();
    const dx = e.clientX - ultimo.x;
    const dy = e.clientY - ultimo.y;
    if (agora - ultimo.t > 60 && dx * dx + dy * dy > 400) {
      const vel = Math.min(Math.sqrt(dx * dx + dy * dy) / 80, 1);
      soltarGota(e.clientX, e.clientY, 0.35 + vel * 0.45);
      ultimo = { x: e.clientX, y: e.clientY, t: agora };
    }
  }
  function aoClicar(e) {
    soltarGota(e.clientX, e.clientY, 1.1);
  }
  function aoMudarVisibilidade() {
    visivel = !document.hidden;
    if (visivel) laco();
  }

  // Qualidade automática: se o PC não aguentar, reduz a resolução;
  // se mesmo assim ficar lento, congela o fundo (fica como imagem parada).
  let amostra = { inicio: 0, quadros: 0 };
  let nivel = 0;
  function medirDesempenho(agora) {
    if (!amostra.inicio) {
      amostra.inicio = agora;
      return;
    }
    amostra.quadros++;
    const dt = agora - amostra.inicio;
    if (dt < 2000) return;
    const fps = (amostra.quadros * 1000) / dt;
    amostra = { inicio: agora, quadros: 0 };
    if (fps >= 30) return;
    nivel++;
    if (nivel === 1) {
      escala = Math.min(escala, 0.5);
      redimensionar();
    } else if (nivel === 2) {
      escala = 0.35;
      redimensionar();
    } else {
      pronto = false;
      console.info('fundo-agua: PC lento, fundo congelado');
    }
  }

  function laco() {
    cancelAnimationFrame(quadro);
    if (parado || !pronto || !visivel) return;
    const agora = performance.now();
    gotas = gotas.filter((g) => agora - g.nasceu < 3500);
    dadosGotas.fill(0);
    for (let i = 0; i < gotas.length; i++) {
      dadosGotas[i * 4] = gotas[i].x;
      dadosGotas[i * 4 + 1] = gotas[i].y;
      dadosGotas[i * 4 + 2] = (agora - gotas[i].nasceu) / 1000;
      dadosGotas[i * 4 + 3] = gotas[i].forca;
    }
    gl.uniform4fv(U.gotas, dadosGotas);
    gl.uniform1i(U.nGotas, gotas.length);
    medirDesempenho(agora);
    gl.uniform1f(U.t, (agora - inicio) / 1000);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    quadro = requestAnimationFrame(laco);
  }

  const img = new Image();
  img.onload = () => {
    if (parado) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(U.img, 0);
    gl.uniform2f(U.imgTam, img.naturalWidth, img.naturalHeight);
    pronto = true;
    canvas.style.background = 'none';
    redimensionar();
    laco();
  };
  img.src = op.imagem;

  window.addEventListener('resize', redimensionar);
  window.addEventListener('pointermove', aoMover, { passive: true });
  window.addEventListener('pointerdown', aoClicar, { passive: true });
  document.addEventListener('visibilitychange', aoMudarVisibilidade);

  return () => {
    parado = true;
    cancelAnimationFrame(quadro);
    window.removeEventListener('resize', redimensionar);
    window.removeEventListener('pointermove', aoMover);
    window.removeEventListener('pointerdown', aoClicar);
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    canvas.style.background = fundoParado;
  };
}
