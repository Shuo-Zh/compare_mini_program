import { getWithRetry } from '../utils/httpClient.js';

export async function scrapeFarfetch(keyword, { limit = 12, page = 1, viaJina = true } = {}) {
  // Use Farfetch CN global search so any keyword (e.g. "Nike Dunk", "T-shirt") returns relevant results.
  const listingUrl = `https://www.farfetch.com/cn/shopping/women/search/items.aspx?q=${encodeURIComponent(keyword)}&page=${page}`;

  if (viaJina) {
    const jinaUrl = `https://r.jina.ai/http://www.farfetch.com/cn/shopping/women/search/items.aspx?q=${encodeURIComponent(keyword)}&page=${page}`;
    const resp = await getWithRetry(jinaUrl, { timeout: 25000, retries: 1 });
    const md = String(resp.data || '');
    const items = parseJinaMarkdown(md, limit);
    return { items, evidence: { platform: 'Farfetch', url: jinaUrl, html: md } };
  }

  // Direct fetch is typically blocked by Akamai in many networks; kept for completeness.
  const resp = await getWithRetry(listingUrl, { timeout: 20000, retries: 1, validateStatus: (c) => c >= 200 && c < 500 });
  const html = String(resp.data || '');
  if (isAccessDenied(html)) {
    return { items: [], evidence: { platform: 'Farfetch', url: listingUrl, html } };
  }
  // If direct fetch ever works, r.jina.ai parsing is still a better normalized representation,
  // so we keep a minimal extractor here based on item-<id> urls.
  const items = extractFromHtml(html, limit);
  return { items, evidence: { platform: 'Farfetch', url: listingUrl, html } };
}

function extractId(url) {
  const m = String(url).match(/-(\d+)\.aspx/i);
  return m ? m[1] : '';
}

function isAccessDenied(html) {
  const s = String(html || '').toLowerCase();
  return s.includes('<title>access denied</title>') || s.includes("you don't have permission to access");
}

function parseJinaMarkdown(md, limit) {
  const lines = String(md || '').split(/\r?\n/);
  const items = [];
  const seen = new Set();

  for (const line of lines) {
    if (items.length >= limit) break;
    const l = String(line || '').trimStart();
    if (!l.startsWith('*')) continue;
    if (!l.includes('farfetch-contents.com')) continue;
    if (!l.includes('item-') || !l.includes('.aspx')) continue;

    // Example:
    // *   [![Image 1: xxx](https://cdn-images.farfetch-contents.com/..jpg) ... ¥955 ¥764 ...](http://www.farfetch.com/...item-34240288.aspx)
    // Detail URL is the last markdown link target on the line.
    const linkStart = l.lastIndexOf('](');
    if (linkStart < 0) continue;
    const linkEnd = l.indexOf(')', linkStart + 2);
    if (linkEnd < 0) continue;
    let detailUrl = l.slice(linkStart + 2, linkEnd).trim();
    // WeChat webview is much more reliable with https links.
    if (detailUrl.startsWith('http://www.farfetch.com/')) {
      detailUrl = `https://${detailUrl.slice('http://'.length)}`;
    } else if (detailUrl.startsWith('http://farfetch.com/')) {
      detailUrl = `https://${detailUrl.slice('http://'.length)}`;
    }
    const idMatch = detailUrl.match(/item-(\d+)\.aspx/i);
    const id = (idMatch && idMatch[1]) || extractId(detailUrl);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    // Image URL is inside the first "(https://cdn-images.farfetch-contents.com...)".
    let image = '';
    const imgMarker = '(https://cdn-images.farfetch-contents.com';
    const imgStart = l.indexOf(imgMarker);
    if (imgStart >= 0) {
      const imgEnd = l.indexOf(')', imgStart + 1);
      if (imgEnd > imgStart) image = l.slice(imgStart + 1, imgEnd).trim();
    }

    // Title: take the text part after image-url close and before first currency sign.
    let title = '';
    let rawText = l;
    const afterImg = rawText.split(') ')[1] || '';
    if (afterImg) {
      const cut = afterImg.split('](')[0] || '';
      const idx = cut.indexOf('¥');
      title = (idx >= 0 ? cut.slice(0, idx) : cut).replace(/\s+/g, ' ').trim();
      // Remove common promo prefixes.
      title = title.replace(/^(?:\d+%\s*优惠已计入\s*)/i, '').replace(/^(?:新季\s*)/, '').trim();
    }
    if (!title) {
      const alt = line.match(/!\[[^:]*:\s*([^\]]+)\]/);
      title = alt ? alt[1].trim() : `Farfetch item ${id}`;
    }

    // Price: use the last "¥<num>" on the line as current price.
    const priceMatches = Array.from(l.matchAll(/¥\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g)).map((m) => m[1]);
    const last = priceMatches.length ? priceMatches[priceMatches.length - 1] : '';
    const price = last ? Number(last.replace(/,/g, '')) : 0;

    items.push({
      platform: 'Farfetch',
      id,
      title,
      image,
      price,
      currency: 'CNY',
      rawPrice: priceMatches.length ? priceMatches.map((x) => `¥${x}`).join(' ') : '',
      url: detailUrl,
      fetchMode: 'jina',
      sourceUrl: '',
    });
  }

  return items;
}

function extractFromHtml(html, limit) {
  const s = String(html || '');
  const out = [];
  const seen = new Set();
  const re = /href="(\/cn\/shopping\/[^"]+?item-(\d+)\.aspx[^"]*)"/gi;
  let m;
  while ((m = re.exec(s)) && out.length < limit) {
    const path = m[1];
    const id = m[2];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      platform: 'Farfetch',
      id,
      title: `Farfetch item ${id}`,
      image: '',
      price: 0,
      currency: 'CNY',
      rawPrice: '',
      url: `https://www.farfetch.com${path}`,
      fetchMode: 'http',
      sourceUrl: '',
    });
  }
  return out;
}
