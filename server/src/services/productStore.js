import fs from 'fs/promises';
import path from 'path';
import { tokenizeTitle } from '../utils/similarity.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'compare.db');

let dbPromise;

export async function initProductDb() {
  await getDb();
}

export async function createScrapeRun({ keyword, sourceUrl, platforms, options, evidencePath }) {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO scrape_runs (created_at, keyword, source_url, platforms_json, options_json, evidence_path)\n     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      createdAt,
      keyword || '',
      sourceUrl || '',
      JSON.stringify(platforms || []),
      JSON.stringify(options || {}),
      evidencePath || '',
    ],
  );
  return { id: String(result.lastID), createdAt };
}

export async function saveScrapedProducts(runId, products = []) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  await db.exec('BEGIN');
  try {
    for (const p of products) {
      await db.run(
        `INSERT OR REPLACE INTO scraped_products (\n          run_id, created_at, platform, item_id, title, image, price, currency, price_cny, url, raw_price, fetch_mode\n        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Number(runId),
          createdAt,
          p.platform || '',
          p.id || '',
          p.title || '',
          p.image || '',
          Number(p.price || 0),
          p.currency || 'CNY',
          Number(p.priceCny || 0),
          p.url || '',
          p.rawPrice || '',
          p.fetchMode || 'http',
        ],
      );

      const siteId = await getOrCreateSiteId(db, p.platform, p.url);
      const productId = await upsertProduct(db, {
        siteId,
        platform: p.platform || '',
        itemId: p.id || '',
        title: p.title || '',
        image: p.image || '',
        url: p.url || '',
        brand: p.brand || '',
        sku: p.sku || p.modelCode || '',
        price: Number(p.price || 0),
        currency: p.currency || 'CNY',
        priceCny: Number(p.priceCny || 0),
        rawPrice: p.rawPrice || '',
        fetchMode: p.fetchMode || 'http',
        createdAt,
      });

      if (productId) {
        await db.run(
          `INSERT INTO product_prices (product_id, created_at, price, currency, price_cny, raw_price)\n           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            Number(productId),
            createdAt,
            Number(p.price || 0),
            p.currency || 'CNY',
            Number(p.priceCny || 0),
            p.rawPrice || '',
          ],
        );
      }
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

export async function listProducts({ keyword, platform, limit = 50 } = {}) {
  const db = await getDb();
  const where = [];
  const params = [];
  if (keyword) {
    where.push('title LIKE ?');
    params.push(`%${keyword}%`);
  }
  if (platform) {
    where.push('platform = ?');
    params.push(platform);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.all(
    `SELECT id, created_at, platform, item_id, title, image, price, currency, price_cny AS priceCny, url, raw_price AS rawPrice, fetch_mode AS fetchMode\n     FROM scraped_products\n     ${whereSql}\n     ORDER BY id DESC\n     LIMIT ?`,
    [...params, Math.max(1, Number(limit || 50))],
  );
  return rows.map((r) => ({
    ...r,
    id: String(r.id),
  }));
}

export async function listRelatedProducts({ title, limit = 12, excludePlatform = '', excludeItemId = '' } = {}) {
  const db = await getDb();
  const toks = tokenizeTitle(title || '').slice(0, 4);
  if (!toks.length) return [];

  const where = [];
  const params = [];

  // Match any of the top tokens (OR) to keep results broad.
  const or = toks.map(() => 'title LIKE ?').join(' OR ');
  where.push(`(${or})`);
  for (const t of toks) params.push(`%${t}%`);

  if (excludePlatform && excludeItemId) {
    where.push('NOT (platform = ? AND item_id = ?)');
    params.push(excludePlatform, excludeItemId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.all(
    `SELECT id, created_at AS createdAt, platform, item_id AS itemId, title, image, price_cny AS priceCny, currency, url
     FROM scraped_products
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, Math.max(1, Math.min(60, Number(limit || 12)))],
  );

  return rows.map((r) => ({ ...r, id: String(r.id) }));
}

export async function listScrapeRuns(limit = 20) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT id, created_at, keyword, source_url AS sourceUrl, platforms_json AS platformsJson, options_json AS optionsJson, evidence_path AS evidencePath\n     FROM scrape_runs ORDER BY id DESC LIMIT ?`,
    [Math.max(1, Number(limit || 20))],
  );
  return rows.map((r) => ({
    id: String(r.id),
    createdAt: r.created_at,
    keyword: r.keyword,
    sourceUrl: r.sourceUrl,
    platforms: safeJson(r.platformsJson, []),
    options: safeJson(r.optionsJson, {}),
    evidencePath: r.evidencePath || '',
  }));
}

// Crawl jobs (for large-scale discovery, e.g. Farfetch listing crawl).
export async function createCrawlJob({ platform, seeds = [], options = {} }) {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO crawl_jobs (created_at, platform, status, seeds_json, options_json, pages_visited, items_found, errors_json)\n     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createdAt,
      platform || '',
      'running',
      JSON.stringify(seeds || []),
      JSON.stringify(options || {}),
      0,
      0,
      JSON.stringify([]),
    ],
  );
  return { id: String(result.lastID), createdAt };
}

export async function updateCrawlJobProgress(jobId, patch = {}) {
  const db = await getDb();
  const allowed = new Set(['status', 'pages_visited', 'items_found', 'errors_json']);
  const fields = [];
  const params = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (!allowed.has(k)) continue;
    fields.push(`${k} = ?`);
    params.push(k === 'errors_json' ? JSON.stringify(v || []) : v);
  }
  if (!fields.length) return;
  await db.run(`UPDATE crawl_jobs SET ${fields.join(', ')} WHERE id = ?`, [...params, Number(jobId)]);
}

