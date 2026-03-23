// 云函数入口文件 - 商品历史价格（带缓存和反爬机制）
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
  min: 800,
  max: 2000
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
// 缓存时间（毫秒）- 5分钟（价格数据变化较快，缓存时间较短）
const CACHE_TTL = 5 * 60 * 1000;

// 生成缓存键
function generateCacheKey(platform, itemId, days) {
  return `scrape:${platform}:${itemId}:${days}`;
}

// 从数据库获取缓存
async function getCache(platform, itemId, days) {
  try {
    const cacheKey = generateCacheKey(platform, itemId, days);
    const { data } = await db.collection('scrape_cache')
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
async function setCache(platform, itemId, days, value) {
  try {
    const cacheKey = generateCacheKey(platform, itemId, days);
    const expireAt = new Date(Date.now() + CACHE_TTL);
    
    await db.collection('scrape_cache').add({
      data: {
        key: cacheKey,
        value: value,
        createdAt: new Date(),
        expireAt: expireAt,
        platform: platform,
        itemId: itemId
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
    const result = await db.collection('scrape_cache')
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

// ========== 3. 数据库操作 ==========

// 获取商品历史价格
async function getItemHistoryFromDB(platform, itemId, days = 180) {
  const collection = db.collection('price_history');
  
  // 计算查询起始日期
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  try {
    const { data } = await collection
      .where({
        platform: platform,
        itemId: itemId,
        createdAt: db.command.gte(startDate.toISOString()),
      })
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    
    return data;
  } catch (error) {
    console.error('查询历史价格失败:', error);
    return [];
  }
}

// 保存商品快照
async function saveItemSnapshotToDB(item) {
  const collection = db.collection('price_history');
  
  try {
    await collection.add({
      data: {
        platform: item.platform,
        itemId: item.id,
        title: item.title,
        price: item.price,
        priceCny: item.priceCny,
        currency: item.currency || 'CNY',
        image: item.image,
        url: item.url,
        createdAt: new Date().toISOString(),
      },
    });
    return true;
  } catch (error) {
    console.error('保存商品快照失败:', error);
    return false;
  }
}

// ========== 4. 真实爬虫服务 ==========

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

// 刷新商品数据（重新爬取）
async function refreshItemData(platform, itemId, url) {
  try {
    console.log(`刷新商品数据: ${platform} - ${itemId}`);
    
    // 根据不同平台使用不同的爬取策略
    if (platform === 'Farfetch') {
      return await refreshFarfetchItem(itemId, url);
    } else if (platform === '京东') {
      return await refreshJDItem(itemId, url);
    }
    
    return null;
  } catch (error) {
    console.error('刷新商品数据失败:', error.message);
    return null;
  }
}

// 刷新 Farfetch 商品
async function refreshFarfetchItem(itemId, url) {
  try {
    // 使用 Jina AI 服务解析商品详情页
    const jinaUrl = `https://r.jina.ai/http://www.farfetch.com/cn/shopping/women/item-${itemId}.aspx`;
    
    const response = await fetchWithRetry(jinaUrl, {
      timeout: 20000,
      retries: 1
    });
    
    const md = String(response.data || '');
    
    // 提取价格
    const priceMatches = Array.from(md.matchAll(/¥\s*([0-9][0-9,]*(?:\.[0-9]+)?)/g)).map(m => m[1]);
    const price = priceMatches.length ? Number(priceMatches[0].replace(/,/g, '')) : 0;
    
    // 提取标题
    const titleMatch = md.match(/^#\s*(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : `Farfetch item ${itemId}`;
    
    // 提取图片
    const imgMatch = md.match(/\(https:\/\/cdn-images\.farfetch-contents\.com\/([^)]+)\)/);
    const image = imgMatch ? `https://cdn-images.farfetch-contents.com/${imgMatch[1]}` : '';
    
    const item = {
      id: itemId,
      platform: 'Farfetch',
      title,
      price,
      priceCny: price,
      currency: 'CNY',
      image,
      url: url || `https://www.farfetch.com/cn/shopping/women/item-${itemId}.aspx`,
    };
    
    // 保存到数据库
    await saveItemSnapshotToDB(item);
    
    return item;
  } catch (error) {
    console.error('刷新 Farfetch 商品失败:', error.message);
    return null;
  }
}

// 刷新京东商品
async function refreshJDItem(itemId, url) {
  try {
    const itemUrl = url || `https://item.jd.com/${itemId}.html`;
    
    const response = await fetchWithRetry(itemUrl, {
      timeout: 15000,
      retries: 1
    });
    
    const html = response.data;
    
    // 提取价格
    const priceMatch = html.match(/price:\s*"?([0-9.]+)"?/);
    const price = priceMatch ? Number(priceMatch[1]) : 0;
    
    // 提取标题
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
    const title = titleMatch ? titleMatch[1].trim() : `京东商品 ${itemId}`;
    
    // 提取图片
    const imgMatch = html.match(/src="(https:\/\/[^"]+\.jpg)"/);
    const image = imgMatch ? imgMatch[1] : '';
    
    const item = {
      id: itemId,
      platform: '京东',
      title,
      price,
      priceCny: price,
      currency: 'CNY',
      image,
      url: itemUrl,
    };
    
    // 保存到数据库
    await saveItemSnapshotToDB(item);
    
    return item;
  } catch (error) {
    console.error('刷新京东商品失败:', error.message);
    return null;
  }
}

// ========== 5. 主函数 ==========
exports.main = async (event, context) => {
  const { action, platform, itemId, url, item, days = 180, useCache = true, refresh = false } = event;
  
  console.log('收到请求:', { action, platform, itemId, days, useCache, refresh });
  
  try {
    if (action === 'history') {
      // 查询历史价格
      if (!platform || !itemId) {
        return {
          code: 400,
          message: 'platform 和 itemId 不能为空',
        };
      }
      
      // 检查缓存
      if (useCache && !refresh) {
        const cached = await getCache(platform, itemId, days);
        if (cached) {
          return {
            code: 200,
            data: cached,
            message: 'success (from cache)',
          };
        }
      }
      
      // 如果需要刷新，先爬取最新数据
      if (refresh) {
        await refreshItemData(platform, itemId, url);
      }
      
      // 查询历史数据
      const snapshots = await getItemHistoryFromDB(platform, itemId, days);
      
      const result = {
        platform,
        itemId,
        days,
        total: snapshots.length,
        snapshots: snapshots,
        refreshed: refresh,
      };
      
      // 保存缓存
      if (useCache) {
        await setCache(platform, itemId, days, result);
      }
      
      // 异步清理过期缓存
      cleanExpiredCache().catch(console.error);
      
      return {
        code: 200,
        data: result,
        message: 'success',
      };
    } else if (action === 'save') {
      // 保存商品快照
      if (!item) {
        return {
          code: 400,
          message: 'item 不能为空',
        };
      }
      
      const success = await saveItemSnapshotToDB(item);
      
      return {
        code: success ? 200 : 500,
        data: { success },
        message: success ? '保存成功' : '保存失败',
      };
    } else if (action === 'refresh') {
      // 刷新商品数据
      if (!platform || !itemId) {
        return {
          code: 400,
          message: 'platform 和 itemId 不能为空',
        };
      }
      
      const refreshedItem = await refreshItemData(platform, itemId, url);
      
      if (refreshedItem) {
        return {
          code: 200,
          data: refreshedItem,
          message: '刷新成功',
        };
      } else {
        return {
          code: 500,
          message: '刷新失败',
        };
      }
    } else {
      return {
        code: 400,
        message: '未知的 action 类型',
      };
    }
  } catch (error) {
    console.error('处理失败:', error);
    return {
      code: 500,
      message: '服务器内部错误',
      error: error.message,
    };
  }
};
