import * as cheerio from 'cheerio';
import { fetchHtml } from '../utils/browserFetcher.js';
import { getWithRetry } from '../utils/httpClient.js';

export async function scrapeItemByUrl(url, { useBrowser = true, viaJina = true } = {}) {
  const u = String(url || '').trim();
  if (!u) throw new Error('url is empty');

  if (u.includes('item.taobao.com')) return scrapeTaobaoItem(u, { useBrowser });
  if (u.includes('farfetch.com')) return scrapeFarfetchItem(u, { viaJina });
  if (u.includes('mytheresa.com')) return scrapeGenericOgItem(u, { platform: 'Mytheresa', useBrowser });
  if (u.includes('shopbop.com')) return scrapeGenericOgItem(u, { platform: 'Shopbop', useBrowser });
  if (u.includes('luisaviaroma.com')) return scrapeGenericOgItem(u, { platform: 'Luisaviaroma', useBrowser });
  if (u.includes('matchesfashion.com')) return scrapeGenericOgItem(u, { platform: 'Matchesfashion', useBrowser });
  if (u.includes('revolve.com')) return scrapeGenericOgItem(u, { platform: 'Revolve', useBrowser });
  if (u.includes('fwrd.com')) return scrapeGenericOgItem(u, { platform: 'FWRD', useBrowser });
  if (u.includes('24s.com')) return scrapeGenericOgItem(u, { platform: '24S', useBrowser });
  if (u.includes('dewu.com')) return scrapeDewuItem(u, { useBrowser });

  throw new Error('unsupported url');
}

