import { describe, it, expect, jest } from '@jest/globals';
import { getRates, toCny } from '../../src/utils/fx.js';

describe('fx.js 汇率工具函数', () => {
  describe('getRates', () => {
    it('应该返回默认汇率当API调用失败时', async () => {
      const rates = await getRates();
      
      expect(rates.CNY).toBe(1);
      expect(typeof rates.USD).toBe('number');
      expect(typeof rates.EUR).toBe('number');
      expect(typeof rates.GBP).toBe('number');
      expect(typeof rates.HKD).toBe('number');
    });

    it('应该返回有效的汇率对象', async () => {
      const rates = await getRates();
      
      expect(rates).toHaveProperty('CNY');
      expect(rates).toHaveProperty('USD');
      expect(rates).toHaveProperty('EUR');
      expect(rates).toHaveProperty('GBP');
      expect(rates).toHaveProperty('HKD');
      
      // 所有汇率应该是正数
      Object.values(rates).forEach(rate => {
        expect(typeof rate).toBe('number');
        expect(rate).toBeGreaterThan(0);
      });
    });
  });

  describe('toCny', () => {
    it('应该正确转换USD到CNY', async () => {
      const result = await toCny(100, 'USD');
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('应该正确转换EUR到CNY', async () => {
      const result = await toCny(100, 'EUR');
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });

    it('CNY应该返回原值', async () => {
      const result = await toCny(100, 'CNY');
      
      expect(result).toBe(100);
    });

    it('未知货币应该返回原值', async () => {
      const result = await toCny(100, 'UNKNOWN');
      
      expect(result).toBe(100);
    });

    it('应该正确处理小数', async () => {
      const result = await toCny(99.99, 'USD');
      
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThan(0);
    });
  });
});
