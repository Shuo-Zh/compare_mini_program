// 比价服务环境配置
// 优先级：本地存储 > 环境变量配置 > 默认配置

const DEFAULT_DEV_IP = '127.0.0.1';
const DEFAULT_DEV_PORT = '3001';

// 尝试从本地存储获取用户自定义的后端地址
function getStoredDevBaseUrl() {
  try {
    const stored = wx.getStorageSync('compare:dev_base_url');
    if (stored && typeof stored === 'string' && stored.startsWith('http')) {
      return stored;
    }
  } catch (_e) {
    // 忽略存储错误
  }
  return null;
}

// 获取开发环境基础 URL
function getDevBaseUrl() {
  // 1. 优先使用用户存储的地址
  const stored = getStoredDevBaseUrl();
  if (stored) return stored;

  // 2. 使用默认本地地址
  return `http://${DEFAULT_DEV_IP}:${DEFAULT_DEV_PORT}`;
}

const ENV = {
  develop: {
    baseUrl: getDevBaseUrl(),
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

  // 开发环境下每次都重新计算，支持动态切换
  if (envVersion === 'develop') {
    return getDevBaseUrl();
  }

  return ENV[envVersion]?.baseUrl || ENV.develop.baseUrl;
}

module.exports = {
  getBaseUrl,
  getDefaultDevBaseUrl,
  DEFAULT_DEV_IP,
  DEFAULT_DEV_PORT,
};
