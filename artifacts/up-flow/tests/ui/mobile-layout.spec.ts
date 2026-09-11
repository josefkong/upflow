import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { SEEDED, uniq } from "../helpers";
import {
  createProjectViaApi,
  createTaskViaApi,
  loggedInContext,
  requireChromiumOrSkip,
} from "./_ui-helpers";

const MOBILE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
];
const COLD_ROUTE_TIMEOUT = process.env.CI ? 60_000 : 30_000;

async function expectNoPageOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(
    scrollWidth,
    "page should not create horizontal document scroll",
  ).toBeLessThanOrEqual(innerWidth + 1);
}

async function expectFitsViewport(page: Page, selector: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} should be visible`).toBeTruthy();
  if (!box) return;
  const viewport = page.viewportSize();
  expect(viewport).toBeTruthy();
  if (!viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function createSpaceViaApi(
  ctx: BrowserContext,
  name: string,
): Promise<string> {
  const res = await ctx.request.post("/api/spaces", { data: { name } });
  expect(res.ok(), `create space failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

async function createFolderViaApi(
  ctx: BrowserContext,
  spaceId: string,
  name: string,
): Promise<string> {
  const res = await ctx.request.post("/api/folders", {
    data: { name, space_id: spaceId },
  });
  expect(res.ok(), `create folder failed: ${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  return body.id;
}

test.describe("Mobile responsive layout", () => {
  requireChromiumOrSkip();

  test("dashboard shell keeps sidebar toggle separate from search on mobile", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addCookies([
      {
        name: "upflow.sidebar.desktopOpen.v2",
        value: "1",
        url: baseURL!,
      },
    ]);
    const page = await ctx.newPage();
    const workspaceTreeRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/workspace-tree") {
        workspaceTreeRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");

    await expect(page.getByTestId("desktop-sidebar")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeVisible();
    const searchbox = page
      .getByRole("form", { name: /^Search / })
      .getByRole("searchbox");
    await expect(searchbox).toBeVisible();

    const button = await page
      .getByRole("button", { name: "Open navigation" })
      .boundingBox();
    const search = await searchbox.boundingBox();
    expect(button).toBeTruthy();
    expect(search).toBeTruthy();
    if (button && search) {
      expect(button.x + button.width).toBeLessThanOrEqual(search.x);
    }

    await expectNoPageOverflow(page);
    await page.waitForTimeout(150);
    expect(workspaceTreeRequests).toHaveLength(0);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    });
    await page.waitForTimeout(150);
    expect(workspaceTreeRequests).toHaveLength(0);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const navigationDialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(navigationDialog).toBeVisible();
    await expect(navigationDialog).toHaveCSS("width", "272px");
    await expect(navigationDialog.getByTestId("sidebar-panel")).toBeVisible();
    await expect(navigationDialog.getByTestId("sidebar-rail")).toHaveCount(0);
    const closeNavigation = navigationDialog.getByRole("button", {
      name: "Close navigation",
    });
    await expect(closeNavigation).toBeVisible();
    await expect(closeNavigation).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        page.evaluate(
          () => document.activeElement?.closest('[role="dialog"]')?.id ?? null,
        ),
      )
      .toBe("mobile-sidebar-dialog");
    await page.keyboard.press("Tab");
    await expect(closeNavigation).toBeFocused();
    await expectFitsViewport(page, "aside.fixed:visible");
    await page.keyboard.press("Escape");
    await expect(navigationDialog).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();

    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(navigationDialog).toBeVisible();
    await page.setViewportSize({ width: 1024, height: 844 });
    const desktopSidebar = page.getByTestId("desktop-sidebar");
    await expect(navigationDialog).toHaveCount(0);
    await expect(desktopSidebar).toBeVisible();
    await expect(
      desktopSidebar.getByRole("button", { name: "Hide sidebar" }),
    ).toBeFocused();
    await page.waitForTimeout(100);
    const desktopRequestBaseline = workspaceTreeRequests.length;
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    });
    await expect
      .poll(() => workspaceTreeRequests.length)
      .toBe(desktopRequestBaseline + 1);
    await page.waitForTimeout(150);
    expect(workspaceTreeRequests).toHaveLength(desktopRequestBaseline + 1);

    const dashboardLink = desktopSidebar.getByRole("link", {
      name: "Dashboard",
      exact: true,
    });
    await dashboardLink.focus();
    await expect(dashboardLink).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(desktopSidebar).toBeHidden();
    const navigationToggle = page.getByRole("button", {
      name: "Open navigation",
    });
    await expect(navigationToggle).toBeVisible();
    await expect(navigationToggle).toBeFocused();
    await expect(navigationDialog).toHaveCount(0);
    const mobileRequestBaseline = workspaceTreeRequests.length;
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    });
    await page.waitForTimeout(150);
    expect(workspaceTreeRequests).toHaveLength(mobileRequestBaseline);

    await navigationToggle.click();
    await expect(navigationDialog).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/calendar(?:\?|$)/),
      navigationDialog
        .getByTestId("sidebar-panel-navigation")
        .getByRole("link", { name: "Calendar", exact: true })
        .click(),
    ]);
    await expect(navigationToggle).toBeVisible();
    await expect(navigationToggle).not.toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("upflow.sidebar.desktopOpen.v2"),
        ),
      )
      .toBe("1");
    await expect
      .poll(async () =>
        (await ctx.cookies()).find(
          (cookie) => cookie.name === "upflow.sidebar.desktopOpen.v2",
        )?.value,
      )
      .toBe("1");

    await navigationToggle.focus();
    await expect(navigationToggle).toBeFocused();
    await page.setViewportSize({ width: 1024, height: 844 });
    await expect(
      page
        .getByTestId("desktop-sidebar")
        .getByRole("button", { name: "Hide sidebar" }),
    ).toBeFocused();
    await ctx.close();
  });

  test("primary dashboard routes do not create page-level horizontal overflow", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(180_000);
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(ctx, uniq("MobileProject"));
    await createTaskViaApi(ctx, projectId, uniq("MobileTask"));
    const spaceId = await createSpaceViaApi(ctx, uniq("MobileSpace"));
    const folderId = await createFolderViaApi(
      ctx,
      spaceId,
      uniq("MobileFolder"),
    );

    const companyRes = await ctx.request.post("/api/companies", {
      data: {
        name: uniq("MobileClient"),
        service_type: "Creative",
        plan_name: "Growth",
      },
    });
    const company = companyRes.ok()
      ? ((await companyRes.json()) as { id: string })
      : null;

    const routes = [
      "/",
      "/team",
      "/projects",
      `/projects/${projectId}`,
      "/calendar",
      "/clients",
      company ? `/clients/${company.id}` : null,
      `/spaces/${spaceId}`,
      `/folders/${folderId}`,
      "/time",
      "/inbox",
    ].filter(Boolean) as string[];

    for (const viewport of MOBILE_VIEWPORTS) {
      const page = await ctx.newPage();
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route, {
          waitUntil: "domcontentloaded",
          timeout: 60_000,
        });
        await expect(page.locator("body")).toBeVisible();
        await expectNoPageOverflow(page);
      }
      await page.close();
    }

    await ctx.close();
  });

  test("project board and task sheet remain usable on phone-sized screens", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const projectId = await createProjectViaApi(
      ctx,
      uniq("MobileBoardProject"),
    );
    const taskTitle = uniq("MobileBoardTask");
    await createTaskViaApi(ctx, projectId, taskTitle);

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    const tasksLoaded = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.pathname === "/api/tasks" &&
          url.searchParams.get("project_id") === projectId &&
          response.ok()
        );
      },
      { timeout: COLD_ROUTE_TIMEOUT },
    );
    const usersLoaded = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return url.pathname === "/api/users" && response.ok();
      },
      { timeout: COLD_ROUTE_TIMEOUT },
    );
    await page.goto(`/projects/${projectId}`, {
      waitUntil: "domcontentloaded",
      timeout: COLD_ROUTE_TIMEOUT,
    });
    // The project page does not publish its task state until the follow-up users
    // request has completed, so wait for both parts of its loadData sequence.
    await Promise.all([tasksLoaded, usersLoaded]);
    await expectNoPageOverflow(page);

    const boardButton = page.getByRole("button", { name: /Board/i }).first();
    if (await boardButton.isVisible().catch(() => false)) {
      await boardButton.click();
    }

    await expect(page.getByText(taskTitle).first()).toBeVisible();
    await expectNoPageOverflow(page);
    await page.getByText(taskTitle).first().click();

    const taskWorkspace = page.getByTestId("task-detail-workspace");
    await expect(taskWorkspace).toBeVisible();
    await expect(
      page.locator(`input[value="${taskTitle}"]`).first(),
    ).toBeVisible();
    await taskWorkspace.getByRole("tab", { name: "Activity" }).click();
    await expect(taskWorkspace.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expectFitsViewport(page, '[data-testid="task-detail-workspace"]');
    await expectNoPageOverflow(page);
    await ctx.close();
  });

  test("global create and invite dialogs fit inside mobile viewport", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    await page
      .getByRole("button", { name: /^New Project$/ })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "New Project" }),
    ).toBeVisible();
    await expectFitsViewport(page, '[role="dialog"]');
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.goto("/team");
    await page.getByRole("button", { name: /Invite users/i }).first().click();
    await expect(
      page.getByRole("heading", {
        name: "Invite real users to Up Flow",
        level: 2,
      }),
    ).toBeVisible();
    await expectFitsViewport(page, "form:has(h2)");
    await ctx.close();
  });

  test("project contributors dialog wraps controls without horizontal overflow", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addInitScript(() => {
      localStorage.setItem("upflow.language", "pt-BR");
    });
    const projectId = await createProjectViaApi(
      ctx,
      uniq("ResponsiveContributorsProject"),
    );
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1024, height: 640 });
    await page.goto(`/projects/${projectId}`, {
      waitUntil: "domcontentloaded",
      timeout: COLD_ROUTE_TIMEOUT,
    });

    const manageContributors = page.getByRole("button", {
      name: "Gerenciar colaboradores",
    });
    await expect(manageContributors).toBeVisible({ timeout: COLD_ROUTE_TIMEOUT });
    const membersLoaded = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.pathname === `/api/projects/${projectId}/members` && response.ok()
        );
      },
      { timeout: COLD_ROUTE_TIMEOUT },
    );
    await manageContributors.click();
    await membersLoaded;

    const dialog = page.getByTestId("project-members-dialog");
    await expect(dialog).toBeVisible();
    await expectFitsViewport(page, '[data-testid="project-members-dialog"]');
    await expect(
      dialog.getByRole("button", { name: "Adicionar colaborador" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      )
      .toBe(true);
    await expectNoPageOverflow(page);
    await ctx.close();
  });
});
