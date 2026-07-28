import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

/**
 * Headless is not negotiable: the brief requires that no separate browser window
 * is ever shown to the user. All survey interaction is rendered by the app's own
 * UI, never by surfacing the live site.
 */
export const LAUNCH_OPTIONS = {
  headless: true as const,
};

export const CONTEXT_OPTIONS = {
  viewport: { width: 1280, height: 900 },
  locale: 'en-US',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    'Chrome/125.0.0.0 Safari/537.36',
};

export interface BrowserBundle {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function launchBrowser(): Promise<BrowserBundle> {
  const browser = await chromium.launch(LAUNCH_OPTIONS);
  const context = await browser.newContext(CONTEXT_OPTIONS);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(45_000);
  return { browser, context, page };
}

export async function closeBrowser(bundle: Partial<BrowserBundle> | null | undefined) {
  // Orphaned headless Chromiums eat RAM — every error path must reach here.
  try {
    await bundle?.browser?.close();
  } catch {
    /* already gone */
  }
}

/**
 * Etiquette (plan §7.13): a small human-ish pause between page advances so the
 * walk does not look like a scraper hammering the form.
 */
export function politeDelay(): Promise<void> {
  const ms = 700 + Math.floor(Math.random() * 800);
  return new Promise((r) => setTimeout(r, ms));
}
