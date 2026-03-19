import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { buildPriceComparison } from './services/priceService.js';
import { renderTrendChart, renderScrapePriceChart } from './services/chartService.js';
import { saveRun, listRuns, getRunById, getTrends, updateRunImagePath, getStorageInfo } from './services/historyService.js';
import { getWithRetry } from './utils/httpClient.js';
import { initProductDb, listProducts, listScrapeRuns, createCrawlJob, getCrawlJob, listDiscoveredItems, saveItemSnapshot, listItemSnapshots, listRelatedProducts } from './services/productStore.js';
import { scrapeAndStore } from './services/scrapeService.js';
import { startFarfetchListingCrawl } from './services/farfetchCrawlService.js';
import { scrapeItemByUrl } from './scrapers/itemScrapers.js';
import { toCny } from './utils/fx.js';

const app = express();
const port = process.env.PORT || 3001;
const publicBaseUrl = process.env.PUBLIC_BASE_URL || `http://127.0.0.1:${port}`;

app.use(cors());
app.use(express.json());
app.use('/images', express.static('tmp/images'));
app.use('/evidence', express.static('data/evidence'));

app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString(), storage: getStorageInfo() });
});

// Init DB (best-effort). If sqlite optional deps are missing, scrape endpoints will fail with a clear message.
initProductDb().catch(() => null);

app.get('/api/sources', (_req, res) => {
  res.json({
    sources: ['Farfetch', 'Mytheresa', 'Shopbop', 'Luisaviaroma', 'Matchesfashion', 'Revolve', 'FWRD', '24S', '京东', '淘宝', '拼多多', 'StockX'],
    note: '不同平台风控差异较大，部分平台在特定网络下可能为空结果。',
    params: {
      pages: '每个平台抓取页数，默认1，建议1-3',
      limitPerSource: '每个平台最多返回商品数，默认8',
      nikeOnly: '是否优先过滤 Nike Dunk 相关（true/false，默认true）',
      modelCode: '指定型号编码，如 DD1503-101',
      strictMode: 'strict=true 时，不满足 nikeOnly 的商品会被丢弃',
      useBrowser: '是否启用浏览器渲染抓取（需安装 playwright）',
      persist: '是否保存本次结果到历史库（默认 true）'
    },
    storage: getStorageInfo()
  });
});

app.get('/api/history', async (req, res) => {
  const limit = Number(req.query.limit || 20);
  const rows = await listRuns(limit);
  res.json({ items: rows, storage: getStorageInfo() });
});

app.get('/api/history/:id', async (req, res) => {
  const row = await getRunById(req.params.id);
  if (!row) return res.status(404).json({ message: '记录不存在' });
  return res.json(row);
});

app.get('/api/trends', async (req, res) => {
  const filters = {
    keyword: (req.query.keyword || '').toString().trim(),
    modelCode: (req.query.modelCode || '').toString().trim(),
    platform: (req.query.platform || '').toString().trim(),
    days: Number(req.query.days || 30),
    limit: Number(req.query.limit || 200)
  };

  const trends = await getTrends(filters);
  res.json({ filters, ...trends, storage: getStorageInfo() });
});

