import { test, expect } from "@playwright/test";
import { SEEDED, uniq } from "../helpers";
import {
  loggedInContext,
  openCommandPalette,
  requireChromiumOrSkip,
} from "./_ui-helpers";

/** Controls that live on every dashboard page. */
test.describe("Global chrome", () => {
  requireChromiumOrSkip();

  test("sidebar rail nav routes to each section and marks the active link", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addCookies([
      {
        name: "upflow.sidebar.desktopOpen.v1",
        value: "1",
        url: baseURL!,
      },
    ]);
    const page = await ctx.newPage();
    await page.goto("/");
    const desktopSidebar = page.getByTestId("desktop-sidebar");
    const rail = page.getByTestId("sidebar-rail-navigation");
    await expect(desktopSidebar).toBeVisible();
    await expect(rail).toBeVisible();

    const sections: { label: string; path: string }[] = [
      { label: "Projects", path: "/projects" },
      { label: "Calendar", path: "/calendar" },
      { label: "Inbox", path: "/inbox" },
      { label: "Time tracking", path: "/time" },
      { label: "Team", path: "/team" },
    ];

    for (const { label, path } of sections) {
      const link = rail.getByRole("link", { name: label, exact: true });
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`), {
        timeout: 30_000,
      });
      await expect(link).toHaveAttribute("aria-current", "page");
    }

    const dash = rail.getByRole("link", { name: "Dashboard", exact: true });
    await dash.click();
    await expect(page).toHaveURL(/\/$/, { timeout: 30_000 });
    await expect(dash).toHaveAttribute("aria-current", "page");

    const help = page.getByRole("link", { name: "Help", exact: true });
    await expect(help).toHaveCount(1);
    await help.click();
    await expect(page).toHaveURL(/\/docs$/, { timeout: 30_000 });

    const sidebarRail = desktopSidebar.getByTestId("desktop-sidebar-rail");
    const sidebarPanel = desktopSidebar.getByTestId("desktop-sidebar-panel");
    const panelToggle = desktopSidebar.getByTestId("sidebar-panel-toggle");
    const main = page.locator("main");
    const mainWithSidebarBox = await main.boundingBox();
    expect(mainWithSidebarBox).not.toBeNull();

    await panelToggle.click();
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(sidebarRail).toBeVisible();
    await expect(sidebarPanel).toBeHidden();
    await expect(sidebarPanel).toHaveCSS("width", "0px");
    await expect(sidebarPanel).toHaveCSS("opacity", "0");
    await expect(sidebarPanel).toHaveAttribute("aria-hidden", "true");
    await expect(sidebarPanel).toHaveAttribute("inert", "");
    await expect(panelToggle).toHaveAccessibleName("Show sidebar");
    await expect(panelToggle).toHaveAttribute(
      "aria-controls",
      "desktop-sidebar-panel",
    );
    await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
    await expect(panelToggle).toBeFocused();

    const mainWithoutSidebarBox = await main.boundingBox();
    expect(mainWithoutSidebarBox).not.toBeNull();
    expect(mainWithoutSidebarBox!.x).toBeLessThan(mainWithSidebarBox!.x);
    expect(mainWithoutSidebarBox!.width).toBeGreaterThan(
      mainWithSidebarBox!.width,
    );

    await panelToggle.press("Enter");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "336px");
    await expect(sidebarPanel).toBeVisible();
    await expect(sidebarPanel).toHaveAttribute("aria-hidden", "false");
    await expect(sidebarPanel).not.toHaveAttribute("inert", "");
    await expect(rail).toBeVisible();
    await expect(panelToggle).toHaveAccessibleName("Hide sidebar");
    await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
    await expect(panelToggle).toBeFocused();

    await ctx.close();
  });

  test("collapsed desktop panel restores with the keyboard and keeps translated rail labels readable", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addCookies([
      {
        name: "upflow.sidebar.desktopOpen.v1",
        value: "0",
        url: baseURL!,
      },
    ]);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.addInitScript(() => {
      localStorage.setItem("upflow.language", "pt-BR");
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

    const desktopSidebar = page.getByTestId("desktop-sidebar");
    const sidebarRail = desktopSidebar.getByTestId("desktop-sidebar-rail");
    const sidebarPanel = desktopSidebar.getByTestId("desktop-sidebar-panel");
    const rail = page.getByTestId("sidebar-rail-navigation");
    const panelToggle = desktopSidebar.getByTestId("sidebar-panel-toggle");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(sidebarRail).toBeVisible();
    await expect(sidebarPanel).toBeHidden();
    await expect(sidebarPanel).toHaveCSS("width", "0px");
    await expect(sidebarPanel).toHaveCSS("opacity", "0");
    await expect(sidebarPanel).toHaveAttribute("aria-hidden", "true");
    await expect(sidebarPanel).toHaveAttribute("inert", "");
    await expect(panelToggle).toHaveAccessibleName("Mostrar sidebar");
    await expect(panelToggle).toHaveAttribute(
      "aria-controls",
      "desktop-sidebar-panel",
    );
    await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
    await expect(panelToggle).toBeInViewport();

    await panelToggle.focus();
    await page.keyboard.press("Enter");
    await expect(desktopSidebar).toHaveCSS("width", "336px");
    await expect(sidebarPanel).toBeVisible();
    await expect(sidebarPanel).toHaveAttribute("aria-hidden", "false");
    await expect(sidebarPanel).not.toHaveAttribute("inert", "");
    await expect(rail).toBeVisible();
    await expect(panelToggle).toHaveAccessibleName("Ocultar sidebar");
    await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
    await expect(panelToggle).toBeFocused();

    const labelOverflow = await rail
      .getByTestId("sidebar-rail-item-label")
      .evaluateAll((labels) =>
        labels.map((label) => ({
          scrollWidth: label.scrollWidth,
          clientWidth: label.clientWidth,
          scrollHeight: label.scrollHeight,
          clientHeight: label.clientHeight,
        })),
      );
    expect(labelOverflow.length).toBeGreaterThan(0);
    expect(
      labelOverflow.every(
        ({ scrollWidth, clientWidth, scrollHeight, clientHeight }) =>
          scrollWidth <= clientWidth && scrollHeight <= clientHeight,
      ),
    ).toBeTruthy();

    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("upflow.sidebar.desktopOpen.v1"),
        ),
      )
      .toBe("1");
    await expect
      .poll(async () =>
        (await ctx.cookies()).find(
          (cookie) => cookie.name === "upflow.sidebar.desktopOpen.v1",
        )?.value,
      )
      .toBe("1");
    await page.reload();
    await expect(desktopSidebar).toHaveCSS("width", "336px");
    await expect(sidebarPanel).toBeVisible();
    await expect(panelToggle).toHaveAccessibleName("Ocultar sidebar");

    await panelToggle.click();
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(sidebarRail).toBeVisible();
    await expect(sidebarPanel).toBeHidden();
    await expect(sidebarPanel).toHaveAttribute("aria-hidden", "true");
    await expect(sidebarPanel).toHaveAttribute("inert", "");
    await expect(panelToggle).toHaveAccessibleName("Mostrar sidebar");
    await expect(panelToggle).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("upflow.sidebar.desktopOpen.v1"),
        ),
      )
      .toBe("0");
    await expect
      .poll(async () =>
        (await ctx.cookies()).find(
          (cookie) => cookie.name === "upflow.sidebar.desktopOpen.v1",
        )?.value,
      )
      .toBe("0");

    await page.reload();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(sidebarRail).toBeVisible();
    await expect(sidebarPanel).toBeHidden();
    await expect(panelToggle).toHaveAccessibleName("Mostrar sidebar");

    await ctx.close();
  });

  test("workspace switcher: open, switch to another workspace, then exercise 'New workspace'", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addCookies([
      {
        name: "upflow.sidebar.desktopOpen.v1",
        value: "0",
        url: baseURL!,
      },
    ]);
    const page = await ctx.newPage();
    const secondaryName = uniq("Secondary workspace");
    const created = await ctx.request.post("/api/workspaces", {
      data: { name: secondaryName },
    });
    expect(created.ok()).toBeTruthy();

    await page.goto("/");
    await page.getByTestId("sidebar-panel-toggle").click();
    const trigger = page.getByRole("button", { name: "Workspace options" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const switched = page.waitForResponse(
      (response) =>
        response.url().includes("/api/workspaces/switch") &&
        response.request().method() === "POST",
    );
    const reloaded = page.waitForNavigation({ waitUntil: "domcontentloaded" });
    await page.getByRole("button").filter({ hasText: secondaryName }).click();
    await switched;
    await reloaded;

    await page.getByRole("button", { name: "Workspace options" }).click();
    page.once("dialog", (dialog) => dialog.dismiss().catch(() => undefined));
    await page.getByRole("button", { name: /New workspace/i }).click();
    await expect(
      page.getByRole("button", { name: "Workspace options" }),
    ).toBeVisible();

    await ctx.close();
  });

  test("header search submits to /search?q=…", async ({ browser, baseURL }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    const input = page
      .getByRole("form", { name: /^Search / })
      .getByRole("searchbox");
    await input.fill("design");
    await input.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=design/);
    await expect(
      page.getByRole("heading", { name: /Results for/i }),
    ).toBeVisible();

    await ctx.close();
  });

  test("⌘K command palette opens, filters, and navigates on selection", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    await openCommandPalette(page);
    await page
      .getByPlaceholder(/Type a command, page, project, or task/)
      .fill("Calendar");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/calendar/);

    await ctx.close();
  });

  test("notification bell opens menu and 'Mark all read' clears unread indicator", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();

    await page.route("**/api/notifications", async (route, request) => {
      if (request.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "n1",
                title: "Hi",
                body: "Test",
                read: false,
                created_at: new Date().toISOString(),
              },
              {
                id: "n2",
                title: "Yo",
                body: "Test",
                read: false,
                created_at: new Date().toISOString(),
              },
            ],
            nextCursor: null,
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });
    await page.route("**/api/notifications/*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(
      page.getByText("Notifications", { exact: true }),
    ).toBeVisible();

    const markAll = page.getByRole("button", { name: "Mark all read" });
    await expect(markAll).toBeVisible();
    await markAll.click();
    await expect(markAll).toHaveCount(0);

    await ctx.close();
  });

  test("header 'New Project' button opens the New Project dialog", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    const page = await ctx.newPage();
    await page.goto("/");
    await page
      .getByRole("button", { name: /^New Project$/ })
      .first()
      .click();
    await expect(
      page.getByRole("dialog", { name: "New Project" }),
    ).toBeVisible();

    await ctx.close();
  });
});
