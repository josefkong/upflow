import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { logError } from "@/lib/log-error";
import { prisma } from "@/lib/prisma";
import {
  formatBrazilianMobilePhone,
  formatPersonName,
  isPhoneLikeName,
  isValidBrazilianMobilePhone,
} from "@/lib/user-profile";
import { withErrorReporting } from "@/lib/with-error-reporting";

const UpdateProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("A valid email is required").max(320),
  phone: z.string().trim().min(1, "Phone is required").max(40),
});

async function GET_handler() {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const u = auth.prismaUser;
  return NextResponse.json({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    role: u.role,
    image: u.avatar_url ?? null,
    currentWorkspaceId: auth.currentWorkspaceId,
    currentRole: auth.currentRole,
    isSuperAdmin: isSuperAdmin(auth),
  });
}

async function PATCH_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;
  const u = auth.prismaUser;

  const body = await req.json().catch(() => ({}));
  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid profile update",
        issues: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  if (isPhoneLikeName(parsed.data.name)) {
    return NextResponse.json({ error: "Name cannot be a phone number" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const phone = formatBrazilianMobilePhone(parsed.data.phone);
  if (!isValidBrazilianMobilePhone(phone)) {
    return NextResponse.json(
      { error: "Phone must follow the format (XX) XXXXX-XXXX" },
      { status: 400 },
    );
  }
  const name = formatPersonName(parsed.data.name.trim());
  const emailChanged = email !== u.email.toLowerCase();

  if (emailChanged) {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== u.id) {
      return NextResponse.json({ error: "Email is already in use" }, { status: 409 });
    }
  }

  if (!auth.supabaseId.startsWith("test:")) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (emailChanged && (!supabaseUrl || !serviceRoleKey)) {
      return NextResponse.json(
        { error: "Supabase service role key is required to update login email" },
        { status: 503 },
      );
    }

    if (supabaseUrl && serviceRoleKey) {
      const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error } = await supabase.auth.admin.updateUserById(auth.supabaseId, {
        ...(emailChanged ? { email, email_confirm: true } : {}),
        user_metadata: { name, full_name: name, phone },
      });

      if (error) {
        logError("api:auth/me:supabase-update", error, {
          user_id: u.id,
          supabase_id: auth.supabaseId,
          email_changed: emailChanged,
        });
        if (emailChanged) {
          return NextResponse.json(
            { error: "Could not update the login email in Supabase Auth" },
            { status: 502 },
          );
        }
      }
    }
  }

  const updated = await prisma.user.update({
    where: { id: u.id },
    data: { name, email, phone },
  });

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone ?? null,
    role: updated.role,
    image: updated.avatar_url ?? null,
    currentWorkspaceId: auth.currentWorkspaceId,
    currentRole: auth.currentRole,
    isSuperAdmin: isSuperAdmin(auth),
  });
}

export const GET = withErrorReporting("api:auth/me:GET", GET_handler);
export const PATCH = withErrorReporting("api:auth/me:PATCH", PATCH_handler);