// Item-level history: enter a specific product (platform + itemId) to compare historical prices.
app.get('/api/item/history', async (req, res) => {
  try {
    const platform = (req.query.platform || '').toString().trim();
    const itemId = (req.query.itemId || '').toString().trim();
    const days = Number(req.query.days || 30);
    const limit = Number(req.query.limit || 400);
    if (!platform) return res.status(400).json({ message: 'platform 不能为空' });
    if (!itemId) return res.status(400).json({ message: 'itemId 不能为空' });

    const snapshots = await listItemSnapshots({ platform, itemId, days, limit });
    const points = snapshots
      .map((s) => ({ at: s.createdAt, platform: s.platform, priceCny: Number(s.priceCny || 0) }))
      .filter((p) => p.at && Number.isFinite(p.priceCny) && p.priceCny > 0);

    const keyword = `${platform} ${itemId}`;
    const imagePath = await renderTrendChart({ points }, keyword, { days });
    res.json({
      platform,
      itemId,
      days,
      total: points.length,
      points,
      imagePath,
      imageUrl: imagePath ? `${getRequestBaseUrl(req)}/${imagePath}` : '',
      snapshots,
    });
  } catch (error) {
    res.status(500).json({
      message: '查询历史失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/item/refresh', async (req, res) => {
  try {
    const body = req.body || {};
    const url = String(body.url || '').trim();
    const platformHint = String(body.platform || '').trim();
    const itemIdHint = String(body.itemId || '').trim();
    const days = Number(body.days || 30);
    const limit = Number(body.limit || 400);
    const useBrowser = body.useBrowser !== undefined ? !!body.useBrowser : true;

    if (!url) return res.status(400).json({ message: 'url 不能为空' });

    // Scrape current price from the real product page (best-effort; Farfetch uses viaJina by default).
    const item = await scrapeItemByUrl(url, { useBrowser, viaJina: true });
    const platform = platformHint || item.platform || 'UNKNOWN';
    const itemId = itemIdHint || item.id || '';
    if (!itemId) return res.status(400).json({ message: 'itemId 解析失败' });
    const priceCny = await toCny(Number(item.price || 0), item.currency || 'CNY');

    await saveItemSnapshot({
      platform,
      itemId,
      title: item.title || '',
      image: item.image || '',
      url: item.url || url,
      priceCny: Number(priceCny || 0),
      currency: item.currency || 'CNY',
      rawPrice: item.rawPrice || '',
      fetchMode: item.fetchMode || '',
    });

    const snapshots = await listItemSnapshots({ platform, itemId, days, limit });
    const points = snapshots
      .map((s) => ({ at: s.createdAt, platform: s.platform, priceCny: Number(s.priceCny || 0) }))
      .filter((p) => p.at && Number.isFinite(p.priceCny) && p.priceCny > 0);

    const keyword = `${platform} ${itemId}`;
    const imagePath = await renderTrendChart({ points }, keyword, { days });

    const stats = computeItemStats(snapshots);
    res.json({
      platform,
      itemId,
      days,
      current: {
        platform,
        id: itemId,
        title: item.title || '',
        image: item.image || '',
        url: item.url || url,
        priceCny: Number(priceCny || 0),
        currency: item.currency || 'CNY',
        rawPrice: item.rawPrice || '',
        fetchMode: item.fetchMode || '',
      },
      total: points.length,
      stats,
      points,
      imagePath,
      imageUrl: imagePath ? `${getRequestBaseUrl(req)}/${imagePath}` : '',
      snapshots,
    });
  } catch (error) {
    res.status(500).json({
      message: '刷新商品失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/item/related', async (req, res) => {
  try {
    const title = (req.query.title || '').toString().trim();
    const limit = Number(req.query.limit || 12);
    const excludePlatform = (req.query.excludePlatform || '').toString().trim();
    const excludeItemId = (req.query.excludeItemId || '').toString().trim();
    if (!title) return res.status(400).json({ message: 'title 不能为空' });
    const items = await listRelatedProducts({ title, limit, excludePlatform, excludeItemId });
    res.json({ items });
  } catch (error) {
    res.status(500).json({
      message: '查询相关商品失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/scrape', async (req, res) => {
  try {
    const body = req.body || {};
    const input = String(body.keyword || body.query || '').trim();
    if (!input) return res.status(400).json({ message: 'keyword 不能为空' });

    const platforms = Array.isArray(body.platforms) && body.platforms.length ? body.platforms : ['taobao', 'farfetch'];
    const options = {
      limit: Number(body.limit || 12),
      page: Math.max(1, Number(body.page || 1)),
      useBrowser: body.useBrowser !== undefined ? !!body.useBrowser : true,
      // For Farfetch: use r.jina.ai to bypass common Access Denied blocks in dev networks.
      // Set viaJina=false to force direct fetch (likely blocked).
      viaJina: body.viaJina !== undefined ? !!body.viaJina : true,
      platformTimeoutMs: body.platformTimeoutMs !== undefined ? Number(body.platformTimeoutMs) : undefined,
    };

    const { keyword, sourceUrl } = await resolveKeyword(input);
    const result = await scrapeAndStore({ keyword, sourceUrl, platforms, options });

    let chartImagePath = '';
    if (body.renderChart && Array.isArray(result.products) && result.products.length) {
      // Render a price curve from crawler results (typically Farfetch).
      chartImagePath = await renderScrapePriceChart(result.products, keyword, { platform: platforms.length === 1 ? platforms[0] : '' });
    }

    res.json({
      ...result,
      chartImagePath,
      chartImageUrl: chartImagePath ? `${getRequestBaseUrl(req)}/${chartImagePath}` : '',
      evidence: (result.evidence || []).map((e) => ({
        ...e,
        evidenceUrl: `${getRequestBaseUrl(req)}${e.evidenceUrlPath}`,
      })),
    });
  } catch (error) {
    res.status(500).json({
      message: '抓取失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/products', async (req, res) => {
  try {
    const keyword = (req.query.keyword || '').toString().trim();
    const platform = (req.query.platform || '').toString().trim();
    const limit = Number(req.query.limit || 50);
    const items = await listProducts({ keyword, platform, limit });
    res.json({ items });
  } catch (error) {
    res.status(500).json({
      message: '查询失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/scrape/runs', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const items = await listScrapeRuns(limit);
    res.json({ items });
  } catch (error) {
    res.status(500).json({
      message: '查询失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.post('/api/crawl/farfetch', async (req, res) => {
  try {
    const body = req.body || {};
    const startUrl = String(body.startUrl || '').trim();
    if (!startUrl) return res.status(400).json({ message: 'startUrl 不能为空' });

    const maxPages = Math.max(1, Math.min(500, Number(body.maxPages || 50)));
    const pageFrom = Math.max(1, Number(body.pageFrom || 1));
    const delayMs = Math.max(0, Number(body.delayMs || 400));

    const job = await createCrawlJob({
      platform: 'Farfetch',
      seeds: [startUrl],
      options: { startUrl, maxPages, pageFrom, delayMs },
    });

    // Fire-and-forget background crawl.
    startFarfetchListingCrawl(job, { startUrl, maxPages, pageFrom, delayMs }).catch(() => null);

    res.json({
      jobId: job.id,
      platform: 'Farfetch',
      status: 'running',
      startUrl,
      options: { maxPages, pageFrom, delayMs },
      jobUrl: `${getRequestBaseUrl(req)}/api/crawl/${job.id}`,
      itemsUrl: `${getRequestBaseUrl(req)}/api/crawl/${job.id}/items`,
    });
  } catch (error) {
    res.status(500).json({
      message: '启动爬虫失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/crawl/:id', async (req, res) => {
  try {
    const job = await getCrawlJob(req.params.id);
    if (!job) return res.status(404).json({ message: 'job 不存在' });
    res.json(job);
  } catch (error) {
    res.status(500).json({
      message: '查询 job 失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/crawl/:id/items', async (req, res) => {
  try {
    const jobId = req.params.id;
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    const items = await listDiscoveredItems({ jobId, limit });
    res.json({ jobId, items });
  } catch (error) {
    res.status(500).json({
      message: '查询 items 失败',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

app.get('/api/compare', async (req, res) => {
  try {
    const input = (req.query.keyword || '').toString().trim();
    if (!input) {
      return res.status(400).json({ message: 'keyword 不能为空' });
    }

    // Allow users to paste JD/Taobao/any product URLs.
    // If input looks like a URL, fetch title and use it as keyword.
    const { keyword, sourceUrl } = await resolveKeyword(input);

    const options = {
      limitPerSource: Number(req.query.limitPerSource || 8),
      pages: Number(req.query.pages || 1),
      nikeOnly: req.query.nikeOnly,
      modelCode: (req.query.modelCode || '').toString(),
      strictMode: req.query.strictMode,
      useBrowser: req.query.useBrowser
    };
    const persist = toBool(req.query.persist, true);

    const comparison = await buildPriceComparison(keyword, options);
    const requestBaseUrl = getRequestBaseUrl(req);

    let historyId = null;
    let imagePath = '';
    if (persist) {
      const saved = await saveRun({
        keyword,
        options: comparison.options,
        stats: comparison.stats,
        failures: comparison.failures,
        platformBest: comparison.platformBest,
        variants: comparison.variants.slice(0, 20),
        products: comparison.products.slice(0, 80),
        imagePath: ''
      });
      historyId = saved.id;

      // Build a trend line chart from stored history (including the just-saved run).
      const trends = await getTrends({ keyword, days: 30, limit: 800 });
      imagePath = await renderTrendChart(trends, keyword, { days: 30 });
      await updateRunImagePath(historyId, imagePath);
    } else {
      // No persistence: render a one-shot "trend" chart using current run points only.
      const now = new Date().toISOString();
      const points = (comparison.products || []).map((p) => ({
        at: now,
        platform: p.platform,
        priceCny: Number(p.priceCny || 0)
      }));
      imagePath = await renderTrendChart({ points }, keyword, { days: 1 });
    }

    res.json({
      keyword,
      sourceUrl,
      imagePath,
      // Keep imageUrl for backward compatibility, but prefer imagePath on client.
      imageUrl: `${requestBaseUrl}/${imagePath}`,
      generatedAt: new Date().toISOString(),
      historyId,
      options: comparison.options,
      stats: comparison.stats,
      failures: comparison.failures,
      platformBest: comparison.platformBest,
      variants: comparison.variants,
      products: comparison.products
    });
  } catch (error) {
    res.status(500).json({
      message: '获取价格信息失败',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post('/api/compare/group', async (req, res) => {
  try {
    const body = req.body || {};
    const groupId = (body.groupId || '').toString().trim();
    const title = (body.title || '').toString().trim();
    const platforms = Array.isArray(body.platforms) ? body.platforms : ['mytheresa', 'shopbop', 'luisaviaroma', 'matchesfashion', 'revolve', 'fwrd', 's24'];
    
    if (!groupId) {
      return res.status(400).json({ message: 'groupId 不能为空' });
    }
    if (!title) {
      return res.status(400).json({ message: 'title 不能为空' });
    }

    // 为每个平台爬取商品
    const results = [];
    for (const platform of platforms) {
      try {
        // 这里应该调用对应的平台适配器
        // 由于时间限制，我们使用现有的 scrape 接口
        const scrapeResult = await scrapeAndStore({
          keyword: title,
          sourceUrl: '',
          platforms: [platform],
          options: {
            limit: 5,
            page: 1,
            useBrowser: true,
            viaJina: true
          }
        });
        
        if (Array.isArray(scrapeResult.products)) {
          results.push(...scrapeResult.products);
        }
      } catch (error) {
        // 单个平台失败不影响整体
        console.warn(`Failed to scrape ${platform}:`, error);
      }
    }

    // 转换价格为人民币
    const productsWithCny = [];
    for (const product of results) {
      try {
        const priceCny = await toCny(Number(product.price), product.currency || 'CNY');
        productsWithCny.push({
          ...product,
          priceCny,
          groupId
        });
      } catch (error) {
        // 价格转换失败，跳过
        console.warn(`Failed to convert price for ${product.platform}:`, error);
      }
    }

    // 按价格排序
    const sortedProducts = productsWithCny.sort((a, b) => (a.priceCny || 0) - (b.priceCny || 0));

    res.json({
      groupId,
      title,
      products: sortedProducts,
      total: sortedProducts.length
    });
  } catch (error) {
    res.status(500).json({
      message: '获取比价信息失败',
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

function getRequestBaseUrl(req) {
  // Use the configured base URL from frontend config, dynamically get the port
  const currentPort = process.env.PORT || 3001;
  return `http://172.20.10.4:${currentPort}`;
}

async function resolveKeyword(input) {
  const s = String(input || '').trim();
  const url = normalizeUrl(s);
  if (!url) return { keyword: s, sourceUrl: '' };

  try {
    const resp = await getWithRetry(url, { timeout: 8000, retries: 0 });
    const html = resp.data || '';
    const title = extractTitle(html);
    const keyword = title || s;
    return { keyword: sanitizeKeyword(keyword), sourceUrl: url };
  } catch (_e) {
    return { keyword: s, sourceUrl: url };
  }
}

function normalizeUrl(s) {
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^www\./i.test(s)) return `https://${s}`;
  return '';
}

function extractTitle(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return '';
  return m[1].replace(/\s+/g, ' ').trim();
}

function sanitizeKeyword(s) {
  return String(s)
    .replace(/[-|_].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function computeItemStats(snapshots = []) {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const prices = rows.map((r) => Number(r.priceCny || 0)).filter((x) => Number.isFinite(x) && x > 0);
  if (!prices.length) {
    return { points: 0, min: 0, max: 0, avg: 0, changes: 0, last: 0, first: 0 };
  }
  let changes = 0;
  for (let i = 1; i < prices.length; i += 1) {
    if (prices[i] !== prices[i - 1]) changes += 1;
  }
  const sum = prices.reduce((a, b) => a + b, 0);
  return {
    points: prices.length,
    min: Number(Math.min(...prices).toFixed(2)),
    max: Number(Math.max(...prices).toFixed(2)),
    avg: Number((sum / prices.length).toFixed(2)),
    changes,
    first: prices[0],
    last: prices[prices.length - 1],
    lastAt: rows[rows.length - 1]?.createdAt || '',
  };
}

// Bind to all interfaces so the WeChat DevTools/real devices can access it via LAN IP.
// node --watch can restart quickly; a short retry avoids transient EADDRINUSE on macOS.
function startServerListen(attempt = 0) {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`price-compare-server listening on ${port}`);
  });
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attempt < 12) {
      const waitMs = 300 + attempt * 150;
      console.warn(`port ${port} in use, retrying in ${waitMs}ms (attempt ${attempt + 1}/12)`);
      setTimeout(() => startServerListen(attempt + 1), waitMs);
      return;
    }
    throw err;
  });
}

startServerListen();

function toBool(v, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return fallback;
}
