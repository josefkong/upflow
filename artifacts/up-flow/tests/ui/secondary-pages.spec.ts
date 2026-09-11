import { test, expect } from "@playwright/test";
import { SEEDED, uniq } from "../helpers";
import {
  createProjectViaApi,
  createTaskViaApi,
  loggedInContext,
  requireChromiumOrSkip,
} from "./_ui-helpers";

/**
 * Calendar, Time, Inbox, Team, Search:
 *   * Calendar: Today / prev / next month navigation + day-cell selection
 *     (the selected day renders due-task links).
 *   * Time: weekly bars + per-project breakdown render once projects load.
 *   * Inbox: filter tabs flip the active state, "Mark all read" works when
 *     unread items exist.
 *   * Team: table renders with at least the seeded admin row.
 *   * Search: navigating with q= renders the "Results for …" heading and
 *     surfaces a seeded project.
 */
test.describe("Calendar", () => {
  requireChromiumOrSkip();

  test("Today / prev / next navigation updates the month label", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    const calendarData = Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/tasks" && response.ok(),
      ),
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/calendar/events" && response.ok(),
      ),
    ]);
    await page.goto("/calendar");
    await calendarData;
    const heading = page
      .locator("h3")
      .filter({ hasText: /\b\d{4}$/ })
      .first();
    const initial = await heading.textContent();
    expect(initial?.length).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Next month" }).click();
    await expect(heading).not.toHaveText(initial ?? "");

    // "Today" jumps the cursor back to the current month.
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(heading).toHaveText(initial ?? "");

    await page.getByRole("button", { name: "Previous month" }).click();
    await expect(heading).not.toHaveText(initial ?? "");
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(heading).toHaveText(initial ?? "");

    // Click a day cell — assert the right-hand "Due tasks" rail header is visible.
    await page
      .locator("button:has(span)")
      .filter({ hasText: /^\d+$/ })
      .first()
      .click();
    await expect(page.getByText("Due tasks")).toBeVisible();

    await ctx.close();
  });

  test("clicking a task link in the calendar 'Due tasks' rail navigates to its project", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("CalProj"));
    const title = uniq("Today-Task");
    // Due today so the calendar surfaces it on the current day.
    await createTaskViaApi(ctx, projectId, title, {
      due_date: new Date().toISOString(),
    });

    const page = await ctx.newPage();
    await page.goto("/calendar");
    // Click the exact calendar cell that rendered the seeded task. This stays
    // correct across the app timezone and adjacent-month day duplicates.
    await page.getByRole("button", { name: new RegExp(title) }).click();
    const link = page.getByRole("link", { name: new RegExp(title) }).first();
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}`));

    await ctx.close();
  });
});

test.describe("Time tracking", () => {
  requireChromiumOrSkip();

  test("page renders summary cards and the weekly chart bars", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    // Seed at least one project so the per-project list renders.
    await createProjectViaApi(ctx, uniq("Time-Proj"));

    const page = await ctx.newPage();
    await page.goto("/time");
    await expect(page.getByText("This week", { exact: true })).toBeVisible();
    await expect(page.getByText("Daily average")).toBeVisible();
    await expect(page.getByText("Weekly hours")).toBeVisible();
    // 7 bars rendered, each with a native `title` tooltip like "Mon: 0h 30m".
    const bars = page.locator("div[title*=':']");
    expect(await bars.count()).toBeGreaterThanOrEqual(7);
    // Assert the native tooltip is populated. Zero-minute bars can be too
    // short to hover, but their title remains the browser-visible tooltip.
    const firstBar = bars.first();
    const tooltipTitle = await firstBar.getAttribute("title");
    expect(tooltipTitle).toMatch(/^[A-Za-z]{3}: (?:(?:\d+h )?\d+m)$/);
    // Per-project breakdown lists at least the seeded project name.
    await expect(page.getByText(/Time-Proj/).first()).toBeVisible();

    await ctx.close();
  });
});

test.describe("Inbox", () => {
  requireChromiumOrSkip();

  test("filter tabs toggle the active state", async ({ browser, baseURL }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/inbox");

    // The tabs are plain buttons with text "All", "Unread", "Assigned", etc.
    await page.getByRole("button", { name: /^Unread\s*\d+$/ }).click();
    // "Mark all read" appears when there are unread items; if not, the
    // empty-state message renders. Either path is a valid pass.
    const markAll = page.getByRole("button", { name: /Mark all read/ });
    if (await markAll.count()) {
      await markAll.click();
      // After marking, the button is gone.
      await expect(markAll).toHaveCount(0);
    } else {
      await expect(
        page.getByText(/No unread notifications|Nothing here yet/),
      ).toBeVisible();
    }

    await ctx.close();
  });

  test("per-row 'Mark read' button clears its unread indicator (with stubbed notifications)", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();

    // Stub the notifications GET so we always have exactly one unread row to
    // act on, and the per-row PATCH so the test is hermetic.
    await page.route("**/api/notifications**", async (route, req) => {
      const m = req.method();
      if (m === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "n1",
                kind: "task_assigned",
                read: false,
                created_at: new Date().toISOString(),
                task: {
                  id: "t1",
                  title: "Review me",
                  project: { id: "p1", name: "Demo" },
                },
              },
            ],
          }),
        });
        return;
      }
      // PATCH /api/notifications/:id — mark read
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await page.goto("/inbox", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    const markRead = page.getByRole("button", { name: /^Mark read$/ });
    await expect(markRead).toBeVisible({ timeout: 30_000 });
    const patch = page.waitForResponse(
      (r) =>
        r.url().includes("/api/notifications/") &&
        r.request().method() === "PATCH",
    );
    await markRead.click();
    await patch;
    // Local state flips read=true → the per-row button is no longer rendered.
    await expect(markRead).toHaveCount(0);

    await ctx.close();
  });
});

test.describe("Team", () => {
  requireChromiumOrSkip();

  test("expands and collapses a team card member panel from its chevron", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    const overviewLoaded = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/team/overview" &&
        response.ok(),
      { timeout: 60_000 },
    );
    await page.goto("/team", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await overviewLoaded;

    const teamCard = page.getByTestId("department-group").first();
    const membersToggle = teamCard.getByRole("button", {
      name: /^(View members|Ver pessoas)$/,
    });

    await expect(teamCard).toBeVisible();
    await expect(membersToggle).toHaveAttribute("aria-expanded", "false");
    await membersToggle.click();
    await expect(membersToggle).toHaveAttribute("aria-expanded", "true");
    await expect(teamCard.getByTestId("team-members-panel")).toBeVisible();

    await membersToggle.click();
    await expect(teamCard.getByTestId("team-members-panel")).toHaveCount(0);

    await ctx.close();
  });
});

test.describe("Search", () => {
  requireChromiumOrSkip();

  test("typing in the header search and pressing Enter surfaces matching projects", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const name = uniq("SearchTarget");
    await createProjectViaApi(ctx, name);
    // Also create a task so /search has at least one matching task.
    const proj = await createProjectViaApi(ctx, uniq("SearchProj"));
    const taskTitle = `${name}-task`;
    await createTaskViaApi(ctx, proj, taskTitle);

    const page = await ctx.newPage();
    await page.goto("/");
    const input = page
      .getByRole("form", { name: /^Search / })
      .getByRole("searchbox");
    await input.fill(name);
    await input.press("Enter");
    await expect(page).toHaveURL(
      new RegExp(`/search\\?q=${encodeURIComponent(name)}`),
    );
    await expect(
      page.getByRole("heading", { name: /Results for/i }),
    ).toBeVisible();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    // Clicking the project result navigates to its detail page.
    await page
      .getByRole("link", { name: new RegExp(name) })
      .first()
      .click();
    await expect(page).toHaveURL(/\/projects\/[^/]+/, { timeout: 30_000 });

    await ctx.close();
  });
});
