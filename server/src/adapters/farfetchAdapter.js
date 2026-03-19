import { BaseAdapter } from './baseAdapter.js';
import { scrapeFarfetch } from '../scrapers/farfetchScraper.js';

export class FarfetchAdapter extends BaseAdapter {
  constructor() {
    super('Farfetch');
  }

  async fetchProductsPage(keyword, page = 1, options = {}) {
    const limit = options.limit || 16;
    const result = await scrapeFarfetch(keyword, { limit, page, viaJina: true });
    const items = Array.isArray(result?.items) ? result.items : [];

    return items.map((p) => ({
      platform: this.name,
      id: p.id,
      title: p.title,
      image: p.image,
      attributes: {
        rawPrice: p.rawPrice || '',
        fetchMode: p.fetchMode || 'http',
      },
      price: Number(p.price || 0),
      currency: p.currency || 'CNY',
      url: p.url,
    }));
  }
}
