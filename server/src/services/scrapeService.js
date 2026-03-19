import { scrapeTaobao } from '../scrapers/taobaoScraper.js';
import { scrapeFarfetch } from '../scrapers/farfetchScraper.js';
import { scrapeJd } from '../scrapers/jdScraper.js';
import { scrapeBooks } from '../scrapers/booksScraper.js';
import { scrapeItemByUrl } from '../scrapers/itemScrapers.js';
import {
  scrapeMytheresa,
  scrapeMytheresaCategory,
  scrapeShopbop,
  scrapeLuisaviaroma,
  scrapeMatchesfashion,
  scrapeRevolve,
  scrapeFwrd,
  scrape24s,
} from '../scrapers/luxRetailScrapers.js';
import { scrapeJinaListing, buildSearchUrls } from '../scrapers/jinaSearchScraper.js';
import { toCny } from '../utils/fx.js';
import { saveEvidence } from '../utils/evidence.js';
import { createScrapeRun, saveScrapedProducts } from './productStore.js';
import { groupSimilarProducts } from '../utils/similarity.js';

const PLATFORM_MAP = {
  taobao: '淘宝',
  farfetch: 'Farfetch',
  jd: '京东',
  books: 'BooksToScrape',
  mytheresa: 'Mytheresa',
  shopbop: 'Shopbop',
  luisaviaroma: 'Luisaviaroma',
  matchesfashion: 'Matchesfashion',
  revolve: 'Revolve',
  fwrd: 'FWRD',
  s24: '24S',
};

export async function scrapeAndStore({ keyword, sourceUrl = '', platforms = ['taobao', 'farfetch'], options = {} }) {
  const selected = (platforms || []).map((x) => String(x).toLowerCase()).filter(Boolean);
  const run = await createScrapeRun({ keyword, sourceUrl, platforms: selected, options, evidencePath: '' });

  // If user provided a concrete item URL, scrape that item page directly.
  // Listing URLs (e.g. Mytheresa category pages) should be handled by platform scrapers instead.
  if (sourceUrl && !isListingUrl(sourceUrl)) {
    const item = await scrapeItemByUrl(sourceUrl, { useBrowser: options.useBrowser !== false });
    const priceCny = await toCny(Number(item.price || 0), item.currency || 'CNY');
    const saved = item.evidence?.html
      ? await saveEvidence({ platform: item.platform, url: item.evidence.url, html: item.evidence.html })
      : null;

    const product = { ...item, priceCny };
    await saveScrapedProducts(run.id, [product]);

    return {
      runId: run.id,
      createdAt: run.createdAt,
      keyword,
      sourceUrl,
      products: [product],
      failures: [],
      evidence: saved ? [{ platform: item.platform, url: item.evidence.url, ...saved }] : [],
    };
  }

  const platformTimeoutMs = Math.max(4000, Number(options.platformTimeoutMs || 14000));
  const page = Math.max(1, Number(options.page || 1));
  const tasks = selected.map(async (p) => withTimeout(async () => {
    if (p === 'taobao') return scrapeTaobao(keyword, { limit: options.limit || 12, page, useBrowser: !!options.useBrowser });
    if (p === 'farfetch') return scrapeFarfetch(keyword, { limit: options.limit || 12, page, viaJina: options.viaJina !== false });
    if (p === 'jd') return scrapeJd(keyword, { limit: options.limit || 12, page });
    if (p === 'books') return scrapeBooks(keyword, { limit: options.limit || 12 });
    if (p === 'mytheresa') {
      if (sourceUrl && isMytheresaCategoryUrl(sourceUrl)) {
        return scrapeMytheresaCategory(sourceUrl, { limit: options.limit || 24, page, useBrowser: !!options.useBrowser });
      }
      return scrapeViaJinaOrFallback('Mytheresa', 'mytheresa.com', 'mytheresa', keyword, { ...options, page });
    }
    if (p === 'shopbop') return scrapeViaJinaOrFallback('Shopbop', 'shopbop.com', 'shopbop', keyword, { ...options, page });
    if (p === 'luisaviaroma') return scrapeViaJinaOrFallback('Luisaviaroma', 'luisaviaroma.com', 'luisaviaroma', keyword, { ...options, page });
    if (p === 'matchesfashion') return scrapeViaJinaOrFallback('Matchesfashion', 'matchesfashion.com', 'matchesfashion', keyword, { ...options, page });
    if (p === 'revolve') return scrapeViaJinaOrFallback('Revolve', 'revolve.com', 'revolve', keyword, { ...options, page });
    if (p === 'fwrd') return scrapeViaJinaOrFallback('FWRD', 'fwrd.com', 'fwrd', keyword, { ...options, page });
    if (p === 's24') return scrapeViaJinaOrFallback('24S', '24s.com', 's24', keyword, { ...options, page });
    return { items: [], evidence: { platform: PLATFORM_MAP[p] || p, url: '', html: '' } };
  }, platformTimeoutMs, PLATFORM_MAP[p] || p));

  const settled = await Promise.allSettled(tasks);
  const allProducts = [];
  const evidences = [];
  const failures = [];

  for (let i = 0; i < settled.length; i += 1) {
    const p = selected[i];
    const r = settled[i];
    if (r.status === 'rejected') {
      failures.push({ platform: PLATFORM_MAP[p] || p, reason: r.reason?.message || String(r.reason) });
      continue;
    }
    evidences.push(r.value.evidence);
    const items = Array.isArray(r.value.items) ? r.value.items : [];
    if (!items.length) {
      failures.push({ platform: PLATFORM_MAP[p] || p, reason: '无结果（可能被风控或页面结构变更）' });
      continue;
    }
    for (const it of items) {
      const priceCny = await toCny(Number(it.price || 0), it.currency || 'CNY');
      allProducts.push({ ...it, priceCny });
    }
  }

  // Save evidence HTML (one per platform) and return paths.
  const evidenceSaved = [];
  for (const ev of evidences) {
    if (!ev?.html || !ev?.url) continue;
    const saved = await saveEvidence({ platform: ev.platform, url: ev.url, html: ev.html });
    evidenceSaved.push({ platform: ev.platform, url: ev.url, ...saved });
  }

  await saveScrapedProducts(run.id, allProducts);

  // Best-effort "same item" grouping across platforms.
  const { groupByIndex, groups } = groupSimilarProducts(allProducts, { threshold: 0.72 });
  for (let i = 0; i < allProducts.length; i += 1) {
    if (groupByIndex[i]) allProducts[i].matchGroupId = groupByIndex[i];
  }

  return {
    runId: run.id,
    createdAt: run.createdAt,
    keyword,
    sourceUrl,
    products: allProducts,
    failures,
    evidence: evidenceSaved,
    matchGroups: groups,
  };
}

