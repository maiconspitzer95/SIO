# Arquitetura do SIO

## Componentes

- React/Vite: navegação, formulários, cadastros, acompanhamento, notificações, indicadores e exportações.
- Express: autenticação, autorização, validação, transações e serviço agendado de alertas; frontend compilado servido na mesma porta.
- PostgreSQL: única fonte de dados institucionais, sessões, tokens de recuperação em hash, limites de tentativas, histórico e auditoria.
- Armazenamento privado: arquivos PDF/PNG/JPEG fora das rotas estáticas, referências e SHA-256 no PostgreSQL.

## Migrations

`001_foundation.sql`: usuários, perfis, permissões, vínculos, sessões, recuperação, limites de acesso e auditoria.

`002_operations.sql`: áreas, setores, motivos, gerentes, gestores, políticas de prazo, parâmetros, manifestações, contatos, conflitos, autorizações, encaminhamentos, respostas, histórico, discussões, anexos, alertas e notificações. A sequência PostgreSQL gera números únicos sem disputa entre processos. Sequências podem ter lacunas após rollback; números nunca são reutilizados.

Migrations usam advisory lock, transações e checksum. Não há migração destrutiva ou importação de casos fictícios. Histórico, respostas, encaminhamentos, discussões e auditoria têm triggers de imutabilidade; manifestações não aceitam DELETE/TRUNCATE. Administradores do banco continuam sendo uma fronteira de confiança externa à aplicação.

## Autorização

`server/repositories/cases.js` centraliza a expressão SQL de escopo. A condição é aplicada antes de ordenar, paginar ou agregar e reutilizada nas notificações e relatórios. Um usuário precisa estar ativo, ter permissão de acompanhamento, satisfazer perfil/atribuição ou concessão individual, não estar em conflito e ter autorização individual quando o caso é restrito. Categoria operacionalmente bloqueada prevalece sobre qualquer concessão.

A Ouvidoria opera casos institucionais; rascunhos são privados do autor. Gestores acessam suas atribuições e gerentes seguem o vínculo do gestor. Direção depende de autorização por caso, incluindo para indicadores, que não contam registros ocultos. Master isolado tem somente administração técnica. Dados de contato ficam limitados à Ouvidoria. Informações do histórico de edição contendo versões anteriores são ocultadas de outros perfis.

Concessões individuais são feitas pela Ouvidoria, com justificativa e histórico. Encaminhamento restrito autoriza o gestor efetivamente atribuído; reatribuição revoga a concessão anterior. Conflitos também excluem o caso das consultas agregadas. Associação de contato por usuário, nome/e-mail e declaração operacional reduzem registro próprio; a validação humana da identidade continua necessária.

`role-capabilities.js` define o teto de permissões por perfil. O administrador pode reduzir/restaurar permissões, sem habilitar abertura/conclusão em perfis indevidos. Mudanças revogam sessões. O backend também exige o perfil Ouvidoria para criação/conclusão, além da permissão específica.

## Transações e concorrência

Criação persiste caso, contato, conflitos, autorização, histórico e eventual encaminhamento em uma transação. Edições/ações bloqueiam a linha da manifestação e verificam `versao`, rejeitando telas desatualizadas com 409. Alterações relevantes registram histórico; respostas e versões anteriores são preservadas. Edição não permite trocar área/motivo/prazo; reatribuição tem ação e justificativa próprias.

O fluxo interno é rascunho → encaminhada → validação → aprovada → concluída, com complementação retornando ao gestor. O status visual deriva de etapa, vencimento e horário atual, sem edição manual. Conclusão guarda a resposta final, a forma de retorno e a condição de atraso.

## Prazos e jobs

O prazo começa no envio efetivo. A política aprovada é copiada para `prazo_snapshot`; alterações administrativas não recalculam envios anteriores. Dias úteis usam calendário/feriados configurados e fuso America/Sao_Paulo. Judicial exige confirmação de 24 horas contínuas. Troca de gestor e complementação preservam vencimento.

O serviço executa ao iniciar e a cada minuto. Advisory lock transacional e `UNIQUE(manifestacao_id,evento)` evitam duplicidade entre processos/restarts. Notificações possuem chave idempotente por destinatário/evento. Respostas tardias também permitem recuperação do alerta que não foi processado durante uma interrupção.

## Anexos, backup e recuperação

Uploads são autenticados antes de receber o arquivo, limitados a 10 MB, identificados pelo conteúdo e armazenados com nome aleatório. Apenas Ouvidoria e gestor atribuído em etapa apropriada podem anexar. Downloads revalidam o caso e usam Content-Disposition attachment. A transação remove arquivos se a gravação no banco falhar; um crash entre arquivo e commit pode deixar arquivo órfão, sem referência pública. Não há limpeza automática que arrisque remover evidências.

Backup completo usa pg_dump e copia os arquivos imutáveis após o snapshot, com manifesto e SHA-256. A restauração valida arquivos, cria banco/pasta novos e confere referências. O runner valida contagens de todas as entidades operacionais e hashes, sem tocar no banco configurado pelo usuário.

## Segurança operacional

Argon2id, sessões PostgreSQL, rotação de sessão, expiração por inatividade/absoluta, CSRF por token e origem, Helmet/CSP, SQL parametrizado, validação de campos, limites persistentes de tentativas e auditoria técnica. Logs comuns não incluem relatos, contatos, tokens ou senhas. Recuperação assistida sem e-mail usa token aleatório, hash, validade e uso único.

A instituição precisa configurar HTTPS, TLS de banco remoto, contas de menor privilégio, criptografia dos volumes/backups, ACL, antivírus/endpoint, retenção aprovada, RPO/RTO e recuperação de desastre. O software não substitui avaliação jurídica, homologação hospitalar ou verificação humana de conflito de interesses. Assédio e violência continuam bloqueados operacionalmente até homologação e alteração controlada do fluxo.
