import { test, expect } from "@playwright/test";
import { SEEDED, uniq } from "../helpers";
import {
  createProjectViaApi,
  createTaskViaApi,
  currentUserId,
  loggedInContext,
  requireChromiumOrSkip,
} from "./_ui-helpers";

/**
 * Projects index + project detail page coverage:
 *   * /projects: client-first directory tabs, URL-backed filters,
 *     keyboard-accessible actions, and the header New Project dialog.
 *   * /projects/[id]: ProjectToolbar (list/board toggle, search filter,
 *     filter popover, group/sort dropdowns, column toggle), kanban DnD
 *     (via keyboard sensor — hello-pangea/dnd supports space + arrows),
 *     task detail sheet (open from list, edit, close).
 */
test.describe("Projects index", () => {
  requireChromiumOrSkip();

  test("header '+ New Project' button on /projects opens the New Project dialog", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/projects");
    await page
      .getByRole("button", { name: /^New Project$/ })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "New Project" }),
    ).toBeVisible();
    await page
      .getByRole("dialog", { name: "New Project" })
      .getByRole("button", { name: "Cancel" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "New Project" }),
    ).toBeHidden();

    await ctx.close();
  });

  test("directory tabs, URL filters, and project action menu work", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const name = uniq("MoveProj");
    await createProjectViaApi(ctx, name);

    const page = await ctx.newPage();
    await page.goto("/projects?tab=internal&q=" + encodeURIComponent(name));
    await expect(page.getByRole("tab", { name: /Internal/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByPlaceholder(/Search by project/)).toHaveValue(name);

    const row = page.locator("[data-project-id]").filter({ hasText: name });
    await expect(row).toBeVisible();
    await row.getByLabel(`Actions for ${name}`).click();
    await row.getByRole("button", { name: /^Move$/ }).click();
    const dialog = page.getByRole("dialog", { name: "Move project" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(name, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.reload();
    await expect(page.getByPlaceholder(/Search by project/)).toHaveValue(name);
    await expect(row).toBeVisible();

    await ctx.close();
  });

  test("client directory shows one expandable client for projects across the workspace", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const companyName = uniq("DirectoryClient");
    const companyResponse = await ctx.request.post("/api/companies", {
      data: { name: companyName },
    });
    expect(companyResponse.ok()).toBeTruthy();
    const company = (await companyResponse.json()) as { id: string };
    const firstProject = uniq("ClientProjectOne");
    const secondProject = uniq("ClientProjectTwo");
    await createProjectViaApi(ctx, firstProject, { company_id: company.id });
    await createProjectViaApi(ctx, secondProject, { company_id: company.id });

    const page = await ctx.newPage();
    await page.goto(`/projects?q=${encodeURIComponent(companyName)}`);
    const clientGroup = page.getByRole("button", { name: new RegExp(companyName) });
    await expect(clientGroup).toHaveCount(1);
    if ((await clientGroup.getAttribute("aria-expanded")) !== "true") {
      await clientGroup.click();
    }
    await expect(clientGroup).toHaveAttribute("aria-expanded", "true");
    const directory = page.locator("main");
    await expect(directory.locator("[data-project-id]").filter({ hasText: firstProject })).toBeVisible();
    await expect(directory.locator("[data-project-id]").filter({ hasText: secondProject })).toBeVisible();

    await ctx.close();
  });
});

test.describe("Project detail page (toolbar + kanban + list + task sheet)", () => {
  requireChromiumOrSkip();

  test("bulk selection deletes all visible matching tasks in one action", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("BulkDeleteProj"));
    const matchingOne = uniq("BulkTarget-One");
    const matchingTwo = uniq("BulkTarget-Two");
    const keepTitle = uniq("Keep-Task");
    await createTaskViaApi(ctx, projectId, matchingOne);
    await createTaskViaApi(ctx, projectId, matchingTwo);
    await createTaskViaApi(ctx, projectId, keepTitle);

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);
    await page.getByPlaceholder("Search tasks...").fill("BulkTarget");
    await page.getByRole("button", { name: "Select tasks" }).click();
    await page.getByRole("button", { name: /Select all visible \(2\)/ }).click();
    await expect(page.getByText("Selected tasks: 2")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete selected" }).click();
    await expect(page.getByText("Tasks deleted: 2")).toBeVisible();

    await page.getByPlaceholder("Search tasks...").fill("");
    await expect(page.getByText(matchingOne)).toBeHidden();
    await expect(page.getByText(matchingTwo)).toBeHidden();
    await expect(page.getByText(keepTitle)).toBeVisible();

    await ctx.close();
  });

  test("toolbar list/board toggle and inline search filter work end-to-end", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("ToolbarProj"));
    const keepTitle = uniq("KEEP");
    const dropTitle = uniq("DROP");
    await createTaskViaApi(ctx, projectId, keepTitle);
    await createTaskViaApi(ctx, projectId, dropTitle);

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText(keepTitle)).toBeVisible();
    await expect(page.getByText(dropTitle)).toBeVisible();

    // List → Board toggle: kanban renders three columns. Header text is
    // "To Do" / "In Progress" / "Done" (uppercase is CSS only).
    await page.getByRole("button", { name: /^Board$/ }).click();
    await expect(page.locator("[data-kanban-column='todo']")).toBeVisible();
    await expect(
      page.locator("[data-kanban-column='in_progress']"),
    ).toBeVisible();
    await expect(page.locator("[data-kanban-column='done']")).toBeVisible();

    // Back to list and use the toolbar's inline search to filter.
    await page.getByRole("button", { name: /^List$/ }).click();
    await page.getByPlaceholder("Search tasks...").fill(keepTitle);
    // The toolbar search filters in the board view too; reapply.
    await page.getByRole("button", { name: /^Board$/ }).click();
    await expect(page.getByText(keepTitle)).toBeVisible();
    await expect(page.getByText(dropTitle)).toBeHidden();

    await ctx.close();
  });

  test("Kanban status navigation scrolls the selected column into view", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("KanbanScrollProj"));
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: /^Board$/ }).click();

    const board = page.locator("[data-kanban-scroll-container]");
    const doneNavigation = page.locator("[data-kanban-scroll-target='done']");
    await expect(board).toBeVisible();
    await expect(doneNavigation).toBeVisible();
    await doneNavigation.click();

    await expect(doneNavigation).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(() => board.evaluate((element) => element.scrollLeft))
      .toBeGreaterThan(0);
    await expect(page.locator("[data-kanban-column='done']")).toHaveAttribute(
      "data-kanban-active",
      "true",
    );

    await ctx.close();
  });

  test("group/sort/filter/columns toolbar controls open their menus", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("MenusProj"));
    await createTaskViaApi(ctx, projectId, uniq("T"), { priority: "high" });

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);

    // Group menu.
    await page.getByRole("button", { name: /^Group:/ }).click();
    await page.getByRole("button", { name: "Priority", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /^Group: Priority$/ }),
    ).toBeVisible();

    // Sort menu.
    await page.getByRole("button", { name: /^Sort:/ }).click();
    await page.getByRole("button", { name: "Due date", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /^Sort: Due date$/ }),
    ).toBeVisible();

    // Filter popover.
    await page.getByRole("button", { name: /^Filter$/ }).click();
    await page.getByRole("button", { name: "High", exact: true }).click();
    // A filter is now active — the button counter renders "1".
    await expect(
      page.getByRole("button", { name: /Filter\s*1/ }).first(),
    ).toBeVisible();

    // Columns dropdown.
    await page.getByRole("button", { name: /^Columns$/ }).click();
    await expect(page.getByRole("button", { name: "Assignee" })).toBeVisible();

    await ctx.close();
  });

  test("custom fields wraps cleanly instead of overlapping task-toolbar controls", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("ToolbarAlignmentProj"));
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1024, height: 900 });
    await page.goto(`/projects/${projectId}`);

    const toolbar = page.getByTestId("project-toolbar");
    const customFields = page.getByTestId("project-toolbar-custom-fields");
    const showClosed = page.getByRole("button", { name: /^Show closed$/ });
    const selectTasks = page.getByRole("button", { name: /^Select tasks$/ });

    await expect(toolbar).toBeVisible();
    await expect(customFields).toBeVisible();
    await expect(showClosed).toBeVisible();
    await expect(selectTasks).toBeVisible();

    const [toolbarBox, showClosedBox, selectTasksBox, customFieldsBox] =
      await Promise.all([
        toolbar.boundingBox(),
        showClosed.boundingBox(),
        selectTasks.boundingBox(),
        customFields.boundingBox(),
      ]);
    expect(toolbarBox).not.toBeNull();
    expect(showClosedBox).not.toBeNull();
    expect(selectTasksBox).not.toBeNull();
    expect(customFieldsBox).not.toBeNull();

    expect(
      (customFieldsBox?.x ?? 0) + (customFieldsBox?.width ?? 0),
    ).toBeLessThanOrEqual((toolbarBox?.x ?? 0) + (toolbarBox?.width ?? 0) + 1);

    expect(
      await toolbar.evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);

    for (const controlBox of [showClosedBox, selectTasksBox]) {
      const overlaps = !(
        (customFieldsBox?.x ?? 0) >=
          (controlBox?.x ?? 0) + (controlBox?.width ?? 0) ||
        (controlBox?.x ?? 0) >=
          (customFieldsBox?.x ?? 0) + (customFieldsBox?.width ?? 0) ||
        (customFieldsBox?.y ?? 0) >=
          (controlBox?.y ?? 0) + (controlBox?.height ?? 0) ||
        (controlBox?.y ?? 0) >=
          (customFieldsBox?.y ?? 0) + (customFieldsBox?.height ?? 0)
      );
      expect(overlaps).toBe(false);
    }

    await ctx.close();
  });

  test("toolbar 'Show closed' and sort-direction buttons toggle their state", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("MiscProj"));
    const done = uniq("Done-Task");
    await createTaskViaApi(ctx, projectId, done, { status: "done" });
    const open = uniq("Open-Task");
    await createTaskViaApi(ctx, projectId, open);

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);

    // By default "Show closed" is off — the done task is hidden.
    await expect(page.getByText(open)).toBeVisible();
    await expect(page.getByText(done)).toBeVisible();
    await page.getByRole("button", { name: /^Show closed$/ }).click();
    await expect(page.getByText(done)).toBeHidden();
    await page.getByRole("button", { name: /^Show closed$/ }).click();
    await expect(page.getByText(done)).toBeVisible();

    // Sort direction button is a single-char "↑"/"↓" button with a tooltip.
    const sortDir = page.getByRole("button", {
      name: /^Sort (asc|desc)ending$/,
    });
    const initialTitle = await sortDir.getAttribute("title");
    await sortDir.click();
    await expect(sortDir).not.toHaveAttribute("title", initialTitle ?? "");

    await ctx.close();
  });

  test("kanban drag-and-drop keeps workflow-controlled tasks in place", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("DnDProj"));
    const title = uniq("Drag-Me");
    await createTaskViaApi(ctx, projectId, title);

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);
    await page.getByRole("button", { name: /^Board$/ }).click();

    // Find the draggable card. @hello-pangea/dnd renders the drag handle
    // with data-rfd-drag-handle-draggable-id on the element with the
    // tabIndex; targeting that element directly avoids accidental focus on
    // a child node and makes the keyboard sensor reliable.
    const handle = page
      .locator(`[data-rfd-drag-handle-draggable-id]`)
      .filter({ hasText: title })
      .first();
    await expect(handle).toBeVisible();
    await handle.focus();

    // Keyboard sensor: Space lifts, ArrowRight moves between columns,
    // Space drops.
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Space");
    await expect(
      page.getByText(
        "Task stages move automatically when their workflow rules are completed.",
      ),
    ).toBeVisible();

    // Reload and confirm the attempted manual movement was not persisted.
    await page.reload();
    await page.getByRole("button", { name: /^Board$/ }).click();
    const todoDroppable = page.locator(
      "[data-rfd-droppable-id='todo']",
    );
    await expect(todoDroppable.getByText(title)).toBeVisible({
      timeout: 10_000,
    });

    await ctx.close();
  });

  test("full task workspace: edits title, status, priority, due date and posts a comment", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const mentionedCtx = await loggedInContext(browser, baseURL, SEEDED.member.email);
    const mentionedUserId = await currentUserId(mentionedCtx);
    const projectId = await createProjectViaApi(ctx, uniq("SheetProj"));
    const title = uniq("Sheet-Task");
    const taskId = await createTaskViaApi(ctx, projectId, title);

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);
    await page.getByText(title).first().click();

    // The detail opens as an accessible, focused task hub with one section navigation.
    const taskWorkspace = page.getByTestId("task-detail-workspace");
    await expect(taskWorkspace).toBeVisible();
    await expect(taskWorkspace).toHaveAttribute("role", "dialog");
    await expect(taskWorkspace.getByTestId("task-detail-main")).toBeVisible();
    await expect(taskWorkspace.getByRole("tablist", { name: "Task sections" })).toBeVisible();

    // Editable title input pre-populated with the task title.
    const titleInput = page.locator(`input[value="${title}"]`).first();
    await expect(titleInput).toBeVisible();

    // Helper: PATCH /api/tasks/:id awaiter.
    const awaitTaskPatch = () =>
      page.waitForResponse(
        (r) =>
          /\/api\/tasks\/[^/]+$/.test(r.url()) &&
          r.request().method() === "PATCH" &&
          r.ok(),
      );

    // 1) Title edit.
    let p = awaitTaskPatch();
    await titleInput.fill(`${title}-EDITED`);
    await titleInput.blur();
    await p;

    // 2) Status select → "in_progress".
    p = awaitTaskPatch();
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="todo"]') })
      .first()
      .selectOption("in_progress");
    await p;

    // 3) Priority select → "high".
    p = awaitTaskPatch();
    await page
      .locator("select")
      .filter({ has: page.locator('option[value="low"]') })
      .first()
      .selectOption("high");
    await p;

    // 4) Due date input (yyyy-mm-dd).
    const dueDate = new Date(Date.now() + 7 * 86400_000);
    const due = [
      String(dueDate.getDate()).padStart(2, "0"),
      String(dueDate.getMonth() + 1).padStart(2, "0"),
      dueDate.getFullYear(),
    ].join("/");
    p = awaitTaskPatch();
    const dueInput = page.getByPlaceholder("dd/mm/aaaa").first();
    await dueInput.fill(due);
    await dueInput.blur();
    await p;

    // 4b) Searchable assignee combobox → first active member.
    const assigneeCombobox = page
      .getByRole("combobox", { name: /Assignee:/i })
      .first();
    await assigneeCombobox.click();
    const firstActiveMember = page.locator("[cmdk-item]:visible").first();
    await expect(firstActiveMember).toBeVisible();
    p = awaitTaskPatch();
    await firstActiveMember.click();
    await p;

    // 5) Comment post — switch to the Comments section and submit. /api/comments
    await taskWorkspace.getByRole("tab", { name: "Comments" }).click();    // POSTs and the input clears.
    const commentInput = page.getByPlaceholder("Add a comment...");
    await expect(commentInput).toBeVisible();

    // Selecting a teammate must add readable text only. IDs travel in the
    // request payload, never in the text a person sees or edits.
    const mentionPicker = page.getByRole("combobox", {
      name: "Mention teammate",
    });
    await expect(mentionPicker).toBeVisible();
    const mentionedOption = mentionPicker.locator(
      `option[value="${mentionedUserId}"]`,
    );
    await expect(mentionedOption).toBeAttached();
    const mentionText = (await mentionedOption.textContent())?.trim();
    expect(mentionText).toMatch(/^@.+/);
    await mentionPicker.selectOption(mentionedUserId);
    await expect(commentInput).not.toHaveValue(/@\[/);
    await expect(commentInput).not.toHaveValue(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    await expect(commentInput).toHaveValue(/^@.+\s$/);
    await expect(commentInput).toBeFocused();
    const commentPost = page.waitForResponse(
      (r) =>
        r.url().includes("/api/comments") && r.request().method() === "POST",
    );
    await page.keyboard.type("Looks good to me");
    await page.keyboard.press("Enter");
    const commentResponse = await commentPost;
    expect(commentResponse.ok()).toBeTruthy();
    const payload = commentResponse.request().postDataJSON() as {
      body: string;
      mention_ids: string[];
    };
    expect(payload.body).toBe(`${mentionText} Looks good to me`);
    expect(payload.body).not.toMatch(/@\[/);
    expect(payload.body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(payload.mention_ids).toEqual([mentionedUserId]);
    const createdComment = (await commentResponse.json()) as { body: string };
    expect(createdComment.body).toBe(payload.body);
    await expect(commentInput).toHaveValue("");
    const mentionNotifications = await mentionedCtx.request.get("/api/notifications");
    expect(mentionNotifications.ok()).toBeTruthy();
    const notificationPage = (await mentionNotifications.json()) as {
      items: Array<{ type: string; task?: { id: string } | null }>;
    };
    expect(notificationPage.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mentioned",
          task: expect.objectContaining({ id: taskId }),
        }),
      ]),
    );

    // 6) Close the full workspace — Escape restores the project surface.
    await page.keyboard.press("Escape");
    await expect(taskWorkspace).toBeHidden();

    await ctx.close();
    await mentionedCtx.close();
  });

  test("list-view inline custom-field editor PUTs the value to /api/tasks/:id/custom-fields", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("CFProj"));
    const taskTitle = uniq("CF-Task");
    await createTaskViaApi(ctx, projectId, taskTitle);

    // Seed a text custom-field definition on this project (admin endpoint).
    const fieldName = "Notes";
    const defRes = await ctx.request.post(
      `/api/projects/${projectId}/custom-fields`,
      {
        data: { name: fieldName, type: "text" },
      },
    );
    expect(defRes.ok()).toBeTruthy();

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText(taskTitle)).toBeVisible();
    await page.getByRole("button", { name: /^List$/ }).click();

    // Make the Notes column visible (Columns dropdown lists custom fields too).
    await page.getByRole("button", { name: /^Columns$/ }).click();
    const colToggle = page.getByRole("button", { name: fieldName });
    if ((await colToggle.getAttribute("aria-pressed")) === "false") {
      await colToggle.click();
    }
    await page.keyboard.press("Escape").catch(() => undefined);

    // The text custom-field renders an <input>. Hover the row, fill, blur,
    // and assert the PUT to /api/tasks/:id/custom-fields fires.
    const taskRow = page
      .locator("div.grid.items-center")
      .filter({ has: page.getByText(taskTitle, { exact: true }) })
      .last();
    await taskRow.hover();
    const cfInput = taskRow.getByRole("textbox", { name: fieldName });
    const put = page.waitForResponse(
      (r) =>
        /\/api\/tasks\/[^/]+\/custom-fields/.test(r.url()) &&
        r.request().method() === "PUT",
    );
    await cfInput.fill("hello world");
    await cfInput.blur();
    await put;

    await ctx.close();
  });

  test("list-view group collapse hides its tasks and completion checkbox toggles status", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("ListGroupProj"));
    const title = uniq("Group-Task");
    await createTaskViaApi(ctx, projectId, title);

    const page = await ctx.newPage();
    await page.goto(`/projects/${projectId}`);
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole("button", { name: /^List$/ }).click();

    // The list groups by status by default; use the group's accessible toggle
    // instead of relying on the surrounding layout or button order.
    await page.getByRole("button", { name: /Collapse To Do/i }).click();
    await expect(page.getByText(title)).toBeHidden();
    await page.getByRole("button", { name: /Expand To Do/i }).click();
    await expect(page.getByText(title)).toBeVisible();

    // Completion checkbox: each row has a circular toggle with title="Toggle complete".
    // Clicking it PATCHes status → "done".
    const patch = page.waitForResponse(
      (r) =>
        /\/api\/tasks\/[^/]+$/.test(r.url()) &&
        r.request().method() === "PATCH" &&
        r.ok(),
    );
    const taskRow = page
      .locator("div.grid.items-center")
      .filter({ has: page.getByText(title, { exact: true }) })
      .last();
    await taskRow.locator('button[title="Completed"]').click();
    await patch;

    await ctx.close();
  });
});
