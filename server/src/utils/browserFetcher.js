import { getWithRetry } from './httpClient.js';

let playwrightLib;
let playwrightLoadTried = false;

export async function fetchHtml(url, options = {}) {
  const useBrowser = toBool(options.useBrowser, false);
  if (useBrowser) {
    const rendered = await fetchRendered(url, options);
    if (rendered.ok) return rendered;
  }

  const response = await getWithRetry(url, {
    timeout: options.timeout || 15000,
    retries: options.retries ?? 1,
    headers: options.headers || {}
  });

  return {
    ok: true,
    mode: 'http',
    html: response.data || '',
    url
  };
}

async function fetchRendered(url, options = {}) {
  const playwright = await loadPlaywright();
  if (!playwright) {
    return {
      ok: false,
      mode: 'browser',
      error: 'playwright 未安装或不可用'
    };
  }

  let browser;
  try {
    // Prefer using system Chrome if available to avoid Playwright browser downloads.
    browser = await playwright.chromium.launch({ headless: true, channel: 'chrome', args: ['--disable-http2'] });
  } catch (e) {
    try {
      browser = await playwright.chromium.launch({ headless: true, args: ['--disable-http2'] });
    } catch (e2) {
      // Playwright may be installed but browser binaries not downloaded for the exact version.
      // Try using an existing cached Chromium if present.
      const fallback = await findCachedChromium();
      if (!fallback) {
        return { ok: false, mode: 'browser', error: `playwright 启动失败: ${e2?.message || e2 || e?.message || e}` };
      }
      browser = await playwright.chromium.launch({ headless: true, executablePath: fallback, args: ['--disable-http2'] });
    }
  }
  try {
    const context = await browser.newContext({
      viewport: { width: 1366, height: 900 },
      locale: 'zh-CN',
      userAgent: options.userAgent ||
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    await page.goto(url, {
      waitUntil: options.waitUntil || 'domcontentloaded',
      timeout: options.timeout || 25000
    });

    if (options.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 8000 }).catch(() => null);
    }

    await page.waitForTimeout(options.extraWaitMs || 1200);
    const html = await page.content();

    await context.close();
    return {
      ok: true,
      mode: 'browser',
      html,
      url
    };
  } finally {
    await browser.close();
  }
}

async function loadPlaywright() {
  if (playwrightLib) return playwrightLib;
  if (playwrightLoadTried) return null;

  playwrightLoadTried = true;
  try {
    playwrightLib = await import('playwright');
    return playwrightLib;
  } catch (_error) {
    return null;
  }
}

async function findCachedChromium() {
  // Best-effort: use cached Chromium from ms-playwright if it exists.
  // Common path on macOS: ~/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium
  try {
    const { default: os } = await import('os');
    const { default: path } = await import('path');
    const { default: fs } = await import('fs/promises');

    const home = os.homedir();
    const base = path.join(home, 'Library', 'Caches', 'ms-playwright');
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    const dirs = entries
      .filter((d) => d.isDirectory() && String(d.name).startsWith('chromium-'))
      .map((d) => d.name)
      .sort()
      .reverse();

    for (const d of dirs) {
      const p = path.join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
      try {
        await fs.access(p);
        return p;
      } catch (_e) {
        // continue
      }
    }
  } catch (_e) {
    // ignore
  }
  return null;
}

function toBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return fallback;
}
