const { getBaseUrl, getDefaultDevBaseUrl } = require('../../config/compare.js');

describe('compare.js 配置模块', () => {
  describe('getDefaultDevBaseUrl', () => {
    it('应该返回开发环境默认地址', () => {
      const url = getDefaultDevBaseUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('http://');
    });
  });

  describe('getBaseUrl', () => {
    it('应该返回有效的URL', () => {
      const url = getBaseUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(url).toContain('http://');
    });

    it('应该包含端口号', () => {
      const url = getBaseUrl();
      expect(url).toMatch(/:\d+/);
    });
  });
});
