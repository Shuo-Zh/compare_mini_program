import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'compare-history.jsonl');

export async function saveRun(payload) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...payload
  };

  await fs.appendFile(DATA_FILE, `${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

export async function listRuns(limit = 20) {
  const all = await readAll();
  return all.slice(-limit).reverse().map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    keyword: r.keyword,
    stats: r.stats,
    options: r.options
  }));
}

export async function getRunById(id) {
  const all = await readAll();
  return all.find((r) => r.id === id) || null;
}

export async function getTrendsFromJsonl(filters = {}) {
  const all = await readAll();
  const days = Math.max(1, Number(filters.days || 30));
  const startMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const points = [];
  for (const run of all) {
    const ts = new Date(run.createdAt || 0).getTime();
    if (!ts || ts < startMs) continue;

    const products = Array.isArray(run.products) ? run.products : [];
    for (const p of products) {
      if (filters.keyword && run.keyword !== filters.keyword) continue;
      if (filters.platform && p.platform !== filters.platform) continue;
      if (filters.modelCode && String(p.signals?.modelCode || '').toUpperCase() !== String(filters.modelCode).toUpperCase()) {
        continue;
      }

      points.push({
        at: run.createdAt,
        platform: p.platform,
        modelCode: p.signals?.modelCode || '',
        variantKey: p.variantKey,
        title: p.title,
        priceCny: Number(p.priceCny || 0)
      });
    }
  }

  points.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  const limited = points.slice(0, Math.max(1, Number(filters.limit || 100)));

  return {
    total: limited.length,
    byPlatform: aggregate(limited, (x) => x.platform || 'UNKNOWN'),
    byModel: aggregate(limited, (x) => x.modelCode || 'NO_CODE'),
    points: limited
  };
}

export function getJsonlPath() {
  return DATA_FILE;
}

async function readAll() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_error) {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
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
    entry.minPriceCny = Math.min(entry.minPriceCny, row.priceCny);
    entry.maxPriceCny = Math.max(entry.maxPriceCny, row.priceCny);
    entry.avgPriceCny += row.priceCny;
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
