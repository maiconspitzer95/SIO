# Padrão visual T.I. — Login sem avatar e interface interna

Santa Casa de Pelotas · Referência: Sistema MP · Atualizado em 12/11/2026.

Este documento define o padrão aprovado no MP: login centralizado sem avatar e área interna com fundo azul, menus, painéis e janelas em vidro escuro fosco. Substitui o documento `PADRAO-LOGIN-TI.md` neste projeto.

## 1. Implementação de referência

Projeto: `C:\Users\maicon\Documents\Projetos\mp`.

A implementação atual usa HTML, CSS e módulos JavaScript, sem exigir React ou Tailwind. O efeito de água foi adaptado da referência do SIC; para reproduzir esta variante, usar os arquivos do MP abaixo.

| Arquivo | Responsabilidade |
|---|---|
| `public/index.html` | Estrutura do login, aplicação e diálogos; ordem dos estilos |
| `public/css/login.css` | Login isolado sob `.mp-login` |
| `public/js/login.js` | Foco, lembrar usuário, mostrar senha, ajuda e ciclo dos efeitos |
| `public/js/fundo-agua.js` | Fundo WebGL; `iniciarFundoAgua(...)` retorna a função de parada |
| `public/js/auth.js` | Integração com a autenticação já existente |
| `public/assets/login/logo-santa-casa.png` | Logo institucional branco |
| `public/assets/login/fundo-base.jpg` | Imagem de fundo do login |
| `public/css/internal-glass.css` | Tema escuro da aplicação e dos diálogos |
| `public/css/visual.css` e demais CSS dos módulos | Estrutura, dimensões e responsividade existentes |

Carregar `login.css` depois dos estilos existentes e `internal-glass.css` por último. O tema interno complementa os estilos dos módulos; não substitui suas regras de layout.

## 2. Direção visual

- Visual limpo, com fundo azul, superfícies escuras translúcidas, bordas finas e sombras discretas.
- Fonte local Segoe UI, sem dependência de serviços de fontes ou internet.
- Textos claros e descrições em azul acinzentado, com bom contraste nos formulários e tabelas.
- Sem mascote, avatar decorativo, coluna reservada ao personagem ou indicador de personagem online no login, em qualquer resolução.
- A identificação do usuário autenticado por nome, perfil e iniciais no cabeçalho interno pode ser mantida.
- Efeitos decorativos de água, circuitos e partículas ficam somente no login. O fundo interno é um gradiente estático, adequado ao uso contínuo.

## 3. Tela de login sem avatar

### Estrutura e medidas

Um único cartão central, com formulário em uma coluna. Largura máxima do conjunto de 420px no desktop e 380px em telas de até 700px, respeitando a largura disponível. Cantos de 22px e padding do cartão de `34px 36px 28px`; em telas de até 420px, `28px 20px 24px`.

Ordem dos elementos:

1. Logo branco da Santa Casa, centralizado, com largura de 170px.
2. Sigla do sistema: `MP`.
3. Nome: `Sistema de Movimentação de Pessoal`.
4. Subtítulo: `Acesso institucional`.
5. Campo Usuário com ícone à esquerda.
6. Campo Senha com ícone à esquerda e botão de mostrar/ocultar à direita.
7. Linha com `Lembrar usuário` e `Esqueceu a senha?`.
8. Botão `Entrar`.
9. Mensagem de erro ou orientação abaixo do botão.
10. Rodapé externo ao cartão: `Santa Casa de Pelotas` e `Tecnologia da Informação, versão 1.0`.

Campos e botão de entrada têm 44px de altura e cantos de 11px. O cartão utiliza `backdrop-filter: blur(20px) saturate(150%)`, borda clara fina e sombra profunda.

### Paleta do login

| Uso | Valor |
|---|---|
| Fundo base | `#01040e` |
| Vidro do cartão | `rgba(14, 32, 78, .52)` |
| Vidro dos campos | `rgba(8, 22, 58, .55)` |
| Borda do cartão | `rgba(150, 195, 255, .22)` |
| Texto principal | `#eef4ff` |
| Texto suave | `#a9bde3` |
| Foco e reflexos | `#5ee7ff` |
| Botão Entrar | Gradiente de `#4f8ff0` para `#1f56c9` |
| Erro | `#ff8a9a` |
| Orientação | `#bfe0ff` |

### Fundo e efeitos

