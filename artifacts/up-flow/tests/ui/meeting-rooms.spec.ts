import { expect, test } from "@playwright/test";
import { SEEDED, apiAs } from "../helpers";
import { loggedInContext, requireChromiumOrSkip } from "./_ui-helpers";

requireChromiumOrSkip();

test("meeting rooms stay usable on desktop and mobile", async ({
  browser,
  baseURL,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    const context = await loggedInContext(browser, baseURL!, SEEDED.admin.email);
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.goto("/sala-de-reuniao");

    await expect(page.getByText("Sala B2B").first()).toBeVisible();
    await expect(page.getByText("Sala B2C").first()).toBeVisible();

    await page
      .getByRole("button", { name: /Reservar sala|Reserve room/i })
      .first()
      .click();
    await expect(page.getByRole("button", { name: "Sala B2B" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sala B2C" })).toBeVisible();
    await expect(page.getByText(/Finalidade|Purpose/)).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");

    await context.close();
  }
});

test("the API rejects overlapping bookings for the same room", async ({
  baseURL,
}) => {
  const api = await apiAs(baseURL!, SEEDED.admin.email);
  const startsAt = "2035-04-18T15:00:00.000Z";
  const endsAt = "2035-04-18T16:00:00.000Z";
  let createdId: string | null = null;

  try {
    const first = await api.post("/api/calendar/events", {
      data: {
        title: "Verificação de reserva B2B",
        type: "meeting",
        starts_at: startsAt,
        ends_at: endsAt,
        timezone: "America/Sao_Paulo",
        meeting_room_key: "b2b",
      },
    });
    expect(first.status()).toBe(201);
    createdId = ((await first.json()) as { id: string }).id;

    const conflict = await api.post("/api/calendar/events", {
      data: {
        title: "Reserva conflitante B2B",
        type: "meeting",
        starts_at: "2035-04-18T15:30:00.000Z",
        ends_at: "2035-04-18T16:30:00.000Z",
        timezone: "America/Sao_Paulo",
        meeting_room_key: "b2b",
      },
    });
    expect(conflict.status()).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({
      code: "MEETING_ROOM_CONFLICT",
    });

    const otherRoom = await api.post("/api/calendar/events", {
      data: {
        title: "Reserva simultânea B2C",
        type: "meeting",
        starts_at: "2035-04-18T15:30:00.000Z",
        ends_at: "2035-04-18T16:30:00.000Z",
        timezone: "America/Sao_Paulo",
        meeting_room_key: "b2c",
      },
    });
    expect(otherRoom.status()).toBe(201);
    const otherId = ((await otherRoom.json()) as { id: string }).id;
    await api.delete(`/api/calendar/events/${otherId}`);
  } finally {
    if (createdId) await api.delete(`/api/calendar/events/${createdId}`);
    await api.dispose();
  }
});
