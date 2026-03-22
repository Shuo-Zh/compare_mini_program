// 云函数入口文件
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

// 获取商品历史价格
async function getItemHistory(platform, itemId, days = 180) {
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
      .limit(100)
      .get();
    
    return data;
  } catch (error) {
    console.error('查询历史价格失败:', error);
    return [];
  }
}

// 保存商品快照
async function saveItemSnapshot(item) {
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

exports.main = async (event, context) => {
  const { action, platform, itemId, item, days = 180 } = event;
  
  console.log('收到请求:', { action, platform, itemId, days });
  
  try {
    if (action === 'history') {
      // 查询历史价格
      if (!platform || !itemId) {
        return {
          code: 400,
          message: 'platform 和 itemId 不能为空',
        };
      }
      
      const history = await getItemHistory(platform, itemId, days);
      
      return {
        code: 200,
        data: {
          platform,
          itemId,
          days,
          total: history.length,
          snapshots: history,
        },
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
      
      const success = await saveItemSnapshot(item);
      
      return {
        code: success ? 200 : 500,
        data: { success },
        message: success ? '保存成功' : '保存失败',
      };
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
