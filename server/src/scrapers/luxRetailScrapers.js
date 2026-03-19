import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { fetchHtml } from '../utils/browserFetcher.js';

export async function scrapeMytheresa(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  // Mytheresa is heavily JS-driven; browser rendering is usually required.
  const urls = [
    `https://www.mytheresa.com/us/en/search?query=${q}&page=${page}`,
    `https://www.mytheresa.com/us/en/search?query=${q}`,
  ];
  return scrapeRetailListing('Mytheresa', urls, { limit, useBrowser });
}

export async function scrapeMytheresaCategory(categoryUrl, { limit = 24, page = 1, useBrowser = true } = {}) {
  const baseUrl = String(categoryUrl || '').trim();
  if (!baseUrl) return { items: [], evidence: { platform: 'Mytheresa', url: '', html: '' } };

  const urls = buildCategoryUrls(baseUrl, page);
  return scrapeRetailListing('Mytheresa', urls, { limit, useBrowser });
}

export async function scrapeShopbop(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  // Shopbop is frequently protected; browser rendering may still fail depending on network.
  const urls = [
    // Shopbop uses /s/ for search. /search is often 404.
    `https://www.shopbop.com/s/?query=${q}&page=${page}`,
    `https://www.shopbop.com/s/?query=${q}`,
  ];
  return scrapeRetailListing('Shopbop', urls, { limit, useBrowser });
}

export async function scrapeLuisaviaroma(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  const urls = [
    `https://www.luisaviaroma.com/en-us/shop/women/search?search=${q}&page=${page}`,
    `https://www.luisaviaroma.com/en-us/shop/women/search?search=${q}`,
  ];
  return scrapeRetailListing('Luisaviaroma', urls, { limit, useBrowser });
}

export async function scrapeMatchesfashion(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  const urls = [
    `https://www.matchesfashion.com/us/search?text=${q}&page=${page}`,
    `https://www.matchesfashion.com/us/search?text=${q}`,
  ];
  return scrapeRetailListing('Matchesfashion', urls, { limit, useBrowser });
}

export async function scrapeRevolve(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  const urls = [
    `https://www.revolve.com/r/Search.jsp?search=${q}&pageNum=${page}`,
    `https://www.revolve.com/r/Search.jsp?search=${q}`,
  ];
  return scrapeRetailListing('Revolve', urls, { limit, useBrowser });
}

export async function scrapeFwrd(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  const urls = [
    `https://www.fwrd.com/r/Search.jsp?search=${q}&pageNum=${page}`,
    `https://www.fwrd.com/r/Search.jsp?search=${q}`,
  ];
  return scrapeRetailListing('FWRD', urls, { limit, useBrowser });
}

export async function scrape24s(keyword, { limit = 12, page = 1, useBrowser = true } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  // 24S URL patterns change; try multiple common forms.
  const urls = [
    `https://www.24s.com/en-us/search?query=${q}&page=${page}`,
    `https://www.24s.com/en-us/search?query=${q}`,
    `https://www.24s.com/en-us/search?q=${q}&page=${page}`,
    `https://www.24s.com/en-us/search?q=${q}`,
    `https://www.24s.com/en-us/search/${q}?page=${page}`,
  ];
  return scrapeRetailListing('24S', urls, { limit, useBrowser });
}

async function scrapeRetailListing(platform, urls, { limit, useBrowser } = {}) {
  let last = { ok: false, mode: 'http', html: '', url: '' };
  for (const u of urls) {
    try {
      const fetched = await fetchHtml(u, {
        useBrowser,
        waitForSelector: pickWaitForSelector(platform),
        // Many retail sites render product cards after initial HTML; give them a bit more time.
        extraWaitMs: useBrowser ? 4500 : 0,
        timeout: useBrowser ? 32000 : 18000,
        retries: 0
      });
      last = fetched;
      const html = String(fetched.html || '');
      const items = extractItemsFromHtml(html, u, platform, limit);
      if (items.length) {
        return { items, evidence: { platform, url: u, html } };
      }
      // If we got a 404-like body, try next URL.
      if (isNotFoundLike(html)) continue;
    } catch (_e) {
      // Try next URL.
      continue;
    }
  }

  const html = String(last.html || '');
  return { items: [], evidence: { platform, url: last.url || urls[0] || '', html } };
}

function pickWaitForSelector(platform) {
  // Keep selectors conservative; even if they don't exist, browserFetcher will continue after timeout.
  const p = String(platform || '').toLowerCase();
  if (p === 'mytheresa') return 'img[src*=\"/media/\"]';
  if (p === 'shopbop') return '[data-at=\"priceText\"], span[data-at=\"priceText\"], [data-at=\"productTile\"]';
  return 'title';
}

function buildCategoryUrls(baseUrl, page) {
  const url = String(baseUrl || '').trim();
  if (!url) return [];
  if (page <= 1) return [url];

  // Mytheresa category pages have used multiple paging params over time; try common variants.
  const sep = url.includes('?') ? '&' : '?';
  return [
    `${url}${sep}page=${page}`,
    `${url}${sep}p=${page}`,
  ];
}

function isNotFoundLike(html) {
  const s = String(html || '').toLowerCase();
  return s.includes('page not found') || s.includes('404') || s.includes('not found');
}

