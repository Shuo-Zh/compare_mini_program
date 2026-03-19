import * as cheerio from 'cheerio';
import { fetchHtml } from '../utils/browserFetcher.js';

const BASE = 'https://books.toscrape.com/';
const CATEGORY_URL = `${BASE}catalogue/category/books_1/index.html`;

export async function scrapeBooks(keyword, { limit = 12 } = {}) {
  const fetched = await fetchHtml(CATEGORY_URL, { useBrowser: false, waitForSelector: '.product_pod' });
  const html = fetched.html || '';
  const $ = cheerio.load(html);

  const q = String(keyword || '').trim().toLowerCase();
  const items = [];

  $('article.product_pod').each((_, el) => {
    if (items.length >= limit) return;
    const a = $(el).find('h3 a');
    const title = (a.attr('title') || a.text() || '').trim();
    if (q && !title.toLowerCase().includes(q)) return;

    const href = String(a.attr('href') || '').trim();
    const url = href ? new URL(href.replace(/^(\.\.\/)+/, 'catalogue/'), BASE).toString() : '';

    let image = String($(el).find('img').attr('src') || '').trim();
    if (image) image = new URL(image.replace(/^(\.\.\/)+/, ''), BASE).toString();

    const priceText = $(el).find('.price_color').text().trim(); // e.g. "£51.77"
    const price = Number(priceText.replace(/[^0-9.]/g, ''));

    // Use the last path segment (without extension) as a stable-ish item id.
    const itemId = url ? url.split('/').filter(Boolean).pop().replace(/\.html?$/i, '') : `books-${items.length + 1}`;

    items.push({
      platform: 'BooksToScrape',
      id: itemId,
      title,
      image,
      price: Number.isFinite(price) ? price : 0,
      currency: 'GBP',
      rawPrice: priceText,
      url,
      fetchMode: fetched.mode,
      sourceUrl: CATEGORY_URL,
    });
  });

  return { items, evidence: { platform: 'BooksToScrape', url: CATEGORY_URL, html } };
}

