// 云开发配置
// 使用微信小程序云开发，无需配置服务器地址

const CLOUD_FUNCTION_NAMES = {
  COMPARE: 'compare',    // 比价云函数
  SCRAPE: 'scrape',      // 商品历史价格云函数
};

// 调用云函数
async function callCloudFunction(name, data = {}) {
  try {
    const result = await wx.cloud.callFunction({
      name,
      data,
    });
    
    if (result.result && result.result.code === 200) {
      return result.result.data;
    } else {
      throw new Error(result.result?.message || '云函数调用失败');
    }
  } catch (error) {
    console.error(`云函数 ${name} 调用失败:`, error);
    throw error;
  }
}

// 比价接口
async function comparePrices(query, options = {}) {
  return callCloudFunction(CLOUD_FUNCTION_NAMES.COMPARE, {
    query,
    pages: options.pages || 1,
    limitPerSource: options.limitPerSource || 8,
  });
}

// 获取商品历史价格
async function getItemHistory(platform, itemId, days = 180) {
  return callCloudFunction(CLOUD_FUNCTION_NAMES.SCRAPE, {
    action: 'history',
    platform,
    itemId,
    days,
  });
}

// 保存商品快照
async function saveItemSnapshot(item) {
  return callCloudFunction(CLOUD_FUNCTION_NAMES.SCRAPE, {
    action: 'save',
    item,
  });
}

module.exports = {
  callCloudFunction,
  comparePrices,
  getItemHistory,
  saveItemSnapshot,
  CLOUD_FUNCTION_NAMES,
};
