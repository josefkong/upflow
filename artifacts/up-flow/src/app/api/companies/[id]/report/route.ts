import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { parseDateParam, startOfWeekMonday } from "@/lib/time-range";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";
import {
  CLIENTS_REGISTRY_CONTEXT_PARAM,
  canViewClientFinancialsInContext,
  redactClientFinancials,
} from "@/lib/client-financial-access";

export const dynamic = "force-dynamic";

function formatMinutes(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}

async function GET_handler(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  if (!auth.currentWorkspaceId) {
    return NextResponse.json({ error: "No active workspace" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const defaultFrom = startOfWeekMonday();
  const defaultTo = new Date(defaultFrom);
  defaultTo.setDate(defaultFrom.getDate() + 7);
  const from = parseDateParam(searchParams.get("from")) ?? defaultFrom;
  const to = parseDateParam(searchParams.get("to")) ?? defaultTo;
  if (to <= from) {
    return NextResponse.json(
      { error: "Report end date must be after start date" },
      { status: 400 },
    );
  }

  const company = await prisma.company.findFirst({
    where: { id: params.id, workspace_id: auth.currentWorkspaceId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      contacts: { orderBy: [{ created_at: "desc" }, { id: "asc" }] },
      projects: {
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          status: true,
          due_date: true,
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!company)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  const financialsVisible = await canViewClientFinancialsInContext(
    auth,
    auth.currentWorkspaceId,
    searchParams.get(CLIENTS_REGISTRY_CONTEXT_PARAM),
  );

  const [tasks, meetings, timeEntries, notes, activity, reportHistory] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          project: { workspace_id: auth.currentWorkspaceId },
          AND: [
            {
              OR: [
                { company_id: company.id },
                { project: { company_id: company.id } },
              ],
            },
            {
              OR: [
                { created_at: { gte: from, lt: to } },
                { due_date: { gte: from, lt: to } },
              ],
            },
          ],
        },
        orderBy: [{ due_date: "asc" }, { created_at: "desc" }, { id: "asc" }],
        include: {
          assignee: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          workspace_id: auth.currentWorkspaceId,
          company_id: company.id,
          starts_at: { gte: from, lt: to },
        },
        orderBy: [{ starts_at: "asc" }, { id: "asc" }],
        include: {
          attendees: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.timeEntry.findMany({
        where: {
          workspace_id: auth.currentWorkspaceId,
          project: { company_id: company.id },
          started_at: { gte: from, lt: to },
        },
        orderBy: [{ started_at: "desc" }, { id: "asc" }],
        include: {
          user: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
          task: { select: { id: true, title: true } },
        },
      }),
      prisma.companyNote.findMany({
        where: {
          workspace_id: auth.currentWorkspaceId,
          company_id: company.id,
          created_at: { gte: from, lt: to },
        },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        include: { author: { select: { id: true, name: true, email: true } } },
      }),
      prisma.activityEvent.findMany({
        where: {
          workspace_id: auth.currentWorkspaceId,
          company_id: company.id,
          created_at: { gte: from, lt: to },
        },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        include: { actor: { select: { id: true, name: true, email: true } } },
        take: 100,
      }),
      prisma.clientReport.findMany({
        where: {
          workspace_id: auth.currentWorkspaceId,
          company_id: company.id,
        },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        take: 10,
        include: {
          author: { select: { id: true, name: true, email: true } },
          approver: { select: { id: true, name: true, email: true } },
          sender: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

  const openTasks = tasks.filter((task) => task.status !== "done");
  const completedTasks = tasks.filter((task) => task.status === "done");
  const overdueTasks = openTasks.filter(
    (task) => task.due_date && task.due_date < new Date(),
  );
  const trackedSeconds = timeEntries.reduce(
    (sum, entry) => sum + timeEntryDurationSeconds(entry),
    0,
  );
  const nextDeadline =
    openTasks
      .map((task) => task.due_date)
      .filter((date): date is Date => Boolean(date))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const riskReasons = [
    ...(company.contacts.length === 0 ? ["No contacts registered"] : []),
    ...(company.projects.length === 0 ? ["No linked projects"] : []),
    ...(financialsVisible && company.contract_value == null
      ? ["No contract value"]
      : []),
    ...(overdueTasks.length > 0
      ? [
          `${overdueTasks.length} overdue open task${overdueTasks.length === 1 ? "" : "s"}`,
        ]
      : []),
  ];

  const markdown = [
    `# ${company.name} client report`,
    `Period: ${from.toISOString()} to ${to.toISOString()}`,
    "",
    `## Snapshot`,
    `- Status: ${company.status}`,
    `- Plan: ${company.plan_name ?? "Not set"}`,
    `- Service type: ${company.service_type ?? "Not set"}`,
    ...(financialsVisible
      ? [
          `- Contract value: ${company.contract_value ?? "Not set"}`,
          `- Commission: ${company.commission ?? "Not set"}`,
        ]
      : []),
    `- Tracked time: ${formatMinutes(trackedSeconds)}`,
    `- Open tasks: ${openTasks.length}`,
    `- Completed tasks: ${completedTasks.length}`,
    `- Meetings: ${meetings.length}`,
    `- Next deadline: ${nextDeadline ? nextDeadline.toISOString() : "Not set"}`,
    "",
    `## Risk`,
    riskReasons.length > 0
      ? riskReasons.map((reason) => `- ${reason}`).join("\n")
      : "- No current risk signals from available records.",
    "",
    `## Recent activity`,
    activity.length > 0
      ? activity
          .slice(0, 10)
          .map((event) => `- ${event.type} by ${event.actor?.name ?? "System"}`)
          .join("\n")
      : "- No activity in this report period.",
  ].join("\n");

  return NextResponse.json({
    company: redactClientFinancials(company, financialsVisible),
    financials_visible: financialsVisible,
    period: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      open_tasks: openTasks.length,
      completed_tasks: completedTasks.length,
      overdue_tasks: overdueTasks.length,
      meetings: meetings.length,
      tracked_seconds: trackedSeconds,
      next_deadline: nextDeadline,
      risk_reasons: riskReasons,
    },
    tasks,
    meetings,
    time_entries: timeEntries,
    notes,
    activity,
    report_history: reportHistory,
    markdown,
  });
}

export const GET = withErrorReporting(
  "api:companies/id/report:GET",
  GET_handler,
);
