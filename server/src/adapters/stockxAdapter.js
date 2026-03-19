import * as cheerio from 'cheerio';
import { BaseAdapter } from './baseAdapter.js';
import { getWithRetry } from '../utils/httpClient.js';

export class StockXAdapter extends BaseAdapter {
  constructor() {
    super('StockX');
  }

  async fetchProductsPage(keyword, page = 1, options = {}) {
    const limit = options.limit || 16;
    const url = `https://stockx.com/search?s=${encodeURIComponent(keyword)}&page=${page}`;
    const response = await getWithRetry(url, { timeout: 15000, retries: 1 });
    const $ = cheerio.load(response.data);

    const jsonText = $('#__NEXT_DATA__').html() || '';
    if (!jsonText) return [];

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (_error) {
      return [];
    }

    const products = parsed?.props?.pageProps?.products || parsed?.props?.pageProps?.browse?.products || [];
    return products.slice(0, limit).map((p, idx) => ({
      platform: this.name,
      id: String(p.id || p.objectID || p.uuid || `sx-${page}-${idx + 1}`),
      title: p.title || p.name || p.shortDescription || keyword,
      image: p.media?.imageUrl || p.thumbnail || '',
      attributes: {
        brand: p.brand || '',
        styleId: p.styleId || '',
        colorway: p.colorway || ''
      },
      price: Number(p.market?.lowestAsk || p.lowest_ask || p.retailPrice || 0),
      currency: 'USD',
      url: p.urlKey ? `https://stockx.com/${p.urlKey}` : url
    })).filter((p) => p.price > 0);
  }
}
