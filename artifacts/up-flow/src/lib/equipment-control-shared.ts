export const EQUIPMENT_PROJECT_NAME = "Equipment Control";
export const EQUIPMENT_PROJECT_DESCRIPTION =
  "Agency equipment checkout, custody, returns, condition inspections, and possession history.";

export const EQUIPMENT_ACTIVE_CHECKOUT_STATUSES = [
  "requested",
  "awaiting_receipt",
  "checked_out",
  "return_requested",
] as const;

export function normalizeEquipmentStructureName(
  value: string | null | undefined,
) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function isGeneralAdministrationSpaceName(
  value: string | null | undefined,
) {
  const name = normalizeEquipmentStructureName(value);
  return name === "general admin" || name === "administracao geral";
}

export function isEquipmentControlProject(input: {
  projectName?: string | null;
  spaceName?: string | null;
}) {
  const projectName = normalizeEquipmentStructureName(input.projectName);
  return (
    isGeneralAdministrationSpaceName(input.spaceName) &&
    (projectName === "equipment control" ||
      projectName === "controle de equipamentos")
  );
}
