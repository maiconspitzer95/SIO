# SIO — Sistema Integrado de Ouvidoria

Santa Casa de Pelotas · React/Vite + Express + PostgreSQL

Aplicação interna com cadastros, manifestações, encaminhamentos, respostas, validação, conclusão, prazos, alertas, notificações, discussões com a Direção, anexos privados, auditoria e relatórios PDF/Excel. Frontend e API usam **a mesma porta 5004**. Nenhum portal público ou registro anônimo é publicado.

## Iniciar

```powershell
npm ci
npm run migrate
npm run build
pm2 start server.js
```

Acesse [http://localhost:5004](http://localhost:5004). Para iniciar sem PM2: `npm start`. Para reiniciar após alterações: `npm run build` e `pm2 restart server --update-env`. O nome do processo iniciado por `pm2 start server.js` é `server`; o ecosystem usa o nome `sio`. Não inicie as duas opções simultaneamente. `pm2 save` salva a lista de processos.

Requisitos: Node.js 22+, PostgreSQL 17 e PM2 instalado. A configuração fica no `.env` local, fora do Git; use `.env.example` como modelo em uma instalação nova. `DATABASE_URL` deve indicar o banco correto (nesta instalação, `sic`). Migrations são aditivas, transacionais e verificadas por checksum; não modifique versões já aplicadas. O `server.js` resolve o `.env` a partir da raiz do projeto.

`npm run dev` compila o frontend e inicia o Node com reinício automático, também na porta 5004. Alterações posteriores no frontend exigem novo `npm run build` e atualização do navegador.

## Primeiro uso

1. Se não existir administrador, preencha `ADMIN_LOGIN`, `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` no `.env` e execute `npm run admin:create`. A senha deve ter 12–128 caracteres. O comando não altera usuários existentes. Remova as variáveis de provisionamento após o uso.
2. Entre como Master e abra **Cadastros → Usuários**. Crie contas individuais com os perfis adequados. Master sozinho não abre manifestações nem lê casos.
3. Cadastre áreas, setores/locais e motivos; depois gerentes e gestores, vinculando cada um a uma conta com o perfil correspondente. Gestores precisam de setor, área e gerente ativos e compatíveis.
4. Em **Prazos**, a instituição deve aprovar a contagem: Geral de 5 dias úteis ou corridos, calendário de feriados e Judicial de 24 horas contínuas. Nenhum encaminhamento funciona com política não aprovada. A alteração posterior não reinicia prazos já enviados.
5. Registre a política institucional de retenção. O sistema preserva os registros e não elimina manifestações automaticamente.
6. Um usuário com perfil **Ouvidoria** inicia o atendimento em **Manifestações → Nova manifestação**.

Os registros iniciais de áreas e tipos de prazo são parâmetros do pedido, não manifestações fictícias. Fixtures e senhas aleatórias dos testes existem apenas no cluster temporário, nunca no banco `sic`.

## Fluxo de atendimento

- Ouvidoria identifica contato e conflitos, registra o relato e salva rascunho ou encaminha. Rascunho só é visível ao autor da Ouvidoria.
- O envio registra gestor/setor, horário, política de prazo e vencimento. O gestor recebe notificação interna e responde com análise, justificativa, providências e evidências.
- A Ouvidoria pode solicitar complementação ou aprovar. As respostas anteriores permanecem preservadas. Troca de gestor exige justificativa e mantém o vencimento original.
- Para concluir, a Ouvidoria precisa de resposta aprovada, resposta final e descrição de como o retorno foi disponibilizado ao manifestante. O sistema grava datas de resposta e conclusão; conclusão tardia permanece identificada.
- Discussões com a Direção têm data, participantes, observações e autoria. Gerentes só registram providências quando recebem autorização individual no caso.
- Edições exigem justificativa e versão atual. Área, motivo e política de prazo não são substituídos depois do registro; reatribuição tem ação própria. Conflitos registrados e sigilo elevado não são removidos por uma edição comum.

## Acesso e sigilo

A autorização combina perfil/permissão, atribuição do gestor, vínculo gerencial, concessão individual, sigilo e conflito de interesses. O mesmo filtro SQL é aplicado a lista, detalhe, indicadores, notificações, relatórios e downloads. Contatos são mostrados somente à Ouvidoria. Identificadores conhecidos não concedem acesso.

Denúncias são restritas por padrão. O autor e o gestor efetivamente atribuído recebem autorização vinculada à operação. Demais usuários dependem de concessão explícita da Ouvidoria. Master não recebe acesso automático. Categorias de assédio/violência são bloqueadas, sem botão para desbloquear; a operação desse fluxo depende de homologação institucional e nova implementação controlada. Há bloqueio adicional por termos no relato de denúncias, sem pretensão de substituir classificação humana.

O cadastro de usuários impede alterar a própria conta/perfis pela API administrativa. Permissões podem ser reduzidas/restauradas dentro dos limites de cada perfil; não é permitido conceder abertura de manifestações a Gestor, Gerente, Direção ou Master. Alterações de conta/perfil invalidam sessões afetadas.

## Prazos e notificações

O backend verifica prazos ao iniciar e a cada minuto. Bloqueio transacional e chaves únicas evitam alertas duplicados entre processos/restarts. O cálculo usa America/Sao_Paulo, dias úteis/feriados aprovados e horas contínuas quando homologadas. O sino consulta apenas notificações cujo destinatário continua autorizado ao caso. Notificações são exclusivamente internas, sem envio de e-mail.

## Relatórios

Dashboard e relatórios compartilham filtros por período da manifestação, tipo, área, motivo, gestor, gerente, canal, status e prazo. Incluem totais, distribuição por tipo/área/motivo/gestor/canal/período, média de resposta do gestor, judiciais, discussões e cumprimento de prazo. Datas de ocorrência, envio, resposta e conclusão são distintas. Exportações detalhadas PDF/Excel limitam-se a 10.000 registros por solicitação; reduza o período quando necessário.

## Anexos

PDF, PNG e JPEG, até 10 MB por arquivo, com validação da assinatura real, nome físico aleatório, checksum SHA-256 e download autenticado como anexo. O armazenamento fica em `storage/private` ou em `STORAGE_PATH`; não há rota estática pública para essa pasta. Defina ACL do Windows para a conta do serviço. A validação de formato não equivale a antivírus; a infraestrutura institucional deve fornecer proteção de endpoint/varredura antes de uso operacional sensível.

## Recuperação de senha

O operador autorizado verifica identidade, define `RESET_LOGIN` e executa `npm run password:issue`. Entrega o código ao titular pelo procedimento institucional. O usuário escolhe **Esqueci minha senha**. Token de uso único, validade de 15 minutos, armazenado somente como hash. A troca revoga sessões e outros tokens. Sem envio de e-mail e sem senha fixa no código.

## Backup e restauração

```powershell
npm run backup -- 'D:\Backups\SIO'
npm run restore -- 'D:\Backups\SIO\sio-DATA-ID' sio_restore_validacao 'D:\Restauracao\SIO-anexos-novo'
```

Os comandos Node usam a conexão do `.env`, sem colocar a senha na linha de comando. Configure `PG_BIN` se necessário. O backup contém `database.dump`, cópia dos anexos e `manifest.json` com hashes. Os arquivos privados são imutáveis; a cópia após o dump preserva os referidos pelo snapshot. Não altere anexos manualmente.

A restauração exige banco com prefixo `sio_restore_` e pasta de anexos novos; falha se os destinos existirem. Não substitui o banco em uso. Valida checksums e referências de anexos. O usuário do PostgreSQL precisa de permissão para criar o banco de teste. O operador escolhe um backup confiável e valida aplicação/contagens antes de qualquer troca produtiva. Os scripts PowerShell legados continuam disponíveis para **banco apenas**; prefira o backup completo para esta versão.

A instituição precisa aprovar retenção, RPO/RTO, frequência, criptografia, armazenamento externo e testes periódicos de restauração. Backups e `.env` não são incluídos no Git. Não é implementado expurgo automático de dados institucionais.

## Testes

```powershell
npm run test:integration
npx playwright install chromium
npm run test:ui
npm audit --omit=dev
```

O runner cria um PostgreSQL temporário, com credenciais aleatórias e porta dinâmica. Não usa o banco do `.env`. Executa testes de autenticação, cadastros, restrições de perfil/caso, fluxo, concorrência, prazos, alertas, anexos e relatórios. Reinicia PostgreSQL, restaura um dump e um backup completo e confere contagens e anexos. `test:ui` executa também o fluxo real no Chromium com alternância de perfis, telas de cadastro, dashboard, responsividade e download. Capturas e log ficam em `test-results/`. `npm test` sozinho ignora integração quando `TEST_DATABASE_URL` não está definido.

## Windows Server / produção

Configure HTTPS no proxy local, `NODE_ENV=production`, `APP_ORIGIN=https://dominio-institucional`, `HOST=127.0.0.1`, `PORT=5004` e `TRUST_PROXY=1` apenas atrás de proxy loopback confiável. Produção exige HTTPS e cookies Secure/HttpOnly/SameSite. Use TLS validado para PostgreSQL remoto (`PG_SSL=true`, `PG_CA_FILE` quando necessário), conta de serviço dedicada, ACL e volume/backup criptografados. A criptografia em repouso depende da infraestrutura; não se trata de criptografia de campos da aplicação.

Separe a credencial de migrations da execução com menor privilégio. Configure inicialização do PM2 pelo Agendador/serviço institucional no Windows. Valide reinício do servidor, certificados, backup e permissões com a TI. Atualização: backup → migrations → build → `pm2 restart server --update-env` → `/health` e login. Não declare homologação hospitalar apenas a partir dos testes automatizados.

A identidade visual segue a descrição recebida; imagem/logotipo oficiais não foram fornecidos. Consulte [arquitetura](docs/ARQUITETURA.md) e [manual de validação](docs/HOMOLOGACAO.md).
