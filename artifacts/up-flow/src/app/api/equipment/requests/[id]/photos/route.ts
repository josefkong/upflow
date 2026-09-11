import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { canManageEquipment, isEquipmentControlProject } from "@/lib/equipment-control";
import { MAX_EQUIPMENT_EVIDENCE_PHOTOS } from "@/lib/equipment-request-options";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { withErrorReporting } from "@/lib/with-error-reporting";

const MAX_IMAGE_BYTES = 5_000_000;
const BUCKET = process.env.TASK_ASSETS_BUCKET || "task-assets";

type EvidenceKind = "handover" | "damage";
type ImageType = "image/png" | "image/jpeg" | "image/webp";
type RouteContext = { params: Promise<{ id: string }> };

function imageTypeFromBytes(bytes: Buffer): ImageType | null {
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) return "image/webp";
  return null;
}

function extensionFor(type: ImageType) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;

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
  if (!canManageEquipment(auth, checkout.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  if (kind !== "handover" && kind !== "damage") {
    return NextResponse.json({ error: "Tipo de evidência inválido." }, { status: 400 });
  }
  const evidenceKind: EvidenceKind = kind;
  if (
    (evidenceKind === "handover" && checkout.status !== "requested") ||
    (evidenceKind === "damage" && checkout.status !== "return_requested")
  ) {
    return NextResponse.json(
      { error: "As fotos não podem ser alteradas nesta etapa." },
      { status: 409 },
    );
  }

  const files = (form?.getAll("files") ?? []).filter(
    (entry): entry is File => entry instanceof File,
  );
  const existing = evidenceKind === "handover"
    ? checkout.handover_photo_paths
    : checkout.damage_photo_paths;
  if (
    files.length === 0 ||
    existing.length + files.length > MAX_EQUIPMENT_EVIDENCE_PHOTOS
  ) {
    return NextResponse.json(
      { error: `Envie entre 1 e ${MAX_EQUIPMENT_EVIDENCE_PHOTOS - existing.length} fotos.` },
      { status: 400 },
    );
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  ) {
    return NextResponse.json(
      { error: "O armazenamento privado de evidências não está configurado." },
      { status: 503 },
    );
  }

  const uploads: Array<{ path: string; bytes: Buffer; type: ImageType }> = [];
  for (const file of files) {
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Cada foto deve ter no máximo 5 MB." },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = imageTypeFromBytes(bytes);
    if (!type) {
      return NextResponse.json(
        { error: "Envie fotos PNG, JPG ou WebP válidas." },
        { status: 400 },
      );
    }
    uploads.push({
      bytes,
      type,
      path: `${checkout.workspace_id}/equipment-checkouts/${checkout.id}/${evidenceKind}/${Date.now()}-${randomUUID()}.${extensionFor(type)}`,
    });
  }

  const supabase = getSupabaseAdminClient();
  const uploadedPaths: string[] = [];
  for (const upload of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(
      upload.path,
      upload.bytes,
      { contentType: upload.type, cacheControl: "3600", upsert: false },
    );
    if (error) {
      if (uploadedPaths.length) {
        await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
      }
      return NextResponse.json(
        { error: "Não foi possível armazenar as fotos. Tente novamente." },
        { status: 503 },
      );
    }
    uploadedPaths.push(upload.path);
  }

  try {
    const paths = [...existing, ...uploadedPaths];
    await prisma.equipmentCheckout.update({
      where: { id: checkout.id },
      data: evidenceKind === "handover"
        ? { handover_photo_paths: paths }
        : { damage_photo_paths: paths },
    });
    return NextResponse.json({ count: paths.length });
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage.from(BUCKET).remove(uploadedPaths).catch(() => undefined);
    }
    throw error;
  }
}

export const POST = withErrorReporting(
  "api:equipment/requests/id/photos:POST",
  POST_handler,
);
