import { DateTime } from "luxon";
import { HttpError } from "../middlewares/security.js";
/** Prazo inicia no envio; calendário em São Paulo, incluindo feriados explicitamente cadastrados. */
export function deadline(start, policy) {
  if (!policy.aprovado || !policy.ativo)
    throw new HttpError(
      409,
      "A administração precisa aprovar a regra de prazo antes do encaminhamento.",
    );
  let dt = DateTime.fromJSDate(new Date(start), { zone: "America/Sao_Paulo" });
  if (policy.unidade === "horas") {
    if (!policy.continuo)
      throw new HttpError(
        409,
        "Homologue a contagem contínua das 24 horas judiciais.",
      );
    return dt.plus({ hours: policy.quantidade }).toJSDate();
  }
  let remaining = policy.quantidade;
  while (remaining > 0) {
    dt = dt.plus({ days: 1 });
    if (
      !policy.dias_uteis ||
      (dt.weekday < 6 && !policy.feriados.includes(dt.toISODate()))
    )
      remaining--;
  }
  return dt.toJSDate();
}
