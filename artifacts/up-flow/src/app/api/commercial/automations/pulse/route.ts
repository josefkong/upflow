import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { requireCurrentWorkspace } from "@/lib/api/scope";
import { runCommercialLeadAutomations } from "@/lib/commercial-lead-automation";
import { processOverdueEquipmentReturns } from "@/lib/equipment-control";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";

/**
 * Runs the same system-owned Commercial checks as the scheduled cron while a
 * workspace is actively open. This keeps localhost useful (where Vercel Cron
 * is absent) and shortens the confirmation delay in production without giving
 * the caller permission to advance any task manually.
 */
async function POST_handler() {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;

  const scope = await requireCurrentWorkspace(authResult.auth);
  if (!scope.ok) return scope.response;

  const [commercial, equipmentOverdue] = await Promise.all([
    runCommercialLeadAutomations({ workspaceId: scope.workspaceId }),
    processOverdueEquipmentReturns({ workspaceId: scope.workspaceId }),
  ]);

  return NextResponse.json({ ...commercial, equipment_overdue: equipmentOverdue }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = withErrorReporting(
  "api:commercial:automations:pulse:POST",
  POST_handler,
);
