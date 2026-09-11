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
        name: "upflow.sidebar.desktopOpen.v2",
        value: "0",
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

    const main = page.locator("main");
    const mainWithoutSidebarBox = await main.boundingBox();
    expect(mainWithoutSidebarBox).not.toBeNull();

    const expandSidebar = desktopSidebar.getByRole("button", {
      name: "Show sidebar",
    });
    const desktopPanel = page.locator("#desktop-sidebar-panel");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(rail).toBeVisible();
    await expect(desktopPanel).toBeHidden();
    await expect(desktopPanel).toHaveAttribute("aria-hidden", "true");
    await expect(desktopPanel).toHaveAttribute("inert", "");
    await expect(expandSidebar).toBeVisible();
    await expect(expandSidebar).toHaveAccessibleName("Show sidebar");
    await expect(expandSidebar).toHaveAttribute(
      "aria-controls",
      "desktop-sidebar-panel",
    );
    await expect(expandSidebar).toHaveAttribute("aria-expanded", "false");
    await expect(expandSidebar).toBeFocused();
    await expect(
      rail.getByTestId("sidebar-rail-item-label").first(),
    ).toHaveClass(/sr-only/);

    await expandSidebar.press("Enter");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "272px");
    await expect(desktopPanel).toBeVisible();
    await expect(desktopPanel).toHaveAttribute("aria-hidden", "false");
    await expect(desktopPanel).not.toHaveAttribute("inert", "");
    await expect(rail).toBeHidden();
    const hideSidebar = desktopSidebar.getByRole("button", {
      name: "Hide sidebar",
    });
    await expect(hideSidebar).toBeFocused();

    const mainWithSidebarBox = await main.boundingBox();
    expect(mainWithSidebarBox).not.toBeNull();
    expect(mainWithoutSidebarBox!.x).toBeLessThan(mainWithSidebarBox!.x);
    expect(mainWithoutSidebarBox!.width).toBeGreaterThan(
      mainWithSidebarBox!.width,
    );

    await ctx.close();
  });

  test("collapsed desktop sidebar expands with the keyboard and keeps icon targets aligned", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addCookies([
      {
        name: "upflow.sidebar.desktopOpen.v2",
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
    const rail = page.getByTestId("sidebar-rail-navigation");
    const desktopPanel = page.locator("#desktop-sidebar-panel");
    const expandSidebar = desktopSidebar.getByTestId("sidebar-panel-toggle");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(rail).toBeVisible();
    await expect(desktopPanel).toBeHidden();
    await expect(desktopPanel).toHaveAttribute("aria-hidden", "true");
    await expect(desktopPanel).toHaveAttribute("inert", "");
    await expect(expandSidebar).toBeVisible();
    await expect(expandSidebar).toHaveAccessibleName("Mostrar sidebar");
    await expect(expandSidebar).toHaveAttribute(
      "aria-controls",
      "desktop-sidebar-panel",
    );
    await expect(expandSidebar).toHaveAttribute("aria-expanded", "false");
    await expect(expandSidebar).toBeInViewport();
    await expect(
      rail.getByTestId("sidebar-rail-item-label").first(),
    ).toHaveClass(/sr-only/);

    const railTargetSizes = await rail.locator("a, button").evaluateAll((items) =>
      items.map((item) => {
        const box = item.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    expect(railTargetSizes.length).toBeGreaterThan(0);
    expect(
      railTargetSizes.every(({ width, height }) => width >= 44 && height >= 44),
    ).toBeTruthy();

    await expandSidebar.focus();
    await page.keyboard.press("Enter");
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "272px");
    await expect(desktopPanel).toBeVisible();
    await expect(rail).toBeHidden();
    const hideSidebar = desktopSidebar
      .getByRole("button", { name: "Ocultar sidebar" })
      .first();
    await expect(hideSidebar).toBeFocused();

    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("upflow.sidebar.desktopOpen.v2"),
        ),
      )
      .toBe("1");
    await expect
      .poll(
        async () =>
          (await ctx.cookies()).find(
            (cookie) => cookie.name === "upflow.sidebar.desktopOpen.v2",
          )?.value,
      )
      .toBe("1");
    await page.reload();
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "272px");
    await expect(hideSidebar).toBeVisible();

    await hideSidebar.click();
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(desktopPanel).toBeHidden();
    await expect(expandSidebar).toBeVisible();
    await expect(expandSidebar).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() =>
          localStorage.getItem("upflow.sidebar.desktopOpen.v2"),
        ),
      )
      .toBe("0");
    await expect
      .poll(
        async () =>
          (await ctx.cookies()).find(
            (cookie) => cookie.name === "upflow.sidebar.desktopOpen.v2",
          )?.value,
      )
      .toBe("0");

    await page.reload();
    await expect(desktopSidebar).toBeVisible();
    await expect(desktopSidebar).toHaveCSS("width", "64px");
    await expect(expandSidebar).toBeVisible();

    await ctx.close();
  });

  test("workspace switcher: open, switch to another workspace, then exercise 'New workspace'", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await loggedInContext(browser, baseURL, SEEDED.admin.email);
    await ctx.addCookies([
      {
        name: "upflow.sidebar.desktopOpen.v2",
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
