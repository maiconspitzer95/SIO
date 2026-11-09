// Limites institucionais: permissões podem ser reduzidas/restauradas, nunca
// convertendo um perfil técnico ou gerencial em Ouvidoria.
export const roleCapabilities = {
  MASTER: [
    "usuarios.gerenciar",
    "cadastros.gerenciar",
    "parametros.gerenciar",
    "auditoria.consultar",
  ],
  OUVIDORIA: [
    "manifestacoes.criar",
    "manifestacoes.editar",
    "manifestacoes.encaminhar",
    "manifestacoes.validar",
    "manifestacoes.concluir",
    "manifestacoes.acompanhar",
    "direcao.registrar",
    "indicadores.consultar",
  ],
  GESTOR: ["manifestacoes.responder", "manifestacoes.acompanhar"],
  GERENTE: [
    "manifestacoes.acompanhar",
    "indicadores.consultar",
    "manifestacoes.providenciar",
    "manifestacoes.responder_escalonada",
  ],
  DIRECAO: [
    "manifestacoes.acompanhar",
    "manifestacoes.acompanhar_todas",
    "indicadores.consultar",
    "direcao.registrar",
  ],
};
