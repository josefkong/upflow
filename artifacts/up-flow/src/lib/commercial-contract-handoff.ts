import { Prisma } from "@prisma/client";
import {
  commercialContractPlanFromLead,
} from "@/lib/commercial-contract";
import {
  ensureSharedContractsRegistryProjects,
  resolveFinanceContractMirrorProject,
} from "@/lib/commercial-contract-mirror";
import {
  createClientOnboardingRecordsForCompany,
  resolveOnboardingTaskProjectId,
} from "@/lib/onboarding";
import { deleteTasksByIds } from "@/lib/task-delete";
import { setCommercialContractStage } from "@/lib/commercial-contract-stages";
import { ensureWorkspaceClientDirectories } from "@/lib/client-space-structure";

type Db = Prisma.TransactionClient;

type LeadContractSnapshot = {
  id: string;
  task_id: string;
  contract_handoff_task_id: string | null;
  finance_contract_task_id: string | null;
  brand_name: string;
  owner_name: string;
  owner_email: string;
  whatsapp: string;
  company_type: string;
  assignee_id: string;
  group_up_plan: string | null;
  group_up_monthly_fee: string | number | Prisma.Decimal | null;
  up_zero_plan: string | null;
  up_zero_monthly_fee: string | number | Prisma.Decimal | null;
  contract_cnpj?: string | null;
  contract_legal_name?: string | null;
  contract_plan?: string | null;
  contract_services?: Prisma.JsonValue | null;
  contract_monthly_fee?: string | number | Prisma.Decimal | null;
};

export function commercialContractHandoffTitle(brandName: string) {
  return `Contrato e Handoff — ${brandName}`;
}

export function commercialFinanceContractTitle(brandName: string) {
  return `Elaborar Contrato — ${brandName}`;
}

function inheritedContractDescription(lead: LeadContractSnapshot) {
  const plan = commercialContractPlanFromLead(lead) || "A definir";
  return [
    "Preparação contratual originada automaticamente pelo fechamento do Lead.",
    `Marca: ${lead.brand_name}`,
    `Proprietário: ${lead.owner_name}`,
    `Empresa: ${lead.company_type}`,
    `Plano negociado: ${plan}`,
    `E-mail: ${lead.owner_email}`,
    `Celular: +55 ${lead.whatsapp}`,
    "Preencha e confirme os dados contratuais nesta tarefa para acionar o Financeiro.",
  ].join("\n");
}

async function replaceFollowers(
  db: Db,
  taskId: string,
  assigneeId: string | null,
  followerIds: string[],
) {
  await db.taskFollower.deleteMany({ where: { task_id: taskId } });
  const uniqueFollowerIds = Array.from(
    new Set(followerIds.filter((userId) => userId && userId !== assigneeId)),
  );
  if (uniqueFollowerIds.length > 0) {
    await db.taskFollower.createMany({
      data: uniqueFollowerIds.map((user_id) => ({ task_id: taskId, user_id })),
      skipDuplicates: true,
    });
  }
}

export async function createCommercialContractHandoffTask(
  db: Db,
  input: {
    lead: LeadContractSnapshot;
    workspaceId: string;
    sourceProjectOwnerId: string;
    followerIds: string[];
  },
) {
  await resolveFinanceContractMirrorProject(db, {
    workspaceId: input.workspaceId,
    fallbackOwnerId: input.sourceProjectOwnerId,
  });
  const projectId = await resolveOnboardingTaskProjectId(db, {
    workspaceId: input.workspaceId,
    sourceProjectId: null,
    sourceProjectSpaceId: null,
    ownerId: input.sourceProjectOwnerId,
    route: "commercial",
  });
  const taskData = {
    title: commercialContractHandoffTitle(input.lead.brand_name),
    description: inheritedContractDescription(input.lead),
    status: "todo" as const,
    priority: "high" as const,
    project_id: projectId,
    assignee_id: input.lead.assignee_id,
    parent_id: input.lead.task_id,
    due_date: null,
  };
  const existing = input.lead.contract_handoff_task_id
    ? await db.task.findUnique({
        where: { id: input.lead.contract_handoff_task_id },
        select: { id: true },
      })
    : null;
  const task = existing
    ? await db.task.update({
        where: { id: existing.id },
        data: taskData,
        select: { id: true, project_id: true, assignee_id: true },
      })
    : await db.task.create({
        data: {
          ...taskData,
          position: await db.task.count({ where: { project_id: projectId } }),
        },
        select: { id: true, project_id: true, assignee_id: true },
      });
  await replaceFollowers(db, task.id, task.assignee_id, input.followerIds);
  await db.commercialLead.update({
    where: { id: input.lead.id },
    data: { contract_handoff_task_id: task.id },
  });
  await setCommercialContractStage(db, {
    workspaceId: input.workspaceId,
    projectId: task.project_id,
    taskId: task.id,
    stage: "information",
  });
  return task;
}

