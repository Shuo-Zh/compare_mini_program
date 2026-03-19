import { BaseAdapter } from './baseAdapter.js';
import { fetchHtml } from '../utils/browserFetcher.js';

export class TaobaoAdapter extends BaseAdapter {
  constructor() {
    super('淘宝');
  }

  async fetchProductsPage(keyword, page = 1, options = {}) {
    const limit = options.limit || 16;
    const s = (page - 1) * 44;
    const url = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}&s=${s}`;

    const fetched = await fetchHtml(url, {
      useBrowser: options.useBrowser,
      waitForSelector: '.items,.m-itemlist,.tb-main'
    });
    const html = fetched.html || '';

    const rows = [];
    const re = /"nid":"(\d+)"[\s\S]*?"raw_title":"([^"]+)"[\s\S]*?"view_price":"([\d.]+)"[\s\S]*?(?:"pic_url":"([^"]+)")?/g;
    let m = re.exec(html);
    while (m && rows.length < limit) {
      let image = m[4] || '';
      if (image && image.startsWith('//')) image = `https:${image}`;
      rows.push({
        platform: this.name,
        id: m[1],
        title: decodeText(m[2]),
        image,
        attributes: {
          nid: m[1],
          fetchMode: fetched.mode
        },
        price: Number(m[3]),
        currency: 'CNY',
        url: `https://item.taobao.com/item.htm?id=${m[1]}`
      });
      m = re.exec(html);
    }

    return rows;
  }
}

function decodeText(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}
