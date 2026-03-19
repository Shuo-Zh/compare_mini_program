export class BaseAdapter {
  constructor(name) {
    this.name = name;
  }

  async fetchProductsPage(_keyword, _page, _options = {}) {
    throw new Error('fetchProductsPage must be implemented');
  }

  async fetchProducts(keyword, options = {}) {
    const pages = Math.max(1, Number(options.pages || 1));
    const limit = Math.max(1, Number(options.limit || 8));

    const merged = [];
    const seen = new Set();

    for (let page = 1; page <= pages; page += 1) {
      const rows = await this.fetchProductsPage(keyword, page, options);
      if (!Array.isArray(rows) || !rows.length) continue;

      for (const item of rows) {
        if (!item?.id) continue;
        const key = `${this.name}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
        if (merged.length >= limit) return merged;
      }
    }

    return merged;
  }
}