- Imagem `fundo-base.jpg` cobrindo a tela, com véu radial escuro e clarão discreto atrás do cartão.
- Trilhas de circuito laterais e poucas partículas; camada SVG com opacidade `.55` e parallax leve.
- Reflexo branco/ciano acompanha o ponteiro no cartão por meio de `--gx` e `--gy`; a borda fica mais clara no hover.
- WebGL produz ondas ao mover o ponteiro e ondas maiores ao clicar, com `intensidade: 1.5`, além de ondulação contínua lenta.
- Entrada com deslocamento vertical de 18px e fade de 0,7s.
- Qualidade do WebGL ajustada pelo FPS, com redução automática da resolução e congelamento em equipamentos lentos. Pausar com a aba oculta; sem WebGL, usar a imagem estática.
- Com redução de movimento, interromper entrada, ondulação contínua, partículas, trilhas e parallax. Os reflexos e ondas acionados pelo ponteiro podem continuar.
- Encerrar o efeito e remover os ouvintes ao sair do login, inclusive ao entrar na troca de senha provisória. Reiniciar ao retornar ao login; evitar duplicação de animações e ouvintes.

### Comportamento

- Preservar autenticação, sessão, CSRF, permissões e fluxo de troca obrigatória de senha do projeto.
- Campos vazios: exibir `Preencha usuário e senha para entrar.` e focar o campo que falta.
- Exibir erros do backend abaixo do botão.
- Durante a requisição, desabilitar o envio e mostrar `Autenticando...`; restaurar `Entrar` ao concluir.
- `Lembrar usuário` armazena somente o nome de usuário no `localStorage`. No MP, usar `mp_usuario`; em outros sistemas, definir chave própria. Nunca gravar a senha.
- Com usuário lembrado, focar a senha; caso contrário, focar o usuário. Ao desmarcar a opção, remover o nome salvo.
- Mostrar/ocultar senha deve atualizar `aria-label` e `aria-pressed`.
- Sem recuperação própria, mostrar: `Para redefinir sua senha, solicite suporte à equipe de T.I. ou ao gestor do seu setor.`
- Limpar a senha ao sair da tela e restaurar seu modo oculto ao retornar.

## 4. Área interna: fundo azul e vidro escuro fosco

### Fundo da aplicação

Aplicar ao contêiner autenticado e à tela de troca de senha provisória:

```css
background:
  radial-gradient(ellipse at 90% 0%, rgba(49, 111, 181, .34), transparent 55%),
  radial-gradient(ellipse at 10% 100%, rgba(32, 85, 151, .3), transparent 60%),
  linear-gradient(140deg, #12365e, #0b2345 55%, #091b35);
background-attachment: fixed;
```

A área de trabalho deve ser transparente para deixar o fundo aparecer. Não adicionar animação contínua nesta área.

### Superfícies e tipografia

| Elemento | Configuração |
|---|---|
| Texto principal | `#e8f0fc` |
| Títulos | `#e8f2ff` |
| Texto secundário | `#a7bad3` |
| Links e destaque | `#8bcaff` / `#96d0ff` |
| Painéis e cartões | `rgba(10, 25, 45, .78)` |
| Superfícies aninhadas | `rgba(7, 20, 37, .48)` |
| Borda padrão | `rgba(161, 193, 232, .17)` |
| Borda de campos/botões | `rgba(161, 193, 232, .28)` |
| Sombra de painéis | `0 8px 28px rgba(0, 8, 23, .16)` |
| Reflexo superior discreto | `inset 0 1px rgba(255, 255, 255, .035)` |

Aplicar desfoque de `18px` e saturação de `125%` aos painéis principais, cartões de indicadores e filtros. Não acumular desfoque em todas as superfícies aninhadas. Preservar a hierarquia de espaçamentos, dimensões e bordas arredondadas dos componentes existentes.

### Menu lateral e cabeçalho

- Menu lateral: `rgba(6, 18, 34, .8)`, borda direita fina e `blur(20px) saturate(130%)`.
- Cabeçalho superior: `rgba(8, 23, 42, .78)`, borda inferior fina e vidro fosco. Manter o comportamento sticky existente.
- Botões do menu: `rgba(8, 20, 36, .42)`, texto `#b6c9e1`, borda discreta e cantos de 13px.
- Hover do menu: `rgba(55, 91, 134, .32)`, borda mais clara e texto branco.
- Item ativo: gradiente entre `rgba(73, 132, 193, .32)` e `rgba(29, 66, 110, .4)`, borda `rgba(137, 196, 250, .28)` e indicação interna à esquerda de 3px em `#7ec6ff`.
- Ícone ativo e identificação por iniciais: fundo `rgba(97, 169, 229, .19)` e texto `#b4e0ff`.
- Manter o recolhimento do menu e o botão de abertura em telas menores.

### Botões, campos e tabelas

