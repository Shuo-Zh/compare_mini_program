import { getWithRetry } from '../utils/httpClient.js';
import { saveEvidence } from '../utils/evidence.js';
import { saveDiscoveredItems, updateCrawlJobProgress } from './productStore.js';

function isAccessDenied(html) {
  const s = String(html || '');
  return /<title>\s*Access Denied\s*<\/title>/i.test(s) || /You don't have permission to access/i.test(s);
}

function normalizeListingUrl(input) {
  const u = new URL(input);
  // Farfetch sometimes normalizes to www.farfetch.com and uses https.
  if (!u.protocol.startsWith('http')) u.protocol = 'https:';
  return u;
}

function withPage(urlObj, page) {
  const u = new URL(urlObj.toString());
  u.searchParams.set('page', String(page));
  return u.toString();
}

function extractItemsFromHtml(html, baseUrl) {
  const s = String(html || '');
  const items = [];
  const seen = new Set();

  // Try to find product links and derive itemId from "item-<id>.aspx".
  const re = /href=\"(\/cn\/shopping\/[^\\\"]+?item-(\\d+)\\.aspx[^\\\"]*)\"/gi;
  let m;
  while ((m = re.exec(s)) && items.length < 5000) {
    const path = m[1];
    const itemId = m[2];
    if (!itemId || seen.has(itemId)) continue;
    seen.add(itemId);
    const url = new URL(path, baseUrl).toString();
    items.push({ itemId, url });
  }

  return items;
}

export async function startFarfetchListingCrawl(job, { startUrl, maxPages = 50, pageFrom = 1, delayMs = 400 } = {}) {
  const baseUrl = 'https://www.farfetch.com';
  const u0 = normalizeListingUrl(startUrl);

  const errors = [];
  let pagesVisited = 0;
  let itemsFound = 0;

  for (let page = Number(pageFrom) || 1; page <= (Number(maxPages) || 1); page += 1) {
    const url = withPage(u0, page);
    let html = '';
    try {
      const resp = await getWithRetry(url, {
        timeout: 20000,
        retries: 1,
        // Farfetch sometimes has issues with HTTP/2; forcing headers here helps consistency.
        headers: {
          accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          referer: startUrl,
        },
        validateStatus: (code) => code >= 200 && code < 500,
      });
      html = String(resp.data || '');
    } catch (e) {
      errors.push({ page, url, error: e instanceof Error ? e.message : String(e) });
      await updateCrawlJobProgress(job.id, {
        pages_visited: pagesVisited,
        items_found: itemsFound,
        errors_json: errors,
      });
      continue;
    }

    pagesVisited += 1;
    const evidence = await saveEvidence({ platform: 'Farfetch', url, html });

    if (isAccessDenied(html)) {
      errors.push({ page, url, error: 'Access Denied (Akamai/风控)', evidenceUrlPath: evidence.evidenceUrlPath });
      await updateCrawlJobProgress(job.id, {
        status: 'blocked',
        pages_visited: pagesVisited,
        items_found: itemsFound,
        errors_json: errors,
      });
      return { status: 'blocked', pagesVisited, itemsFound, errors };
    }

    const items = extractItemsFromHtml(html, baseUrl);
    if (!items.length) {
      // No items: treat as the end.
      await updateCrawlJobProgress(job.id, {
        status: 'done',
        pages_visited: pagesVisited,
        items_found: itemsFound,
        errors_json: errors,
      });
      return { status: 'done', pagesVisited, itemsFound, errors };
    }

    await saveDiscoveredItems(job.id, 'Farfetch', items.map((it) => ({ ...it, sourceUrl: url })));
    itemsFound += items.length;

    await updateCrawlJobProgress(job.id, {
      pages_visited: pagesVisited,
      items_found: itemsFound,
      errors_json: errors,
    });

    if (delayMs) await sleep(delayMs);
  }

  await updateCrawlJobProgress(job.id, {
    status: 'done',
    pages_visited: pagesVisited,
    items_found: itemsFound,
    errors_json: errors,
  });
  return { status: 'done', pagesVisited, itemsFound, errors };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

