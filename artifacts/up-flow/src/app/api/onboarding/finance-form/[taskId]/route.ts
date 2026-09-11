import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { recordActivity } from "@/lib/activity";
import { getOnboardingCompletionBlocker, loadOnboardingAccess, recomputeOnboardingProgress } from "@/lib/onboarding";
import { isFinanceOnboardingFormLocation } from "@/lib/onboarding-routing";
import { canReadProject } from "@/lib/project-access";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { canViewClientFinancials } from "@/lib/client-financial-access";

const FinanceSchema = z.object({
  legal_name: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  billing_email: z.string().optional().nullable(),
  main_contact_email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  billing_notes: z.string().optional().nullable(),
  contract_value: z.union([z.string(), z.number()]).optional().nullable(),
  payment_terms: z.string().optional().nullable(),
  contract_start_date: z.string().optional().nullable(),
  plan_name: z.string().optional().nullable(),
  service_type: z.string().optional().nullable(),
});

const PatchSchema = z.object({
  finance: FinanceSchema.optional(),
  complete: z.boolean().optional(),
});

function cleanText(value: string | null | undefined, max = 4_000) {
  const text = value?.trim();
  return text ? text.slice(0, max) : null;
}

function cleanDate(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = value
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function companyUpdateData(finance: z.infer<typeof FinanceSchema>) {
  const data: Record<string, string | number | Date | null> = {};
  if ("legal_name" in finance) data.legal_name = cleanText(finance.legal_name, 255);
  if ("cnpj" in finance) data.cnpj = cleanText(finance.cnpj, 64);
  if ("billing_email" in finance) data.billing_email = cleanText(finance.billing_email, 255);
  if ("main_contact_email" in finance) data.main_contact_email = cleanText(finance.main_contact_email, 255);
  if ("phone" in finance) data.phone = cleanText(finance.phone, 80);
  if ("whatsapp" in finance) data.whatsapp = cleanText(finance.whatsapp, 80);
  if ("address" in finance) data.address = cleanText(finance.address, 600);
  if ("billing_notes" in finance) data.billing_notes = cleanText(finance.billing_notes, 4_000);
  if ("contract_value" in finance) data.contract_value = cleanMoney(finance.contract_value);
  if ("payment_terms" in finance) data.payment_terms = cleanText(finance.payment_terms, 255);
  if ("contract_start_date" in finance) data.contract_start_date = cleanDate(finance.contract_start_date);
  if ("plan_name" in finance) data.plan_name = cleanText(finance.plan_name, 255);
  if ("service_type" in finance) data.service_type = cleanText(finance.service_type, 120);
  return data;
}

async function loadFinanceTask(taskId: string) {
  return prisma.onboardingChecklistItem.findFirst({
    where: { task_id: taskId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      task: {
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          project: {
            select: {
              id: true,
              name: true,
              workspace_id: true,
              owner_id: true,
              space: { select: { id: true, name: true } },
            },
          },
        },
      },
      onboarding: {
        include: {
          company: true,
          contracts: {
            orderBy: { uploaded_at: "desc" },
            include: { uploader: { select: { id: true, name: true, email: true } } },
          },
        },
      },
    },
  });
}

function responseBody(
  item: NonNullable<Awaited<ReturnType<typeof loadFinanceTask>>>,
  canEdit: boolean,
) {
  return {
    can_edit: canEdit,
    task: item.task
      ? {
          id: item.task.id,
          title: item.task.title,
          status: item.task.status,
          assignee: item.task.assignee,
          project: item.task.project,
        }
      : null,
    checklist_item: {
      id: item.id,
      title: item.title,
      status: item.status,
    },
    company: {
      id: item.onboarding.company.id,
      name: item.onboarding.company.name,
      legal_name: item.onboarding.company.legal_name,
      cnpj: item.onboarding.company.cnpj,
      billing_email: item.onboarding.company.billing_email,
      main_contact_email: item.onboarding.company.main_contact_email,
      phone: item.onboarding.company.phone,
      whatsapp: item.onboarding.company.whatsapp,
      address: item.onboarding.company.address,
      billing_notes: item.onboarding.company.billing_notes,
      contract_value: item.onboarding.company.contract_value,
      payment_terms: item.onboarding.company.payment_terms,
      contract_start_date: item.onboarding.company.contract_start_date,
      plan_name: item.onboarding.company.plan_name,
      service_type: item.onboarding.company.service_type,
    },
    onboarding: {
      id: item.onboarding.id,
      status: item.onboarding.status,
      progress: item.onboarding.progress,
      contracts: item.onboarding.contracts.map((contract) => ({
        id: contract.id,
        file_name: contract.file_name,
        created_at: contract.created_at,
        uploaded_at: contract.uploaded_at,
        uploader: contract.uploader,
      })),
    },
  };
}

