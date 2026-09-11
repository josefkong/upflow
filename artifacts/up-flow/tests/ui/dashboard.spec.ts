import { test, expect, type Page } from "@playwright/test";
import { SEEDED, uniq } from "../helpers";
import {
  createProjectViaApi,
  createTaskViaApi,
  currentUserId,
  loggedInContext,
  requireChromiumOrSkip,
} from "./_ui-helpers";

async function openQuickCreate(
  page: Page,
  item: "Task" | "Project" | "Meeting" | "Company" | "Invite",
) {
  await page.getByRole("button", { name: "Quick create" }).click();
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/**
 * Main dashboard `/`:
 *   * Five quick-action buttons open their dialogs
 *   * Stat cards toggle the statusFilter (aria-pressed flips)
 *   * Task-row "Actions" menu: Mark done / Edit / Delete (with confirm)
 *   * Progress widget "New Task" button opens the New Task dialog
 *   * Happy-path create via New Project dialog produces a visible project
 */
test.describe("Dashboard quick actions and task rows", () => {
  requireChromiumOrSkip();

  test("each quick action opens its dialog", async ({ browser, baseURL }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");

    // New Project
    await openQuickCreate(page, "Project");
    await expect(
      page.getByRole("dialog", { name: "New Project" }),
    ).toBeVisible();
    await page.keyboard.press("Escape").catch(() => undefined);
    // Esc isn't wired on every dialog — explicitly Cancel.
    const cancel = page
      .getByRole("dialog", { name: "New Project" })
      .getByRole("button", {
        name: "Cancel",
      });
    if (await cancel.count()) await cancel.click();

    // New Task
    await openQuickCreate(page, "Task");
    await expect(page.getByRole("dialog", { name: "Create task" })).toBeVisible();
    await page
      .getByRole("dialog", { name: "Create task" })
      .getByRole("button", { name: "Cancel" })
      .click();

    // Invite / Schedule / Company — these are <form> overlays (no dialog
    // role) so we assert by the heading each renders, then Cancel out.
    const overlays: {
      trigger: "Invite" | "Meeting" | "Company";
      heading: string;
    }[] = [
      { trigger: "Invite", heading: "Invite to team" },
      { trigger: "Meeting", heading: "Schedule meeting" },
      { trigger: "Company", heading: "Create client" },
    ];
    for (const { trigger, heading } of overlays) {
      await openQuickCreate(page, trigger);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Cancel" }).first().click();
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeHidden();
    }

    await ctx.close();
  });

  test("each stat card opens an explicit filtered task drawer", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(
      page.locator('main[data-dashboard-ready="true"]'),
    ).toBeVisible();

    const cards: { status: string; heading: string }[] = [
      { status: "todo", heading: "Upcoming" },
      { status: "in_progress", heading: "In progress" },
      { status: "done", heading: "Completed" },
    ];
    for (const { status, heading } of cards) {
      const card = page.locator(`button[data-task-status="${status}"]`);
      await card.click();
      await expect(card).toHaveAttribute("aria-expanded", "true");
      const drawer = page.locator(`aside[aria-label="${heading} tasks"]`);
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Close task drawer" }).click();
      await expect(drawer).toBeHidden();
      await expect(card).toHaveAttribute("aria-expanded", "false");
    }

    await ctx.close();
  });

  test("Invite quick action submits emails and closes the form", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    // Stub the invites endpoint so the test doesn't depend on a real mail backend.
    await page.route("**/api/invites", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sent: 2 }),
      });
    });
    await page.goto("/");
    await openQuickCreate(page, "Invite");
    const heading = page.getByRole("heading", {
      name: "Invite to team",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await page
      .getByPlaceholder("alice@acme.com, bob@acme.com")
      .fill("a@x.com, b@x.com");
    const post = page.waitForResponse(
      (r) =>
        r.url().includes("/api/invites") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Send invites/ }).click();
    await post;
    await expect(heading).toBeHidden();

    await ctx.close();
  });

  test("Schedule Meeting quick action submits and closes the form", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    await openQuickCreate(page, "Meeting");
    const heading = page.getByRole("heading", {
      name: "Schedule meeting",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await page.getByPlaceholder("e.g. Sprint review").fill(uniq("Sprint"));
    // Pick the second color tag to exercise the color buttons.
    await page.getByRole("button", { name: "Color 2" }).click();
    await page.getByRole("button", { name: /^Schedule$/ }).click();
    await expect(heading).toBeHidden();

    await ctx.close();
  });

  test("Create a standalone client quick action submits and closes the form", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    await openQuickCreate(page, "Company");
    const heading = page.getByRole("heading", {
      name: "Create client",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await page.getByPlaceholder("Acme Corp").fill(uniq("Acme"));
    await page.getByPlaceholder("acme.com", { exact: true }).fill("acme.test");
    await page.getByRole("button", { name: /^Create client$/ }).click();
    await expect(heading).toBeHidden();

    await ctx.close();
  });

  test("task row 'Edit / details' menu item opens the task detail modal", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("Dash"));
    const title = uniq("Task-Edit");
    const assigneeId = await currentUserId(ctx);
    await createTaskViaApi(ctx, projectId, title, {
      due_date: new Date().toISOString(),
      priority: "high",
      assignee_id: assigneeId,
    });

    const page = await ctx.newPage();
    await page.goto("/");
    const section = page
      .locator("section", {
        has: page.getByRole("heading", { name: "Today focus" }),
      })
      .first();
    await section
      .getByRole("button", { name: new RegExp(`Actions for ${title}`) })
      .click();
    await page.getByRole("menuitem", { name: "Open", exact: true }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();

    await ctx.close();
  });

  test("creating a new project via the header dialog adds it to /projects", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    const name = uniq("UI-Proj");
    await page
      .getByRole("button", { name: /^New Project$/ })
      .first()
      .click();
    const dlg = page.getByRole("dialog", { name: "New Project" });
    await dlg.getByPlaceholder("e.g. Website Redesign").fill(name);
    await dlg.getByRole("button", { name: /Create Project/i }).click();
    await expect(dlg).toBeHidden({ timeout: 10_000 });

    await page.goto(`/projects?tab=internal&q=${encodeURIComponent(name)}`);
    await expect(page.locator("main").getByRole("link", { name, exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await ctx.close();
  });

  test("task row 'More' menu marks a task done and removes it from the upcoming list", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    // Seed a project + task for the admin so a row exists deterministically.
    const projectId = await createProjectViaApi(ctx, uniq("Dash"));
    const title = uniq("Task-MarkDone");
    const assigneeId = await currentUserId(ctx);
    await createTaskViaApi(ctx, projectId, title, {
      due_date: new Date().toISOString(),
      priority: "high",
      assignee_id: assigneeId,
    });

    const page = await ctx.newPage();
    await page.goto("/");
    const row = page
      .locator("section", {
        has: page.getByRole("heading", { name: "Today focus" }),
      })
      .first();
    await expect(row.getByText(title)).toBeVisible();

    await row
      .getByRole("button", { name: new RegExp(`Actions for ${title}`) })
      .click();
    await page.getByRole("menuitem", { name: "Done", exact: true }).click();

    await expect(row.getByText(title)).toBeHidden({ timeout: 10_000 });

    await ctx.close();
  });

  test("task row 'Delete' confirms via window.confirm and removes the row", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("Dash"));
    const title = uniq("Task-Delete");
    const assigneeId = await currentUserId(ctx);
    await createTaskViaApi(ctx, projectId, title, {
      due_date: new Date().toISOString(),
      priority: "high",
      assignee_id: assigneeId,
    });

    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept().catch(() => undefined));
    await page.goto("/");
    const section = page
      .locator("section", {
        has: page.getByRole("heading", { name: "Today focus" }),
      })
      .first();
    await expect(section.getByText(title)).toBeVisible();

    await section
      .getByRole("button", { name: new RegExp(`Actions for ${title}`) })
      .click();
    await page.getByRole("menuitem", { name: /^Delete$/ }).click();
    const detail = page.getByRole("dialog", { name: title });
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Delete task" }).click();

    await expect(section.getByText(title)).toBeHidden({ timeout: 10_000 });

    await ctx.close();
  });

  test("progress widget 'New Task' button opens the New Task dialog", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    // The progress widget's button is `+ New Task` (with leading icon). The
    // header's button is "+ New Project". Disambiguate by exact name match.
    await page
      .getByRole("button", { name: /^New task$/ })
      .first()
      .click();
    await expect(page.getByRole("dialog", { name: "Create task" })).toBeVisible();

    await ctx.close();
  });

  test("Create Task quick action happy-path: pick project, set title, submit", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    // Seed a project so the New Task dialog has a selectable project.
    const projectName = uniq("TaskHostProj");
    await createProjectViaApi(ctx, projectName);

    const page = await ctx.newPage();
    await page.goto("/");
    await openQuickCreate(page, "Task");
    const dlg = page.getByRole("dialog", { name: "Create task" });
    await expect(dlg).toBeVisible();

    const taskTitle = uniq("DashTask");
    await dlg
      .getByPlaceholder(
        "Example: Approve the Meta Ads creative set",
      )
      .fill(taskTitle);
    // The dialog has a "Project *" select — pick our seeded project.
    await dlg.locator("select").first().selectOption({ label: projectName });

    // Wait for the POST /api/tasks then for the dialog to dismiss.
    const post = page.waitForResponse(
      (r) =>
        r.url().includes("/api/tasks") &&
        r.request().method() === "POST" &&
        r.ok(),
    );
    await dlg.getByRole("button", { name: /Create task/i }).click();
    await post;
    await expect(dlg).toBeHidden({ timeout: 10_000 });

    await ctx.close();
  });

  test("quick-first task creator validates inline, preserves collapsed details, and protects drafts", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    await openQuickCreate(page, "Task");

    const creator = page.getByRole("dialog", { name: "Create task" });
    await creator.getByRole("button", { name: "Create task" }).click();
    await expect(creator.getByText("Title is required", { exact: true })).toBeVisible();
    await expect(creator.getByText("Choose a destination list.", { exact: true })).toBeVisible();

    await creator.getByLabel("Task title").fill("Review launch brief");
    await creator.getByText("Template details", { exact: true }).click();
    const objective = creator.getByLabel("Objective");
    await objective.fill("Confirm the launch is ready");
    await creator.getByText("Template details", { exact: true }).click();
    await creator.getByText("Template details", { exact: true }).click();
    await expect(objective).toHaveValue("Confirm the launch is ready");

    await page.keyboard.press("Escape");
    const discard = page.getByRole("dialog", { name: "Discard this task?" });
    await expect(discard).toBeVisible();
    await discard.getByRole("button", { name: "Keep editing" }).click();
    await expect(creator).toBeVisible();

    await page.keyboard.press("Escape");
    await page
      .getByRole("dialog", { name: "Discard this task?" })
      .getByRole("button", { name: "Discard task" })
      .click();
    await expect(creator).toBeHidden();

    await ctx.close();
  });
});
