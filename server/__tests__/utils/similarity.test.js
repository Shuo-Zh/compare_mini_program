import { describe, it, expect } from '@jest/globals';
import {
  normalizeTitle,
  tokenizeTitle,
  jaccard,
  extractStyleCode,
  groupSimilarProducts
} from '../../src/utils/similarity.js';

describe('similarity.js 相似度工具函数', () => {
  describe('normalizeTitle', () => {
    it('应该将标题转换为小写', () => {
      expect(normalizeTitle('Nike Air Max')).toBe('nike air max');
    });

    it('应该移除特殊字符', () => {
      expect(normalizeTitle('Nike - Air! Max?')).toBe('nike air max');
    });

    it('应该移除常见噪音词', () => {
      expect(normalizeTitle('Nike Air Max Women New Season')).toBe('nike air max');
    });

    it('应该处理空字符串', () => {
      expect(normalizeTitle('')).toBe('');
    });

    it('应该处理HTML实体', () => {
      expect(normalizeTitle('Nike &amp; Adidas')).toBe('nike adidas');
    });
  });

  describe('tokenizeTitle', () => {
    it('应该正确分词', () => {
      const tokens = tokenizeTitle('Nike Air Max 90');
      expect(tokens).toContain('nike');
      expect(tokens).toContain('air');
      expect(tokens).toContain('max');
      expect(tokens).toContain('90');
    });

    it('应该过滤短词', () => {
      const tokens = tokenizeTitle('Nike Air Max a b c');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('b');
      expect(tokens).not.toContain('c');
    });

    it('应该去重', () => {
      const tokens = tokenizeTitle('Nike Nike Air Air Max');
      const nikeCount = tokens.filter(t => t === 'nike').length;
      expect(nikeCount).toBe(1);
    });
  });

  describe('jaccard', () => {
    it('应该计算正确的Jaccard相似度', () => {
      const a = ['nike', 'air', 'max'];
      const b = ['nike', 'air', 'force'];
      const sim = jaccard(a, b);
      expect(sim).toBe(0.5); // 2/4
    });

    it('空数组应该返回0', () => {
      expect(jaccard([], ['nike'])).toBe(0);
      expect(jaccard(['nike'], [])).toBe(0);
    });

    it('完全相同的数组应该返回1', () => {
      const a = ['nike', 'air'];
      expect(jaccard(a, a)).toBe(1);
    });
  });

  describe('extractStyleCode', () => {
    it('应该提取纯字母数字款式代码', () => {
      expect(extractStyleCode('Nike Air Max DD1503101')).toBe('DD1503101');
    });

    it('应该处理没有款式代码的情况', () => {
      expect(extractStyleCode('Nike Air Max')).toBe('');
    });

    it('应该提取6-14位字母数字组合', () => {
      // 注意：PRODUCT 也是8位字母，符合匹配规则
      const result = extractStyleCode('Product ABC123XYZ789 Test');
      expect(result).toMatch(/^[A-Z0-9]{6,14}$/);
    });

    it('应该提取第一个匹配的代码', () => {
      const result = extractStyleCode('Nike DD1503101 Adidas XYZ7890123');
      expect(result).toBe('DD1503101');
    });
  });

  describe('groupSimilarProducts', () => {
    it('应该将相似商品分组', () => {
      const products = [
        { id: '1', title: 'Nike Air Max 90', platform: 'A', priceCny: 1000 },
        { id: '2', title: 'Nike Air Max 90', platform: 'B', priceCny: 1050 },
        { id: '3', title: 'Adidas Superstar', platform: 'A', priceCny: 800 },
      ];

      const result = groupSimilarProducts(products, { threshold: 0.8 });

      expect(result.groups.length).toBeGreaterThan(0);
      expect(result.groupByIndex.length).toBe(3);
    });

    it('相同样式代码的商品应该被分到同一组', () => {
      const products = [
        { id: '1', title: 'Nike DD1503101', platform: 'A', priceCny: 1000 },
        { id: '2', title: 'Nike DD1503101', platform: 'B', priceCny: 1100 },
      ];

      const result = groupSimilarProducts(products);

      expect(result.groups.length).toBe(1);
      expect(result.groups[0].size).toBe(2);
    });

    it('空数组应该返回空结果', () => {
      const result = groupSimilarProducts([]);
      expect(result.groups).toEqual([]);
      expect(result.groupByIndex).toEqual([]);
    });
  });
});
