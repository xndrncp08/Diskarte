import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// The Pulse component gallery (tests/browser/pulse-gallery.tsx) in both colour modes, phone and desktop widths.
async function expectNoAxeViolations(page: Page) {
  // Reduced motion still fades opacity (framer-motion), so wait until every overlay is fully opaque.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll("[role=dialog],[role=menu],[data-sonner-toast]")).every((el) => {
      for (let node: Element | null = el; node; node = node.parentElement) if (getComputedStyle(node).opacity !== "1") return false;
      return true;
    }),
  );
  const audit = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(audit.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => `${node.target.join(" ")}: ${node.html.slice(0, 120)} ${node.failureSummary ?? ""}`) }))).toEqual([]);
}

for (const mode of ["dark", "light"] as const) {
  for (const width of [390, 1280]) {
    test(`Pulse gallery, ${mode} at ${width}px: accessible, no overflow, overlays work`, async ({ page }) => {
      const shot = (name: string) => `test-results/pulse-gallery-${mode}-${width}${name}.png`;
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/pulse-gallery?mode=${mode}`);
      await expect(page.getByRole("heading", { level: 1, name: "Pulse gallery" })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-shell", "pulse");
      await expect(page.locator("html")).toHaveAttribute("data-color-mode", mode);
      await expectNoAxeViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // An invalid field's edge is the alert colour (the aria-[invalid=true] class is a class of its own).
      const edge = await page.getByRole("textbox", { name: "Email" }).evaluate((input) => {
        const probe = document.body.appendChild(document.createElement("span"));
        probe.style.color = "var(--pulse-alert)";
        const alert = getComputedStyle(probe).color;
        probe.remove();
        return { border: getComputedStyle(input).borderTopColor, alert };
      });
      expect(edge.border).toBe(edge.alert);
      await page.screenshot({ path: shot(""), fullPage: true });

      await page.getByRole("button", { name: "Open dialog" }).click();
      const dialog = page.getByRole("dialog", { name: "Leave Bayanihan Crew?" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("textbox", { name: "Type the Space name to confirm" })).toBeFocused(); // data-autofocus
      await expectNoAxeViolations(page);
      await page.screenshot({ path: shot("-dialog") });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("button", { name: "Open dialog" })).toBeFocused();

      await page.getByRole("button", { name: "Open sheet" }).click();
      const sheet = page.getByRole("dialog", { name: "Context" });
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute("data-sheet", width < 640 ? "bottom" : "side");
      await expectNoAxeViolations(page);
      await page.screenshot({ path: shot("-sheet") });
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();

      await page.getByRole("button", { name: "Menu", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Message options" });
      await expect(menu.getByRole("menuitem", { name: "Edit" })).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(menu.getByRole("menuitem", { name: "Copy link" })).toBeFocused();
      await expectNoAxeViolations(page);
      await page.screenshot({ path: shot("-menu") });
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();

      await page.getByTestId("context-target").focus();
      await page.keyboard.press("Shift+F10");
      await expect(page.getByRole("menu", { name: "Message actions" })).toBeVisible();
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "Show toast" }).click();
      await expect(page.getByText("Your profile is up to date.")).toBeVisible();
      await expectNoAxeViolations(page);
      await page.screenshot({ path: shot("-toast") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test("Pulse gallery Tab order follows the page and every stop shows focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/pulse-gallery");
  await expect(page.getByRole("heading", { level: 1, name: "Pulse gallery" })).toBeVisible();
  const stops: { name: string; role: string | null; order: number; outline: string }[] = [];
  for (let i = 0; i < 120; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const all = Array.from(document.querySelectorAll("*"));
      const style = getComputedStyle(el);
      return { name: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40) ?? "", role: el.getAttribute("role"), order: all.indexOf(el), outline: `${style.outlineStyle} ${style.outlineWidth}` };
    });
    if (!stop || (stops.length > 0 && stop.order <= stops[stops.length - 1].order)) break;
    stops.push(stop);
  }
  // The header switch, then the buttons in reading order; disabled and loading buttons are skipped.
  expect(stops.slice(0, 5).map((s) => s.name)).toEqual(["", "Primary", "Small", "Large", "Secondary"]);
  expect(stops[0].role).toBe("switch");
  // One stop for the whole tablist (roving focus), and the walk reached the overlay triggers at the end.
  expect(stops.filter((s) => s.role === "tab")).toHaveLength(1);
  expect(stops.filter((s) => s.role === "radio")).toHaveLength(1);
  expect(stops.filter((s) => ["Bold", "Italic", "Mention someone"].includes(s.name))).toHaveLength(1);
  expect(stops.map((s) => s.name)).toContain("Show toast");
  for (const s of stops) expect(s.outline, s.name).not.toMatch(/^none/);
});
