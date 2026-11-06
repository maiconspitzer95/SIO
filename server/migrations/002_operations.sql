CREATE TABLE areas_tecnicas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE, descricao text NOT NULL DEFAULT '', ativo boolean NOT NULL DEFAULT true);
CREATE TABLE setores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, descricao text NOT NULL DEFAULT '', area_id uuid NOT NULL REFERENCES areas_tecnicas(id), ativo boolean NOT NULL DEFAULT true, UNIQUE(area_id,nome));
CREATE TABLE motivos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, descricao text NOT NULL DEFAULT '', area_id uuid NOT NULL REFERENCES areas_tecnicas(id), restrito boolean NOT NULL DEFAULT false, bloqueado boolean NOT NULL DEFAULT false, ativo boolean NOT NULL DEFAULT true, UNIQUE(area_id,nome));
CREATE TABLE gerentes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, usuario_id uuid NOT NULL UNIQUE REFERENCES usuarios(id), area_id uuid NOT NULL REFERENCES areas_tecnicas(id), ativo boolean NOT NULL DEFAULT true);
CREATE TABLE gestores (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, usuario_id uuid NOT NULL UNIQUE REFERENCES usuarios(id), area_id uuid NOT NULL REFERENCES areas_tecnicas(id), setor_id uuid NOT NULL REFERENCES setores(id), gerente_id uuid NOT NULL REFERENCES gerentes(id), ativo boolean NOT NULL DEFAULT true);
CREATE TABLE prazos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL UNIQUE, tipo text NOT NULL CHECK(tipo IN ('Geral','Judicial')), quantidade integer NOT NULL CHECK(quantidade BETWEEN 1 AND 365), unidade text NOT NULL CHECK(unidade IN ('dias','horas')), dias_uteis boolean NOT NULL DEFAULT false, continuo boolean NOT NULL DEFAULT false, feriados jsonb NOT NULL DEFAULT '[]', alerta_horas integer NOT NULL DEFAULT 24 CHECK(alerta_horas BETWEEN 1 AND 168), aprovado boolean NOT NULL DEFAULT false, ativo boolean NOT NULL DEFAULT true, CHECK((tipo='Geral' AND quantidade=5 AND unidade='dias') OR (tipo='Judicial' AND quantidade=24 AND unidade='horas' AND NOT dias_uteis)));
INSERT INTO areas_tecnicas(nome) VALUES('Assistencial'),('Administrativa'),('Operacional');
INSERT INTO prazos(nome,tipo,quantidade,unidade) VALUES('Geral — 5 dias','Geral',5,'dias'),('Judicial — 24 horas','Judicial',24,'horas');
CREATE TABLE parametros (chave text PRIMARY KEY, valor text NOT NULL, atualizado_em timestamptz NOT NULL DEFAULT now());
INSERT INTO parametros VALUES('retencao_aprovada','Não definida pela instituição',now());
CREATE SEQUENCE manifestacao_numero_seq;
CREATE TABLE manifestacoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero bigint NOT NULL UNIQUE DEFAULT nextval('manifestacao_numero_seq'),
 data_manifestacao date NOT NULL, tipo text NOT NULL CHECK(tipo IN ('Elogio','Reclamação','Denúncia','Informação','Sugestão')),
 canal text NOT NULL CHECK(canal IN ('E-mail','Pessoal','Telefone')), area_id uuid NOT NULL REFERENCES areas_tecnicas(id),
 motivo_id uuid NOT NULL REFERENCES motivos(id), setor_id uuid NOT NULL REFERENCES setores(id), local_complemento text NOT NULL DEFAULT '',
 prazo_id uuid NOT NULL REFERENCES prazos(id), gestor_id uuid NOT NULL REFERENCES gestores(id), relato text NOT NULL,
 criado_por uuid NOT NULL REFERENCES usuarios(id), restrito boolean NOT NULL DEFAULT false,
 etapa text NOT NULL DEFAULT 'rascunho' CHECK(etapa IN ('rascunho','encaminhada','complementacao','validacao','aprovada','concluida')),
 criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now(), versao integer NOT NULL DEFAULT 1,
 enviado_em timestamptz, vencimento timestamptz, prazo_snapshot jsonb, resposta_gestor_em timestamptz,
 alerta_gerente_em timestamptz, respondido_em timestamptz, concluido_em timestamptz,
 resposta_final text, procedimento_retorno text, concluido_atraso boolean NOT NULL DEFAULT false
);
CREATE TABLE contatos_manifestacao (manifestacao_id uuid PRIMARY KEY REFERENCES manifestacoes(id), nome text NOT NULL CHECK(length(trim(nome))>0), email text NOT NULL DEFAULT '', telefone text NOT NULL DEFAULT '', usuario_id uuid REFERENCES usuarios(id));
CREATE TABLE conflitos_manifestacao (manifestacao_id uuid REFERENCES manifestacoes(id), usuario_id uuid REFERENCES usuarios(id), PRIMARY KEY(manifestacao_id,usuario_id));
CREATE TABLE autorizacoes_restritas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), usuario_id uuid NOT NULL REFERENCES usuarios(id), concedido_por uuid NOT NULL REFERENCES usuarios(id), justificativa text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(), revogado_em timestamptz, UNIQUE(manifestacao_id,usuario_id));
CREATE TABLE encaminhamentos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), gestor_id uuid NOT NULL REFERENCES gestores(id), setor_id uuid NOT NULL REFERENCES setores(id), enviado_por uuid NOT NULL REFERENCES usuarios(id), enviado_em timestamptz NOT NULL DEFAULT now(), vencimento timestamptz NOT NULL, justificativa text NOT NULL, prazo_snapshot jsonb NOT NULL);
CREATE TABLE respostas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), autor_id uuid NOT NULL REFERENCES usuarios(id), analise text NOT NULL, justificativa text NOT NULL DEFAULT '', providencias text NOT NULL DEFAULT '', resposta text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now());
CREATE TABLE historico_manifestacoes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), autor_id uuid REFERENCES usuarios(id), evento text NOT NULL, dados jsonb NOT NULL DEFAULT '{}', criado_em timestamptz NOT NULL DEFAULT now());
CREATE TABLE discussoes_direcao (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), data_discussao date NOT NULL, participantes text NOT NULL DEFAULT '', observacoes text NOT NULL, autor_id uuid NOT NULL REFERENCES usuarios(id), criado_em timestamptz NOT NULL DEFAULT now());
CREATE TABLE anexos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), nome text NOT NULL, armazenamento text NOT NULL UNIQUE, mime text NOT NULL, tamanho integer NOT NULL CHECK(tamanho BETWEEN 1 AND 10485760), sha256 text NOT NULL, autor_id uuid NOT NULL REFERENCES usuarios(id), criado_em timestamptz NOT NULL DEFAULT now());
CREATE TABLE alertas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), evento text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(manifestacao_id,evento));
CREATE TABLE notificacoes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), manifestacao_id uuid NOT NULL REFERENCES manifestacoes(id), usuario_id uuid NOT NULL REFERENCES usuarios(id), evento text NOT NULL, chave text NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(), lida_em timestamptz, UNIQUE(usuario_id,chave));
CREATE INDEX manifestacoes_area_idx ON manifestacoes(area_id);
CREATE INDEX manifestacoes_gestor_idx ON manifestacoes(gestor_id);
CREATE INDEX manifestacoes_data_idx ON manifestacoes(data_manifestacao DESC);
CREATE INDEX manifestacoes_prazo_idx ON manifestacoes(vencimento) WHERE etapa IN ('encaminhada','complementacao');
CREATE INDEX historico_caso_idx ON historico_manifestacoes(manifestacao_id,id);
CREATE INDEX respostas_caso_idx ON respostas(manifestacao_id);
CREATE INDEX notificacoes_usuario_idx ON notificacoes(usuario_id,criado_em DESC);
CREATE INDEX autorizacoes_usuario_idx ON autorizacoes_restritas(usuario_id,manifestacao_id) WHERE revogado_em IS NULL;
CREATE TRIGGER historico_imutavel BEFORE UPDATE OR DELETE OR TRUNCATE ON historico_manifestacoes FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria();
CREATE TRIGGER respostas_imutaveis BEFORE UPDATE OR DELETE OR TRUNCATE ON respostas FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria();
CREATE TRIGGER encaminhamentos_imutaveis BEFORE UPDATE OR DELETE OR TRUNCATE ON encaminhamentos FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria();
CREATE TRIGGER manifestacoes_sem_exclusao BEFORE DELETE OR TRUNCATE ON manifestacoes FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria();
CREATE TRIGGER discussoes_imutaveis BEFORE UPDATE OR DELETE OR TRUNCATE ON discussoes_direcao FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria();
INSERT INTO permissoes(codigo,descricao) VALUES('manifestacoes.providenciar','Registrar providências gerenciais em casos expressamente autorizados');
INSERT INTO perfil_permissoes(perfil_id,permissao_id) SELECT p.id,m.id FROM perfis p CROSS JOIN permissoes m WHERE p.codigo='GERENTE' AND m.codigo='manifestacoes.providenciar';