export async function getCrawlJob(jobId) {
  const db = await getDb();
  const row = await db.get(
    `SELECT id, created_at, platform, status, seeds_json AS seedsJson, options_json AS optionsJson,\n     pages_visited AS pagesVisited, items_found AS itemsFound, errors_json AS errorsJson\n     FROM crawl_jobs WHERE id = ?`,
    [Number(jobId)],
  );
  if (!row) return null;
  return {
    id: String(row.id),
    createdAt: row.created_at,
    platform: row.platform,
    status: row.status,
    seeds: safeJson(row.seedsJson, []),
    options: safeJson(row.optionsJson, {}),
    pagesVisited: Number(row.pagesVisited || 0),
    itemsFound: Number(row.itemsFound || 0),
    errors: safeJson(row.errorsJson, []),
  };
}

export async function saveDiscoveredItems(jobId, platform, items = []) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  await db.exec('BEGIN');
  try {
    for (const it of items) {
      await db.run(
        `INSERT OR IGNORE INTO discovered_items (job_id, created_at, platform, item_id, url, source_url)\n         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          Number(jobId),
          createdAt,
          platform || '',
          it.itemId || '',
          it.url || '',
          it.sourceUrl || '',
        ],
      );
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

export async function listDiscoveredItems({ platform, limit = 50, offset = 0, jobId } = {}) {
  const db = await getDb();
  const where = [];
  const params = [];
  if (platform) {
    where.push('platform = ?');
    params.push(platform);
  }
  if (jobId) {
    where.push('job_id = ?');
    params.push(Number(jobId));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.all(
    `SELECT id, created_at, job_id AS jobId, platform, item_id AS itemId, url, source_url AS sourceUrl\n     FROM discovered_items\n     ${whereSql}\n     ORDER BY id ASC\n     LIMIT ? OFFSET ?`,
    [...params, Math.max(1, Number(limit || 50)), Math.max(0, Number(offset || 0))],
  );
  return rows.map((r) => ({ ...r, id: String(r.id), jobId: String(r.jobId) }));
}

// Item snapshots (time-series) for a specific product (platform + item_id).
export async function saveItemSnapshot(snapshot = {}) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  const platform = String(snapshot.platform || '').trim();
  const itemId = String(snapshot.itemId || snapshot.id || '').trim();
  if (!platform) throw new Error('platform is required');
  if (!itemId) throw new Error('itemId is required');

  const title = String(snapshot.title || '').trim();
  const image = String(snapshot.image || '').trim();
  const url = String(snapshot.url || '').trim();
  const priceCny = Number(snapshot.priceCny ?? snapshot.price ?? 0);
  const currency = String(snapshot.currency || 'CNY').trim() || 'CNY';
  const rawPrice = String(snapshot.rawPrice || '').trim();
  const fetchMode = String(snapshot.fetchMode || '').trim();

  const result = await db.run(
    `INSERT INTO item_snapshots (
      created_at, platform, item_id, title, image, url, price_cny, currency, raw_price, fetch_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [createdAt, platform, itemId, title, image, url, priceCny, currency, rawPrice, fetchMode],
  );

  return { id: String(result.lastID), createdAt };
}

export async function listItemSnapshots({ platform, itemId, days = 30, limit = 200 } = {}) {
  const db = await getDb();
  const p = String(platform || '').trim();
  const id = String(itemId || '').trim();
  if (!p) throw new Error('platform is required');
  if (!id) throw new Error('itemId is required');

  const maxDays = Math.max(1, Math.min(365, Number(days || 30)));
  const maxLimit = Math.max(1, Math.min(2000, Number(limit || 200)));

  const rows = await db.all(
    `SELECT id, created_at AS createdAt, platform, item_id AS itemId, title, image, url, price_cny AS priceCny, currency, raw_price AS rawPrice, fetch_mode AS fetchMode
     FROM item_snapshots
     WHERE platform = ? AND item_id = ? AND created_at >= datetime('now', ?)
     ORDER BY created_at ASC
     LIMIT ?`,
    [p, id, `-${maxDays} day`, maxLimit],
  );

  return rows.map((r) => ({
    ...r,
    id: String(r.id),
  }));
}

async function getDb() {
  if (!dbPromise) dbPromise = initDb();
  return dbPromise;
}

async function initDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let open;
  let sqlite3Mod;
  try {
    ({ open } = await import('sqlite'));
    sqlite3Mod = await import('sqlite3');
  } catch (error) {
    throw new Error(`SQLite 依赖不可用，请安装 sqlite sqlite3: ${error.message}`);
  }

  // sqlite3 is CommonJS; ESM import shape can vary across versions.
  const driver =
    sqlite3Mod?.Database ||
    sqlite3Mod?.default?.Database ||
    sqlite3Mod?.default;
  if (!driver) {
    throw new Error('sqlite3 driver is not defined');
  }

  const db = await open({ filename: DB_PATH, driver });

  const schemaSql = `
    CREATE TABLE IF NOT EXISTS scrape_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      keyword TEXT NOT NULL,
      source_url TEXT,
      platforms_json TEXT NOT NULL,
      options_json TEXT NOT NULL,
      evidence_path TEXT
    );

    CREATE TABLE IF NOT EXISTS scraped_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      platform TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      image TEXT,
      price REAL,
      currency TEXT,
      price_cny REAL,
      url TEXT,
      raw_price TEXT,
      fetch_mode TEXT,
      UNIQUE(platform, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_scraped_created_at ON scraped_products(created_at);
    CREATE INDEX IF NOT EXISTS idx_scraped_platform ON scraped_products(platform);

    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      base_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(platform, base_url)
    );

    CREATE INDEX IF NOT EXISTS idx_sites_platform ON sites(platform);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER,
      platform TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      image TEXT,
      url TEXT,
      brand TEXT,
      sku TEXT,
      price REAL,
      currency TEXT,
      price_cny REAL,
      raw_price TEXT,
      fetch_mode TEXT,
      last_seen TEXT,
      UNIQUE(platform, item_id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_platform ON products(platform);
    CREATE INDEX IF NOT EXISTS idx_products_site ON products(site_id);

    CREATE TABLE IF NOT EXISTS product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      price REAL,
      currency TEXT,
      price_cny REAL,
      raw_price TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_product_prices_product ON product_prices(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_prices_created_at ON product_prices(created_at);

    CREATE TABLE IF NOT EXISTS crawl_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL,
      seeds_json TEXT NOT NULL,
      options_json TEXT NOT NULL,
      pages_visited INTEGER NOT NULL,
      items_found INTEGER NOT NULL,
      errors_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discovered_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      platform TEXT NOT NULL,
      item_id TEXT NOT NULL,
      url TEXT NOT NULL,
      source_url TEXT,
      UNIQUE(platform, item_id),
      UNIQUE(url)
    );

    CREATE INDEX IF NOT EXISTS idx_discovered_platform ON discovered_items(platform);
    CREATE INDEX IF NOT EXISTS idx_discovered_job ON discovered_items(job_id);

    CREATE TABLE IF NOT EXISTS item_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      platform TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT,
      image TEXT,
      url TEXT,
      price_cny REAL,
      currency TEXT,
      raw_price TEXT,
      fetch_mode TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_item_snapshots_key ON item_snapshots(platform, item_id);
    CREATE INDEX IF NOT EXISTS idx_item_snapshots_created_at ON item_snapshots(created_at);
  `;
  await db.exec(schemaSql);

  return db;
}

function safeJson(v, fallback) {
  try {
    return JSON.parse(v);
  } catch (_e) {
    return fallback;
  }
}

function baseOrigin(url) {
  const u = String(url || '').trim();
  if (!u || !/^https?:\/\//i.test(u)) return '';
  try {
    const parsed = new URL(u);
    return `${parsed.protocol}//${parsed.host}`;
  } catch (_e) {
    return '';
  }
}

async function getOrCreateSiteId(db, platform, url) {
  const baseUrl = baseOrigin(url);
  if (!platform || !baseUrl) return null;
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT OR IGNORE INTO sites (platform, base_url, created_at) VALUES (?, ?, ?)`,
    [platform, baseUrl, createdAt],
  );
  const row = await db.get(`SELECT id FROM sites WHERE platform = ? AND base_url = ?`, [platform, baseUrl]);
  return row ? Number(row.id) : null;
}

async function upsertProduct(db, p) {
  if (!p.platform || !p.itemId) return null;
  await db.run(
    `INSERT INTO products (
      site_id, platform, item_id, title, image, url, brand, sku, price, currency, price_cny, raw_price, fetch_mode, last_seen
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform, item_id) DO UPDATE SET
      site_id=excluded.site_id,
      title=excluded.title,
      image=excluded.image,
      url=excluded.url,
      brand=excluded.brand,
      sku=excluded.sku,
      price=excluded.price,
      currency=excluded.currency,
      price_cny=excluded.price_cny,
      raw_price=excluded.raw_price,
      fetch_mode=excluded.fetch_mode,
      last_seen=excluded.last_seen`,
    [
      p.siteId,
      p.platform,
      p.itemId,
      p.title,
      p.image,
      p.url,
      p.brand,
      p.sku,
      Number(p.price || 0),
      p.currency || 'CNY',
      Number(p.priceCny || 0),
      p.rawPrice || '',
      p.fetchMode || 'http',
      p.createdAt || new Date().toISOString(),
    ],
  );

  const row = await db.get(`SELECT id FROM products WHERE platform = ? AND item_id = ?`, [p.platform, p.itemId]);
  return row ? Number(row.id) : null;
}
