import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { canManageEquipment, isEquipmentControlProject } from "@/lib/equipment-control";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { withErrorReporting } from "@/lib/with-error-reporting";

const BUCKET = process.env.TASK_ASSETS_BUCKET || "task-assets";
type RouteContext = {
  params: Promise<{ id: string; kind: string; index: string }>;
};

async function GET_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id, kind, index: rawIndex } = await params;
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || !["handover", "damage"].includes(kind)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const checkout = await prisma.equipmentCheckout.findUnique({
    where: { id },
    include: {
      project: {
        select: {
          name: true,
          workspace_id: true,
          space: { select: { name: true } },
        },
      },
    },
  });
  if (
    !checkout ||
    checkout.workspace_id !== auth.currentWorkspaceId ||
    !isEquipmentControlProject({
      projectName: checkout.project.name,
      spaceName: checkout.project.space?.name,
    })
  ) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isManager = canManageEquipment(auth, checkout.workspace_id);
  const isRequester = checkout.requester_id === auth.prismaUser.id;
  if (!isManager && !isRequester) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (kind === "handover" && !isManager && checkout.status === "requested") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (kind === "damage" && !isManager && !checkout.admin_return_confirmed_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const paths = kind === "handover"
    ? checkout.handover_photo_paths
    : checkout.damage_photo_paths;
  const path = paths[index];
  if (!path) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "A foto está temporariamente indisponível." },
      { status: 503 },
    );
  }
  return NextResponse.redirect(data.signedUrl, {
    status: 307,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
export const GET = withErrorReporting(
  "api:equipment/requests/id/photos/kind/index:GET",
  GET_handler,
);
