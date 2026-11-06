# Entrega operacional — 06/11/2026

## Resultado por etapa

| Etapa | Entregue | Principais arquivos |
|---|---|---|
| 2 — Cadastros | Áreas, motivos, setores/locais, usuários, gerentes, gestores, prazos, retenção e permissões dentro do teto institucional. Inativação e auditoria. | `server/routes/catalogs.js`, `server/routes/admin.js`, `server/config/role-capabilities.js`, `client/src/pages/Catalogs.jsx`, `client/src/pages/Roles.jsx` |
| 3 — Manifestações | UUID, sequência PostgreSQL, formulário, rascunho privado, filtros, ordenação, paginação, detalhe, edição justificada, conflitos e escopo por caso. | `server/migrations/002_operations.sql`, `server/repositories/cases.js`, `server/routes/cases.js`, `server/validators/operations.js`, `client/src/pages/Cases.jsx`, `CaseForm.jsx`, `CaseDetail.jsx` |
| 4 — Fluxos | Encaminhamento, troca de gestor sem reiniciar prazo, respostas preservadas, complementação, aprovação, conclusão, discussão, autorizações individuais e anexos privados. | `server/services/case-flow.js`, `case-events.js`, `server/routes/attachments.js` |
| 5 — Prazos | Política aprovada, dias úteis/corridos, feriados, judicial contínuo, snapshots, job de alertas idempotente, primeiro alerta e sino com leitura. | `server/services/deadlines.js`, `alerts.js`, `server/routes/notifications.js`, `client/src/components/Notifications.jsx` |
| 6 — Relatórios | Dashboard, agrupamentos, métricas, cumprimento por gestor, filtros e exportação detalhada PDF/Excel respeitando sigilo. | `server/routes/reports.js`, `client/src/pages/Dashboard.jsx`, `client/src/components/CaseFilters.jsx` |
| 7 — Validação técnica | Testes PostgreSQL/HTTP, fluxo Chromium, revisão de capturas, verificação de dependências, backup/restauração completos e atualização local PM2. Homologação institucional permanece separada. | `tests/operations.test.js`, `tests/browser-smoke.js`, `scripts/test-postgres.js`, `scripts/backup.js`, `scripts/restore.js`, `docs/HOMOLOGACAO.md` |

Também foram atualizados roteamento, layout, cliente de API multipart, estilos responsivos, configuração de armazenamento, serviço de inicialização, README e documentação de arquitetura. `.env.example` foi restaurado como modelo sem credenciais reais. O `.env` local foi preservado.

## Testes executados

- Build Vite: aprovado.
- PostgreSQL real isolado: **42 testes aprovados, zero falhas e zero ignorados**.
- Navegador Chromium: login, recuperação, auditoria, cadastro de motivo, dashboard, formulário, envio, resposta com perfil Gestor, aprovação/conclusão pela Ouvidoria e download Excel aprovados.
- Layout: capturas desktop e celular revisadas; detalhe móvel sem overflow horizontal. Corrigida associação acessível entre rótulos e selects.
- Dados: reinício real do PostgreSQL preservou registros; dump restaurado e backup completo restaurado em destinos novos, com contagens das tabelas operacionais e hashes dos anexos conferidos.
- Segurança: negadas criação indevida, registro próprio/anônimo, categoria bloqueada, leitura de outro gestor, acesso restrito não autorizado, edição concorrente e download indevido. Testes também cobrem CSRF, sessão, recuperação, permissões, formatos falsos e alertas duplicados.
- `npm audit --omit=dev`: zero vulnerabilidades conhecidas reportadas. A dependência transitiva UUID do ExcelJS foi atualizada por override para versão corrigida; exportação foi testada.

O log integral da execução bem-sucedida está em `test-results/latest-run.log`. Capturas incluem `dashboard-desktop.png`, `new-case-desktop.png`, `case-detail-desktop.png`, `case-detail-mobile.png` e `catalogs-desktop.png`. Dados das imagens são fixtures do banco temporário, não dados institucionais.

## Atualização da instalação local

- Backup prévio criado em `backups/sio-2026-11-06T03-14-22-641Z-UWARIQ`, contendo dump e manifesto.
- Migration 002 aplicada ao banco `sic`; migrations totais: 2.
- Conta existente preservada: 1 usuário antes e depois. Nenhuma manifestação fictícia foi criada no `sic` (0 registros após atualização).
- Processo PM2 `server` reiniciado e confirmado na porta 5004. O processo duplicado `ouvidoria`, apontando ao mesmo arquivo e sem porta de escuta, foi parado; não foi excluído. Lista PM2 salva.
- Verificação local: frontend, `/health` e sessão responderam 200; casos sem autenticação retornaram 401.
- Login administrativo com credencial existente confirmado; cadastros, matriz de perfis e notificações responderam 200. A sessão de verificação foi encerrada.

## Como utilizar e validar

Acessar http://localhost:5004 com a conta existente. Em Cadastros, preparar usuários individuais, áreas/setores/motivos e gerência/gestores. Aprovar a política de prazo antes de encaminhar. Para operar, criar uma conta autorizada de Ouvidoria; o perfil Master não abre manifestações nem deve autoatribuir perfil operacional pela própria conta.

Para repetir a validação técnica: `npm run test:ui`. Para manutenção do processo atual: `pm2 restart server --update-env`; após alterar frontend, executar `npm run build` antes. Para backup completo: `npm run backup -- PASTA_DESTINO`.

## Pendências institucionais

A homologação jurídica/hospitalar, regras aprovadas de prazo e retenção, infraestrutura HTTPS/Windows Server, criptografia em repouso/backup, ACL, endpoint/antivírus, RPO/RTO e recuperação de desastre exigem a instituição. Não foram presumidas aprovações. Assédio/violência permanecem bloqueados, sem fluxo operacional liberado. A imagem/logotipo oficial não foi fornecida. O roteiro está em `docs/HOMOLOGACAO.md`.
