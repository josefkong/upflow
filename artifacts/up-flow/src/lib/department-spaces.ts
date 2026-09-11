import { Prisma, type CustomFieldType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log-error";
import { ensureWorkspaceOnboardingMirrorProjects } from "@/lib/onboarding";
import {
  RH_BOARD_COLUMNS,
  RH_BOARD_COLUMN_OPTIONS,
  RH_BOARD_FIELD_NAME,
  RH_TASK_TYPE_FIELD_NAME,
  RH_TASK_TYPE_OPTIONS,
} from "@/lib/rh-board";
import { SOCIAL_MEDIA_LIST_PRESET } from "@/lib/social-media";
import type { TaskTemplateId } from "@/lib/task-templates";
import { isCreativeDesignDepartmentName } from "@/lib/company-creation-access";
import { isDesignQueueName } from "@/lib/system-projects";
import { ensureWorkspaceClientsProjects } from "@/lib/client-space-structure";
import {
  COMMERCIAL_LEAD_STAGE_FIELD_NAME,
  COMMERCIAL_LEAD_STAGES,
} from "@/lib/commercial-lead-stages";
import { ensureSharedContractsRegistryProjects } from "@/lib/commercial-contract-mirror";
import { ensureEquipmentControlProject } from "@/lib/equipment-control";

export type DepartmentSpaceKey =
  | "comercial"
  | "marketing_b2b"
  | "marketing_b2c"
  | "creative_design"
  | "finance"
  | "production"
  | "technical_support"
  | "general_admin";

/**
 * The current UP Flow starts in Comercial and continues in Financeiro. Other
 * department Spaces remain available as empty containers until their workflow
 * is explicitly designed.
 */
export const PROJECT_BEARING_DEPARTMENT_KEYS = new Set<DepartmentSpaceKey>([
  "comercial",
  "finance",
]);

export interface DepartmentSpacePreset {
  department_key: DepartmentSpaceKey;
  name: string;
  emoji: string;
  description: string;
  starter_lists: string[];
  starter_list_presets?: DepartmentListPreset[];
  starter_folders?: DepartmentFolderPreset[];
  default_task_template_id: TaskTemplateId;
  dashboard_focus_labels: {
    urgent: string;
    workload: string;
    time: string;
    meetings: string;
    activity: string;
    risk: string;
    empty: string;
  };
}

export interface DepartmentFolderPreset {
  name: string;
  icon?: string;
  starter_lists: DepartmentListPreset[];
}

export interface DepartmentListPreset {
  name: string;
  description?: string;
  custom_fields?: DepartmentCustomFieldPreset[];
  workflow_statuses?: DepartmentWorkflowStatusPreset[];
}

export interface DepartmentCustomFieldPreset {
  name: string;
  type: CustomFieldType;
  options?: string[];
  position?: number;
}

export interface DepartmentWorkflowStatusPreset {
  key: string;
  name: string;
  color?: string;
  terminal?: boolean;
}

export const DEPARTMENT_SPACE_PRESETS: DepartmentSpacePreset[] = [
  {
    department_key: "comercial",
    name: "Comercial",
    emoji: "💼",
    description:
      "Sales pipeline, proposals, follow-ups, contracts, and commissions.",
    starter_lists: [
      "Leads",
      "Proposals",
      "Follow Up",
      "Contracts",
      "Customer Service",
    ],
    starter_list_presets: [
      {
        name: "Leads",
        custom_fields: [
          {
            name: COMMERCIAL_LEAD_STAGE_FIELD_NAME,
            type: "dropdown",
            options: COMMERCIAL_LEAD_STAGES.map((stage) => stage.name),
            position: 0,
          },
        ],
        workflow_statuses: COMMERCIAL_LEAD_STAGES.map((stage) => ({
          key: `commercial-lead-${stage.key}`,
          name: stage.name,
          color: stage.color,
          terminal: stage.terminal,
        })),
      },
      {
        name: "Contracts",
        description:
          "Automatic registry of active and inactive clients and their contract history.",
      },
      {
        name: "Customer Service",
        description:
          "Commercial customer service workspace for client requests and relationship follow-up.",
      },
    ],
    default_task_template_id: "commercial",
    dashboard_focus_labels: {
      urgent: "Deals, follow-ups, and proposals needing action",
      workload: "Commercial workload by owner",
      time: "Tracked on sales and proposal work",
      meetings: "Sales meetings linked to this Space",
      activity: "Pipeline and contract activity",
      risk: "Deals or contracts with stale movement",
      empty:
        "Create a commercial list to start tracking leads, proposals, and follow-ups.",
    },
  },
  {
    department_key: "marketing_b2b",
    name: "Marketing B2B",
    emoji: "🎯",
    description: "B2B campaigns, outbound, landing pages, and reporting.",
    starter_lists: [
      "Campaigns",
      "LinkedIn & Outbound",
      "Landing Pages",
      "Reports",
    ],
    default_task_template_id: "b2b_marketing",
    dashboard_focus_labels: {
      urgent: "B2B campaigns and reports needing action",
      workload: "B2B campaign workload by owner",
      time: "Tracked on B2B marketing work",
      meetings: "B2B planning and review meetings",
      activity: "Campaign and outbound activity",
      risk: "Campaigns with overdue work or no movement",
      empty:
        "Create a B2B marketing list to organize campaigns, outbound, and reports.",
    },
  },
  {
    department_key: "marketing_b2c",
    name: "Marketing B2C",
    emoji: "📣",
    description: "Consumer campaigns, content calendar, ads, and promotions.",
    starter_lists: ["Campaigns", "Content Calendar", "Ads", "Promotions"],
    default_task_template_id: "b2c_marketing",
    dashboard_focus_labels: {
      urgent: "B2C campaigns, ads, and promos needing action",
      workload: "B2C marketing workload by owner",
      time: "Tracked on B2C campaign work",
      meetings: "Consumer campaign meetings",
      activity: "Content, ads, and promo activity",
      risk: "Campaigns with overdue work or stalled publishing",
      empty:
        "Create a B2C marketing list to plan campaigns, content, ads, and promotions.",
    },
  },
  {
    department_key: "creative_design",
    name: "Creative & Design",
    emoji: "🎨",
    description: "Design queue, creative reviews, brand assets, and approvals.",
    starter_lists: [
      "Design Queue",
      "Creative Reviews",
      "Brand Assets",
      "Approvals",
      "Social Media",
    ],
    starter_list_presets: [SOCIAL_MEDIA_LIST_PRESET],
    default_task_template_id: "creative",
    dashboard_focus_labels: {
      urgent: "Design requests and approvals needing action",
      workload: "Creative workload by designer or owner",
      time: "Tracked on creative production",
      meetings: "Creative reviews linked to this Space",
      activity: "Design queue and approval activity",
      risk: "Creative work blocked, overdue, or waiting approval",
      empty:
        "Create a creative list to manage design requests, reviews, and approvals.",
    },
  },
  {
    department_key: "finance",
    name: "Finance",
    emoji: "💰",
    description:
      "Invoices, payments, commissions, expenses, and cashflow operations.",
    // Finance receives only projects that are destinations of the fixed Flow:
    // the mirrored Onboarding project and Contracts & Handoffs. Do not seed
    // generic queues that are not connected to an automatic transition.
    starter_lists: [],
    default_task_template_id: "finance",
    dashboard_focus_labels: {
      urgent: "Invoices, payments, or commissions needing action",
      workload: "Finance workload by owner",
      time: "Tracked on finance operations",
      meetings: "Finance meetings linked to this Space",
      activity: "Invoice, payment, and expense activity",
      risk: "Finance work overdue, unpaid, or missing ownership",
      empty:
        "Create a finance list to track invoices, payments, commissions, and expenses.",
    },
  },
  {
    department_key: "production",
    name: "Production",
    emoji: "🎬",
    description:
      "Shoots, editing, publishing, deliverables, and production handoffs.",
    starter_lists: ["Shoots", "Editing", "Publishing", "Deliverables"],
    default_task_template_id: "production",
    dashboard_focus_labels: {
      urgent: "Shoots, edits, and deliverables needing action",
      workload: "Production workload by owner",
      time: "Tracked on production work",
      meetings: "Production planning and review meetings",
      activity: "Shoot, editing, and publishing activity",
      risk: "Production work overdue, blocked, or waiting delivery",
      empty:
        "Create a production list to manage shoots, editing, publishing, and deliverables.",
    },
  },
  {
    department_key: "technical_support",
    name: "Technical Support",
    emoji: "🛠️",
    description:
      "Support tickets, bug reports, access issues, client requests, and resolutions.",
    starter_lists: [
      "Support Tickets",
      "Bug Reports",
      "Access Issues",
      "Client Requests",
      "Resolved",
    ],
    default_task_template_id: "technical_support",
    dashboard_focus_labels: {
      urgent:
        "Critical tickets, access issues, and client requests needing action",
      workload: "Support workload by owner",
      time: "Tracked on support and troubleshooting",
      meetings: "Support calls and escalation meetings",
      activity: "Ticket, bug, and access activity",
      risk: "Support work overdue, unresolved, or waiting escalation",
      empty:
        "Create a support list to manage tickets, bugs, access issues, and client requests.",
    },
  },
  {
    department_key: "general_admin",
    name: "General Admin",
    emoji: "⚙️",
    description:
      "Internal requests, access, documents, vendors, and admin operations.",
    starter_lists: [
      "Internal Requests",
      "Access & Accounts",
      "Documents",
      "Vendors",
    ],
    starter_folders: [
      {
        name: "RH",
        icon: "RH",
        starter_lists: [
          {
            name: "RH",
            description:
              "Human resources board modeled after the agency RH workflow in ClickUp.",
            custom_fields: [
              {
                name: RH_BOARD_FIELD_NAME,
                type: "dropdown",
                options: RH_BOARD_COLUMN_OPTIONS,
                position: 0,
              },
              {
                name: RH_TASK_TYPE_FIELD_NAME,
                type: "dropdown",
                options: [...RH_TASK_TYPE_OPTIONS],
                position: 1,
              },
            ],
            workflow_statuses: RH_BOARD_COLUMNS.map((column, index) => ({
              key: column.key,
              name: column.label,
              color: column.color,
              terminal: index === RH_BOARD_COLUMNS.length - 1,
            })),
          },
        ],
      },
    ],
    default_task_template_id: "admin",
    dashboard_focus_labels: {
      urgent: "Internal requests and access work needing action",
      workload: "Admin workload by owner",
      time: "Tracked on admin operations",
      meetings: "Admin meetings linked to this Space",
      activity: "Requests, documents, and vendor activity",
      risk: "Admin work overdue, unowned, or stale",
      empty:
        "Create an admin list to handle internal requests, access, documents, and vendors.",
    },
  },
];

export function normalizeDepartmentSpaceName(input: string) {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDepartmentSpacePreset(name: string | null | undefined) {
  if (!name) return null;
  const normalized = normalizeDepartmentSpaceName(name);
  const exactPreset =
    DEPARTMENT_SPACE_PRESETS.find(
      (preset) => normalizeDepartmentSpaceName(preset.name) === normalized,
    ) ?? null;
  if (exactPreset) return exactPreset;

  return isCreativeDesignDepartmentName(name)
    ? (DEPARTMENT_SPACE_PRESETS.find(
        (preset) => preset.department_key === "creative_design",
      ) ?? null)
    : null;
}

async function pickDepartmentOwnerId(
  workspaceId: string,
  fallbackOwnerId: string,
) {
  const owner =
    (await prisma.workspaceMember.findFirst({
      where: { workspace_id: workspaceId, role: "owner", status: "active" },
      select: { user_id: true },
      orderBy: { created_at: "asc" },
    })) ??
    (await prisma.workspaceMember.findFirst({
      where: { workspace_id: workspaceId, role: "admin", status: "active" },
      select: { user_id: true },
      orderBy: { created_at: "asc" },
    }));

  return owner?.user_id ?? fallbackOwnerId;
}

function containerKey(
  spaceId: string,
  parentId: string | null | undefined,
  name: string,
) {
  return `${spaceId}:${parentId ?? "root"}:${normalizeDepartmentSpaceName(name)}`;
}

function sameOptions(current: Prisma.JsonValue | null, expected: string[]) {
  if (!Array.isArray(current)) return expected.length === 0;
  const strings = current.filter(
    (item): item is string => typeof item === "string",
  );
  return (
    strings.length === expected.length &&
    strings.every((item, index) => item === expected[index])
  );
}

function getRootListPresets(preset: DepartmentSpacePreset) {
  const listPresetsByName = new Map<string, DepartmentListPreset>();

  for (const name of preset.starter_lists) {
    listPresetsByName.set(normalizeDepartmentSpaceName(name), { name });
  }

  for (const listPreset of preset.starter_list_presets ?? []) {
    listPresetsByName.set(
      normalizeDepartmentSpaceName(listPreset.name),
      listPreset,
    );
  }

  return [...listPresetsByName.values()];
}

async function ensureCreativeDesignQueue(
  workspaceId: string,
  spaceId: string,
  ownerId: string,
) {
  const queueWhere = {
    workspace_id: workspaceId,
    space_id: spaceId,
    company_id: null,
    name: { equals: "Design Queue", mode: "insensitive" as const },
  };
  const select = {
    id: true,
    name: true,
    folder_id: true,
    sidebar_hidden: true,
    kind: true,
  };
  const rootQueue = await prisma.project.findFirst({
    where: { ...queueWhere, folder_id: null },
    select,
  });
  const queue =
    rootQueue ??
    (await prisma.project.findFirst({
      where: queueWhere,
      select,
      orderBy: [{ created_at: "asc" }, { id: "asc" }],
    }));

  if (!queue) {
    await prisma.project.create({
      data: {
        name: "Design Queue",
        workspace_id: workspaceId,
        owner_id: ownerId,
        space_id: spaceId,
        kind: "operational_queue",
      },
    });
    return;
  }

  if (
    queue.folder_id !== null ||
    queue.sidebar_hidden ||
    queue.kind !== "operational_queue" ||
    !isDesignQueueName(queue.name) ||
    queue.name !== "Design Queue"
  ) {
    await prisma.project.update({
      where: { id: queue.id },
      data: {
        name: "Design Queue",
        folder_id: null,
        sidebar_hidden: false,
        kind: "operational_queue",
      },
    });
  }
}

async function ensureDepartmentListModel(
  projectId: string,
  workspaceId: string,
  listPreset: DepartmentListPreset,
) {
  if (listPreset.custom_fields?.length) {
    const existingFields = await prisma.customFieldDefinition.findMany({
      where: { project_id: projectId },
      select: {
        id: true,
        name: true,
        type: true,
        options: true,
        position: true,
      },
    });
    const fieldsByName = new Map(
      existingFields.map((field) => [
        normalizeDepartmentSpaceName(field.name),
        field,
      ]),
    );

    for (const field of listPreset.custom_fields) {
      const expectedOptions =
        field.type === "dropdown" ? (field.options ?? []) : [];
      const existing = fieldsByName.get(
        normalizeDepartmentSpaceName(field.name),
      );
      if (!existing) {
        await prisma.customFieldDefinition.create({
          data: {
            project_id: projectId,
            name: field.name,
            type: field.type,
            options:
              field.type === "dropdown"
                ? (expectedOptions as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            position: field.position ?? existingFields.length,
          },
        });
        continue;
      }

      const position = field.position ?? existing.position;
      const needsUpdate =
        existing.type !== field.type ||
        existing.position !== position ||
        (field.type === "dropdown" &&
          !sameOptions(existing.options, expectedOptions));

      if (needsUpdate) {
        await prisma.customFieldDefinition.update({
          where: { id: existing.id },
          data: {
            type: field.type,
            options:
              field.type === "dropdown"
                ? (expectedOptions as Prisma.InputJsonValue)
                : Prisma.JsonNull,
            position,
          },
        });
      }
    }
  }

  if (listPreset.workflow_statuses?.length) {
    const existingStatuses = await prisma.workflowStatus.findMany({
      where: {
        workspace_id: workspaceId,
        project_id: projectId,
        category: "task",
      },
      select: {
        id: true,
        key: true,
        name: true,
        color: true,
        stage_order: true,
        terminal: true,
        active: true,
      },
    });
    const statusesByKey = new Map(
      existingStatuses.map((status) => [status.key, status]),
    );

    for (const [index, status] of listPreset.workflow_statuses.entries()) {
      const existing = statusesByKey.get(status.key);
      const data = {
        name: status.name,
        color: status.color ?? null,
        stage_order: index,
        terminal: status.terminal ?? false,
        active: true,
      };

      if (!existing) {
        await prisma.workflowStatus.create({
          data: {
            workspace_id: workspaceId,
            project_id: projectId,
            category: "task",
            key: status.key,
            ...data,
          },
        });
        continue;
      }

      if (
        existing.name !== data.name ||
        existing.color !== data.color ||
        existing.stage_order !== data.stage_order ||
        existing.terminal !== data.terminal ||
        existing.active !== data.active
      ) {
        await prisma.workflowStatus.update({
          where: { id: existing.id },
          data,
        });
      }
    }
  }
}

export async function ensureDepartmentSpaces(
  workspaceId: string,
  fallbackOwnerId: string,
) {
  try {
    const ownerId = await pickDepartmentOwnerId(workspaceId, fallbackOwnerId);
    const existingSpaces = await prisma.space.findMany({
      where: { workspace_id: workspaceId },
      select: { id: true, name: true, position: true },
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
    });
    const spacesByName = new Map(
      existingSpaces.map((space) => [
        normalizeDepartmentSpaceName(space.name),
        space,
      ]),
    );
    let nextPosition =
      existingSpaces.reduce((max, space) => Math.max(max, space.position), -1) +
      1;

    for (const preset of DEPARTMENT_SPACE_PRESETS) {
      const normalizedPresetName = normalizeDepartmentSpaceName(preset.name);
      let space =
        spacesByName.get(normalizedPresetName) ??
        existingSpaces.find(
          (candidate) =>
            getDepartmentSpacePreset(candidate.name)?.department_key ===
            preset.department_key,
        );

      if (!space) {
        space = await prisma.space.create({
          data: {
            name: preset.name,
            icon: preset.emoji,
            workspace_id: workspaceId,
            owner_id: ownerId,
            position: nextPosition,
          },
          select: { id: true, name: true, position: true },
        });
        spacesByName.set(normalizedPresetName, space);
        nextPosition += 1;
      }

      spacesByName.set(normalizedPresetName, space);
    }

    const departmentSpaceIds = DEPARTMENT_SPACE_PRESETS.map(
      (preset) =>
        spacesByName.get(normalizeDepartmentSpaceName(preset.name))?.id,
    ).filter((id): id is string => Boolean(id));

    const existingFolders = await prisma.folder.findMany({
      where: {
        workspace_id: workspaceId,
        space_id: { in: departmentSpaceIds },
      },
      select: {
        id: true,
        name: true,
        space_id: true,
        parent_id: true,
        position: true,
      },
      orderBy: [{ position: "asc" }, { created_at: "asc" }],
    });
    const foldersByContainer = new Map(
      existingFolders.map((folder) => [
        containerKey(folder.space_id, folder.parent_id, folder.name),
        folder,
      ]),
    );
    const nextFolderPosition = new Map<string, number>();
    for (const folder of existingFolders) {
      const key = `${folder.space_id}:${folder.parent_id ?? "root"}`;
      nextFolderPosition.set(
        key,
        Math.max(nextFolderPosition.get(key) ?? 0, folder.position + 1),
      );
    }

    for (const preset of DEPARTMENT_SPACE_PRESETS) {
      const space = spacesByName.get(normalizeDepartmentSpaceName(preset.name));
      if (!space) continue;
      if (!PROJECT_BEARING_DEPARTMENT_KEYS.has(preset.department_key)) continue;

      for (const folderPreset of preset.starter_folders ?? []) {
        const key = containerKey(space.id, null, folderPreset.name);
        if (foldersByContainer.has(key)) continue;

        const positionKey = `${space.id}:root`;
        const position = nextFolderPosition.get(positionKey) ?? 0;
        const folder = await prisma.folder.create({
          data: {
            name: folderPreset.name,
            icon: folderPreset.icon ?? null,
            workspace_id: workspaceId,
            owner_id: ownerId,
            space_id: space.id,
            position,
          },
          select: {
            id: true,
            name: true,
            space_id: true,
            parent_id: true,
            position: true,
          },
        });
        foldersByContainer.set(key, folder);
        nextFolderPosition.set(positionKey, position + 1);
      }
    }

    const existingProjects = await prisma.project.findMany({
      where: {
        workspace_id: workspaceId,
        space_id: { in: departmentSpaceIds },
      },
      select: {
        id: true,
        name: true,
        space_id: true,
        folder_id: true,
        company_id: true,
        kind: true,
      },
    });
    const projectNamesBySpace = new Map<string, Set<string>>();
    const projectsByFolder = new Map<
      string,
      (typeof existingProjects)[number]
    >();
    for (const project of existingProjects) {
      if (!project.space_id) continue;
      if (project.company_id === null) {
        const names =
          projectNamesBySpace.get(project.space_id) ?? new Set<string>();
        names.add(normalizeDepartmentSpaceName(project.name));
        projectNamesBySpace.set(project.space_id, names);
      }
      if (project.folder_id && project.company_id === null) {
        projectsByFolder.set(
          containerKey(project.folder_id, null, project.name),
          project,
        );
      }
    }

    for (const preset of DEPARTMENT_SPACE_PRESETS) {
      const space = spacesByName.get(normalizeDepartmentSpaceName(preset.name));
      if (!space) continue;
      if (!PROJECT_BEARING_DEPARTMENT_KEYS.has(preset.department_key)) continue;

      const rootListPresets = getRootListPresets(preset);
      const existingProjectNames =
        projectNamesBySpace.get(space.id) ?? new Set<string>();
      const missingLists = rootListPresets.filter(
        (listPreset) =>
          !existingProjectNames.has(
            normalizeDepartmentSpaceName(listPreset.name),
          ),
      );

      if (missingLists.length > 0) {
        const listData = missingLists.map((listPreset) => ({
          name: listPreset.name,
          description: listPreset.description ?? null,
          workspace_id: workspaceId,
          owner_id: ownerId,
          space_id: space.id,
          kind: "operational_queue" as const,
        }));
        await prisma.project.createMany({
          data: listData,
          skipDuplicates: true,
        });
      }

      if (preset.department_key === "creative_design") {
        await ensureCreativeDesignQueue(workspaceId, space.id, ownerId);
      }

      const configuredRootListPresets = rootListPresets.filter(
        (listPreset) =>
          listPreset.description ||
          listPreset.custom_fields?.length ||
          listPreset.workflow_statuses?.length,
      );

      if (configuredRootListPresets.length > 0) {
        const rootProjects = await prisma.project.findMany({
          where: {
            workspace_id: workspaceId,
            space_id: space.id,
            folder_id: null,
            company_id: null,
          },
          select: {
            id: true,
            name: true,
            kind: true,
          },
        });
        const rootProjectsByName = new Map(
          rootProjects.map((project) => [
            normalizeDepartmentSpaceName(project.name),
            project,
          ]),
        );

        for (const listPreset of configuredRootListPresets) {
          const project = rootProjectsByName.get(
            normalizeDepartmentSpaceName(listPreset.name),
          );
          if (!project) continue;

          if (listPreset.description || project.kind !== "operational_queue") {
            await prisma.project.update({
              where: { id: project.id },
              data: {
                ...(listPreset.description && {
                  description: listPreset.description,
                }),
                kind: "operational_queue",
              },
            });
          }

          await ensureDepartmentListModel(project.id, workspaceId, listPreset);
        }
      }

      for (const folderPreset of preset.starter_folders ?? []) {
        const folder = foldersByContainer.get(
          containerKey(space.id, null, folderPreset.name),
        );
        if (!folder) continue;

        for (const listPreset of folderPreset.starter_lists) {
          const projectKey = containerKey(folder.id, null, listPreset.name);
          let project = projectsByFolder.get(projectKey);
          if (!project) {
            project = await prisma.project.create({
              data: {
                name: listPreset.name,
                description: listPreset.description ?? null,
                workspace_id: workspaceId,
                owner_id: ownerId,
                space_id: space.id,
                folder_id: folder.id,
                kind: "operational_queue",
              },
              select: {
                id: true,
                name: true,
                space_id: true,
                folder_id: true,
                company_id: true,
                kind: true,
              },
            });
            projectsByFolder.set(projectKey, project);
          } else if (
            listPreset.description ||
            project.kind !== "operational_queue"
          ) {
            await prisma.project.update({
              where: { id: project.id },
              data: {
                ...(listPreset.description && {
                  description: listPreset.description,
                }),
                kind: "operational_queue",
              },
            });
          }

          await ensureDepartmentListModel(project.id, workspaceId, listPreset);
        }
      }
    }

    // The mirrored Onboarding projects are part of the department structure,
    // not a side effect of the first signed contract. Keeping them present from
    // provisioning time makes every department ready to receive the shared
    // onboarding tasks as soon as that workflow starts.
    await ensureWorkspaceOnboardingMirrorProjects(prisma, {
      workspaceId,
      ownerId,
    });
    await ensureWorkspaceClientsProjects(prisma, {
      workspaceId,
      ownerId,
    });
    await ensureSharedContractsRegistryProjects(prisma, {
      workspaceId,
      fallbackOwnerId: ownerId,
    });
    await ensureEquipmentControlProject(prisma, {
      workspaceId,
      ownerId,
    });
  } catch (err) {
    logError("department-spaces:ensure", err, { workspaceId });
    throw err;
  }
}
