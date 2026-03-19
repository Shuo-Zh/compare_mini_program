import * as cheerio from 'cheerio';
import { BaseAdapter } from './baseAdapter.js';
import { getWithRetry } from '../utils/httpClient.js';

export class JDAdapter extends BaseAdapter {
  constructor() {
    super('京东');
  }

  async fetchProductsPage(keyword, page = 1, options = {}) {
    const limit = options.limit || 16;
    const p = page * 2 - 1;
    const url = `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}&page=${p}`;
    const response = await getWithRetry(url, { timeout: 15000, retries: 1 });
    const $ = cheerio.load(response.data);

    const items = [];
    $('li.gl-item').each((_, el) => {
      if (items.length >= limit) return;
      const node = $(el);
      const id = node.attr('data-sku') || '';
      if (!id) return;

      const title = node.find('.p-name em').text().replace(/\s+/g, ' ').trim();
      const pValue = node.find('.p-price i').first().text().trim();
      const price = Number(pValue);
      if (!title || !price) return;

      let image = node.find('.p-img img').attr('src') || node.find('.p-img img').attr('data-lazy-img') || '';
      if (image.startsWith('//')) image = `https:${image}`;

      let detail = node.find('.p-name a').attr('href') || '';
      if (detail.startsWith('//')) detail = `https:${detail}`;

      items.push({
        platform: this.name,
        id,
        title,
        image,
        attributes: { sku: id },
        price,
        currency: 'CNY',
        url: detail || `https://item.jd.com/${id}.html`
      });
    });

    return items;
  }
}
