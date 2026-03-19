import { getWithRetry } from '../utils/httpClient.js';

// Generic r.jina.ai markdown listing parser.
// It works best for sites where the rendered markdown contains bullet lines with image + link + price.

export async function scrapeJinaListing({ platform, host, url, urls, limit = 12 } = {}) {
  const candidates = Array.isArray(urls) && urls.length ? urls : (url ? [url] : []);
  if (!candidates.length) throw new Error('url(s) is required');

  let lastEvidence = { platform, url: '', html: '' };
  for (const u of candidates) {
    const jinaUrl = toJinaUrl(u);
    try {
      const resp = await getWithRetry(jinaUrl, { timeout: 25000, retries: 1 });
      const md = String(resp.data || '');
      lastEvidence = { platform, url: jinaUrl, html: md };
      const items = parseJinaMarkdownListing(md, { platform, host, limit });
      if (items.length) return { items, evidence: lastEvidence };
    } catch (_e) {
      // Try next candidate.
    }
  }

  return { items: [], evidence: lastEvidence };
}

export function buildSearchUrls(platformKey, keyword, { page = 1 } = {}) {
  const q = encodeURIComponent(String(keyword || '').trim());
  const p = Math.max(1, Number(page || 1));

  // These endpoints are best-effort. Some sites change frequently or apply bot protections.
  switch (String(platformKey || '').toLowerCase()) {
    case 'mytheresa':
      return [
        `https://www.mytheresa.com/us/en/search?query=${q}&page=${p}`,
        `https://www.mytheresa.com/us/en/search?query=${q}`,
        `https://www.mytheresa.com/us/en/search?query=${q}&page=1`,
      ];
    case 'shopbop':
      return [
        // Shopbop uses /s/ for search. /search is often 404.
        `https://www.shopbop.com/s/?query=${q}&page=${p}`,
        `https://www.shopbop.com/s/?query=${q}`,
      ];
    case 'luisaviaroma':
      // LVR URLs change; keep a conservative default and rely on evidence/failures if blocked.
      return [
        `https://www.luisaviaroma.com/en-us/shop/women/search?search=${q}&page=${p}`,
        `https://www.luisaviaroma.com/en-us/shop/women/search?search=${q}`,
        `https://www.luisaviaroma.com/en-us/search?search=${q}&page=${p}`,
        `https://www.luisaviaroma.com/en-us/search?search=${q}`,
      ];
    case 'matchesfashion':
      return [
        `https://www.matchesfashion.com/us/search?text=${q}&page=${p}`,
        `https://www.matchesfashion.com/us/search?text=${q}`,
      ];
    case 'revolve':
      return [
        `https://www.revolve.com/r/Search.jsp?search=${q}&pageNum=${p}`,
        `https://www.revolve.com/r/Search.jsp?search=${q}`,
      ];
    case 'fwrd':
      return [
        `https://www.fwrd.com/r/Search.jsp?search=${q}&pageNum=${p}`,
        `https://www.fwrd.com/r/Search.jsp?search=${q}`,
      ];
    case 's24':
      return [
        `https://www.24s.com/en-us/search?query=${q}&page=${p}`,
        `https://www.24s.com/en-us/search?query=${q}`,
        `https://www.24s.com/en-us/search?q=${q}&page=${p}`,
        `https://www.24s.com/en-us/search?q=${q}`,
      ];
    default:
      return [];
  }
}

function toJinaUrl(url) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (u.startsWith('https://r.jina.ai/')) return u;
  // r.jina.ai expects http:// prefix after its domain.
  const stripped = u.replace(/^https?:\/\//, '');
  return `https://r.jina.ai/http://${stripped}`;
}

function parseJinaMarkdownListing(md, { platform = '', host = '', limit = 12 } = {}) {
  const lines = String(md || '').split(/\r?\n/);
  const items = [];
  const seen = new Set();

  for (const line of lines) {
    if (items.length >= limit) break;
    const l = String(line || '').trimStart();

    // Require at least one markdown link.
    const link = extractLastMarkdownLink(l);
    if (!link) continue;
    let detailUrl = link.url;
    if (!detailUrl) continue;
    detailUrl = normalizeUrl(detailUrl);
    if (host && !detailUrl.includes(host)) continue;

    // Extract image if present.
    const image = extractFirstHttpImage(l);

    // Title: prefer alt text from Image markdown, else the bracket text before last link.
    let title = extractImageAltTitle(l) || '';
    if (!title) {
      title = (link.text || '').replace(/\s+/g, ' ').trim();
    }
    if (!title) continue;

    // Price: use the last currency-like occurrence on the line.
    const priceInfo = extractPrice(l);
    if (!priceInfo.price) continue;

    const id = extractId(detailUrl) || hashId(detailUrl);
    const key = `${platform}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({
      platform: platform || host || 'UNKNOWN',
      id,
      title,
      image: (image && !image.startsWith('blob:') && !image.startsWith('data:')) ? image : '',
      price: priceInfo.price,
      currency: priceInfo.currency,
      rawPrice: priceInfo.raw,
      url: detailUrl,
      fetchMode: 'jina',
      sourceUrl: '',
    });
  }

  return items;
}

function normalizeUrl(url) {
  const u = String(url || '').trim();
  if (u.startsWith('http://')) return `https://${u.slice('http://'.length)}`;
  if (u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `https:${u}`;
  // r.jina.ai sometimes emits relative links; keep them as-is (caller can filter by host).
  return u;
}

function extractFirstHttpImage(line) {
  // Find first "(http...)" which looks like an image link.
  const m = line.match(/\((https?:\/\/[^\s)]+)\)/i);
  return m ? m[1] : '';
}

function extractImageAltTitle(line) {
  // Example: ![Image 1: Product Name](https://...)
  const m = line.match(/!\[[^\]]*?:\s*([^\]]+)\]/);
  return m ? String(m[1]).replace(/\s+/g, ' ').trim() : '';
}

function extractLastMarkdownLink(line) {
  // Find last [text](url) occurrence.
  const s = String(line || '');
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  let last = null;
  while ((m = re.exec(s))) {
    last = { text: m[1], url: m[2] };
  }
  return last;
}

function extractPrice(line) {
  const s = String(line || '');
  // Support common symbols.
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
  const m1 = u.match(/[?&]id=(\d{5,})/);
  if (m1 && m1[1]) return m1[1];
  const m2 = u.match(/-(\d{6,})(?:[/?#]|$)/);
  if (m2 && m2[1]) return m2[1];
  const m3 = u.match(/\/(\d{6,})(?:[/?#]|$)/);
  if (m3 && m3[1]) return m3[1];
  return '';
}

function hashId(url) {
  // Avoid adding a new dependency; simple hash.
  let h = 0;
  const s = String(url || '');
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return `h${Math.abs(h)}`;
}
