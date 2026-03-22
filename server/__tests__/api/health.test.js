import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

// 创建一个简单的express应用用于测试
const app = express();
app.use(express.json());

// 模拟健康检查端点
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

describe('Health API', () => {
  it('应该返回健康状态', async () => {
    const response = await request(app)
      .get('/health')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(response.body.ok).toBe(true);
    expect(response.body.timestamp).toBeDefined();
  });
});