function extractItemsFromHtml(html, pageUrl, platform, limit) {
  const $ = cheerio.load(String(html || ''));
  const base = baseOrigin(pageUrl);

  const out = [];
  const seen = new Set();

  // Heuristic: product cards usually contain an <a> with an <img> and a price nearby.
  $('a[href]').each((_i, el) => {
    if (out.length >= limit) return;
    const href = $(el).attr('href') || '';
    const url = absolutizeUrl(href, base);
    if (!url) return;

    // Keep only same-origin links for this page.
    if (base && !url.startsWith(base)) return;

    // Avoid obvious non-product links.
    if (url.includes('/account') || url.includes('/help') || url.includes('/customer') || url.includes('/returns')) return;

    // Require image evidence.
    const img = pickImage($(el), base);
    if (!img) return;

    // Find a container with some price text.
    const container = $(el).closest('article, li, div');
    const text = normalizeSpace(container.text());
    const priceInfo = extractPrice(text);
    if (!priceInfo.price) return;

    const title = deriveTitle($, $(el), container, platform, priceInfo) || `${platform} item`;

    const id = extractId(url) || hashId(url);
    const key = `${platform}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);

    out.push({
      platform,
      id,
      title,
      image: img,
      price: priceInfo.price,
      currency: priceInfo.currency,
      rawPrice: priceInfo.raw,
      url,
      fetchMode: 'browser',
      sourceUrl: pageUrl,
    });
  });

  return out;
}

function deriveTitle($, $a, $container, platform, priceInfo) {
  // 1) Prefer explicit labels
  const imgAlt = normalizeSpace($a.find('img').first().attr('alt'));
  if (imgAlt && !looksLikeNoiseTitle(imgAlt)) return imgAlt;

  const ariaOrTitle = normalizeSpace($a.attr('aria-label') || $a.attr('title') || '');
  if (ariaOrTitle && !looksLikeNoiseTitle(ariaOrTitle)) return ariaOrTitle;

  // 2) Known data attributes (Shopbop-like)
  const dataTitle = normalizeSpace($container.find('[data-at*=\"product\"], [data-at*=\"Product\"], [data-testid*=\"product\" i]').first().text());
  if (dataTitle && !looksLikeNoiseTitle(dataTitle)) return stripPriceAndSizes(dataTitle, priceInfo);

  // 3) Fallback: container text cleaned (may include brand + name + price)
  const raw = normalizeSpace($container.text());
  const cleaned = stripPriceAndSizes(raw, priceInfo);
  if (cleaned && !looksLikeNoiseTitle(cleaned)) return cleaned.slice(0, 160);

  return normalizeSpace($a.text()) || `${platform} item`;
}

function stripPriceAndSizes(s, priceInfo) {
  let out = String(s || '');
  // Remove price raw token if present (e.g. "$ 3,700" / "￥51,060")
  if (priceInfo?.raw) {
    out = out.replaceAll(priceInfo.raw, ' ');
    out = out.replaceAll(priceInfo.raw.replace(/\s+/g, ''), ' ');
  }
  // Remove common "available size" chatter
  out = out.replace(/available\s+sizes?:?/ig, ' ');
  out = out.replace(/available\s+size:?/ig, ' ');
  // Remove common size tokens like "FR 34", "EU 39.5", "UK 8", "IT 48"
  out = out.replace(/\b(FR|EU|UK|IT|US)\s*\d+(?:\.\d+)?\b/gi, ' ');
  out = out.replace(/\b\d{2}\b/g, (m) => (Number(m) >= 20 && Number(m) <= 50 ? ' ' : m));
  return normalizeSpace(out);
}

function looksLikeNoiseTitle(t) {
  const s = String(t || '').toLowerCase();
  if (!s) return true;
  if (s.length <= 2) return true;
  if (s.includes('available sizes')) return true;
  return false;
}

function pickImage($a, base) {
  const img = $a.find('img').first();
  if (!img.length) return '';
  let src = img.attr('src') || img.attr('data-src') || img.attr('data-original') || '';
  if (!src) return '';
  if (src.startsWith('blob:') || src.startsWith('data:')) return '';
  if (src.startsWith('//')) src = `https:${src}`;
  if (src.startsWith('/')) src = base ? `${base}${src}` : '';
  if (!src.startsWith('http')) return '';
  return src;
}

function extractPrice(text) {
  const s = String(text || '');
  // Regex literal: avoid double-escaping (\\d/\\s) which would match backslashes instead of digits/spaces.
  const matches = Array.from(s.matchAll(/(US\$|\$|€|£|¥|￥)\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g));
  if (!matches.length) return { price: 0, currency: 'UNKNOWN', raw: '' };
  const last = matches[matches.length - 1];
  const sym = last[1];
  const num = last[2];
  const price = Number(String(num).replace(/,/g, '')) || 0;
  const currency =
    sym === '€' ? 'EUR' :
      sym === '£' ? 'GBP' :
        (sym === '¥' || sym === '￥') ? 'CNY' : 'USD';
  return { price, currency, raw: `${sym}${num}` };
}

function extractId(url) {
  const u = String(url || '');
  // Common patterns: /product/<id>, ?id=<id>, trailing digits.
  const m1 = u.match(/[?&]id=(\d{5,})/);
  if (m1 && m1[1]) return m1[1];
  const m2 = u.match(/\/(\d{6,})(?:[/?#]|$)/);
  if (m2 && m2[1]) return m2[1];
  const m3 = u.match(/-(\d{6,})(?:[/?#]|$)/);
  if (m3 && m3[1]) return m3[1];
  return '';
}

function hashId(url) {
  return crypto.createHash('sha1').update(String(url || '')).digest('hex').slice(0, 12);
}

function baseOrigin(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch (_e) {
    return '';
  }
}

function absolutizeUrl(href, base) {
  const h = String(href || '').trim();
  if (!h) return '';
  if (h.startsWith('http://')) return `https://${h.slice('http://'.length)}`;
  if (h.startsWith('https://')) return h;
  if (h.startsWith('//')) return `https:${h}`;
  if (h.startsWith('/')) return base ? `${base}${h}` : '';
  return '';
}

function normalizeSpace(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}
