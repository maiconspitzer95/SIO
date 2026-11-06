# SIO — Sistema Integrado de Ouvidoria

Santa Casa de Pelotas · **Etapa 1: fundação**

Aplicação JavaScript com React/Vite, Express e PostgreSQL. Esta entrega implementa login, sessão persistente, recuperação assistida de senha, cinco perfis, matriz de permissões, auditoria técnica e layout responsivo. Cadastros e manifestações pertencem às próximas etapas e ainda não estão disponíveis. Não existem dados fictícios na aplicação; os únicos dados de demonstração são fixtures criadas exclusivamente no banco temporário de testes.

## Requisitos

- Node.js 22 ou superior (validado com Node 24).
- PostgreSQL 17 (validado localmente).
- Windows/PowerShell; `PG_BIN` pode indicar outro diretório de binários para os testes.

## Executar localmente

1. `npm ci`
2. Copie `.env.example` para `.env`. Gere o segredo conforme o comentário do arquivo. Ajuste `DATABASE_URL`, sem usar credenciais de produção.
3. Crie um banco PostgreSQL dedicado e seu usuário pelo procedimento administrativo local. O comando de migrations não cria nem redefine bancos.
4. `npm run migrate`
5. Preencha `ADMIN_LOGIN`, `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` no ambiente (senha com 12–128 caracteres). Execute `npm run admin:create`. Esse comando cria somente Master, não concede perfil operacional e não sobrescreve usuário existente. Remova a senha de provisionamento após executar.
6. `npm run build`
7. `pm2 start server.js` (ou `npm start`, sem PM2).
8. Abra [http://localhost:5004](http://localhost:5004). Frontend e API compartilham a porta **5004**, sem servidor Vite separado. Use exatamente a origem configurada em `APP_ORIGIN`; ela é validada pela proteção CSRF.

O `server.js` da raiz carrega o `.env` do projeto e inicia o Express com o build React. Se mudar a porta, ajuste `PORT` e `APP_ORIGIN` no `.env`. Para desenvolvimento, `npm run dev` compila o frontend e inicia o backend com reinício automático, também na porta 5004; alterações posteriores no frontend exigem `npm run build` e atualização do navegador.

Após alterar código: `npm run build` e `pm2 restart server --update-env`. O comando `pm2 start server.js` usa o nome padrão `server`; opcionalmente use `pm2 start server.js --name sio` ou o arquivo ecosystem, e então gerencie esse processo pelo nome `sio`. Não inicie as duas opções simultaneamente na mesma porta. Execute `pm2 save` para salvar a lista de processos.

### Recuperar senha

Um operador com acesso administrativo ao servidor deve verificar a identidade do titular, definir `RESET_LOGIN` no ambiente e executar `npm run password:issue`. O código de uso único aparece somente nesse comando e vale 15 minutos. O titular acessa **Esqueci minha senha**, informa código e nova senha. Não há integração de e-mail. Tokens não devem ir para tickets, histórico de comandos ou logs compartilhados.

## Validação

```powershell
npm run build
npm test
npm run test:integration
npx playwright install chromium
npm run test:ui
```

`npm test` roda os testes unitários e marca a integração como ignorada na ausência de `TEST_DATABASE_URL`. **Prefira `npm run test:integration`**: inicializa um cluster PostgreSQL temporário com senha aleatória, aplica migrations, executa os testes unitários e HTTP, reinicia o PostgreSQL, cria um dump, restaura em um segundo banco e compara os dados. Encerra e remove apenas seu diretório temporário. Não usa `DATABASE_URL` nem acessa um banco existente. Porta alocada dinamicamente; requer execução por usuário não administrador no Windows quando exigido pelo PostgreSQL.

Os testes cobrem login válido/inválido, cookies, CSRF, limitação persistente, matriz de perfis, negação de rotas administrativas, política preliminar por caso, auditoria imutável, recuperação de senha, logout, inativação e expiração, migrations idempotentes, reinicialização e restauração. Não cobrem fluxos de manifestações ainda não implementados.

`test:ui` executa também o navegador Chromium contra o build e o mesmo PostgreSQL isolado. Verifica login, recuperação, navegação, auditoria, atualização de página, menu móvel, ausência de overflow horizontal e logout. Capturas ficam em `test-results/` (fora do versionamento).

## Produção / Windows Server 2022

1. Defina localização de aplicação, banco, armazenamento e backups com ACL restrita; não use a pasta sincronizada como armazenamento hospitalar.
2. Configure PostgreSQL, contas de migrations e execução, HTTPS no proxy local, certificado e firewall.
3. Ajuste `.env`: `NODE_ENV=production`, `APP_ORIGIN=https://seu-dominio-institucional`, `HOST=127.0.0.1`, `PORT`, `TRUST_PROXY=1` somente atrás desse proxy e segredo aleatório. Para banco remoto, configure `PG_SSL=true` e CA confiável.
4. Execute `npm ci`, `npm run build`, backup prévio e `npm run migrate` com conta de migrations. Migre antes de iniciar a nova versão; não edite migrations aplicadas.
5. Use credencial de execução com menor privilégio, instale PM2 conforme política da TI e execute `pm2 start ecosystem.config.cjs` e `pm2 save`.
6. Para atualização controlada: novo build, backup, migrations aditivas, `pm2 reload ecosystem.config.cjs --update-env`. Verifique `/health` e teste login. `pm2 logs sio` exibe somente logs técnicos da aplicação.
7. No Windows, configure inicialização do PM2 no Agendador de Tarefas/serviço institucional sob conta dedicada; não presumir suporte do `pm2 startup` de Linux. Valide reinício do Windows e renovação de certificados antes de publicar.

O Express serve frontend e API na mesma porta em produção. `/health` verifica conexão com o banco sem divulgar credenciais. Nenhum endpoint operacional de denúncias é publicado.

### Backup e restauração

Configure `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` e `PGPASSFILE` apontando para arquivo de senha PostgreSQL com ACL restrita. Execute:

```powershell
.\scripts\backup.ps1 -Destination 'D:\Backups\SIO'
.\scripts\restore.ps1 -BackupFile 'D:\Backups\SIO\arquivo.dump' -TargetDatabase 'sio_restore_validacao'
```

A restauração cria um banco novo; falha se ele já existir. Não substitui nem apaga produção. Verifique contagens de usuários, perfis, auditoria, integridade e acesso antes de definir um procedimento de recuperação produtivo. A política institucional deverá definir frequência, retenção, criptografia, cópia externa, RPO e RTO. O teste automatizado valida o mecanismo PostgreSQL, não toda a infraestrutura de recuperação institucional.

## Organização

- `client/src/components`, `layouts`, `pages`, `hooks`, `services`, `styles`: interface e sessão.
- `server/config`, `middlewares`, `routes`, `repositories`, `services`, `validators`: API e regras.
- `server/migrations`: esquema e permissões versionados.
- `scripts`: migrations, provisionamento, recuperação, backup e testes isolados.
- `tests`: testes unitários e integração HTTP/PostgreSQL.
- `storage`: reservado para armazenamento privado futuro, nunca servido como pasta pública.
- [Arquitetura e próximos módulos](docs/ARQUITETURA.md).

Não foi recebida imagem de referência nesta entrega. O visual segue as cores e a composição descritas no pedido, com marca tipográfica provisória; não se trata do logotipo oficial.
