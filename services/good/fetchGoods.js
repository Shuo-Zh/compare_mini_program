import { config } from '../../config/index';
import { getBaseUrl } from '../../config/compare';

function mockFetchGoodsList(pageIndex = 1, pageSize = 20) {
  console.log('[fetchGoods] Using mock data, pageIndex:', pageIndex, 'pageSize:', pageSize);
  const { delay } = require('../_utils/delay');
  const { getGoodsList } = require('../../model/goods');
  return delay().then(() => {
    const goodsList = getGoodsList(pageIndex, pageSize);
    console.log('[fetchGoods] Mock raw goods list:', goodsList.map(item => ({ spuId: item.spuId, primaryImage: item.primaryImage })));
    return goodsList.map((item) => {
      return {
        spuId: item.spuId,
        thumb: item.primaryImage || 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-09a.png',
        title: item.title,
        price: item.minSalePrice,
        originPrice: item.maxLinePrice,
        tags: item.spuTagList ? item.spuTagList.map((tag) => tag.title) : [],
      };
    });
  });
}

async function fetchGoodsFromDb(pageIndex = 1, pageSize = 20) {
  const baseUrl = getBaseUrl();
  console.log('[fetchGoods] Fetching from database, baseUrl:', baseUrl);
  
  if (!baseUrl) {
    console.log('[fetchGoods] No baseUrl, falling back to mock');
    return mockFetchGoodsList(pageIndex, pageSize);
  }

  const requestUrl = `${baseUrl}/api/products`;
  console.log('[fetchGoods] Request URL:', requestUrl);
  console.log('[fetchGoods] Request params - limit:', pageSize);

  return new Promise((resolve) => {
    wx.request({
      url: requestUrl,
      method: 'GET',
      data: {
        limit: pageSize,
      },
      timeout: 10000,
      success: (res) => {
        console.log('[fetchGoods] Response status:', res.statusCode);
        console.log('[fetchGoods] Response data keys:', Object.keys(res.data || {}));
        
        if (res.statusCode === 200 && res.data && res.data.items && res.data.items.length > 0) {
          const items = res.data.items;
          console.log('[fetchGoods] Total items received:', items.length);
          
          const start = (pageIndex - 1) * pageSize;
          const pagedItems = items.slice(start, start + pageSize);
          console.log('[fetchGoods] Paged items for page', pageIndex, ':', pagedItems.length);
          
          const goodsList = pagedItems.map((item, idx) => {
            const mappedItem = {
              spuId: item.id || String(idx),
              thumb: item.image || 'https://tdesign.gtimg.com/miniprogram/template/retail/goods/nz-09a.png',
              title: item.title || '未知商品',
              price: item.priceCny || item.price || 0,
              originPrice: item.priceCny ? Math.round(item.priceCny * 1.2) : 0,
              tags: [item.platform || ''],
              platform: item.platform,
              itemId: item.item_id,
              url: item.url,
            };
            console.log(`[fetchGoods] Item ${idx}: id=${item.id}, image=${item.image}, thumb=${mappedItem.thumb}`);
            return mappedItem;
          });
          
          console.log('[fetchGoods] Final goodsList count:', goodsList.length);
          console.log('[fetchGoods] First item thumb:', goodsList[0]?.thumb);
          resolve(goodsList);
        } else {
          console.log('[fetchGoods] No items from database, falling back to mock');
          console.log('[fetchGoods] Response data:', JSON.stringify(res.data).substring(0, 200));
          mockFetchGoodsList(pageIndex, pageSize).then(resolve);
        }
      },
      fail: (err) => {
        console.log('[fetchGoods] Failed to fetch from database:', err);
        console.log('[fetchGoods] Error details:', JSON.stringify(err));
        mockFetchGoodsList(pageIndex, pageSize).then(resolve);
      },
    });
  });
}

export function fetchGoodsList(pageIndex = 1, pageSize = 20) {
  console.log('[fetchGoods] fetchGoodsList called, useMock:', config.useMock);
  if (config.useMock) {
    return mockFetchGoodsList(pageIndex, pageSize);
  }
  return fetchGoodsFromDb(pageIndex, pageSize);
}
