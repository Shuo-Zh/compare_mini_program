// 云函数入口文件
const cloud = require('wx-server-sdk');
const axios = require('axios');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 模拟价格对比数据（实际项目中可以接入真实的爬虫服务）
async function mockPriceComparison(query) {
  const platforms = ['京东', '淘宝', '拼多多', 'Farfetch'];
  const products = [];
  
  for (let i = 0; i < 8; i++) {
    products.push({
      id: `item_${Date.now()}_${i}`,
      platform: platforms[i % platforms.length],
      title: `${query} - 商品${i + 1}`,
      price: Math.floor(Math.random() * 1000) + 100,
      priceCny: Math.floor(Math.random() * 1000) + 100,
      currency: 'CNY',
      image: `https://via.placeholder.com/300x300?text=${query}_${i + 1}`,
      url: 'https://example.com',
    });
  }
  
  return {
    keyword: query,
    products: products.sort((a, b) => a.priceCny - b.priceCny),
    stats: {
      productsCount: products.length,
      platformsHit: platforms.length,
    },
    generatedAt: new Date().toISOString(),
  };
}

exports.main = async (event, context) => {
  const { query, pages = 1, limitPerSource = 8 } = event;
  
  console.log('收到比价请求:', { query, pages, limitPerSource });
  
  try {
    if (!query) {
      return {
        code: 400,
        message: '查询关键词不能为空',
      };
    }
    
    // 调用模拟数据（实际项目中替换为真实的爬虫逻辑）
    const result = await mockPriceComparison(query);
    
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
