export type CommercialFlowProjectKind =
  | "leads"
  | "follow_up"
  | "proposal_archive"
  | "contract_handoff"
  | "contracts";

function normalizeFlowName(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/&/g, " and ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export function isCommercialSpaceName(value?: string | null) {
  const name = normalizeFlowName(value);
  return name === "comercial" || name === "commercial";
}

export function commercialFlowProjectKind(input: {
  projectName?: string | null;
  spaceName?: string | null;
}): CommercialFlowProjectKind | null {
  if (!isCommercialSpaceName(input.spaceName)) return null;

  const projectName = normalizeFlowName(input.projectName);
  if (projectName === "leads") return "leads";
  if (
    projectName === "follow up" ||
    projectName === "follow ups" ||
    projectName === "followup" ||
    projectName === "followups"
  ) {
    return "follow_up";
  }
  if (projectName === "propostas" || projectName === "proposals") {
    return "proposal_archive";
  }
  if (
    projectName === "contratos e handoffs" ||
    projectName === "contracts and handoffs"
  ) {
    return "contract_handoff";
  }
  if (projectName === "contratos" || projectName === "contracts") {
    return "contracts";
  }
  return null;
}

export function isCommercialFlowEntryProject(input: {
  projectName?: string | null;
  spaceName?: string | null;
}) {
  return commercialFlowProjectKind(input) === "leads";
}

export function isCommercialManagedDownstreamProject(input: {
  projectName?: string | null;
  spaceName?: string | null;
}) {
  const kind = commercialFlowProjectKind(input);
  return kind !== null && kind !== "leads";
}

export function isCommercialSystemFlowProject(input: {
  projectName?: string | null;
  spaceName?: string | null;
}) {
  return commercialFlowProjectKind(input) !== null;
}

export function isCommercialContractsRegistryProject(input: {
  projectName?: string | null;
  spaceName?: string | null;
}) {
  const projectName = normalizeFlowName(input.projectName);
  const spaceName = normalizeFlowName(input.spaceName);
  return (
    (projectName === "contratos" || projectName === "contracts") &&
    ["comercial", "commercial", "finance", "financeiro"].includes(spaceName)
  );
}
