import { FarfetchAdapter } from '../adapters/farfetchAdapter.js';
import { JDAdapter } from '../adapters/jdAdapter.js';
import { TaobaoAdapter } from '../adapters/taobaoAdapter.js';
import { PDDAdapter } from '../adapters/pddAdapter.js';
import { StockXAdapter } from '../adapters/stockxAdapter.js';
import { toCny } from '../utils/fx.js';
import {
  buildVariantKey,
  extractNikeDunkSignals,
  isNikeDunkLike,
  matchesModelCode
} from '../utils/productNormalizer.js';
import { groupSimilarProducts } from '../utils/similarity.js';

const adapters = [
  new FarfetchAdapter(),
  new JDAdapter(),
  new TaobaoAdapter(),
  new PDDAdapter(),
  new StockXAdapter()
];

export async function buildPriceComparison(keyword, options = {}) {
  const limitPerSource = Math.max(1, Number(options.limitPerSource || 8));
  const pages = Math.max(1, Number(options.pages || 1));
  const nikeOnly = toBool(options.nikeOnly, true);
  const strictMode = toBool(options.strictMode, false);
  const useBrowser = toBool(options.useBrowser, false);
  const modelCode = (options.modelCode || '').toString().trim().toUpperCase();

  const settled = await Promise.allSettled(
    adapters.map((adapter) => adapter.fetchProducts(keyword, { limit: limitPerSource, pages, useBrowser }))
  );

  const failures = [];
  const flatProducts = [];

  for (let i = 0; i < settled.length; i += 1) {
    const adapter = adapters[i];
    const result = settled[i];
    if (result.status === 'rejected') {
      failures.push({ platform: adapter.name, reason: normalizeError(result.reason) });
      continue;
    }

    const list = Array.isArray(result.value) ? result.value : [];
    for (const p of list) {
      if (!p || !p.id || !p.title || !p.price) continue;

      if (nikeOnly && !isNikeDunkLike(p.title)) {
        if (strictMode) continue;
      }

      if (!matchesModelCode(p.title, modelCode)) continue;

      const priceCny = await toCny(Number(p.price), p.currency || 'CNY');
      const signals = extractNikeDunkSignals(p.title);

      flatProducts.push({
        ...p,
        keyword,
        price: Number(p.price),
        currency: p.currency || 'CNY',
        priceCny,
        variantKey: buildVariantKey(p),
        matchScore: calcMatchScore(keyword, p.title, signals),
        signals
      });
    }
  }

  if (!flatProducts.length) {
    throw new Error('没有抓到可用商品：可尝试关闭 strictMode、增大 pages 或更换关键词');
  }

  // Best-effort "same item" grouping across platforms, independent from nike-only variantKey logic.
  const { groupByIndex, groups: matchGroups } = groupSimilarProducts(flatProducts, { threshold: 0.72 });
  for (let i = 0; i < flatProducts.length; i += 1) {
    if (groupByIndex[i]) flatProducts[i].matchGroupId = groupByIndex[i];
  }

  const grouped = groupByVariant(flatProducts);
  const bestByPlatform = pickBestByPlatform(flatProducts);

  return {
    keyword,
    failures,
    options: { limitPerSource, pages, nikeOnly, strictMode, modelCode, useBrowser },
    stats: {
      productsCount: flatProducts.length,
      variantsCount: grouped.length,
      platformsHit: bestByPlatform.length,
      platformsFailed: failures.length
    },
    products: flatProducts.sort((a, b) => b.matchScore - a.matchScore || a.priceCny - b.priceCny),
    variants: grouped,
    platformBest: bestByPlatform,
    matchGroups
  };
}

function groupByVariant(products) {
  const map = new Map();

  for (const p of products) {
    if (!map.has(p.variantKey)) {
      map.set(p.variantKey, {
        variantKey: p.variantKey,
        products: []
      });
    }
    map.get(p.variantKey).products.push(p);
  }

  const result = [];
  for (const [variantKey, row] of map.entries()) {
    const productsInVariant = row.products.sort((a, b) => a.priceCny - b.priceCny);
    const best = productsInVariant[0];
    result.push({
      variantKey,
      sampleTitle: best.title,
      bestPriceCny: best.priceCny,
      products: productsInVariant
    });
  }

  return result.sort((a, b) => a.bestPriceCny - b.bestPriceCny);
}

function pickBestByPlatform(products) {
  const m = new Map();
  for (const p of products) {
    const prev = m.get(p.platform);
    if (!prev || p.priceCny < prev.priceCny) {
      m.set(p.platform, p);
    }
  }
  return Array.from(m.values()).sort((a, b) => a.priceCny - b.priceCny);
}

function calcMatchScore(keyword, title, signals) {
  const kw = (keyword || '').toLowerCase();
  const t = (title || '').toLowerCase();

  let score = 0;
  if (kw && t.includes(kw)) score += 40;
  if (signals.hasNike) score += 20;
  if (signals.hasDunk) score += 20;
  if (signals.modelCode) score += 25;
  if (signals.lowHigh) score += 5;

  return score;
}

function normalizeError(e) {
  if (!e) return 'unknown';
  if (e instanceof Error) return e.message;
  return String(e);
}

function toBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return fallback;
}
