# Homologação institucional e roteiro de validação

Versão operacional desenvolvida em 06/11/2026. Este roteiro complementa os testes automatizados; não constitui aprovação jurídica ou homologação hospitalar.

## Preparação

Usar ambiente de homologação, dados autorizados e contas individuais. Definir responsáveis institucionais pelos perfis, sigilo, contatos, calendários e retorno aos manifestantes. A conta Master existente é preservada; as fixtures de testes não são instaladas no banco institucional.

## Roteiro por perfil

| Perfil | Validação esperada |
|---|---|
| Master | Cadastra usuários, áreas, setores, motivos, equipes e prazos; consulta auditoria; não abre casos nem lê conteúdo automaticamente. |
| Ouvidoria | Registra terceiro identificado, salva rascunho, encaminha, edita com justificativa, solicita complementação, aprova, registra retorno e conclui. |
| Gestor | Vê apenas atribuições/concessões válidas; responde e anexa evidência; não edita o relato original, abre ou conclui. |
| Gerente | Vê casos não restritos de subordinados; recebe alertas autorizados; registra providência somente após concessão individual. |
| Direção | Vê indicadores/casos expressamente autorizados e registra discussão quando permitido; não abre ou conclui. |

1. Cadastrar usuários/equipes e motivos em áreas diferentes. Confirmar filtro de motivos/gestores e rejeição de vínculos incompatíveis.
2. Tentar abertura por Master/Gestor, registro anônimo e registro do próprio usuário: devem ser negados.
3. Criar rascunho e confirmar invisibilidade ao gestor e a outro operador. Encaminhar sem aprovar política de prazo: deve falhar.
4. Aprovar a política institucional de contagem e enviar o caso; conferir vencimento calculado desde o envio, feriados e regra judicial.
5. Responder, pedir complementação e responder novamente; verificar as duas respostas no histórico. Aprovar e concluir com retorno registrado.
6. Trocar gestor com justificativa e verificar que o prazo original permanece e o gestor anterior perde a atribuição.
7. Abrir o mesmo caso em duas sessões e editar: a segunda gravação com versão antiga deve ser rejeitada com orientação para atualizar.
8. Validar atraso, primeiro alerta ao gerente, notificação lida e conclusão tardia. Reiniciar o serviço e confirmar ausência de duplicidade.
9. Tentar acessar outro caso por URL, baixar outro anexo e exportar dados fora do escopo. Conferir ausência também nos indicadores e no sino.
10. Criar denúncia restrita permitida, autorizar/revogar um participante e verificar o efeito. Assédio/violência devem permanecer bloqueados, inclusive se o motivo bloqueado for renomeado.
11. Testar PDF/PNG/JPEG válidos e arquivo de outro formato com extensão falsa. Conferir download autenticado e rejeição de envio após conclusão.
12. Conferir indicadores e exportações por período contra os registros conhecidos; distinguir datas da manifestação, envio, resposta e conclusão.
13. Alterar permissões dentro do teto institucional e confirmar expiração das sessões afetadas. Tentar conceder criação ao Gestor: deve ser negado.
14. Fazer backup completo, restaurar em destinos novos, conferir usuários, casos, históricos, arquivos e login antes de aprovar o plano de recuperação.

## Condições institucionais ainda necessárias

- Aprovação documentada dos prazos, calendário, política de retenção e procedimento de devolutiva ao contato.
- Validação jurídica do fluxo específico de assédio/violência, sigilo, proteção e anonimato aplicáveis. O bloqueio não deve ser removido por alteração manual em banco.
- HTTPS, certificados, isolamento de rede, conta de serviço Windows, menor privilégio no PostgreSQL, ACL de anexos e criptografia de volumes/backups.
- Proteção de endpoint/antivírus institucional e política de documentos aceitos.
- Teste de restauração na infraestrutura institucional, RPO/RTO, cópia externa e rotina de backup monitorada.
- Homologação visual com imagem/logotipo oficiais, que não foram fornecidos.

## Evidências automatizadas

`npm run test:integration` executa os testes de backend em PostgreSQL descartável. `npm run test:ui` também percorre cadastros e o fluxo completo no Chromium, alternando Ouvidoria/Gestor e verificando layout móvel. O log, as capturas e a exportação de teste ficam em `test-results/`, sem dados de produção. O runner restaura dump e backup completo e compara contagens das tabelas operacionais e hashes dos anexos.

O relatório histórico `VALIDACAO-ETAPA-1.md` descreve a primeira entrega; suas pendências de implementação não representam o estado atual.
