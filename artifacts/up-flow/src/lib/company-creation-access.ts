/**
 * Company creation permissions are intentionally kept separate from the
 * onboarding wizard. Creative & Design can register a client record, but
 * cannot use that path to start an onboarding workflow.
 *
 * This module has no server-only dependencies so client UI can use the same
 * department predicate when deciding which creation action to display. The
 * API remains the source of authorization.
 */

export interface CompanyCreationMembership {
  role: string | null | undefined;
  status: string | null | undefined;
  departmentName: string | null | undefined;
}

export interface CompanyCreationAccess {
  canCreateStandalone: boolean;
  canCreateCompleteClient: boolean;
  canStartOnboarding: boolean;
  forceCreatorAsOwner: boolean;
}

function normalizedDepartmentName(name: string | null | undefined) {
  return (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Matches the canonical English and Portuguese Creative & Design labels. */
export function isCreativeDesignDepartmentName(name: string | null | undefined) {
  const normalized = normalizedDepartmentName(name);
  return /^(?:(?:creative|criacao|criativos?)\s*(?:(?:&|and|e|\/|-|\u2013|\u2014)\s*)?design|design\s*(?:(?:&|and|e|\/|-|\u2013|\u2014)\s*)?(?:creative|criacao|criativos?))(?:\b|\s|[-\u2013\u2014/])/.test(normalized);
}

/** Matches the Commercial/Sales department labels used for onboarding access. */
export function isCommercialOrSalesDepartmentName(name: string | null | undefined) {
  const normalized = normalizedDepartmentName(name);
  return /^(?:commercial|comercial|sales|vendas)(?:\b|\s|[-\u2013\u2014/&])/.test(normalized);
}

/** Matches the Finance labels used by the contract workflow. */
export function isFinanceDepartmentName(name: string | null | undefined) {
  const normalized = normalizedDepartmentName(name);
  return normalized === "finance" || normalized === "financeiro";
}

/**
 * Resolve permissions for client creation and onboarding.
 *
 * Creative & Design members can create a standalone client. Commercial and
 * Sales members can start onboarding, while Commercial, Sales, and Finance
 * can recreate a complete signed-client record. Workspace admins can use all
 * three flows, subject to the separate financial-visibility rule.
 */
export function resolveCompanyCreationAccess(input: {
  isWorkspaceAdmin: boolean;
  membership: CompanyCreationMembership | null | undefined;
}): CompanyCreationAccess {
  const isEligibleMember = Boolean(
    input.membership &&
      input.membership.status === "active" &&
      input.membership.role !== "guest",
  );

  const isCreativeMember = Boolean(
    isEligibleMember && isCreativeDesignDepartmentName(input.membership?.departmentName),
  );
  const isCommercialMember = Boolean(
    isEligibleMember && isCommercialOrSalesDepartmentName(input.membership?.departmentName),
  );
  const isFinanceMember = Boolean(
    isEligibleMember && isFinanceDepartmentName(input.membership?.departmentName),
  );

  return {
    canCreateStandalone: input.isWorkspaceAdmin || isCreativeMember,
    canCreateCompleteClient:
      input.isWorkspaceAdmin || isCommercialMember || isFinanceMember,
    canStartOnboarding: input.isWorkspaceAdmin || isCommercialMember,
    // Only Creative's restricted standalone path needs this guard. Admins
    // keep their existing ability to assign an active workspace owner.
    forceCreatorAsOwner: isCreativeMember && !input.isWorkspaceAdmin,
  };
}
