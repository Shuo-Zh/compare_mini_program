const { getBaseUrl, getDefaultDevBaseUrl, DEFAULT_DEV_IP, DEFAULT_DEV_PORT } = require('../../config/compare.js');

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
        miniProgram: { envVersion: 'develop' }
      });
      
      const url = getBaseUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('http://');
    });

    it('应该包含端口号', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'develop' }
      });
      
      const url = getBaseUrl();
      expect(url).toMatch(/:\d+/);
    });

    it('应该根据环境版本返回不同地址', () => {
      mockWx.getStorageSync.mockReturnValue(null);
      
      // 测试 trial 环境
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'trial' }
      });
      const trialUrl = getBaseUrl();
      expect(trialUrl).toBe('https://api.example.com');

      // 测试 release 环境
      mockWx.getAccountInfoSync.mockReturnValue({
        miniProgram: { envVersion: 'release' }
      });
      const releaseUrl = getBaseUrl();
      expect(releaseUrl).toBe('https://api.example.com');
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
});
