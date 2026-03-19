import { fetchHtml } from '../utils/browserFetcher.js';

// Dewu web pages are often JS-rendered + protected.
// This is best-effort: it tries a few candidate search URLs and extracts simple signals.
export async function scrapeDewu(keyword, { limit = 8, useBrowser = true } = {}) {
  const candidates = [
    `https://www.dewu.com/search?keyword=${encodeURIComponent(keyword)}`,
    `https://www.dewu.com/search?key=${encodeURIComponent(keyword)}`,
    `https://www.dewu.com/`,
  ];

  let last = null;
  for (const url of candidates) {
    try {
      const fetched = await fetchHtml(url, { useBrowser, waitForSelector: 'body', extraWaitMs: 1200 });
      const html = fetched.html || '';
      const items = extractItemsFromHtml(html, limit).map((x, idx) => ({
        platform: '得物',
        id: x.id || `dewu-${idx + 1}`,
        title: x.title || keyword,
        image: x.image || '',
        price: x.price || 0,
        currency: 'CNY',
        rawPrice: x.rawPrice || '',
        url: x.url || url,
        fetchMode: fetched.mode,
        sourceUrl: url,
      })).filter((x) => x.price > 0);

      return { items, evidence: { platform: '得物', url, html } };
    } catch (e) {
      last = e;
    }
  }

  const msg = last && last.message ? last.message : 'Dewu scrape failed';
  throw new Error(`得物抓取失败（可能被风控/需渲染）：${msg}`);
}

function extractItemsFromHtml(html, limit) {
  const s = String(html || '');
  const out = [];

  // Heuristic JSON patterns (may break if Dewu changes).
  const re = /\"(spuId|goodsId|id)\"\\s*:\\s*\"?(\\d{6,})\"?[\\s\\S]*?\"(title|name)\"\\s*:\\s*\"([^\"]{4,})\"[\\s\\S]*?(\"price\"\\s*:\\s*\"?([\\d.]{2,})\"?)/g;
  let m = re.exec(s);
  while (m && out.length < limit) {
    out.push({
      id: m[2],
      title: m[4],
      price: Number(m[6] || 0),
      rawPrice: m[6] || '',
    });
    m = re.exec(s);
  }

  return out;
}

