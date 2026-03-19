import { fetchHtml } from '../utils/browserFetcher.js';

export async function scrapeTaobao(keyword, { limit = 12, page = 1, useBrowser = false } = {}) {
  const s = (page - 1) * 44;
  const url = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}&s=${s}`;

  const fetched = await fetchHtml(url, { useBrowser, waitForSelector: '.items,.m-itemlist,.tb-main' });
  const html = fetched.html || '';

  const items = [];
  const re = /\"nid\":\"(\\d+)\"[\\s\\S]*?\"raw_title\":\"([^\"]+)\"[\\s\\S]*?\"view_price\":\"([\\d.]+)\"[\\s\\S]*?(?:\"pic_url\":\"([^\"]+)\")?/g;
  let m = re.exec(html);
  while (m && items.length < limit) {
    let image = m[4] || '';
    if (image && image.startsWith('//')) image = `https:${image}`;
    items.push({
      platform: '淘宝',
      id: m[1],
      title: decodeText(m[2]),
      image,
      price: Number(m[3]),
      currency: 'CNY',
      rawPrice: m[3],
      url: `https://item.taobao.com/item.htm?id=${m[1]}`,
      fetchMode: fetched.mode,
      sourceUrl: url,
    });
    m = re.exec(html);
  }

  return { items, evidence: { platform: '淘宝', url, html } };
}

function decodeText(str) {
  return String(str).replace(/\\\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

