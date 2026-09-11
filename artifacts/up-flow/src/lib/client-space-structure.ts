import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export const CLIENTS_PROJECT_NAME = "Clients";

function normalizeClientStructureName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

export function isClientsRegistryProject(input: {
  projectName?: string | null;
}) {
  const name = normalizeClientStructureName(input.projectName);
  return name === "clients" || name === "clientes";
}

async function ensureClientsProjectForSpace(
  db: Db,
  input: {
    workspaceId: string;
    ownerId: string;
    spaceId: string;
  },
) {
  const existing = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: input.spaceId,
      folder_id: null,
      company_id: null,
      OR: [
        { name: { equals: "Clients", mode: "insensitive" } },
        { name: { equals: "Clientes", mode: "insensitive" } },
      ],
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      sidebar_hidden: true,
      space_id: true,
    },
  });

  if (existing) {
    if (
      existing.name !== CLIENTS_PROJECT_NAME ||
      existing.kind !== "operational_queue" ||
      existing.sidebar_hidden
    ) {
      await db.project.update({
        where: { id: existing.id },
        data: {
          name: CLIENTS_PROJECT_NAME,
          description:
            "Shared client directory. Each card opens the client folder mirrored in this Space.",
          kind: "operational_queue",
          sidebar_hidden: false,
        },
      });
    }
    return { id: existing.id, spaceId: existing.space_id ?? input.spaceId };
  }

  const created = await db.project.create({
    data: {
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: input.spaceId,
      name: CLIENTS_PROJECT_NAME,
      description:
        "Shared client directory. Each card opens the client folder mirrored in this Space.",
      kind: "operational_queue",
      sidebar_hidden: false,
    },
    select: { id: true, space_id: true },
  });

  return { id: created.id, spaceId: created.space_id ?? input.spaceId };
}

export async function ensureWorkspaceClientsProjects(
  db: Db,
  input: { workspaceId: string; ownerId: string },
) {
  const spaces = await db.space.findMany({
    where: { workspace_id: input.workspaceId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  return Promise.all(
    spaces.map((space) =>
      ensureClientsProjectForSpace(db, {
        workspaceId: input.workspaceId,
        ownerId: input.ownerId,
        spaceId: space.id,
      }),
    ),
  );
}

/**
 * A client has one canonical Company record. Each Clients project renders that
 * record as a virtual folder, so no folder is created at the Space root.
 */
export async function ensureWorkspaceClientDirectories(
  db: Db,
  input: {
    workspaceId: string;
    ownerId: string;
  },
) {
  return ensureWorkspaceClientsProjects(db, input);
}
