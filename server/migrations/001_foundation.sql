CREATE TABLE perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE CHECK (codigo IN ('MASTER','OUVIDORIA','GESTOR','GERENTE','DIRECAO')),
  nome text NOT NULL
);
CREATE TABLE permissoes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), codigo text NOT NULL UNIQUE, descricao text NOT NULL);
CREATE TABLE perfil_permissoes (
  perfil_id uuid REFERENCES perfis(id) ON DELETE RESTRICT,
  permissao_id uuid REFERENCES permissoes(id) ON DELETE RESTRICT,
  PRIMARY KEY (perfil_id, permissao_id)
);
CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL,
  login text NOT NULL UNIQUE CHECK (login = lower(login)), email text NOT NULL,
  senha_hash text NOT NULL, ativo boolean NOT NULL DEFAULT true,
  versao_sessao integer NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now(), atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usuario_perfis (
  usuario_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  perfil_id uuid REFERENCES perfis(id) ON DELETE RESTRICT,
  PRIMARY KEY (usuario_id, perfil_id)
);
CREATE TABLE sessoes (sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL);
CREATE INDEX sessoes_expire_idx ON sessoes(expire);
CREATE TABLE recuperacoes_senha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE, expira_em timestamptz NOT NULL,
  usado_em timestamptz, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE limites_acesso (
  chave text PRIMARY KEY, tentativas integer NOT NULL DEFAULT 1,
  reinicia_em timestamptz NOT NULL
);
CREATE INDEX limites_acesso_expira_idx ON limites_acesso(reinicia_em);
CREATE TABLE auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ator_id uuid REFERENCES usuarios(id) ON DELETE RESTRICT,
  evento text NOT NULL, entidade text, entidade_id text,
  resultado text NOT NULL CHECK (resultado IN ('sucesso','negado')),
  request_id uuid, criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_criado_idx ON auditoria(criado_em DESC);
CREATE INDEX auditoria_ator_idx ON auditoria(ator_id);
CREATE FUNCTION impedir_mutacao_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Auditoria é imutável'; END;
$$;
CREATE TRIGGER auditoria_imutavel BEFORE UPDATE OR DELETE OR TRUNCATE ON auditoria
FOR EACH STATEMENT EXECUTE FUNCTION impedir_mutacao_auditoria();

INSERT INTO perfis(codigo,nome) VALUES
('MASTER','Administração técnica'),('OUVIDORIA','Ouvidoria'),('GESTOR','Gestor'),('GERENTE','Gerente'),('DIRECAO','Direção');
INSERT INTO permissoes(codigo,descricao) VALUES
('usuarios.gerenciar','Gerenciar usuários e perfis'),
('cadastros.gerenciar','Gerenciar cadastros institucionais'),
('parametros.gerenciar','Gerenciar parâmetros'),
('auditoria.consultar','Consultar auditoria técnica sem conteúdo de casos'),
('manifestacoes.criar','Registrar manifestação de terceiro'),
('manifestacoes.editar','Editar mediante justificativa'),
('manifestacoes.encaminhar','Encaminhar manifestações'),
('manifestacoes.validar','Validar respostas'),
('manifestacoes.concluir','Concluir manifestações'),
('manifestacoes.responder','Responder atribuições'),
('manifestacoes.acompanhar','Acompanhar casos autorizados'),
('direcao.registrar','Registrar discussões autorizadas'),
('indicadores.consultar','Consultar indicadores autorizados');
INSERT INTO perfil_permissoes(perfil_id,permissao_id)
SELECT p.id, m.id FROM perfis p CROSS JOIN permissoes m WHERE
(p.codigo='MASTER' AND m.codigo IN ('usuarios.gerenciar','cadastros.gerenciar','parametros.gerenciar','auditoria.consultar')) OR
(p.codigo='OUVIDORIA' AND m.codigo IN ('manifestacoes.criar','manifestacoes.editar','manifestacoes.encaminhar','manifestacoes.validar','manifestacoes.concluir','manifestacoes.acompanhar','direcao.registrar','indicadores.consultar')) OR
(p.codigo='GESTOR' AND m.codigo IN ('manifestacoes.responder','manifestacoes.acompanhar')) OR
(p.codigo='GERENTE' AND m.codigo IN ('manifestacoes.acompanhar','indicadores.consultar')) OR
(p.codigo='DIRECAO' AND m.codigo IN ('manifestacoes.acompanhar','indicadores.consultar','direcao.registrar'));
