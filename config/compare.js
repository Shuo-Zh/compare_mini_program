// 比价服务环境配置
const ENV = {
  develop: {
    // DevTools cannot request localhost; use your current LAN IP here.
    // Current machine IP (auto changes with Wi-Fi): 172.20.10.4
    baseUrl: 'http://172.20.10.4:3001',
  },
  trial: {
    baseUrl: 'https://api.example.com',
  },
  release: {
    baseUrl: 'https://api.example.com',
  },
};

function getDefaultDevBaseUrl() {
  return ENV.develop.baseUrl;
}

function getBaseUrl() {
  let envVersion = 'develop';
  try {
    const account = wx.getAccountInfoSync();
    envVersion = account?.miniProgram?.envVersion || 'develop';
  } catch (_e) {
    envVersion = 'develop';
  }

  // 固定使用开发默认地址，避免因旧缓存导致不可达
  return ENV[envVersion]?.baseUrl || ENV.develop.baseUrl;
}

module.exports = {
  getBaseUrl,
  getDefaultDevBaseUrl,
};
