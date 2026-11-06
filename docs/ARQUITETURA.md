# Arquitetura e evolução

## Etapa 1

React + Vite em `client/`, Express em `server/`, PostgreSQL como fonte de usuários, perfis, permissões, sessões, recuperação, limitação de tentativas e auditoria. O build é servido pelo Express em produção. Não há portal público nem rota de criação de manifestações nesta etapa.

Fluxo HTTP: identificador de requisição → Helmet → limite persistente → JSON com tamanho limitado → sessão PostgreSQL → CSRF (origem exata + token) → autenticação → permissão → rota/repositório. Consultas usam parâmetros. Senhas usam Argon2id (64 MiB, três iterações). Sessões são rotacionadas no login, têm expiração por inatividade e absoluta, e verificam a situação e a versão do usuário em cada requisição autenticada. Perfis e permissões são relidos do banco, sem cache de autoridade no navegador.

`services/authorization.js` define uma política inicial por caso para integrar e estender na Etapa 3. Seus testes unitários **não equivalem a testar o futuro módulo de manifestações**. Consultas, exportações, anexos e indicadores deverão aplicar a mesma restrição no SQL antes de paginar ou agregar. Identidade de contatos, conflitos, setores e concessões ainda precisarão de entidades persistidas e verificação institucional.

Master tem somente permissões técnicas. Assédio e violência não possuem fluxo operacional publicado. A regra `operationalBlocked` deve prevalecer mesmo sobre concessões individuais. A concessão de acesso restrito deverá exigir usuário habilitado, justificativa, escopo, validade e autoridade institucional; o administrador técnico não pode conceder a si próprio acesso ao conteúdo por uma tela administrativa genérica.

## Próximas migrations, sem antecipar regras institucionais

2. Áreas, setores/locais, motivos (restrição e homologação), gerentes, gestores, parâmetros de prazos, calendários, escopos de setor e gestão de usuários. Inativação em vez de exclusão.
3. Manifestações (UUID + sequência PostgreSQL), contatos, autorizações restritas, histórico e edições versionadas com justificativa. Pessoa identificada e prevenção de conflito de interesses. Rascunho visível somente à operação autorizada.
4. Encaminhamentos, respostas versionadas, validação, complementações, discussões e anexos privados. Transações e bloqueio de linha para transições; verificação de versão para edições concorrentes. Uploads e downloads deverão aplicar autorização por caso e validação real de formato/tamanho.
5. Prazos calculados desde envio efetivo conforme configuração homologada. Troca de gestor preserva vencimento. Alertas e notificações com chave única por evento e processamento transacional idempotente. Datas do primeiro atraso e conclusão tardia preservadas.
6. Indicadores e exportações com o mesmo filtro de acesso do detalhe. Não agregar casos restritos para destinatários sem autorização. Diferenciar as datas de registro, ocorrência, envio, resposta e conclusão.
7. Homologação de segurança, identidade, sigilo, recuperação, retenção, disponibilidade e restauração, incluindo teste de carga e revisão de permissões com representantes institucionais.

As entidades dos módulos futuros não são tabelas vazias nesta etapa: serão criadas por migrations aditivas junto com as regras correspondentes. Não editar `001_foundation.sql` depois de aplicada; checksums impedem essa prática.

## Operação e proteção dos dados

- Usar conta PostgreSQL separada para migrations/provisionamento e conta de execução sem DDL, superuser ou capacidade de conceder perfis. A conta de execução precisa SELECT nas tabelas de autorização, INSERT/SELECT em auditoria, operações de sessão/limites e UPDATE específico nas tabelas de senha. Conceder privilégios de sequência para auditoria. O trigger bloqueia UPDATE/DELETE/TRUNCATE de auditoria; administradores do banco continuam uma fronteira de confiança externa.
- HTTPS termina em proxy local confiável no Windows Server. Express escuta loopback. `TRUST_PROXY=1` somente nesse cenário. Cookies de produção usam `__Host-`, Secure, HttpOnly, SameSite=Strict.
- TLS com validação de certificado para PostgreSQL remoto. Criptografia em repouso depende de BitLocker/volume e proteção dos backups; não está implementada como criptografia de campos nesta etapa.
- Backups devem incluir PostgreSQL e, quando houver anexos, snapshot consistente do armazenamento privado. Definir RPO/RTO, retenção, ACL, criptografia, armazenamento externo e testes regulares antes de produção. Nenhuma rotina elimina dados institucionais; somente sessões e contadores expirados são limpos.
- Não usar uma instância PostgreSQL de testes como servidor de produção. `.env`, logs, dumps e anexos não pertencem ao repositório. Evitar sincronizar dados operacionais por OneDrive; o código atual está na pasta escolhida pelo usuário.
- Recuperação inicial é assistida por operador local autorizado, sem envio de e-mail. O operador verifica identidade, emite um token e entrega ao titular por canal institucional aprovado. O banco guarda só SHA-256 do token. Uso único, validade de 15 minutos; troca revoga sessões e outros tokens.

## Limites desta entrega

Não há afirmação de conformidade LGPD ou prontidão para produção hospitalar. A Etapa 1 não possui registros de pacientes, fluxo de denúncia, upload, exportação, regras de retenção aprovadas, notificações ou indicadores operacionais. A validação jurídica/institucional de denúncias e os controles específicos de seus módulos permanecem obrigatórios antes de qualquer ativação.
