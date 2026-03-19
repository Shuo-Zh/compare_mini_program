import { BaseAdapter } from './baseAdapter.js';
import { fetchHtml } from '../utils/browserFetcher.js';

export class PDDAdapter extends BaseAdapter {
  constructor() {
    super('拼多多');
  }

  async fetchProductsPage(keyword, page = 1, options = {}) {
    const offset = (page - 1) * 20;
    const url = `https://mobile.yangkeduo.com/search_result.html?search_key=${encodeURIComponent(keyword)}&list_id=${offset}`;

    const fetched = await fetchHtml(url, {
      useBrowser: options.useBrowser,
      waitForSelector: 'body'
    });
    const html = fetched.html || '';

    const rows = [];
    const re = /goods_id["']?\s*[:=]\s*["']?(\d+)["']?[\s\S]*?goods_name["']?\s*[:=]\s*["']([^"']+)["'][\s\S]*?(?:min_group_price|price)["']?\s*[:=]\s*(\d+)/g;
    let m = re.exec(html);
    while (m && rows.length < 16) {
      const rawFen = Number(m[3] || 0);
      const price = rawFen > 5000 ? Number((rawFen / 100).toFixed(2)) : 0;
      rows.push({
        platform: this.name,
        id: m[1],
        title: m[2],
        image: '',
        attributes: {
          goodsId: m[1],
          fetchMode: fetched.mode
        },
        price,
        currency: 'CNY',
        url: `https://mobile.yangkeduo.com/goods.html?goods_id=${m[1]}`
      });
      m = re.exec(html);
    }

    return rows.filter((p) => p.price > 0);
  }
}
