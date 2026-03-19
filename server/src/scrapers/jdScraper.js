import * as cheerio from 'cheerio';
import { fetchHtml } from '../utils/browserFetcher.js';
import { getWithRetry } from '../utils/httpClient.js';

// JD search pages are mostly server-rendered HTML, but prices are typically served by a separate endpoint.
export async function scrapeJd(keyword, { limit = 12, page = 1 } = {}) {
  const url = `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}&page=${Number(page) || 1}`;

  const fetched = await fetchHtml(url, { useBrowser: false, waitForSelector: '.gl-warp-wrap,.gl-warp' });
  const html = fetched.html || '';
  const $ = cheerio.load(html);

  const items = [];
  const skus = [];

  $('li.gl-item[data-sku]').each((_, el) => {
    if (items.length >= limit) return;
    const sku = String($(el).attr('data-sku') || '').trim();
    if (!sku) return;

    const title = $(el).find('.p-name em').text().replace(/\s+/g, ' ').trim();
    let image =
      $(el).find('.p-img img').attr('data-lazy-img') ||
      $(el).find('.p-img img').attr('src') ||
      '';
    image = String(image).trim();
    if (image && image.startsWith('//')) image = `https:${image}`;
    if (image && image.startsWith('/')) image = `https://img10.360buyimg.com${image}`;

    items.push({
      platform: '京东',
      id: sku,
      title,
      image,
      price: 0,
      currency: 'CNY',
      rawPrice: '',
      url: `https://item.jd.com/${sku}.html`,
      fetchMode: fetched.mode,
      sourceUrl: url,
    });
    skus.push(sku);
  });

  let pricesText = '';
  try {
    const priceUrl = `https://p.3.cn/prices/mgets?skuIds=${skus.map((s) => `J_${s}`).join(',')}`;
    const resp = await getWithRetry(priceUrl, {
      timeout: 12000,
      retries: 1,
      headers: { referer: url, accept: 'application/json,text/plain,*/*' },
    });
    pricesText = String(resp.data || '');
    const arr = JSON.parse(pricesText);
    const bySku = new Map();
    for (const row of Array.isArray(arr) ? arr : []) {
      const skuId = String(row?.id || '').replace(/^J_/, '');
      const p = Number(row?.p || row?.op || 0);
      if (skuId) bySku.set(skuId, p);
    }
    for (const it of items) {
      const p = bySku.get(it.id);
      if (typeof p === 'number' && Number.isFinite(p) && p > 0) {
        it.price = p;
        it.rawPrice = String(p);
      }
    }
  } catch (_e) {
    // If price endpoint fails, keep price = 0; evidence still shows the search HTML.
  }

  const evidenceHtml = `<!-- jd:search -->\n${html}\n\n<!-- jd:prices -->\n${pricesText}\n`;
  return { items, evidence: { platform: '京东', url, html: evidenceHtml } };
}
