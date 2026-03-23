// 云函数入口文件 - 全网比价（接入真实爬虫服务）
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

// ========== 1. 反爬机制配置 ==========
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

// 请求间隔配置（毫秒）
const REQUEST_DELAY = {
  min: 1000,
  max: 3000
};

// 随机延迟函数
function randomDelay() {
  const delay = Math.floor(Math.random() * (REQUEST_DELAY.max - REQUEST_DELAY.min + 1)) + REQUEST_DELAY.min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

// 获取随机 User-Agent
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ========== 2. 缓存策略 ==========
// 缓存时间（毫秒）- 15分钟
const CACHE_TTL = 15 * 60 * 1000;

// 生成缓存键
function generateCacheKey(keyword, options) {
  return `compare:${keyword}:${options.pages}:${options.limitPerSource}`;
}

// 从数据库获取缓存
async function getCache(keyword, options) {
  try {
    const cacheKey = generateCacheKey(keyword, options);
    const { data } = await db.collection('cache')
      .where({
        key: cacheKey,
        expireAt: _.gt(new Date())
      })
      .limit(1)
      .get();
    
    if (data && data.length > 0) {
      console.log('缓存命中:', cacheKey);
      return data[0].value;
    }
    return null;
  } catch (error) {
    console.error('获取缓存失败:', error);
    return null;
  }
}

// 保存缓存到数据库
async function setCache(keyword, options, value) {
  try {
    const cacheKey = generateCacheKey(keyword, options);
    const expireAt = new Date(Date.now() + CACHE_TTL);
    
    await db.collection('cache').add({
      data: {
        key: cacheKey,
        value: value,
        createdAt: new Date(),
        expireAt: expireAt,
        keyword: keyword
      }
    });
    
    console.log('缓存已保存:', cacheKey);
  } catch (error) {
    console.error('保存缓存失败:', error);
  }
}

// 清理过期缓存
async function cleanExpiredCache() {
  try {
    const result = await db.collection('cache')
      .where({
        expireAt: _.lt(new Date())
      })
      .remove();
    
    if (result.stats && result.stats.removed > 0) {
      console.log('清理过期缓存:', result.stats.removed, '条');
    }
  } catch (error) {
    console.error('清理缓存失败:', error);
  }
}

// ========== 3. 真实爬虫服务 ==========

// 带重试的请求函数
async function fetchWithRetry(url, options = {}) {
  const maxRetries = options.retries || 2;
  const timeout = options.timeout || 15000;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      // 添加随机延迟（第一次不延迟）
      if (i > 0) {
        await randomDelay();
      }
      
      const response = await axios.get(url, {
        timeout,
        responseType: 'text',
        transformResponse: [(data) => data],
        headers: {
          'User-Agent': getRandomUserAgent(),
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          ...options.headers
        },
        validateStatus: (status) => status >= 200 && status < 500
      });
      
      return response;
    } catch (error) {
      console.error(`请求失败 (尝试 ${i + 1}/${maxRetries + 1}):`, error.message);
      if (i === maxRetries) {
        throw error;
      }
    }
  }
}

// Farfetch 爬虫
async function scrapeFarfetch(keyword, limit = 8) {
  try {
    // 使用 Jina AI 服务解析网页（绕过反爬）
    const jinaUrl = `https://r.jina.ai/http://www.farfetch.com/cn/shopping/women/search/items.aspx?q=${encodeURIComponent(keyword)}`;
    
    const response = await fetchWithRetry(jinaUrl, {
      timeout: 25000,
      retries: 1
    });
    
    const md = String(response.data || '');
    const items = parseJinaMarkdown(md, limit);
    
    return items.map(item => ({
      ...item,
      platform: 'Farfetch',
      currency: 'CNY'
    }));
  } catch (error) {
    console.error('Farfetch 爬取失败:', error.message);
    return [];
  }
}

// 解析 Jina AI 返回的 Markdown
function parseJinaMarkdown(md, limit) {
  const lines = String(md || '').split(/\r?\n/);
  const items = [];
  const seen = new Set();
  
  for (const line of lines) {
    if (items.length >= limit) break;
    
    const l = String(line || '').trimStart();
    if (!l.startsWith('*')) continue;
    if (!l.includes('farfetch-contents.com')) continue;
    if (!l.includes('item-') || !l.includes('.aspx')) continue;
    
    // 提取链接
    const linkStart = l.lastIndexOf('](');
    if (linkStart < 0) continue;
    const linkEnd = l.indexOf(')', linkStart + 2);
    if (linkEnd < 0) continue;
    
    let detailUrl = l.slice(linkStart + 2, linkEnd).trim();
    if (detailUrl.startsWith('http://')) {
      detailUrl = `https://${detailUrl.slice('http://'.length)}`;
    }
    
    const idMatch = detailUrl.match(/item-(\d+)\.aspx/i);
    const id = idMatch ? idMatch[1] : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    
    // 提取图片
    let image = '';
    const imgMarker = '(https://cdn-images.farfetch-contents.com';
    const imgStart = l.indexOf(imgMarker);
    if (imgStart >= 0) {
      const imgEnd = l.indexOf(')', imgStart + 1);
      if (imgEnd > imgStart) {
        image = l.slice(imgStart + 1, imgEnd).trim();
      }
    }
    
    // 提取标题
    let title = '';
    const afterImg = l.split(') ')[1] || '';
    if (afterImg) {
      const cut = afterImg.split('](')[0] || '';
      const idx = cut.indexOf('¥');
      title = (idx >= 0 ? cut.slice(0, idx) : cut).replace(/\s+/g, ' ').trim();
      title = title.replace(/^(?:\d+%\s*优惠已计入\s*)/i, '').replace(/^(?:新季\s*)/, '').trim();
    }
    
    if (!title) {
      const alt = line.match(/!\[[^:]*:\s*([^\]]+)\]/);
      title = alt ? alt[1].trim() : `Farfetch item ${id}`;
    }
    
    // 提取价格
    const priceMatches = Array.from(l.matchAll(/¥\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g)).map(m => m[1]);
    const last = priceMatches.length ? priceMatches[priceMatches.length - 1] : '';
    const price = last ? Number(last.replace(/,/g, '')) : 0;
    
    items.push({
      id,
      title,
      price,
      priceCny: price,
      image,
      url: detailUrl
    });
  }
  
  return items;
}