async function findFinanceOwner(db: Db, workspaceId: string) {
  const department = await db.department.findFirst({
    where: {
      workspace_id: workspaceId,
      OR: [
        { name: { contains: "finance", mode: "insensitive" } },
        { name: { contains: "financeiro", mode: "insensitive" } },
      ],
    },
    select: {
      leader: { select: { id: true, name: true, email: true } },
      members: {
        where: { status: "active" },
        orderBy: { created_at: "asc" },
        take: 1,
        select: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  return department?.leader ?? department?.members[0]?.user ?? null;
}

function financeContractDescription(input: {
  lead: LeadContractSnapshot;
  cnpj: string;
  legalName: string;
  plan: string;
  services: string[];
  monthlyFee: number;
}) {
  return [
    "Nova solicitação de elaboração de contrato originada pelo Comercial.",
    `Marca: ${input.lead.brand_name}`,
    `CNPJ: ${input.cnpj}`,
    `Razão Social: ${input.legalName}`,
    `Empresa: ${input.lead.company_type}`,
    `Plano: ${input.plan}`,
    `Serviços: ${input.services.join(", ")}`,
    `E-mail: ${input.lead.owner_email}`,
    `Celular: +55 ${input.lead.whatsapp}`,
    "Ação do Financeiro: elaborar o contrato da marca e dar continuidade à confirmação da parceria.",
  ].join("\n");
}

export async function confirmCommercialContractHandoff(
  db: Db,
  input: {
    lead: LeadContractSnapshot;
    workspaceId: string;
    actorId: string;
    cnpj: string;
    legalName: string;
    plan: string;
    services: string[];
    monthlyFee: number;
    confirmedAt: Date;
  },
) {
  if (!input.lead.contract_handoff_task_id) {
    throw new Error("A tarefa de Contratos e Handoffs ainda não foi criada.");
  }
  const financeOwner = await findFinanceOwner(db, input.workspaceId);
  const assigneeId = financeOwner?.id ?? input.actorId;
  const financeProject = await resolveFinanceContractMirrorProject(db, {
    workspaceId: input.workspaceId,
    fallbackOwnerId: assigneeId,
  });
  const taskData = {
    title: commercialFinanceContractTitle(input.lead.brand_name),
    description: financeContractDescription(input),
    status: "todo" as const,
    priority: "high" as const,
    project_id: financeProject.id,
    assignee_id: assigneeId,
    parent_id: input.lead.contract_handoff_task_id,
  };
  const existing = input.lead.finance_contract_task_id
    ? await db.task.findUnique({
        where: { id: input.lead.finance_contract_task_id },
        select: { id: true },
      })
    : null;
  const financeTask = existing
    ? await db.task.update({
        where: { id: existing.id },
        data: taskData,
        select: { id: true, project_id: true, assignee_id: true },
      })
    : await db.task.create({
        data: {
          ...taskData,
          position: await db.task.count({
            where: { project_id: financeProject.id },
          }),
        },
        select: { id: true, project_id: true, assignee_id: true },
      });
  await replaceFollowers(db, financeTask.id, assigneeId, [
    input.lead.assignee_id,
  ]);
  const contractTask = await db.task.findUniqueOrThrow({
    where: { id: input.lead.contract_handoff_task_id },
    select: { id: true, project_id: true },
  });
  await Promise.all([
    setCommercialContractStage(db, {
      workspaceId: input.workspaceId,
      projectId: contractTask.project_id,
      taskId: contractTask.id,
      stage: "preparation",
    }),
    db.commercialLead.update({
      where: { id: input.lead.id },
      data: {
        finance_contract_task_id: financeTask.id,
        contract_cnpj: input.cnpj,
        contract_legal_name: input.legalName,
        contract_plan: input.plan,
        contract_services: input.services,
        contract_monthly_fee: input.monthlyFee,
        contract_confirmed_at: input.confirmedAt,
      },
    }),
  ]);
  return { financeTask, financeOwner };
}

export async function repairMissingCommercialFinanceContractTasks(
  db: Db,
  input: { workspaceId: string; actorId: string },
) {
  const leads = await db.commercialLead.findMany({
    where: {
      workspace_id: input.workspaceId,
      contract_confirmed_at: { not: null },
      contract_handoff_task_id: { not: null },
      finance_contract_task_id: null,
    },
    select: {
      id: true,
      task_id: true,
      contract_handoff_task_id: true,
      finance_contract_task_id: true,
      brand_name: true,
      owner_name: true,
      owner_email: true,
      whatsapp: true,
      company_type: true,
      assignee_id: true,
      group_up_plan: true,
      group_up_monthly_fee: true,
      up_zero_plan: true,
      up_zero_monthly_fee: true,
      contract_cnpj: true,
      contract_legal_name: true,
      contract_plan: true,
      contract_services: true,
      contract_monthly_fee: true,
      contract_confirmed_at: true,
      contract_handoff_task: { select: { id: true } },
    },
  });

  let repaired = 0;
  for (const lead of leads) {
    const services = Array.isArray(lead.contract_services)
      ? lead.contract_services.filter(
          (service): service is string => typeof service === "string",
        )
      : [];
    if (
      !lead.contract_handoff_task ||
      !lead.contract_cnpj ||
      !lead.contract_legal_name ||
      !lead.contract_plan ||
      lead.contract_monthly_fee === null ||
      !lead.contract_confirmed_at
    ) {
      continue;
    }
    await confirmCommercialContractHandoff(db, {
      lead,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      cnpj: lead.contract_cnpj,
      legalName: lead.contract_legal_name,
      plan: lead.contract_plan,
      services,
      monthlyFee: Number(lead.contract_monthly_fee),
      confirmedAt: lead.contract_confirmed_at,
    });
    repaired += 1;
  }
  return repaired;
}

export async function markCommercialContractSent(
  db: Db,
  input: {
    lead: LeadContractSnapshot;
    workspaceId: string;
  },
) {
  if (
    !input.lead.contract_handoff_task_id ||
    !input.lead.finance_contract_task_id
  ) {
    throw new Error("A preparação do contrato ainda não foi iniciada.");
  }
  const contractTask = await db.task.findUniqueOrThrow({
    where: { id: input.lead.contract_handoff_task_id },
    select: { id: true, project_id: true },
  });
  await Promise.all([
    setCommercialContractStage(db, {
      workspaceId: input.workspaceId,
      projectId: contractTask.project_id,
      taskId: contractTask.id,
      stage: "sent",
    }),
    db.task.update({
      where: { id: input.lead.finance_contract_task_id },
      data: { status: "in_progress" },
    }),
  ]);
}

export async function markCommercialContractSigned(
  db: Db,
  input: {
    lead: LeadContractSnapshot;
    workspaceId: string;
    actorId: string;
    signedAt: Date;
  },
) {
  if (
    !input.lead.contract_handoff_task_id ||
    !input.lead.finance_contract_task_id
  ) {
    throw new Error("A preparação do contrato ainda não foi iniciada.");
  }
  const contractTask = await db.task.findUniqueOrThrow({
    where: { id: input.lead.contract_handoff_task_id },
    select: { id: true, project_id: true },
  });
  const existingCompany = await db.company.findFirst({
    where: {
      workspace_id: input.workspaceId,
      OR: [
        { name: { equals: input.lead.brand_name, mode: "insensitive" } },
        { main_contact_email: input.lead.owner_email },
        { billing_email: input.lead.owner_email },
      ],
    },
    orderBy: { created_at: "asc" },
    select: { id: true },
  });
  const services = Array.isArray(input.lead.contract_services)
    ? input.lead.contract_services
    : [];
  const companyData = {
    name: input.lead.brand_name,
    status: "active",
    commercial_status: "active",
    legal_name: input.lead.contract_legal_name ?? undefined,
    cnpj: input.lead.contract_cnpj ?? undefined,
    plan_name: input.lead.contract_plan ?? undefined,
    service_type: input.lead.company_type,
    included_services: services as Prisma.InputJsonValue,
    contract_value:
      input.lead.contract_monthly_fee === null ||
      input.lead.contract_monthly_fee === undefined
        ? undefined
        : Number(input.lead.contract_monthly_fee),
    billing_email: input.lead.owner_email,
    main_contact_email: input.lead.owner_email,
    phone: input.lead.whatsapp,
    whatsapp: input.lead.whatsapp,
    contract_start_date: input.signedAt,
  };
  const company = existingCompany
    ? await db.company.update({
        where: { id: existingCompany.id },
        data: companyData,
        select: { id: true },
      })
    : await db.company.create({
        data: {
          ...companyData,
          workspace_id: input.workspaceId,
          owner_id: input.lead.assignee_id,
        },
        select: { id: true },
      });

  await Promise.all([
    setCommercialContractStage(db, {
      workspaceId: input.workspaceId,
      projectId: contractTask.project_id,
      taskId: contractTask.id,
      stage: "signed",
    }),
    db.task.update({
      where: { id: input.lead.finance_contract_task_id },
      data: { status: "done", company_id: company.id },
    }),
    db.task.update({
      where: { id: input.lead.task_id },
      data: { company_id: company.id },
    }),
    db.task.update({
      where: { id: input.lead.contract_handoff_task_id },
      data: { company_id: company.id },
    }),
  ]);

  await ensureWorkspaceClientDirectories(db, {
    workspaceId: input.workspaceId,
    ownerId: input.lead.assignee_id,
  });
  await ensureSharedContractsRegistryProjects(db, {
    workspaceId: input.workspaceId,
    fallbackOwnerId: input.lead.assignee_id,
  });

  const onboarding = await createClientOnboardingRecordsForCompany(db, {
    companyId: company.id,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    services: services.filter(
      (service): service is string => typeof service === "string",
    ),
    expectedStartDate: input.signedAt,
    responsibleSalespersonId: input.lead.assignee_id,
    responsibleDepartmentName: "Comercial",
    source: "commercial_contract_signed",
  });

  return { company, onboarding };
}

export async function removeCommercialContractWorkflow(
  db: Db,
  input: {
    leadId: string;
    contractHandoffTaskId: string | null;
    financeContractTaskId: string | null;
  },
) {
  await db.commercialLead.update({
    where: { id: input.leadId },
    data: {
      contract_handoff_task_id: null,
      finance_contract_task_id: null,
      contract_cnpj: null,
      contract_legal_name: null,
      contract_plan: null,
      contract_services: Prisma.JsonNull,
      contract_monthly_fee: null,
      contract_confirmed_at: null,
    },
  });
  const rootTaskIds = input.contractHandoffTaskId
    ? [input.contractHandoffTaskId]
    : input.financeContractTaskId
      ? [input.financeContractTaskId]
      : [];
  if (rootTaskIds.length > 0) {
    await deleteTasksByIds(db, rootTaskIds);
  }
}