- Botões comuns, secundários, Abrir e expandir: vidro escuro `rgba(21, 45, 74, .8)`, texto `#c5e4ff`, borda fina e reflexo superior discreto.
- Botão primário: gradiente entre `rgba(43, 100, 163, .93)` e `rgba(23, 64, 114, .96)`, texto branco e borda azul clara.
- Hover dos botões: aumento moderado de brilho; desabilitados com opacidade `.5` e cursor adequado.
- Campos: `rgba(5, 17, 32, .65)`, texto `#e8f0fc`, placeholder `#8da6c5`, borda clara discreta e foco azul `#78c8f5`.
- Usar `color-scheme: dark` para controles nativos, incluindo datas. Opções dos selects usam fundo `#10233c` e texto claro. Manter autofill legível.
- Tabelas transparentes sobre o painel; cabeçalho `rgba(6, 19, 35, .7)` com texto `#a7c0df`.
- Separadores das linhas discretos; hover `rgba(87, 151, 217, .09)`. Preservar rolagem horizontal quando necessária.

### Status e mensagens

Preservar os textos e significados dos status. Usar fundos escuros com tonalidade semântica, sem depender apenas da cor para identificá-los.

| Significado | Fundo | Texto |
|---|---|---|
| Aguardando, informação, contratação | `rgba(54, 127, 196, .2)` | `#a3d7ff` |
| Aprovado, concluído, preenchido | `rgba(45, 143, 113, .2)` | `#93e4c0` |
| Reprovado, cancelado, ação destrutiva | `rgba(164, 57, 77, .2)` | `#ffa5b2` |
| Ajuste, devolução, pendência | `rgba(160, 115, 43, .2)` | `#f4ce88` |
| Neutro | `rgba(102, 130, 167, .16)` | `#c7d7eb` |

Erros de formulários internos usam `#ffa1ad`. Alertas extensos usam fundo âmbar escuro translúcido e texto claro, sem caixas brancas.

### Janelas e modais

- Fundo: `rgba(9, 23, 41, .92)`.
- Borda: `1px solid rgba(161, 193, 232, .25)`.
- Vidro: `blur(22px) saturate(125%)`, também com prefixo `-webkit-`.
- Sombra: `0 30px 90px rgba(0, 5, 18, .55)` e reflexo superior discreto.
- Backdrop: `rgba(1, 9, 23, .68)` com `blur(5px)`.
- Cabeçalho do detalhe: `rgba(10, 28, 49, .94)`; botão fechar escuro, com texto claro.
- Preservar cabeçalho fixo, rolagem do corpo, limites de altura, fechamento e proteção contra perda de dados.
- Aplicar também às janelas criadas dinamicamente e anexadas ao `body`.

### Abrangência

O padrão deve alcançar Solicitações/Status MP, Nova MP, Aprovações, Monitoramento RH, Relatórios e Dashboards, Relatórios detalhados, Administração, contratação, acompanhamento de vagas, históricos, troca de senha e diálogos de confirmação/redirecionamento. Não deixar campos, cartões aninhados ou janelas com fundos brancos herdados.

## 5. Regras de integração e reutilização

- No MP, o login é isolado por `.mp-login`; o tema interno por `#app-view`, `body > dialog` e `#provisional-password-view`.
- O CSS interno fica em `@media screen`, para não aplicar o fundo escuro à impressão. Não alterar PDF/Excel nem a geração dos relatórios exportados.
- Sem suporte a `backdrop-filter`, usar superfícies escuras mais opacas, preservando contraste.
- Manter navegação por teclado, labels, foco visível, mensagens acessíveis e responsividade existentes.
- Não alterar rotas, fluxos, permissões, validações, autenticação ou dados ao portar o tema.
- Em outro sistema, adaptar sigla, nome, subtítulo, versão, chave de usuário lembrado e seletores do projeto. Manter a variante sem avatar e a paleta azul como padrão.
- Copiar os assets localmente e integrar os eventos à autenticação do destino. Não substituir seu módulo de autenticação pelo do MP.
- Em React ou outra SPA, inicializar os efeitos ao montar o login e executar a limpeza ao desmontar.

## 6. Verificação após aplicar

- Conferir login em desktop e celular, ausência de avatar e espaço vazio de personagem.
- Conferir foco, campos vazios, mostrar senha, lembrar usuário, ajuda, erro do backend, envio em andamento e saída/retorno ao login.
- Revisar menu ativo, filtros, tabelas, formulários, relatórios, administração e todos os modais no tema escuro.
- Verificar leitura dos status, campos de data, selects, autofill e botões desabilitados.
- Conferir responsividade, rolagem dos modais, foco por teclado, redução de movimento e fallback sem WebGL/desfoque.
- Confirmar que impressão e exportações continuam adequadas.
- Executar os testes pertinentes do projeto. No MP, `node --test tests/visual-design.test.js` verifica os contratos visuais existentes; esses testes não substituem a inspeção no navegador.
