import { expect, test, type Page } from "@playwright/test";

const tomorrow = "2026-10-04";
const nav = (page: Page) => page.locator(page.viewportSize()!.width > 700 ? ".sidebar nav" : ".mobile-nav");
async function date(page: Page, value = tomorrow) {
  await page.getByLabel("Calendar date").fill(value);
}
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-03T06:30:00Z"));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Make time for a good game." })).toBeVisible();
});
test("responsive calendar, real logo and installation metadata", async ({ page, request }, testInfo) => {
  await expect(page.locator(".slot")).toHaveCount(10);
  await expect(page.locator(".facility-tile")).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
  await expect(page.locator(".slot").nth(3)).toBeDisabled();
  await expect(page.locator(".slot").nth(4)).toBeEnabled();
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect(await manifest.json()).toMatchObject({ name: "The Boulevard Club", display: "standalone" });
  const svg = await request.get("/brand/wordmark.svg");
  expect(await svg.text()).toContain("<path");
  expect(await svg.text()).not.toContain("<text");
  await page.screenshot({ path: testInfo.outputPath("calendar.png"), fullPage: true });
});
test("public demo rejects real invitations at the server", async ({ page, request }) => {
  const response = await request.post("/api/invitations", {
    headers: { Origin: new URL(page.url()).origin },
    data: { full_name: "Preview visitor", email: "preview@example.com" }
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ error: "Invitations are disabled in the public demo." });
  const crossOrigin = await request.post("/api/invitations", {
    headers: { Origin: "https://unrelated.example" },
    data: { full_name: "Preview visitor", email: "preview@example.com" }
  });
  expect(crossOrigin.status()).toBe(403);
  expect(await crossOrigin.json()).toEqual({ error: "Cross-origin requests are not allowed." });
});
test("create, persist, edit and cancel a booking", async ({ page }) => {
  await page.getByLabel("Demo role").selectOption("demo-ali");
  await date(page);
  await page.locator(".slot").filter({ hasText: "8:30 am" }).click();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("alert")).toContainText("Confirm");
  await page.getByLabel(/I will play and be present/).check();
  await page.getByLabel(/Guests or session notes/).fill("2 cousins joining");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("You're booked");
  await page.reload();
  await page.getByLabel("Demo role").selectOption("demo-ali");
  await nav(page).getByRole("button", { name: "My bookings" }).click();
  await page.locator(".my-booking-card").filter({ hasText: "8:30 am" }).click();
  await expect(page.getByRole("dialog")).toContainText("2 cousins joining");
  await page.getByRole("button", { name: "Edit booking" }).click();
  await page.getByLabel("90-minute slot").selectOption("2026-10-04T05:00:00.000Z");
  await page.getByLabel(/I will play and be present/).check();
  await page.getByRole("button", { name: "Save booking" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".my-booking-card").filter({ hasText: "10:00 am" }).click();
  await page.getByRole("button", { name: "Cancel booking", exact: true }).click();
  await page.getByRole("button", { name: "Yes, cancel booking" }).click();
  await expect(page.getByRole("status")).toContainText("Booking cancelled");
  await expect(page.locator(".history-row").filter({ hasText: "10:00 am" })).toContainText("Cancelled");
});
test("premium limit is enforced across courts and reschedules", async ({ page }) => {
  await date(page);
  await page.locator(".facility-tile").filter({ hasText: "Padel Court 2" }).click();
  await page.locator(".slot").filter({ hasText: "8:30 pm" }).last().click();
  await page.getByLabel(/I will play and be present/).check();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("alert")).toContainText("One premium booking");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await nav(page).getByRole("button", { name: "My bookings" }).click();
  await page.locator(".my-booking-card").click();
  await page.getByRole("button", { name: "Edit booking" }).click();
  await page.getByLabel("90-minute slot").selectOption("2026-10-04T15:30:00.000Z");
  await page.getByLabel(/I will play and be present/).check();
  await page.getByRole("button", { name: "Save booking" }).click();
  await expect(page.getByRole("status")).toContainText("updated");
});
test("manager agenda and admin maintenance affect the member calendar", async ({ page }) => {
  await nav(page).getByRole("button", { name: "Manage club" }).click();
  await page.getByLabel("From (PKT)").fill(`${tomorrow}T08:30`);
  await page.getByLabel("Until (PKT)").fill(`${tomorrow}T10:00`);
  await page.getByLabel("Reason", { exact: true }).fill("Court care");
  await page.getByRole("button", { name: "Add maintenance block" }).click();
  await expect(page.getByRole("status")).toContainText("Maintenance block added");
  await page.getByLabel("Demo role").selectOption("demo-sara");
  await expect(nav(page).getByRole("button", { name: "Manage club" })).toHaveCount(0);
  await date(page);
  await expect(page.locator(".slot").filter({ hasText: "Court care" })).toBeDisabled();
  await page.getByLabel("Demo role").selectOption("demo-manager");
  await nav(page).getByRole("button", { name: "Daily agenda" }).click();
  await expect(page.locator(".schedule-preview")).toContainText("For Ameen Khan & Nawab Khan");
  await expect(page.locator(".schedule-preview")).toContainText("Court care");
});
test("day, week and month views navigate without changing the slot rules", async ({ page }) => {
  await page.getByRole("button", { name: "week", exact: true }).click();
  await expect(page.locator(".period-day")).toHaveCount(7);
  await page.getByRole("button", { name: "month", exact: true }).click();
  await expect(page.locator(".period-day")).toHaveCount(42);
  await page.locator(".period-day").filter({ has: page.locator("strong", { hasText: /^4$/ }) }).first().click();
  await expect(page.locator(".slot")).toHaveCount(10);
  await date(page, "2026-10-06");
  await expect(page.locator(".slot").nth(3)).toBeDisabled();
  await expect(page.locator(".slot").nth(2)).toBeEnabled();
});
