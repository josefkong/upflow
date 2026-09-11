import { isCreativeDesignDepartmentName } from "@/lib/company-creation-access";
import {
  getCreativeBriefingRequester,
  isCreativeBriefingType,
} from "@/lib/creative-briefing";
import { parseTaskBrief } from "@/lib/task-templates";

export interface ClientCreativeTrackingMembership {
  role: string | null | undefined;
  departmentName: string | null | undefined;
}

export interface ClientCreativeTrackingTaskInput {
  title?: string | null;
  description?: string | null;
  projectName?: string | null;
  spaceName?: string | null;
}

export interface ClientCreativeTrackingFieldValue {
  value: unknown;
  definition: {
    name: string;
    type?: string | null;
    position?: number | null;
  };
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isMarketingB2BOrB2CDepartmentName(
  value: string | null | undefined,
) {
  const name = normalize(value);
  return (
    name === "b2b" ||
    name === "b2c" ||
    /^(?:marketing|performance|midia|trafego)\s+(?:b2b|b2c)(?:\b|\s|[-–—/&])/.test(
      name,
    )
  );
}

function isCreativeTeamDepartmentName(value: string | null | undefined) {
  const name = normalize(value);
  return (
    isCreativeDesignDepartmentName(value) ||
    name === "criacao" ||
    name === "criativos" ||
    name === "creative" ||
    name === "design"
  );
}

/**
 * The client folder is only a mirror of creative work. Workspace admins keep
 * governance access; active B2B/B2C and Creative & Design members can read it.
 */
export function canViewClientCreativeTracking(input: {
  isWorkspaceAdmin: boolean;
  membership: ClientCreativeTrackingMembership | null | undefined;
}) {
  if (input.isWorkspaceAdmin) return true;
  if (!input.membership || input.membership.role === "guest") return false;

  return (
    isMarketingB2BOrB2CDepartmentName(input.membership.departmentName) ||
    isCreativeTeamDepartmentName(input.membership.departmentName)
  );
}

function isCreativeProjectName(value: string | null | undefined) {
  const name = normalize(value);
  return (
    name === "design queue" ||
    name === "creative reviews" ||
    name === "solicitacao de producao criativa" ||
    name === "creative production request" ||
    name.includes("producao criativa") ||
    name.includes("creative production")
  );
}

export function isClientCreativeTrackingTask(
  input: ClientCreativeTrackingTaskInput,
) {
  if (isCreativeTeamDepartmentName(input.spaceName)) return true;
  if (isCreativeProjectName(input.projectName)) return true;

  const brief = parseTaskBrief(input.description);
  return isCreativeBriefingType(brief?.type);
}

function textValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").join(", ").trim();
  }
  return "";
}

const STAGE_FIELD_PRIORITY = [
  "upflow space status",
  "creative production status",
  "clickup status",
  "etapa da producao criativa",
  "creative production stage",
];

export function resolveClientCreativeTaskStage(
  fields: ReadonlyArray<ClientCreativeTrackingFieldValue>,
  fallbackStatus: "todo" | "in_progress" | "done",
) {
  const candidates = fields
    .filter((field) => field.definition.type === "dropdown")
    .map((field) => ({
      name: normalize(field.definition.name),
      position: field.definition.position ?? Number.MAX_SAFE_INTEGER,
      value: textValue(field.value),
    }))
    .filter((field) => field.value.length > 0);

  for (const name of STAGE_FIELD_PRIORITY) {
    const match = candidates.find((candidate) => candidate.name === name);
    if (match) return match.value;
  }

  const inferred = candidates
    .filter(
      (candidate) =>
        candidate.name.includes("status") ||
        candidate.name.includes("etapa") ||
        candidate.name.includes("stage"),
    )
    .sort((left, right) => left.position - right.position)[0];
  if (inferred) return inferred.value;

  return fallbackStatus;
}

export function getClientCreativeTaskMetadata(
  input: Pick<ClientCreativeTrackingTaskInput, "title" | "description">,
) {
  const brief = parseTaskBrief(input.description);
  const formats =
    brief?.details.find((detail) => {
      const label = normalize(detail.label);
      return label === "formats" || label === "formatos";
    })?.value ?? "";
  const searchable = normalize(`${input.title ?? ""} ${formats}`);

  const kind = /\b(video|reel|motion|roteiro|filmagem|gravacao|edicao)\b/.test(
    searchable,
  )
    ? ("video" as const)
    : /\b(estatico|static|imagem|image|banner|carrossel|carousel|arte|feed)\b/.test(
          searchable,
        )
      ? ("static" as const)
      : ("creative" as const);

  return {
    kind,
    formats: formats || null,
    requester: brief ? getCreativeBriefingRequester(brief.details) : null,
  };
}
