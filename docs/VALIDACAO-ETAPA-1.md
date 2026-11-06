# Validação da Etapa 1

Data: 05/11/2026. Ambiente: Windows, Node.js 24.14.1, PostgreSQL 17.11 e Chromium via Playwright.

## Resultado executado

- `npm run test:ui`: concluído com código de saída 0. Inclui build Vite, cluster PostgreSQL isolado, testes e navegador.
- 25 testes unitários/HTTP: 25 aprovados, zero falhas, zero ignorados na execução integrada.
- Browser smoke: login, tela de recuperação, navegação, matriz de perfis, auditoria, recarregamento preservando sessão, menu móvel e logout aprovados. Sem erros JavaScript capturados.
- Layout: verificado em 1440 × 1000 e 390 × 844; sem overflow horizontal na página inicial móvel. Capturas revisadas visualmente em `test-results/`.
- Produção: frontend servido pelo Express em rota de SPA; cookie com prefixo `__Host-` e atributo Secure; CSP presente, usando simulação de proxy local confiável.
- PostgreSQL: migrations reaplicadas sem duplicação, histórico preservado após restart real, dump restaurado em segundo banco e contagens de usuários/auditoria conferidas.
- `npm audit --omit=dev`: nenhuma vulnerabilidade conhecida reportada na execução.

O teste inicial de restauração expôs um erro no script de teste que substituía também o nome de usuário ao trocar o nome do banco na URL. Corrigido para alterar somente `URL.pathname`; restauração repetida e aprovada. O runner foi ajustado para não herdar pipes do serviço PostgreSQL no Windows.

## Arquivos entregues

- Interface em `client/src/`, configuração Vite e HTML de entrada.
- API em `server/`, incluindo configuração, middlewares, autenticação, administração de leitura, repositórios, serviços e validators.
- `server/migrations/001_foundation.sql`: usuários, perfis, permissões, sessões, recuperação, limites e auditoria.
- Scripts de migrations, criação inicial de Master, emissão de recuperação, testes PostgreSQL, backup e restauração.
- `tests/authorization.test.js`, `tests/integration.test.js`, `tests/browser-smoke.js`.
- `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `ecosystem.config.cjs`, `README.md` e documentação de arquitetura.

## Pendências e limites

O ambiente de testes foi encerrado e removido. Não foram criados usuário institucional, credencial fixa ou banco operacional persistente. Para uso local, configurar `.env`, criar banco dedicado, aplicar migrations e provisionar o administrador conforme README.

A prova de persistência/restauração cobre a fundação. A política de acesso por caso é preliminar e testada como função, sem rotas de manifestações publicadas. Os testes não homologam módulos futuros nem a infraestrutura Windows Server/PM2, HTTPS real, estratégia de criptografia de volumes, recuperação de desastre ou requisitos legais institucionais. Os scripts PowerShell de backup/restauração estão entregues; os comandos PostgreSQL equivalentes foram executados pelo runner, mas esses wrappers PowerShell não foram executados contra infraestrutura institucional.

Etapa seguinte: cadastros de áreas, setores, motivos, gerentes, gestores, usuários e parâmetros aprovados de prazo. Imagem e logotipo oficiais não estavam anexados; identidade visual provisória baseada na descrição fornecida.
