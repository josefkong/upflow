import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canAccessWorkspace } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { broadcastNotification } from "@/lib/supabase-server";
import { buildPage, parsePagination } from "@/lib/pagination";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { canContributeToProject } from "@/lib/project-access";
import {
  extractLegacyCommentMentions,
  hasVisibleMention,
  isUuid,
  normalizeCommentBody,
  normalizeCommentThread,
} from "@/lib/comment-mentions";

async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("task_id");
  if (!taskId)
    return NextResponse.json({ error: "task_id required" }, { status: 400 });

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { project: { select: { workspace_id: true } } },
  });
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessWorkspace(auth, task.project.workspace_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { limit, cursor } = parsePagination(req, {
    defaultLimit: 100,
    maxLimit: 500,
  });

  const rows = await prisma.comment.findMany({
    where: { task_id: taskId, parent_id: null },
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    include: {
      author: { select: { id: true, name: true, email: true } },
      replies: {
        include: { author: { select: { id: true, name: true } } },
        orderBy: { created_at: "asc" },
      },
    },
  });

  return NextResponse.json(buildPage(rows.map(normalizeCommentThread), limit));
}

async function POST_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  const body = (await req.json()) as {
    task_id?: string;
    body?: string;
    parent_id?: string;
    mention_ids?: unknown;
  };
  const { task_id, body: commentBody, parent_id } = body;

  if (!task_id || typeof commentBody !== "string" || !commentBody.trim()) {
    return NextResponse.json(
      { error: "task_id and body are required" },
      { status: 400 },
    );
  }

  if (
    body.mention_ids !== undefined &&
    (!Array.isArray(body.mention_ids) ||
      body.mention_ids.length > 50 ||
      body.mention_ids.some((id) => typeof id !== "string" || !isUuid(id)))
  ) {
    return NextResponse.json(
      { error: "mention_ids must contain up to 50 user IDs" },
      { status: 400 },
    );
  }

  const task = await prisma.task.findUnique({
    where: { id: task_id },
    select: {
      id: true,
      title: true,
      assignee_id: true,
      followers: { select: { user_id: true } },
      project: { select: { id: true, workspace_id: true, owner_id: true } },
    },
  });
  if (!task)
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parent_id) {
    const parent = await prisma.comment.findUnique({
      where: { id: parent_id },
      select: { task_id: true },
    });
    if (!parent || parent.task_id !== task_id) {
      return NextResponse.json(
        { error: "Reply parent must belong to the same task" },
        { status: 400 },
      );
    }
  }

  const rawCommentBody = commentBody.trim();
  const storedCommentBody = normalizeCommentBody(rawCommentBody);
  const legacyMentions = extractLegacyCommentMentions(rawCommentBody);
  const pickerMentionIds = new Set(body.mention_ids as string[] | undefined);
  const mentionedUserIds = new Set<string>();
  const idCandidates = new Set([
    ...legacyMentions.userIds,
    ...pickerMentionIds,
  ]);

  // New clients send mention IDs separately while keeping the comment itself
  // readable as @Name. Older UUID markup and @email mentions remain supported.
  if (idCandidates.size > 0 || legacyMentions.emails.size > 0) {
    const members = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: task.project.workspace_id,
        status: "active",
        OR: [
          ...(idCandidates.size > 0
            ? [{ user_id: { in: [...idCandidates] } }]
            : []),
          ...(legacyMentions.emails.size > 0
            ? [{ user: { email: { in: [...legacyMentions.emails] } } }]
            : []),
        ],
      },
      select: { user_id: true, user: { select: { name: true, email: true } } },
    });

    for (const member of members) {
      const selectedInPicker =
        pickerMentionIds.has(member.user_id) &&
        hasVisibleMention(storedCommentBody, member.user.name);
      const mentionedByLegacyToken = legacyMentions.userIds.has(member.user_id);
      const mentionedByEmail = member.user.email
        ? legacyMentions.emails.has(member.user.email.toLowerCase())
        : false;
      if (
        member.user_id !== auth.prismaUser.id &&
        (selectedInPicker || mentionedByLegacyToken || mentionedByEmail)
      ) {
        mentionedUserIds.add(member.user_id);
      }
    }
  }

  const excerpt = storedCommentBody.slice(0, 140);
  const assigneeId = task.assignee_id;
  const assigneeMentioned = assigneeId
    ? mentionedUserIds.has(assigneeId)
    : false;
  const notificationRecipients = new Set<string>();
  const followerIds = task.followers
    .map((follower) => follower.user_id)
    .filter(
      (userId) =>
        userId !== auth.prismaUser.id && !mentionedUserIds.has(userId),
    );

  // Keep the comment and its notifications consistent: a successful response
  // means every validated recipient has an inbox notification to receive.
  const comment = await prisma.$transaction(async (tx) => {
    const createdComment = await tx.comment.create({
      data: {
        task_id,
        body: storedCommentBody,
        author_id: auth.prismaUser.id,
        parent_id: parent_id || null,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
        replies: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { created_at: "asc" },
        },
      },
    });

    if (assigneeId && assigneeId !== auth.prismaUser.id && !assigneeMentioned) {
      await tx.notification.create({
        data: { type: "commented", user_id: assigneeId, task_id },
      });
      notificationRecipients.add(assigneeId);
    }

    for (const followerId of followerIds) {
      if (notificationRecipients.has(followerId)) continue;
      await tx.notification.create({
        data: {
          type: "commented",
          user_id: followerId,
          task_id,
          data: {
            source: "task_follower_comment",
            comment_id: createdComment.id,
            comment_excerpt: excerpt,
            actor_id: auth.prismaUser.id,
            actor_name: auth.prismaUser.name,
            task_title: task.title,
          },
        },
      });
      notificationRecipients.add(followerId);
    }

    for (const recipientId of mentionedUserIds) {
      await tx.notification.create({
        data: {
          type: "mentioned",
          user_id: recipientId,
          task_id,
          data: {
            comment_id: createdComment.id,
            comment_excerpt: excerpt,
            actor_id: auth.prismaUser.id,
            actor_name: auth.prismaUser.name,
            task_title: task.title,
          },
        },
      });
      notificationRecipients.add(recipientId);
    }

    return createdComment;
  });

  // The notification rows are already committed above. Realtime is only a
  // prompt for an open browser: the recipient also receives the durable inbox
  // entry through Postgres changes and polling. Never make a person wait for
  // that network round-trip before their comment can be posted.
  for (const recipientId of notificationRecipients) {
    void broadcastNotification(recipientId);
  }

  return NextResponse.json(comment, { status: 201 });
}

export const GET = withErrorReporting("api:comments:GET", GET_handler);
export const POST = withErrorReporting("api:comments:POST", POST_handler);
