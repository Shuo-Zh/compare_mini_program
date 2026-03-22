import { describe, it, expect } from '@jest/globals';
import {
  normalizeTitle,
  extractNikeDunkSignals,
  isNikeDunkLike,
  matchesModelCode,
  buildVariantKey
} from '../../src/utils/productNormalizer.js';

describe('productNormalizer.js 商品标准化工具', () => {
  describe('normalizeTitle', () => {
    it('应该转换为小写并清理空格', () => {
      expect(normalizeTitle('Nike  Air   Max')).toBe('nike air max');
    });

    it('应该移除特殊字符', () => {
      expect(normalizeTitle('Nike Air Max!@#')).toBe('nike air max');
    });

    it('应该保留连字符', () => {
      expect(normalizeTitle('Nike Air-Max')).toBe('nike air-max');
    });
  });

  describe('extractNikeDunkSignals', () => {
    it('应该识别Nike Dunk', () => {
      const signals = extractNikeDunkSignals('Nike Dunk Low Panda');
      expect(signals.hasNike).toBe(true);
      expect(signals.hasDunk).toBe(true);
      expect(signals.lowHigh).toBe('low');
    });

    it('应该提取型号代码', () => {
      const signals = extractNikeDunkSignals('Nike Dunk DD1503-101');
      expect(signals.modelCode).toBe('DD1503-101');
    });

    it('应该识别颜色', () => {
      const signals = extractNikeDunkSignals('Nike Dunk Black White');
      expect(signals.colorway).toContain('black');
      expect(signals.colorway).toContain('white');
    });

    it('应该识别High版本（带空格）', () => {
      const signals = extractNikeDunkSignals('Nike Dunk High Panda');
      expect(signals.lowHigh).toBe('high');
    });

    it('应该识别High版本（结尾）', () => {
      const signals = extractNikeDunkSignals('Nike Dunk High');
      expect(signals.lowHigh).toBe('high');
    });
  });

  describe('isNikeDunkLike', () => {
    it('应该识别Nike Dunk商品', () => {
      expect(isNikeDunkLike('Nike Dunk Low')).toBe(true);
      expect(isNikeDunkLike('Nike Air Max')).toBe(false);
    });

    it('应该不区分大小写', () => {
      expect(isNikeDunkLike('nike dunk')).toBe(true);
    });
  });

  describe('matchesModelCode', () => {
    it('应该匹配型号代码', () => {
      expect(matchesModelCode('Nike Dunk DD1503-101', 'DD1503-101')).toBe(true);
      expect(matchesModelCode('Nike Dunk DD1503-101', 'DD1503-102')).toBe(false);
    });

    it('空目标代码应该返回true', () => {
      expect(matchesModelCode('Nike Dunk DD1503-101', '')).toBe(true);
    });
  });

  describe('buildVariantKey', () => {
    it('应该使用型号代码构建key', () => {
      const product = { title: 'Nike Dunk DD1503-101' };
      expect(buildVariantKey(product)).toBe('code:DD1503-101');
    });

    it('没有型号代码时应该使用特征构建key', () => {
      const product = { title: 'Nike Dunk Low Black' };
      const key = buildVariantKey(product);
      expect(key).toContain('nike-dunk');
      expect(key).toContain('low');
    });
  });
});
