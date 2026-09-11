import type { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

const FINANCE_SPACE_NAMES = ["finance", "financeiro"];
const COMMERCIAL_SPACE_NAMES = ["comercial", "commercial"];
const CONTRACTS_REGISTRY_NAMES = ["contracts", "contratos"];
const CONTRACT_MIRROR_PROJECT_NAMES = [
  "contracts & handoffs",
  "contracts and handoffs",
  "contratos e handoffs",
];

function normalizedName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isFinanceContractMirrorProject(input: {
  projectName?: string | null;
  spaceName?: string | null;
}) {
  return (
    FINANCE_SPACE_NAMES.includes(normalizedName(input.spaceName)) &&
    CONTRACT_MIRROR_PROJECT_NAMES.includes(normalizedName(input.projectName))
  );
}

export async function resolveFinanceContractMirrorProject(
  db: Db,
  input: { workspaceId: string; fallbackOwnerId: string },
) {
  const financeSpace = await db.space.findFirst({
    where: {
      workspace_id: input.workspaceId,
      OR: FINANCE_SPACE_NAMES.map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    select: { id: true, owner_id: true },
  });
  if (!financeSpace) {
    throw new Error(
      "O espaço Finance não foi encontrado para espelhar os contratos.",
    );
  }

  const existing = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: financeSpace.id,
      OR: CONTRACT_MIRROR_PROJECT_NAMES.map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true, name: true, space_id: true },
  });
  if (existing) return existing;

  const position = await db.project.count({
    where: { workspace_id: input.workspaceId, space_id: financeSpace.id },
  });
  return db.project.create({
    data: {
      name: "Contracts & Handoffs",
      description:
        "Espelho financeiro das solicitações de contrato originadas no projeto Leads. As tarefas são compartilhadas com o Comercial.",
      status: "active",
      kind: "operational_queue",
      workspace_id: input.workspaceId,
      owner_id: financeSpace.owner_id || input.fallbackOwnerId,
      space_id: financeSpace.id,
      position,
    },
    select: { id: true, name: true, space_id: true },
  });
}

export async function ensureSharedContractsRegistryProjects(
  db: Db,
  input: { workspaceId: string; fallbackOwnerId: string },
) {
  const spaces = await db.space.findMany({
    where: {
      workspace_id: input.workspaceId,
      OR: [...COMMERCIAL_SPACE_NAMES, ...FINANCE_SPACE_NAMES].map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: { id: true, owner_id: true },
  });

  return Promise.all(
    spaces.map(async (space) => {
      const existing = await db.project.findFirst({
        where: {
          workspace_id: input.workspaceId,
          space_id: space.id,
          folder_id: null,
          company_id: null,
          OR: CONTRACTS_REGISTRY_NAMES.map((name) => ({
            name: { equals: name, mode: "insensitive" as const },
          })),
        },
        orderBy: [{ created_at: "asc" }, { id: "asc" }],
        select: { id: true, name: true, kind: true, sidebar_hidden: true },
      });
      const description =
        "Automatic shared registry of active and inactive clients and their contract history.";

      if (existing) {
        if (
          existing.name !== "Contracts" ||
          existing.kind !== "operational_queue" ||
          existing.sidebar_hidden
        ) {
          await db.project.update({
            where: { id: existing.id },
            data: {
              name: "Contracts",
              description,
              kind: "operational_queue",
              sidebar_hidden: false,
            },
          });
        }
        return { id: existing.id, space_id: space.id };
      }

      const position = await db.project.count({
        where: { workspace_id: input.workspaceId, space_id: space.id },
      });
      return db.project.create({
        data: {
          name: "Contracts",
          description,
          status: "active",
          kind: "operational_queue",
          workspace_id: input.workspaceId,
          owner_id: space.owner_id || input.fallbackOwnerId,
          space_id: space.id,
          position,
        },
        select: { id: true, space_id: true },
      });
    }),
  );
}
