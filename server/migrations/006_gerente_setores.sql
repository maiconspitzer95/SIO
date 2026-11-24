-- Migration 006: gerente vinculado a vários setores (como o gestor).
-- Um gerente pode responder por setores de diferentes áreas
-- (administrativa, operacional, assistencial). Nenhum dado existente é removido.

CREATE TABLE IF NOT EXISTS gerente_setores (
  gerente_id uuid NOT NULL REFERENCES gerentes(id) ON DELETE RESTRICT,
  setor_id uuid NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  PRIMARY KEY (gerente_id, setor_id)
);
CREATE INDEX IF NOT EXISTS gerente_setores_setor_idx ON gerente_setores(setor_id);

-- Preserva o setor atual de cada gerente como primeiro vínculo.
INSERT INTO gerente_setores(gerente_id, setor_id)
SELECT id, setor_id FROM gerentes WHERE setor_id IS NOT NULL
ON CONFLICT DO NOTHING;
-- gerentes.setor_id/area_id continuam como setor/área "principal" (compatibilidade).