async function withTimeout(fn, ms, label) {
  const timeoutError = new Error(`${label} 抓取超时（>${ms}ms）`);
  let t;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        t = setTimeout(() => reject(timeoutError), ms);
      })
    ]);
  } finally {
    if (t) clearTimeout(t);
  }
}

async function scrapeViaJinaOrFallback(platformName, host, platformKey, keyword, options) {
  // Prefer r.jina.ai to mimic the Farfetch approach. If it yields nothing, fallback to the heuristic HTML scraper.
  const wantJina = options.viaJina !== false;
  const limit = options.limit || 12;
  if (wantJina) {
    const urls = buildSearchUrls(platformKey, keyword, { page: options.page || 1 });
    if (urls && urls.length) {
      try {
        const r = await scrapeJinaListing({ platform: platformName, host, urls, limit });
        // If Jina yields items, use it. Otherwise fall back to browser/HTML extraction, which is often required.
        if (Array.isArray(r.items) && r.items.length) return r;
      } catch (_e) {
        // continue to fallback
      }
    }
  }

  // Fallback: heuristic HTML extraction (may require browser rendering / may fail under bot protection).
  if (platformKey === 'mytheresa') return scrapeMytheresa(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });
  if (platformKey === 'shopbop') return scrapeShopbop(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });
  if (platformKey === 'luisaviaroma') return scrapeLuisaviaroma(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });
  if (platformKey === 'matchesfashion') return scrapeMatchesfashion(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });
  if (platformKey === 'revolve') return scrapeRevolve(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });
  if (platformKey === 'fwrd') return scrapeFwrd(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });
  if (platformKey === 's24') return scrape24s(keyword, { limit, page: options.page || 1, useBrowser: !!options.useBrowser });

  return { items: [], evidence: { platform: platformName, url: '', html: '' } };
}

function isMytheresaCategoryUrl(url) {
  const u = String(url || '').toLowerCase();
  return u.includes('mytheresa.com') && u.includes('/women/clothing');
}

function isListingUrl(url) {
  return isMytheresaCategoryUrl(url);
}
