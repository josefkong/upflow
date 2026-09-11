import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { requireCurrentWorkspace, requireWorkspaceAdmin } from "@/lib/api/scope";
import { runAutomationRules } from "@/lib/automation-runner";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { runCommercialLeadAutomations } from "@/lib/commercial-lead-automation";

export const dynamic = "force-dynamic";

async function POST_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const scope = await requireCurrentWorkspace(auth);
  if (!scope.ok) return scope.response;
  const admin = requireWorkspaceAdmin(auth, scope.workspaceId);
  if (!admin.ok) return admin.response;

  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  const result = await runAutomationRules({
    workspaceId: scope.workspaceId,
    actorId: auth.prismaUser.id,
    dryRun: body.dryRun ?? false,
  });

  return NextResponse.json({
    ...result,
    commercial_leads: body.dryRun
      ? { skipped: true, reason: "dry_run" }
      : await runCommercialLeadAutomations({ workspaceId: scope.workspaceId }),
  });
}

export const POST = withErrorReporting("api:automations/run:POST", POST_handler);
