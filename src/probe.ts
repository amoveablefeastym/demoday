import { chromium } from "playwright";

export type Probe = { url: string; title: string; aria: string; screenshot: Buffer; themeColor: string | null; native?: boolean };

export const VIEWPORT = { width: 1440, height: 900 };

/** Load the live app once and capture what the planner needs to write real selectors. */
export async function probe(url: string): Promise<Probe> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(url, { waitUntil: "load", timeout: 45_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const aria = await page.locator("body").ariaSnapshot();
    const themeColor = await page
      .locator('meta[name="theme-color"]')
      .first()
      .getAttribute("content", { timeout: 500 })
      .catch(() => null);
    return {
      url: page.url(),
      title: await page.title(),
      aria,
      screenshot: await page.screenshot(),
      themeColor,
    };
  } finally {
    await browser.close();
  }
}
