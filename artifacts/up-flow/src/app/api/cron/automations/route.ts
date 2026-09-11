import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutomationRules } from "@/lib/automation-runner";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { runCommercialLeadAutomations } from "@/lib/commercial-lead-automation";
import { processCalendarEventReminders } from "@/lib/calendar-notifications";

export const dynamic = "force-dynamic";

async function GET_handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Cron secret is not configured" }, { status: 503 });
  }
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const dayKey = now.toISOString().slice(0, 10);
  const calendarReminders = await processCalendarEventReminders(now);
  const workspaces = await prisma.workspace.findMany({
    take: 50,
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      members: {
        where: { status: "active", role: { in: ["owner", "admin"] } },
        select: { user_id: true },
        take: 1,
      },
    },
  });

  const results = [];
  for (const workspace of workspaces) {
    const actorId = workspace.members[0]?.user_id;
    if (!actorId) {
      results.push({ workspace_id: workspace.id, skipped: true, reason: "No active owner/admin" });
      continue;
    }
    results.push({
      workspace_id: workspace.id,
      result: {
        rules: await runAutomationRules({
          workspaceId: workspace.id,
          actorId,
          now,
          dedupePrefix: `cron:${dayKey}`,
        }),
        commercial_leads: await runCommercialLeadAutomations({ workspaceId: workspace.id, now }),
      },
    });
  }

  return NextResponse.json({
    ran_at: now.toISOString(),
    workspace_count: workspaces.length,
    calendar_reminders: calendarReminders,
    results,
  });
}

export const GET = withErrorReporting("api:cron/automations:GET", GET_handler);
