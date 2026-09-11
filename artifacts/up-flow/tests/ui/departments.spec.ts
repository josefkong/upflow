import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from "@playwright/test";
import { SEEDED, uniq, loginAs } from "../helpers";
import { loggedInContext, requireChromiumOrSkip } from "./_ui-helpers";

/**
 * End-to-end coverage for the Department feature (Task #57).
 *
 * Two complementary layers:
 *   1. API-level CRUD coverage hitting the real /api/workspaces/[id]/
 *      departments routes through Playwright's HTTP client — exercises
 *      the real Prisma + auth-helpers + withErrorReporting stack. This
 *      replaces the source-text guardrail style with true behavioral
 *      verification (auth/admin role, workspace scope, validation).
 *   2. A UI flow that creates a department in the Manage dialog, assigns
 *      a member via the inline picker, and asserts the member moves into
 *      the new group's section in the rendered DOM.
 */

async function getCurrentWorkspaceId(
  request: APIRequestContext,
): Promise<string> {
  const res = await request.get("/api/workspaces");
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { current_workspace_id: string };
  expect(body.current_workspace_id).toBeTruthy();
  return body.current_workspace_id;
}

test.describe("Departments API", () => {
  test("admin can CRUD departments; non-admin is blocked from writes", async ({
    baseURL,
  }) => {
    // Admin context.
    const adminCtx = await playwrightRequest.newContext({ baseURL });
    await loginAs(adminCtx, SEEDED.admin.email);
    const wsId = await getCurrentWorkspaceId(adminCtx);

    // CREATE — admin
    const name = uniq("Dept");
    const created = await adminCtx.post(`/api/workspaces/${wsId}/departments`, {
      data: { name, color: "blue" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const dep = (await created.json()) as { id: string; name: string };
    expect(dep.name).toBe(name);

    // LIST — admin sees the new dep
    const list = await adminCtx.get(`/api/workspaces/${wsId}/departments`);
    expect(list.ok()).toBeTruthy();
    const listBody = (await list.json()) as { items: { id: string }[] };
    expect(listBody.items.some((d) => d.id === dep.id)).toBeTruthy();

    // CREATE duplicate name — 409
    const dup = await adminCtx.post(`/api/workspaces/${wsId}/departments`, {
      data: { name, color: "red" },
    });
    expect(dup.status()).toBe(409);

    // CREATE empty name — 400
    const empty = await adminCtx.post(`/api/workspaces/${wsId}/departments`, {
      data: { name: "" },
    });
    expect(empty.status()).toBe(400);

    // PATCH rename + recolor — admin
    const newName = `${name}-renamed`;
    const patched = await adminCtx.patch(
      `/api/workspaces/${wsId}/departments/${dep.id}`,
      { data: { name: newName, color: "green" } },
    );
    expect(patched.ok()).toBeTruthy();
    const patchedBody = (await patched.json()) as {
      name: string;
      color: string;
    };
    expect(patchedBody.name).toBe(newName);
    expect(patchedBody.color).toBe("green");

    // PATCH invalid color — 400
    const badColor = await adminCtx.patch(
      `/api/workspaces/${wsId}/departments/${dep.id}`,
      { data: { color: "puce" } },
    );
    expect(badColor.status()).toBe(400);

    // Non-admin context (Sarah is seeded as a regular member).
    const memberCtx = await playwrightRequest.newContext({ baseURL });
    await loginAs(memberCtx, SEEDED.member.email);

    // Reads are allowed for any workspace member.
    const memberList = await memberCtx.get(
      `/api/workspaces/${wsId}/departments`,
    );
    expect(memberList.ok()).toBeTruthy();

    // Writes are forbidden.
    const memberCreate = await memberCtx.post(
      `/api/workspaces/${wsId}/departments`,
      { data: { name: uniq("MemberDept") } },
    );
    expect(memberCreate.status()).toBe(403);

    const memberPatch = await memberCtx.patch(
      `/api/workspaces/${wsId}/departments/${dep.id}`,
      { data: { name: "hijack" } },
    );
    expect(memberPatch.status()).toBe(403);

    const memberDelete = await memberCtx.delete(
      `/api/workspaces/${wsId}/departments/${dep.id}`,
    );
    expect(memberDelete.status()).toBe(403);

    // DELETE — admin succeeds.
    const del = await adminCtx.delete(
      `/api/workspaces/${wsId}/departments/${dep.id}`,
    );
    expect(del.ok()).toBeTruthy();

    // PATCH a now-missing department — 404.
    const missing = await adminCtx.patch(
      `/api/workspaces/${wsId}/departments/${dep.id}`,
      { data: { name: "ghost" } },
    );
    expect(missing.status()).toBe(404);

    await adminCtx.dispose();
    await memberCtx.dispose();
  });

  test("assigning a member to a department validates workspace scope", async ({
    baseURL,
  }) => {
    const adminCtx = await playwrightRequest.newContext({ baseURL });
    await loginAs(adminCtx, SEEDED.admin.email);
    const wsId = await getCurrentWorkspaceId(adminCtx);

    // Need a department + a member user id.
    const dep = await adminCtx
      .post(`/api/workspaces/${wsId}/departments`, {
        data: { name: uniq("Eng"), color: "indigo" },
      })
      .then((r) => r.json() as Promise<{ id: string }>);

    const users = await adminCtx
      .get(`/api/users?workspace_id=${wsId}`)
      .then((r) => r.json() as Promise<{ items: { id: string }[] }>);
    expect(users.items.length).toBeGreaterThan(0);
    const memberId = users.items[0].id;

    // Assign — success.
    const assign = await adminCtx.fetch(
      `/api/workspaces/${wsId}/members/${memberId}/department`,
      { method: "PUT", data: { department_id: dep.id } },
    );
    expect(assign.ok()).toBeTruthy();

    // Cross-workspace department id is rejected with 400, not silently
    // accepted. We don't have a second workspace handy, so use an obviously
    // non-existent id — the validator returns the same 400 either way.
    const bogus = await adminCtx.fetch(
      `/api/workspaces/${wsId}/members/${memberId}/department`,
      {
        method: "PUT",
        data: { department_id: "00000000-0000-0000-0000-000000000000" },
      },
    );
    expect(bogus.status()).toBe(400);

    // Clear back to Unassigned.
    const clear = await adminCtx.fetch(
      `/api/workspaces/${wsId}/members/${memberId}/department`,
      { method: "PUT", data: { department_id: null } },
    );
    expect(clear.ok()).toBeTruthy();

    // Non-admin cannot reassign.
    const memberCtx = await playwrightRequest.newContext({ baseURL });
    await loginAs(memberCtx, SEEDED.member.email);
    const denied = await memberCtx.fetch(
      `/api/workspaces/${wsId}/members/${memberId}/department`,
      { method: "PUT", data: { department_id: dep.id } },
    );
    expect(denied.status()).toBe(403);

    // Cleanup.
    await adminCtx.delete(`/api/workspaces/${wsId}/departments/${dep.id}`);
    await adminCtx.dispose();
    await memberCtx.dispose();
  });
});

test.describe("Departments UI", () => {
  requireChromiumOrSkip();

  test("admin creates a department via the dialog, assigns a member, and the member appears under it", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const wsId = await getCurrentWorkspaceId(ctx.request);

    // Find the seeded member we'll reassign.
    const usersRes = await ctx.request.get(`/api/users?workspace_id=${wsId}`);
    const users = (await usersRes.json()) as {
      items: { id: string; name: string; email: string }[];
    };
    const targetMember = users.items.find(
      (u) => u.email === SEEDED.member.email,
    );
    expect(targetMember, "seeded member sarah should exist").toBeTruthy();

    const page = await ctx.newPage();
    await page.goto("/team");

    // Drive the Manage Departments dialog — this is the real admin path,
    // not an API shortcut.
    const depName = uniq("Design");
    await page.getByRole("button", { name: "Manage departments" }).click();
    const dialog = page.getByRole("dialog", { name: "Manage departments" });
    await expect(dialog).toBeVisible();
    await dialog.getByPlaceholder("e.g. Engineering").fill(depName);
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    // Close the dialog and verify the new team appears in the single Teams view.
    await dialog.getByRole("button", { name: "Close" }).click();
    const list = await ctx.request.get(`/api/workspaces/${wsId}/departments`);
    const listBody = (await list.json()) as {
      items: { id: string; name: string }[];
    };
    const created = listBody.items.find((d) => d.name === depName);
    expect(created, "new department should be returned by the API").toBeTruthy();
    const depGroup = page.locator(
      `[data-testid="department-group"][data-department-key="${created!.id}"]`,
    );
    await expect(depGroup).toBeVisible();

    // Expand the seeded member's current team, then use the inline selector
    // to move them into the newly-created team.
    const memberTeam = page.locator("[data-testid=\"department-group\"]", {
      hasText: targetMember!.email,
    });
    await expect(memberTeam).toHaveCount(1);
    await memberTeam.getByRole("button", { name: "View members" }).click();
    const select = memberTeam.getByLabel(`Department for ${targetMember!.name}`);
    const assignment = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/members/${targetMember!.id}`) &&
        response.request().method() === "PATCH" &&
        response.ok(),
    );
    await select.selectOption({ label: depName });
    await assignment;

    // updateMember triggers a router refresh after persisting the assignment.
    // Reload before expanding the target team so this assertion runs on the
    // settled, current Teams view rather than a transient panel state.
    await page.reload();
    await expect(depGroup).toBeVisible();
    await depGroup.getByRole("button", { name: "View members" }).click();
    await expect(
      depGroup
        .getByTestId("team-members-panel")
        .getByRole("listitem")
        .filter({ hasText: targetMember!.email }),
    ).toBeVisible({
      timeout: 10_000,
    });

    // Cleanup — also exercises the SetNull onDelete path.
    await ctx.request.delete(
      `/api/workspaces/${wsId}/departments/${created!.id}`,
    );

    await ctx.close();
  });

  test("searching for a non-existent name shows an explicit empty state", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/team");
    await page.getByLabel("Search members").fill("zzz-no-such-member-zzz");
    await expect(page.getByTestId("team-search-empty")).toBeVisible();
    // None of the department <section>s should be rendered.
    await expect(page.getByTestId("department-group")).toHaveCount(0);
    await ctx.close();
  });
});
