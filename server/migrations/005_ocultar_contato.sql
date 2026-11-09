-- Migration 005: a Ouvidoria escolhe, por manifestação, se os dados do
-- contato ficam ocultos para gestor/gerente/Direção.
ALTER TABLE manifestacoes ADD COLUMN IF NOT EXISTS ocultar_contato boolean NOT NULL DEFAULT false;
-- Registros já existentes eram sempre ocultos: preserva esse comportamento.
UPDATE manifestacoes SET ocultar_contato = true;
