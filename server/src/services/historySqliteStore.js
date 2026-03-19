import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'compare.db');

let dbPromise;

export async function saveRunSqlite(payload) {
  const db = await getDb();
  const createdAt = new Date().toISOString();

  await db.exec('BEGIN');
  try {
    const runResult = await db.run(
      `INSERT INTO compare_runs (
        created_at, keyword, options_json, stats_json, failures_json, image_path, products_count, variants_count, platforms_hit, platforms_failed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        createdAt,
        payload.keyword,
        JSON.stringify(payload.options || {}),
        JSON.stringify(payload.stats || {}),
        JSON.stringify(payload.failures || []),
        payload.imagePath || '',
        Number(payload.stats?.productsCount || 0),
        Number(payload.stats?.variantsCount || 0),
        Number(payload.stats?.platformsHit || 0),
        Number(payload.stats?.platformsFailed || 0)
      ]
    );

    const runId = runResult.lastID;

    const products = Array.isArray(payload.products) ? payload.products : [];
    for (const p of products) {
      await db.run(
        `INSERT INTO compare_items (
          run_id, created_at, keyword, platform, item_id, title, model_code, variant_key, price, currency, price_cny, url, image, attributes_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          createdAt,
          payload.keyword,
          p.platform || '',
          p.id || '',
          p.title || '',
          p.signals?.modelCode || '',
          p.variantKey || '',
          Number(p.price || 0),
          p.currency || 'CNY',
          Number(p.priceCny || 0),
          p.url || '',
          p.image || '',
          JSON.stringify(p.attributes || {})
        ]
      );
    }

    const variants = Array.isArray(payload.variants) ? payload.variants : [];
    await db.run(
      `UPDATE compare_runs SET variants_json = ?, platform_best_json = ? WHERE id = ?`,
      [
        JSON.stringify(variants),
        JSON.stringify(payload.platformBest || []),
        runId
      ]
    );

    await db.exec('COMMIT');

    return {
      id: String(runId),
      createdAt,
      keyword: payload.keyword,
      stats: payload.stats || {},
      options: payload.options || {}
    };
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
}

export async function listRunsSqlite(limit = 20) {
  const db = await getDb();
  const rows = await db.all(
    `SELECT id, created_at, keyword, options_json, products_count, variants_count, platforms_hit, platforms_failed
     FROM compare_runs ORDER BY id DESC LIMIT ?`,
    [Math.max(1, Number(limit || 20))]
  );

  return rows.map((r) => ({
    id: String(r.id),
    createdAt: r.created_at,
    keyword: r.keyword,
    stats: {
      productsCount: r.products_count,
      variantsCount: r.variants_count,
      platformsHit: r.platforms_hit,
      platformsFailed: r.platforms_failed
    },
    options: parseJson(r.options_json, {})
  }));
}

export async function getRunByIdSqlite(id) {
  const db = await getDb();
  const run = await db.get(`SELECT * FROM compare_runs WHERE id = ?`, [Number(id)]);
  if (!run) return null;

  const items = await db.all(
    `SELECT platform, item_id AS id, title, model_code, variant_key, price, currency, price_cny AS priceCny, url, image, attributes_json
     FROM compare_items WHERE run_id = ? ORDER BY price_cny ASC`,
    [Number(id)]
  );

  return {
    id: String(run.id),
    createdAt: run.created_at,
    keyword: run.keyword,
    options: parseJson(run.options_json, {}),
    stats: parseJson(run.stats_json, {}),
    failures: parseJson(run.failures_json, []),
    imagePath: run.image_path,
    platformBest: parseJson(run.platform_best_json, []),
    variants: parseJson(run.variants_json, []),
    products: items.map((it) => ({
      ...it,
      attributes: parseJson(it.attributes_json, {})
    }))
  };
}