async function getAccess(taskId: string) {
  const _r = await requireAuth();
  if (!_r.ok) return { ok: false as const, response: _r.response };
  const auth = _r.auth;

  const item = await loadFinanceTask(taskId);
  if (!item || !item.task) {
    return { ok: false as const, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  if (!(await canReadProject(auth, item.task.project)) && item.task.assignee_id !== auth.prismaUser.id) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const onboardingAccess = await loadOnboardingAccess(auth, item.onboarding_id);
  if (!onboardingAccess) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (
    !(await canViewClientFinancials(auth, item.task.project.workspace_id))
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  if (
    !isFinanceOnboardingFormLocation({
      checklistDepartment: item.department,
      projectSpaceName: item.task.project.space?.name,
    })
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Finance onboarding forms are only available from the Finance space." },
        { status: 409 },
      ),
    };
  }

  const canEdit = onboardingAccess.canWork && Boolean(
    onboardingAccess.admin ||
      item.task.assignee_id === auth.prismaUser.id ||
      item.owner_id === auth.prismaUser.id ||
      onboardingAccess.canUploadContract ||
      onboardingAccess.canUpdateChecklistItem(item),
  );

  return { ok: true as const, auth, item, canEdit };
}

async function GET_handler(
  _req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const access = await getAccess(params.taskId);
  if (!access.ok) return access.response;
  return NextResponse.json(responseBody(access.item, access.canEdit));
}

async function PATCH_handler(
  req: NextRequest,
  { params }: { params: { taskId: string } },
) {
  const access = await getAccess(params.taskId);
  if (!access.ok) return access.response;
  if (!access.canEdit) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const linkedTask = access.item.task;
  if (!linkedTask) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid finance onboarding form", issues: parsed.error.flatten() }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    if (parsed.data.finance) {
      await tx.company.update({
        where: { id: access.item.onboarding.company_id },
        data: companyUpdateData(parsed.data.finance),
      });
    }

    if (parsed.data.complete) {
      const blocker = await getOnboardingCompletionBlocker(tx, access.item.onboarding_id, {
        id: access.item.id,
        department: access.item.department,
        title: access.item.title,
        task_id: access.item.task_id,
      });
      if (blocker) return { blocker };
      await tx.task.update({
        where: { id: access.item.task_id ?? params.taskId },
        data: { status: "done" },
      });
      await tx.onboardingChecklistItem.update({
        where: { id: access.item.id },
        data: {
          status: "complete",
          completed_at: new Date(),
          completed_by: access.auth.prismaUser.id,
        },
      });
      await recomputeOnboardingProgress(tx, access.item.onboarding_id);
    } else {
      if (linkedTask.status === "todo") {
        await tx.task.update({
          where: { id: linkedTask.id },
          data: { status: "in_progress" },
        });
      }
      if (access.item.status === "pending") {
        await tx.onboardingChecklistItem.update({
          where: { id: access.item.id },
          data: { status: "in_progress" },
        });
      }
    }
    return { blocker: null };
  });

  if (result.blocker) {
    return NextResponse.json(
      { error: result.blocker },
      { status: 409 },
    );
  }

  await recordActivity({
    workspace_id: access.item.workspace_id,
    actor_id: access.auth.prismaUser.id,
    type: parsed.data.complete ? "client_finance_onboarding_completed" : "client_finance_onboarding_updated",
    entity_type: "client_onboarding",
    entity_id: access.item.onboarding_id,
    project_id: linkedTask.project_id,
    task_id: access.item.task_id,
    company_id: access.item.onboarding.company_id,
    metadata: {
      checklist_item_id: access.item.id,
      task_title: linkedTask.title,
    },
  });

  const updated = await loadFinanceTask(params.taskId);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(responseBody(updated, access.canEdit));
}

export const GET = withErrorReporting("api:onboarding/finance-form:GET", GET_handler);
export const PATCH = withErrorReporting("api:onboarding/finance-form:PATCH", PATCH_handler);