// 京东爬虫（简化版）
async function scrapeJD(keyword, limit = 8) {
  try {
    // 使用京东搜索 API
    const searchUrl = `https://search.jd.com/Search?keyword=${encodeURIComponent(keyword)}&enc=utf-8`;
    
    const response = await fetchWithRetry(searchUrl, {
      timeout: 15000,
      retries: 1
    });
    
    // 简化解析逻辑（实际项目中需要更复杂的解析）
    const html = response.data;
    const items = [];
    
    // 使用正则提取商品信息
    const productRegex = /<li[^>]*data-sku="(\d+)"[^>]*>[\s\S]*?<\/li>/g;
    let match;
    
    while ((match = productRegex.exec(html)) !== null && items.length < limit) {
      const sku = match[1];
      const liHtml = match[0];
      
      // 提取标题
      const titleMatch = liHtml.match(/<em>([^<]+)<\/em>/);
      const title = titleMatch ? titleMatch[1].trim() : `京东商品 ${sku}`;
      
      // 提取价格
      const priceMatch = liHtml.match(/¥\s*([0-9.]+)/);
      const price = priceMatch ? Number(priceMatch[1]) : 0;
      
      // 提取图片
      const imgMatch = liHtml.match(/src="(https:\/\/[^"]+\.jpg)"/);
      const image = imgMatch ? imgMatch[1] : '';
      
      items.push({
        id: sku,
        title,
        price,
        priceCny: price,
        image,
        url: `https://item.jd.com/${sku}.html`,
        platform: '京东',
        currency: 'CNY'
      });
    }
    
    return items;
  } catch (error) {
    console.error('京东爬取失败:', error.message);
    return [];
  }
}

// 淘宝爬虫（使用 Jina AI）
async function scrapeTaobao(keyword, limit = 8) {
  try {
    const searchUrl = `https://s.taobao.com/search?q=${encodeURIComponent(keyword)}`;
    const jinaUrl = `https://r.jina.ai/http://${searchUrl}`;
    
    const response = await fetchWithRetry(jinaUrl, {
      timeout: 20000,
      retries: 1
    });
    
    // 解析逻辑（简化版）
    const items = [];
    // 实际项目中需要更复杂的解析
    
    return items;
  } catch (error) {
    console.error('淘宝爬取失败:', error.message);
    return [];
  }
}

// 主爬虫函数
async function crawlAllPlatforms(keyword, options) {
  const platforms = [
    { name: 'Farfetch', scraper: scrapeFarfetch },
    { name: '京东', scraper: scrapeJD },
    // { name: '淘宝', scraper: scrapeTaobao }, // 淘宝反爬较强，暂时注释
  ];
  
  const results = [];
  const failures = [];
  
  for (const platform of platforms) {
    try {
      console.log(`开始爬取 ${platform.name}...`);
      const items = await platform.scraper(keyword, options.limitPerSource);
      
      if (items.length > 0) {
        results.push(...items);
        console.log(`${platform.name} 爬取成功: ${items.length} 条`);
      } else {
        failures.push({ platform: platform.name, reason: '未获取到数据' });
      }
      
      // 平台间添加延迟
      if (platform !== platforms[platforms.length - 1]) {
        await randomDelay();
      }
    } catch (error) {
      console.error(`${platform.name} 爬取失败:`, error.message);
      failures.push({ platform: platform.name, reason: error.message });
    }
  }
  
  return { products: results, failures };
}

// ========== 4. 主函数 ==========
exports.main = async (event, context) => {
  const { query, pages = 1, limitPerSource = 8, useCache = true } = event;
  
  console.log('收到比价请求:', { query, pages, limitPerSource, useCache });
  
  try {
    if (!query) {
      return {
        code: 400,
        message: '查询关键词不能为空',
      };
    }
    
    // 检查缓存
    if (useCache) {
      const cached = await getCache(query, { pages, limitPerSource });
      if (cached) {
        return {
          code: 200,
          data: cached,
          message: 'success (from cache)',
        };
      }
    }
    
    // 执行爬虫
    const { products, failures } = await crawlAllPlatforms(query, { pages, limitPerSource });
    
    if (products.length === 0) {
      return {
        code: 404,
        message: '未找到相关商品，请尝试其他关键词',
        data: { failures }
      };
    }
    
    // 按价格排序
    const sortedProducts = products.sort((a, b) => a.priceCny - b.priceCny);
    
    const result = {
      keyword: query,
      products: sortedProducts,
      stats: {
        productsCount: sortedProducts.length,
        platformsHit: sortedProducts.reduce((set, p) => set.add(p.platform), new Set()).size,
        platformsFailed: failures.length
      },
      failures,
      generatedAt: new Date().toISOString(),
    };
    
    // 保存缓存
    if (useCache) {
      await setCache(query, { pages, limitPerSource }, result);
    }
    
    // 异步清理过期缓存（不阻塞响应）
    cleanExpiredCache().catch(console.error);
    
    return {
      code: 200,
      data: result,
      message: 'success',
    };
  } catch (error) {
    console.error('比价失败:', error);
    return {
      code: 500,
      message: '服务器内部错误',
      error: error.message,
    };
  }
};
