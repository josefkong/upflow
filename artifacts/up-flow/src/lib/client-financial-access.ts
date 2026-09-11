import { type AuthUser } from "@/lib/auth-helpers";
import { isCommercialOrSalesDepartmentName } from "@/lib/company-creation-access";
import { isFinanceDepartmentName } from "@/lib/commercial-contract-access";

export const CLIENTS_REGISTRY_CONTEXT_PARAM = "context_project_id";

function isFinancialDepartment(name: string | null | undefined) {
  return (
    isCommercialOrSalesDepartmentName(name) || isFinanceDepartmentName(name)
  );
}

export async function canViewClientFinancials(
  auth: AuthUser,
  workspaceId: string,
) {
  const membership = auth.memberships.find(
    (item) => item.workspace_id === workspaceId,
  );
  if (
    membership &&
    membership.role !== "guest" &&
    isFinancialDepartment(membership.department?.name)
  ) {
    return true;
  }
  return false;
}

export async function canViewClientFinancialsInContext(
  auth: AuthUser,
  workspaceId: string,
  contextProjectId: string | null | undefined,
) {
  void contextProjectId;
  return canViewClientFinancials(auth, workspaceId);
}

export function redactCommercialLeadFinancials<
  T extends Record<string, unknown>,
>(value: T | null, allowed: boolean): T | null {
  if (!value || allowed) return value;
  return {
    ...value,
    group_up_monthly_fee: null,
    up_zero_monthly_fee: null,
    up_zero_implementation_fee: null,
    contract_monthly_fee: null,
  };
}

const FINANCIAL_METADATA_KEYS = new Set([
  "contract_value",
  "commission",
  "group_up_monthly_fee",
  "up_zero_monthly_fee",
  "up_zero_implementation_fee",
  "contract_monthly_fee",
  "monthly_fee",
]);

export function redactFinancialMetadata(
  value: unknown,
  allowed: boolean,
): unknown {
  if (allowed || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactFinancialMetadata(item, false));
  }
  if (typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !FINANCIAL_METADATA_KEYS.has(key))
      .map(([key, entry]) => [key, redactFinancialMetadata(entry, false)]),
  );
}

export function redactFinancialTaskDescription(
  description: string | null,
  allowed: boolean,
) {
  if (allowed || !description) return description;
  return description
    .split("\n")
    .filter(
      (line) =>
        !/\b(mensalidade|monthly fee|contract value|valor do contrato|comiss(?:a|ã)o|commission|taxa de implementa(?:c|ç)(?:a|ã)o|implementation fee)\b/i.test(
          line,
        ),
    )
    .join("\n");
}

export function redactClientFinancials<
  T extends Record<string, unknown> & {
    summary?: Record<string, unknown> | null;
  },
>(value: T, allowed: boolean): T {
  if (allowed) return value;
  const redacted = {
    ...value,
    contract_value: null,
    commission: null,
    payment_terms: null,
    billing_notes: null,
    ...(value.summary
      ? {
          summary: {
            ...value.summary,
            profitability_ratio: null,
            contract_value_per_tracked_hour: null,
            commission_per_tracked_hour: null,
            risk_reasons: Array.isArray(value.summary.risk_reasons)
              ? value.summary.risk_reasons.filter(
                  (reason) =>
                    typeof reason !== "string" ||
                    !reason.toLocaleLowerCase().includes("contract value"),
                )
              : value.summary.risk_reasons,
            latest_activity:
              value.summary.latest_activity &&
              typeof value.summary.latest_activity === "object"
                ? {
                    ...(value.summary.latest_activity as Record<
                      string,
                      unknown
                    >),
                    metadata: redactFinancialMetadata(
                      (value.summary.latest_activity as Record<string, unknown>)
                        .metadata,
                      false,
                    ),
                  }
                : value.summary.latest_activity,
          },
        }
      : {}),
  } as T & { activity_events?: unknown };

  if (Array.isArray(value.activity_events)) {
    redacted.activity_events = value.activity_events.map((event) =>
      event && typeof event === "object"
        ? {
            ...(event as Record<string, unknown>),
            metadata: redactFinancialMetadata(
              (event as Record<string, unknown>).metadata,
              false,
            ),
          }
        : event,
    );
  }

  return redacted;
}
