// 比价服务环境配置
// 优先级：本地存储 > 环境变量配置 > 默认配置

const DEFAULT_DEV_IP = '127.0.0.1';
const DEFAULT_DEV_PORT = '3001';

// 体验版/正式版后端地址配置
// 注意：体验版和正式版必须使用 HTTPS 公网地址，不能使用本地 IP
const PROD_BASE_URL = 'https://your-production-api.com';

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

// 验证 URL 是否有效
function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

const ENV = {
  develop: {
    baseUrl: getDevBaseUrl(),
    // 开发版允许本地 IP
    allowLocalIp: true,
  },
  trial: {
    // 体验版必须使用 HTTPS 公网地址
    baseUrl: PROD_BASE_URL,
    allowLocalIp: false,
  },
  release: {
    // 正式版必须使用 HTTPS 公网地址
    baseUrl: PROD_BASE_URL,
    allowLocalIp: false,
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

  const config = ENV[envVersion] || ENV.develop;
  
  // 开发环境下每次都重新计算，支持动态切换
  if (envVersion === 'develop') {
    return getDevBaseUrl();
  }

  // 体验版/正式版检查
  if (!config.allowLocalIp && config.baseUrl.includes('127.0.0.1')) {
    console.warn(`[${envVersion}] 环境不能使用本地 IP，请配置公网 HTTPS 地址`);
  }

  return config.baseUrl;
}

// 获取当前环境版本
function getEnvVersion() {
  try {
    const account = wx.getAccountInfoSync();
    return account?.miniProgram?.envVersion || 'develop';
  } catch (_e) {
    return 'develop';
  }
}

// 判断是否应该使用云开发（体验版和正式版使用云函数）
function shouldUseCloud() {
  const envVersion = getEnvVersion();
  return envVersion === 'trial' || envVersion === 'release';
}

// 获取当前环境信息
function getEnvInfo() {
  const envVersion = getEnvVersion();
  const config = ENV[envVersion] || ENV.develop;
  
  return {
    version: envVersion,
    baseUrl: getBaseUrl(),
    allowLocalIp: config.allowLocalIp,
    isProduction: envVersion === 'trial' || envVersion === 'release',
    useCloud: shouldUseCloud(),
  };
}

module.exports = {
  getBaseUrl,
  getDefaultDevBaseUrl,
  getEnvInfo,
  getEnvVersion,
  shouldUseCloud,
  DEFAULT_DEV_IP,
  DEFAULT_DEV_PORT,
  PROD_BASE_URL,
};
