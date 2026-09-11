import type { MemberJoinedData, Notification } from "@/lib/types";

type LanguageCode = "en" | "pt" | "pt-BR";

function isPortuguese(language: LanguageCode) {
  return language === "pt" || language === "pt-BR";
}

function memberJoinedData(notification: Notification): MemberJoinedData {
  return notification.data && typeof notification.data === "object"
    ? (notification.data as MemberJoinedData)
    : {};
}

export function formatMemberRole(role: MemberJoinedData["role"], language: LanguageCode = "en") {
  if (role === "admin") return isPortuguese(language) ? "Administrador" : "Admin";
  return isPortuguese(language) ? "Membro" : "Member";
}

export function memberJoinedNotificationLabel(
  notification: Notification,
  language: LanguageCode = "en",
) {
  const data = memberJoinedData(notification);
  const who =
    data.new_member_name ||
    data.new_member_email ||
    (isPortuguese(language) ? "Uma pessoa" : "Someone");
  const workspaceName =
    notification.workspace?.name ?? (isPortuguese(language) ? "este workspace" : "this workspace");
  const roleLabel = formatMemberRole(data.role, language);

  if (isPortuguese(language)) {
    return `${who} entrou no workspace ${workspaceName} como ${roleLabel}`;
  }

  return `${who} joined workspace ${workspaceName} as ${roleLabel}`;
}

export function equipmentNotificationLabel(
  notification: Notification,
  language: LanguageCode = "en",
) {
  const data = (notification.data ?? {}) as Record<string, unknown>;
  if (data.source !== "equipment_request") return null;
  const action = typeof data.action === "string" ? data.action : "";
  const equipment = typeof data.equipment_name === "string"
    ? data.equipment_name
    : isPortuguese(language)
      ? "o equipamento"
      : "the equipment";
  const pt: Record<string, string> = {
    request_created: `Nova solicitação para ${equipment}`,
    handover_confirmed_by_administration: `${equipment} está liberado para retirada. Confira as fotos antes de confirmar`,
    receipt_confirmed_by_requester: `Retirada de ${equipment} confirmada pelo solicitante`,
    return_requested_by_administration: `A Administração solicitou a devolução de ${equipment}`,
    return_inspected_by_administration: `Devolução de ${equipment} inspecionada pela Administração`,
    request_rejected: `Solicitação de ${equipment} recusada pela Administração`,
    request_cancelled_by_administration: `Solicitação de ${equipment} cancelada pela Administração`,
    request_cancelled_by_requester: `Solicitação de ${equipment} cancelada pelo solicitante`,
    return_overdue: `Prazo de devolução vencido para ${equipment}`,
  };
  const en: Record<string, string> = {
    request_created: `New request for ${equipment}`,
    handover_confirmed_by_administration: `${equipment} is ready for pickup. Check the photos before confirming`,
    receipt_confirmed_by_requester: `Pickup of ${equipment} confirmed by the requester`,
    return_requested_by_administration: `Administration requested the return of ${equipment}`,
    return_inspected_by_administration: `Return of ${equipment} inspected by Administration`,
    request_rejected: `Request for ${equipment} rejected by Administration`,
    request_cancelled_by_administration: `Request for ${equipment} cancelled by Administration`,
    request_cancelled_by_requester: `Request for ${equipment} cancelled by the requester`,
    return_overdue: `Return deadline has passed for ${equipment}`,
  };
  return (isPortuguese(language) ? pt : en)[action] ?? equipment;
}
