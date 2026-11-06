-- Migration 003: Gestores e Gerentes Institucionais
-- Permite que gerentes e gestores existam como cadastros institucionais
-- sem obrigatoriedade de vínculo com usuários e logins do sistema.
-- Adiciona vínculo de gerente ao setor e preserva todos os dados e chaves existentes.

-- 1. Gerentes: tornar usuario_id opcional e adicionar setor_id
ALTER TABLE gerentes ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE gerentes DROP CONSTRAINT IF EXISTS gerentes_usuario_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS gerentes_usuario_id_idx ON gerentes(usuario_id) WHERE usuario_id IS NOT NULL;
ALTER TABLE gerentes ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES setores(id);
ALTER TABLE gerentes ALTER COLUMN area_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS gerentes_setor_idx ON gerentes(setor_id);

-- 2. Gestores: tornar usuario_id opcional
ALTER TABLE gestores ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE gestores DROP CONSTRAINT IF EXISTS gestores_usuario_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS gestores_usuario_id_idx ON gestores(usuario_id) WHERE usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gestores_gerente_idx ON gestores(gerente_id);
CREATE INDEX IF NOT EXISTS gestores_setor_idx ON gestores(setor_id);
