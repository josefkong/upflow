import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-response";
import { withErrorReporting } from "@/lib/with-error-reporting";

async function GET_handler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;
  void req;

  const notification = await prisma.notification.findUnique({
    where: { id },
    include: {
      task: {
        select: {
          id: true,
          title: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!notification) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (notification.user_id !== auth.prismaUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(notification);
}

async function PATCH_handler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (notification.user_id !== auth.prismaUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as { read?: boolean };
  const read = body.read ?? true;
  const data =
    notification.data &&
    typeof notification.data === "object" &&
    !Array.isArray(notification.data)
      ? (notification.data as Record<string, unknown>)
      : null;
  const calendarEventId =
    data?.source === "calendar_event_assigned" &&
    typeof data.calendar_event_id === "string"
      ? data.calendar_event_id
      : null;

  const acknowledged =
    read && calendarEventId
      ? await prisma.notification.updateMany({
          where: {
            user_id: auth.prismaUser.id,
            type: "assigned",
            read: false,
            data: { path: ["calendar_event_id"], equals: calendarEventId },
          },
          data: { read: true },
        })
      : await prisma.notification.updateMany({
          where: { id, user_id: auth.prismaUser.id },
          data: { read },
        });
  const updated = await prisma.notification.findUniqueOrThrow({
    where: { id },
  });

  return NextResponse.json({
    ...updated,
    acknowledged_count: acknowledged.count,
  });
}

async function DELETE_handler(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const { id } = await params;
  void req;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (notification.user_id !== auth.prismaUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.notification.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
export const GET = withErrorReporting("api:notifications/id:GET", GET_handler);
export const PATCH = withErrorReporting("api:notifications/id:PATCH", PATCH_handler);
export const DELETE = withErrorReporting("api:notifications/id:DELETE", DELETE_handler);