export async function getTrendsSqlite(filters = {}) {
  const db = await getDb();
  const days = Math.max(1, Number(filters.days || 30));
  const limit = Math.max(1, Number(filters.limit || 100));

  const where = ['created_at >= datetime(\'now\', ?)'];
  const params = [`-${days} day`];

  if (filters.keyword) {
    where.push('keyword = ?');
    params.push(filters.keyword);
  }
  if (filters.platform) {
    where.push('platform = ?');
    params.push(filters.platform);
  }
  if (filters.modelCode) {
    where.push('model_code = ?');
    params.push(String(filters.modelCode).toUpperCase());
  }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await db.all(
    `SELECT created_at, platform, model_code, variant_key, title, price_cny
     FROM compare_items
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, limit]
  );

  const byPlatform = aggregate(rows, (r) => r.platform || 'UNKNOWN');
  const byModel = aggregate(rows, (r) => r.model_code || 'NO_CODE');

  return {
    total: rows.length,
    byPlatform,
    byModel,
    points: rows.map((r) => ({
      at: r.created_at,
      platform: r.platform,
      modelCode: r.model_code,
      variantKey: r.variant_key,
      title: r.title,
      priceCny: r.price_cny
    }))
  };
}

export async function updateRunImagePathSqlite(id, imagePath) {
  const db = await getDb();
  await db.run(`UPDATE compare_runs SET image_path = ? WHERE id = ?`, [imagePath || '', Number(id)]);
}

export function getSqlitePath() {
  return DB_PATH;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = initDb();
  }
  return dbPromise;
}

async function initDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  let open;
  let sqlite3;
  try {
    ({ open } = await import('sqlite'));
    sqlite3 = await import('sqlite3');
  } catch (error) {
    throw new Error(`SQLite 依赖不可用，请安装 sqlite sqlite3：${error.message}`);
  }

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS compare_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      keyword TEXT NOT NULL,
      options_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      failures_json TEXT NOT NULL,
      image_path TEXT,
      products_count INTEGER DEFAULT 0,
      variants_count INTEGER DEFAULT 0,
      platforms_hit INTEGER DEFAULT 0,
      platforms_failed INTEGER DEFAULT 0,
      variants_json TEXT DEFAULT '[]',
      platform_best_json TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS compare_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      keyword TEXT NOT NULL,
      platform TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model_code TEXT,
      variant_key TEXT,
      price REAL,
      currency TEXT,
      price_cny REAL,
      url TEXT,
      image TEXT,
      attributes_json TEXT,
      FOREIGN KEY(run_id) REFERENCES compare_runs(id)
    );

    CREATE INDEX IF NOT EXISTS idx_items_created_at ON compare_items(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_platform ON compare_items(platform);
    CREATE INDEX IF NOT EXISTS idx_items_model_code ON compare_items(model_code);
    CREATE INDEX IF NOT EXISTS idx_items_keyword ON compare_items(keyword);
  `);

  return db;
}

function parseJson(v, fallback) {
  try {
    return JSON.parse(v);
  } catch (_error) {
    return fallback;
  }
}

function aggregate(rows, keyFn) {
  const m = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    const entry = m.get(key) || {
      key,
      count: 0,
      minPriceCny: Number.POSITIVE_INFINITY,
      maxPriceCny: Number.NEGATIVE_INFINITY,
      avgPriceCny: 0
    };

    entry.count += 1;
    entry.minPriceCny = Math.min(entry.minPriceCny, row.price_cny);
    entry.maxPriceCny = Math.max(entry.maxPriceCny, row.price_cny);
    entry.avgPriceCny += row.price_cny;
    m.set(key, entry);
  }

  return Array.from(m.values())
    .map((x) => ({
      ...x,
      avgPriceCny: Number((x.avgPriceCny / x.count).toFixed(2)),
      minPriceCny: Number(x.minPriceCny.toFixed(2)),
      maxPriceCny: Number(x.maxPriceCny.toFixed(2))
    }))
    .sort((a, b) => a.avgPriceCny - b.avgPriceCny);
}