async function scrapeTaobaoItem(url, { useBrowser } = {}) {
  const fetched = await fetchHtml(url, { useBrowser, waitForSelector: 'title', extraWaitMs: 1200 });
  const html = fetched.html || '';
  const $ = cheerio.load(html);

  const title = $('meta[property=\"og:title\"]').attr('content') || $('title').text().trim();
  let image = $('meta[property=\"og:image\"]').attr('content') || '';
  if (image && image.startsWith('//')) image = `https:${image}`;

  // Best-effort price extraction from embedded JSON
  const rawPrice =
    (html.match(/\"price\"\\s*:\\s*\"?(\\d+(?:\\.\\d+)?)\"?/i) || [])[1] ||
    (html.match(/\"view_price\"\\s*:\\s*\"?(\\d+(?:\\.\\d+)?)\"?/i) || [])[1] ||
    '';
  const price = rawPrice ? Number(rawPrice) : 0;

  const id = (url.match(/[?&]id=(\\d+)/) || [])[1] || '';

  return {
    platform: '淘宝',
    id: id || `tb-${Date.now()}`,
    title: title || `Taobao Item ${id}`,
    image,
    price,
    currency: 'CNY',
    rawPrice,
    url,
    fetchMode: fetched.mode,
    sourceUrl: url,
    evidence: { platform: '淘宝', url, html },
  };
}

async function scrapeFarfetchItem(url, { viaJina = true } = {}) {
  const targetUrl = normalizeHttpToHttps(url);

  if (viaJina) {
    // Farfetch is frequently blocked by bot protection. r.jina.ai provides a normalized markdown view.
    const jinaUrl = `https://r.jina.ai/http://${targetUrl.replace(/^https?:\/\//, '')}`;
    const resp = await getWithRetry(jinaUrl, { timeout: 20000, retries: 1 });
    const md = String(resp.data || '');
    const parsed = parseFarfetchItemFromJinaMarkdown(md);
    return {
      platform: 'Farfetch',
      id: parsed.id || (targetUrl.match(/-(\d+)\.aspx/i) || [])[1] || `ff-${Date.now()}`,
      title: parsed.title || 'Farfetch Item',
      image: parsed.image || '',
      price: parsed.price || 0,
      currency: 'CNY',
      rawPrice: parsed.rawPrice || '',
      url: targetUrl,
      fetchMode: 'jina',
      sourceUrl: targetUrl,
      evidence: { platform: 'Farfetch', url: jinaUrl, html: md },
    };
  }

  const resp = await getWithRetry(targetUrl, { timeout: 15000, retries: 1 });
  const html = resp.data || '';
  const $ = cheerio.load(html);

  // Try JSON-LD first
  const jsonLd = $('script[type=\"application/ld+json\"]').first().text().trim();
  let title = '';
  let image = '';
  let rawPrice = '';
  let currency = 'UNKNOWN';
  let price = 0;

  if (jsonLd) {
    try {
      const data = JSON.parse(jsonLd);
      title = data?.name || '';
      image = Array.isArray(data?.image) ? data.image[0] : (data?.image || '');
      rawPrice = data?.offers?.price ? String(data.offers.price) : '';
      currency = data?.offers?.priceCurrency || currency;
      price = rawPrice ? Number(rawPrice) : 0;
    } catch (_e) {
      // ignore
    }
  }

  if (!title) title = $('[data-testid=\"product-name\"]').first().text().trim() || $('title').text().trim();
  if (!image) image = $('meta[property=\"og:image\"]').attr('content') || '';
  if (!rawPrice) {
    const raw = $('[data-testid=\"price\"]').first().text().trim();
    rawPrice = (raw.match(/(\\d+(?:\\.\\d+)?)/) || [])[1] || '';
    if (raw.includes('$')) currency = 'USD';
    if (raw.includes('€')) currency = 'EUR';
    if (raw.includes('£')) currency = 'GBP';
    price = rawPrice ? Number(rawPrice) : 0;
  }

  const id = (targetUrl.match(/-(\\d+)\\.aspx/) || [])[1] || '';

  return {
    platform: 'Farfetch',
    id: id || `ff-${Date.now()}`,
    title: title || 'Farfetch Item',
    image,
    price,
    currency,
    rawPrice,
    url: targetUrl,
    fetchMode: 'http',
    sourceUrl: targetUrl,
    evidence: { platform: 'Farfetch', url: targetUrl, html },
  };
}

async function scrapeDewuItem(url, { useBrowser } = {}) {
  const fetched = await fetchHtml(url, { useBrowser, waitForSelector: 'title', extraWaitMs: 1200 });
  const html = fetched.html || '';
  const $ = cheerio.load(html);

  const title = $('meta[property=\"og:title\"]').attr('content') || $('title').text().trim();
  let image = $('meta[property=\"og:image\"]').attr('content') || '';
  if (image && image.startsWith('//')) image = `https:${image}`;

  const rawPrice = (html.match(/\"price\"\\s*:\\s*\"?(\\d+(?:\\.\\d+)?)\"?/i) || [])[1] || '';
  const price = rawPrice ? Number(rawPrice) : 0;

  return {
    platform: '得物',
    id: `dewu-${Date.now()}`,
    title: title || '得物商品',
    image,
    price,
    currency: 'CNY',
    rawPrice,
    url,
    fetchMode: fetched.mode,
    sourceUrl: url,
    evidence: { platform: '得物', url, html },
  };
}

function normalizeHttpToHttps(url) {
  const u = String(url || '').trim();
  if (u.startsWith('http://')) return `https://${u.slice('http://'.length)}`;
  return u;
}

function parseFarfetchItemFromJinaMarkdown(md) {
  const text = String(md || '');
  const id = (text.match(/item-(\d+)\.aspx/i) || [])[1] || '';

  // Image: pick the first farfetch-contents image.
  const image = (text.match(/https:\/\/cdn-images\.farfetch-contents\.com\/[^\s)]+/i) || [])[0] || '';

  // Title: use the first H1 if present, else fallback to a nearby "title" line.
  let title = '';
  const h1 = text.match(/^\#\s+(.+?)\s*$/m);
  if (h1 && h1[1]) title = String(h1[1]).trim();
  if (!title) {
    const t2 = text.match(/^\s*Title\s*:\s*(.+?)\s*$/mi);
    if (t2 && t2[1]) title = String(t2[1]).trim();
  }

  // Price: Farfetch CN uses CNY with "¥". Use the last occurrence as the effective current price.
  const prices = Array.from(text.matchAll(/¥\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g)).map((m) => m[1]);
  const last = prices.length ? prices[prices.length - 1] : '';
  const price = last ? Number(last.replace(/,/g, '')) : 0;

  return {
    id,
    title,
    image,
    price,
    rawPrice: prices.length ? prices.map((x) => `¥${x}`).join(' ') : '',
  };
}

async function scrapeGenericOgItem(url, { platform, useBrowser } = {}) {
  const targetUrl = normalizeHttpToHttps(url);
  const fetched = await fetchHtml(targetUrl, { useBrowser: !!useBrowser, waitForSelector: 'title', extraWaitMs: 1200, timeout: 35000, retries: 0 });
  const html = fetched.html || '';
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content') ||
    $('meta[name="twitter:title"]').attr('content') ||
    $('title').text().trim();
  let image =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="twitter:image"]').attr('content') ||
    '';
  if (image && image.startsWith('//')) image = `https:${image}`;
  if (image && (image.startsWith('blob:') || image.startsWith('data:'))) image = '';

  const { price, currency, rawPrice } = extractPriceFromHtml(html, $);
  const id = extractIdFromUrl(targetUrl);

  return {
    platform,
    id: id || `${platform.toLowerCase()}-${Date.now()}`,
    title: title || `${platform} Item`,
    image,
    price,
    currency,
    rawPrice,
    url: targetUrl,
    fetchMode: fetched.mode,
    sourceUrl: targetUrl,
    evidence: { platform, url: targetUrl, html },
  };
}

function extractPriceFromHtml(html, $) {
  // Prefer JSON-LD "offers" when present.
  try {
    const jsonLd = $('script[type="application/ld+json"]').first().text().trim();
    if (jsonLd) {
      const data = JSON.parse(jsonLd);
      const offers = data?.offers || data?.[0]?.offers;
      const raw = offers?.price ? String(offers.price) : '';
      const cur = offers?.priceCurrency ? String(offers.priceCurrency) : '';
      const p = raw ? Number(raw) : 0;
      if (p) return { price: p, currency: cur || 'USD', rawPrice: raw };
    }
  } catch (_e) {
    // ignore
  }

  const s = String(html || '');
  // Common embedded JSON keys.
  const raw = (s.match(/"price"\s*:\s*"?(\\d+(?:\\.\\d+)?)"?/i) || [])[1] || '';
  const cur = (s.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/i) || [])[1] || '';
  if (raw) return { price: Number(raw) || 0, currency: cur || 'USD', rawPrice: raw };

  // Fallback: find last currency symbol price in the html.
  const m = Array.from(s.matchAll(/(US\\$|\\$|€|£|¥)\s*([0-9][0-9,]*(?:\\.[0-9]+)?)/g));
  if (m.length) {
    const last = m[m.length - 1];
    const sym = last[1];
    const num = last[2];
    const price = Number(String(num).replace(/,/g, '')) || 0;
    const currency = sym === '€' ? 'EUR' : sym === '£' ? 'GBP' : sym === '¥' ? 'CNY' : 'USD';
    return { price, currency, rawPrice: `${sym}${num}` };
  }

  return { price: 0, currency: 'UNKNOWN', rawPrice: '' };
}

function extractIdFromUrl(url) {
  const u = String(url || '');
  const m1 = u.match(/[?&]id=(\\d{5,})/);
  if (m1 && m1[1]) return m1[1];
  const m2 = u.match(/-(\\d{6,})\\.aspx/i);
  if (m2 && m2[1]) return m2[1];
  const m3 = u.match(/\/(\d{6,})(?:[/?#]|$)/);
  if (m3 && m3[1]) return m3[1];
  return '';
}
