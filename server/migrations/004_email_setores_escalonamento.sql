-- Migration 004: e-mail de gerentes/gestores, gestor com vários setores,
-- escalonamento ao gerente (24h) e visão ampla da Direção.
-- Nenhum dado existente é removido.

-- 1. E-mail institucional (opcional) para gerentes e gestores
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
ALTER TABLE gestores ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';

-- 2. Gestor vinculado a vários setores
CREATE TABLE IF NOT EXISTS gestor_setores (
  gestor_id uuid NOT NULL REFERENCES gestores(id) ON DELETE RESTRICT,
  setor_id uuid NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  PRIMARY KEY (gestor_id, setor_id)
);
CREATE INDEX IF NOT EXISTS gestor_setores_setor_idx ON gestor_setores(setor_id);
-- Preserva o setor atual de cada gestor como primeiro vínculo
INSERT INTO gestor_setores(gestor_id, setor_id)
SELECT id, setor_id FROM gestores WHERE setor_id IS NOT NULL
ON CONFLICT DO NOTHING;
-- setor_id/area_id passam a ser o setor/área "principal" (compatibilidade)
ALTER TABLE gestores ALTER COLUMN setor_id DROP NOT NULL;
ALTER TABLE gestores ALTER COLUMN area_id DROP NOT NULL;

-- 3. Escalonamento ao gerente quando o gestor perde o prazo
ALTER TABLE manifestacoes ADD COLUMN IF NOT EXISTS escalado_gerente_em timestamptz;
ALTER TABLE manifestacoes ADD COLUMN IF NOT EXISTS vencimento_gerente timestamptz;
ALTER TABLE manifestacoes ADD COLUMN IF NOT EXISTS resposta_gerente_em timestamptz;
ALTER TABLE respostas ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'gestor';
CREATE INDEX IF NOT EXISTS manifestacoes_venc_gerente_idx ON manifestacoes(vencimento_gerente)
  WHERE etapa IN ('encaminhada','complementacao');

-- 4. Gerente responde à Ouvidoria em casos escalonados
INSERT INTO permissoes(codigo,descricao)
VALUES('manifestacoes.responder_escalonada','Responder manifestações escalonadas por atraso do gestor')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO perfil_permissoes(perfil_id,permissao_id)
SELECT p.id,m.id FROM perfis p CROSS JOIN permissoes m
WHERE p.codigo='GERENTE' AND m.codigo='manifestacoes.responder_escalonada'
ON CONFLICT DO NOTHING;

-- 5. Direção acompanha todas as manifestações abertas
INSERT INTO permissoes(codigo,descricao)
VALUES('manifestacoes.acompanhar_todas','Acompanhar todas as manifestações (painel da Direção)')
ON CONFLICT (codigo) DO NOTHING;
INSERT INTO perfil_permissoes(perfil_id,permissao_id)
SELECT p.id,m.id FROM perfis p CROSS JOIN permissoes m
WHERE p.codigo='DIRECAO' AND m.codigo='manifestacoes.acompanhar_todas'
ON CONFLICT DO NOTHING;
