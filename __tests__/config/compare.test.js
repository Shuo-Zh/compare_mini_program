const {
  getBaseUrl,
  getDefaultDevBaseUrl,
  getEnvInfo,
  DEFAULT_DEV_IP,
  DEFAULT_DEV_PORT,
  PROD_BASE_URL,
} = require('../../config/compare.js');

describe('compare.js 配置模块', () => {
  // 模拟 wx 对象
  const mockWx = {
    getStorageSync: jest.fn(),
    getAccountInfoSync: jest.fn(),
  };

  beforeEach(() => {
    global.wx = mockWx;
    jest.clearAllMocks();
  });

  describe('常量定义', () => {
    it('应该定义默认 IP 地址', () => {
      expect(DEFAULT_DEV_IP).toBe('127.0.0.1');
    });

    it('应该定义默认端口', () => {
      expect(DEFAULT_DEV_PORT).toBe('3001');
    });

    it('应该定义生产环境地址', () => {
      expect(PROD_BASE_URL).toBe('https://your-production-api.com');
    });
  });

  describe('getDefaultDevBaseUrl', () => {
    it('应该返回开发环境默认地址', () => {
      mockWx.getStorageSync.mockReturnValue(null);

      const url = getDefaultDevBaseUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('http://');
    });

    it('应该优先使用存储的地址', () => {
      const storedUrl = 'http://192.168.1.100:3001';
      mockWx.getStorageSync.mockReturnValue(storedUrl);

      const url = getDefaultDevBaseUrl();
      expect(url).toBe(storedUrl);
    });

    it('应该过滤无效的存储地址', () => {
      mockWx.getStorageSync.mockReturnValue('invalid-url');

      const url = getDefaultDevBaseUrl();
      expect(url).toContain(DEFAULT_DEV_IP);
      expect(url).toContain(DEFAULT_DEV_PORT);
    });
  });

  describe('getBaseUrl', () => {
    it('应该返回有效的URL', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'develop' },
      });

      const url = getBaseUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('http://');
    });

    it('应该包含端口号', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'develop' },
      });

      const url = getBaseUrl();
      expect(url).toMatch(/:\d+/);
    });

    it('体验版应该返回生产环境地址', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'trial' },
      });

      const url = getBaseUrl();
      expect(url).toBe(PROD_BASE_URL);
      expect(url).toContain('https://');
    });

    it('正式版应该返回生产环境地址', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'release' },
      });

      const url = getBaseUrl();
      expect(url).toBe(PROD_BASE_URL);
      expect(url).toContain('https://');
    });

    it('应该处理获取环境版本失败的情况', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockImplementation(() => {
        throw new Error('getAccountInfoSync failed');
      });

      const url = getBaseUrl();
      expect(url).toBeDefined();
      expect(url).toContain('http://');
    });
  });

  describe('getEnvInfo', () => {
    it('应该返回开发环境信息', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'develop' },
      });

      const info = getEnvInfo();
      expect(info.version).toBe('develop');
      expect(info.allowLocalIp).toBe(true);
      expect(info.isProduction).toBe(false);
      expect(info.baseUrl).toContain('http://');
    });

    it('应该返回体验版环境信息', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'trial' },
      });

      const info = getEnvInfo();
      expect(info.version).toBe('trial');
      expect(info.allowLocalIp).toBe(false);
      expect(info.isProduction).toBe(true);
      expect(info.baseUrl).toBe(PROD_BASE_URL);
    });

    it('应该返回正式版环境信息', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'release' },
      });

      const info = getEnvInfo();
      expect(info.version).toBe('release');
      expect(info.allowLocalIp).toBe(false);
      expect(info.isProduction).toBe(true);
      expect(info.baseUrl).toBe(PROD_BASE_URL);
    });
  });
});
