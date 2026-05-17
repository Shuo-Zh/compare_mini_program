// 比价服务环境配置
// 统一使用后端 API：https://qhzs.work

const DEFAULT_DEV_IP = '127.0.0.1';
const DEFAULT_DEV_PORT = '3001';

// 后端 API 地址
const PROD_BASE_URL = 'https://qhzs.work';

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

function getDevBaseUrl() {
  const stored = getStoredDevBaseUrl();
  if (stored) return stored;
  return PROD_BASE_URL;
}

function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

const ENV = {
  develop: {
    baseUrl: PROD_BASE_URL,
    allowLocalIp: false,
  },
  trial: {
    baseUrl: PROD_BASE_URL,
    allowLocalIp: false,
  },
  release: {
    baseUrl: PROD_BASE_URL,
    allowLocalIp: false,
  },
};

function getDefaultDevBaseUrl() {
  return PROD_BASE_URL;
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
  
  if (envVersion === 'develop') {
    return getDevBaseUrl();
  }

  return config.baseUrl;
}

function getEnvVersion() {
  try {
    const account = wx.getAccountInfoSync();
    return account?.miniProgram?.envVersion || 'develop';
  } catch (_e) {
    return 'develop';
  }
}

function shouldUseCloud() {
  return false;
}

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
};
