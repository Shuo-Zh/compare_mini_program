# 全网价格对比小程序

<p align="center">
  <img alt="Price Compare Logo" width="120" src="https://img.icons8.com/color/240/price-comparison.png">
</p>

<p align="center">
  <a href="https://github.com/Shuo-Zh/compare_mini_program">
    <img src="https://img.shields.io/github/stars/Shuo-Zh/compare_mini_program?style=social" alt="Stars">
  </a>
  <a href="https://github.com/Shuo-Zh/compare_mini_program/issues">
    <img src="https://img.shields.io/github/issues/Shuo-Zh/compare_mini_program" alt="Issues">
  </a>
  <a href="https://github.com/Shuo-Zh/compare_mini_program/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Shuo-Zh/compare_mini_program" alt="License">
  </a>
</p>

## 📝 项目简介

全网价格对比小程序是一个专注于**商品价格追踪与对比**的工具类小程序。通过抓取多个电商平台的商品数据，帮助用户找到最优惠的购买渠道，并提供历史价格趋势分析，避免高价买入。

### ✨ 核心功能

- 🔍 **全网比价**: 支持 Farfetch、Mytheresa、Shopbop、京东、淘宝、拼多多等 12+ 平台
- 📊 **历史价格**: 查看商品近 180 天的价格走势
- 🔔 **同款识别**: 自动识别不同平台的同款商品进行比价
- 📱 **商品详情**: 展示商品图片、价格、历史记录等详细信息
- 🔄 **实时刷新**: 下拉刷新获取最新价格数据

## 🏗️ 技术架构

### 前端（微信小程序）
- **框架**: 微信小程序原生开发
- **组件库**: TDesign 小程序组件库
- **语言**: JavaScript + WXSS + WXML
- **构建**: 微信开发者工具

### 后端（Node.js）
- **框架**: Express.js
- **数据库**: SQLite（商品数据存储）
- **爬虫**: Cheerio + Playwright（可选）
- **图表**: Chart.js + chartjs-node-canvas
- **测试**: Jest + Supertest

## 📁 项目结构

```
compare_mini_program/
├── 📱 小程序前端
│   ├── pages/
│   │   ├── compare/          # 全网比价主页面
│   │   │   ├── index.js      # 搜索、比价逻辑
│   │   │   ├── index.wxml    # 页面结构
│   │   │   ├── index.wxss    # 页面样式
│   │   │   └── index.json    # 页面配置
│   │   └── item/             # 商品详情页
│   │       ├── index.js      # 历史价格、相关商品
│   │       ├── index.wxml
│   │       ├── index.wxss
│   │       └── index.json
│   ├── components/           # 公共组件
│   │   ├── goods-card/       # 商品卡片
│   │   ├── goods-list/       # 商品列表
│   │   ├── price/            # 价格展示
│   │   └── webp-image/       # 图片组件
│   ├── config/
│   │   └── compare.js        # 后端地址配置
│   ├── app.js                # 小程序入口
│   ├── app.json              # 全局配置
│   └── app.wxss              # 全局样式
│
├── 🖥️ 后端服务
│   ├── src/
│   │   ├── index.js          # 服务入口
│   │   ├── adapters/         # 平台适配器
│   │   │   ├── farfetchAdapter.js
│   │   │   ├── jdAdapter.js
│   │   │   ├── taobaoAdapter.js
│   │   │   └── ...
│   │   ├── scrapers/         # 网页爬虫
│   │   │   ├── farfetchScraper.js
│   │   │   ├── itemScrapers.js
│   │   │   └── ...
│   │   ├── services/         # 业务逻辑
│   │   │   ├── priceService.js      # 价格对比
│   │   │   ├── productStore.js      # 数据存储
│   │   │   ├── chartService.js      # 图表生成
│   │   │   └── historyService.js    # 历史记录
│   │   └── utils/            # 工具函数
│   │       ├── fx.js         # 汇率转换
│   │       ├── similarity.js # 相似度计算
│   │       └── productNormalizer.js
│   ├── __tests__/            # 单元测试
│   │   ├── utils/
│   │   └── api/
│   └── package.json
│
└── 📄 配置文件
    ├── .gitignore
    ├── LICENSE
    └── README.md
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- 微信开发者工具
- Git

### 1. 克隆项目

```bash
git clone https://github.com/Shuo-Zh/compare_mini_program.git
cd compare_mini_program
```

### 2. 启动后端服务

```bash
cd server
npm install
npm run dev
```

服务默认运行在 `http://localhost:3001`

### 3. 配置小程序

1. 打开微信开发者工具
2. 导入项目，选择 `compare_mini_program` 目录
3. 修改 `config/compare.js` 中的 `baseUrl` 为实际后端地址
4. 点击"编译"运行

### 4. 运行测试

```bash
# 后端测试
cd server
npm test

# 查看测试覆盖率
npm test -- --coverage
```

## 📊 支持的电商平台

| 平台 | 类型 | 状态 |
|------|------|------|
| Farfetch | 奢侈品 | ✅ 已支持 |
| Mytheresa | 奢侈品 | ✅ 已支持 |
| Shopbop | 时尚 | ✅ 已支持 |
| Luisaviaroma | 奢侈品 | ✅ 已支持 |
| Matchesfashion | 奢侈品 | ✅ 已支持 |
| Revolve | 时尚 | ✅ 已支持 |
| FWRD | 奢侈品 | ✅ 已支持 |
| 24S | 奢侈品 | ✅ 已支持 |
| 京东 | 综合电商 | ✅ 已支持 |
| 淘宝 | 综合电商 | ✅ 已支持 |
| 拼多多 | 综合电商 | ✅ 已支持 |
| StockX | 潮鞋 | ✅ 已支持 |

## 🔧 API 接口

### 健康检查
```http
GET /health
```

### 获取支持的平台列表
```http
GET /api/sources
```

### 商品比价
```http
POST /api/compare
Content-Type: application/json

{
  "query": "Nike Dunk",
  "pages": 1,
  "limitPerSource": 8
}
```

### 商品历史价格
```http
GET /api/item/history?platform=Farfetch&itemId=12345&days=180
```

### 刷新商品数据
```http
POST /api/item/refresh
Content-Type: application/json

{
  "url": "https://www.farfetch.com/...",
  "platform": "Farfetch",
  "itemId": "12345"
}
```

## 🧪 测试覆盖

项目包含完整的单元测试，覆盖核心工具函数和 API：

```
Test Suites: 4 passed, 4 total
Tests:       40 passed, 40 total
Coverage:
  - Statements: 58.63%
  - Branches: 43.72%
  - Functions: 69.04%
  - Lines: 59.42%
```

### 测试文件
- `server/__tests__/utils/fx.test.js` - 汇率转换测试
- `server/__tests__/utils/similarity.test.js` - 相似度计算测试
- `server/__tests__/utils/productNormalizer.test.js` - 商品标准化测试
- `server/__tests__/api/health.test.js` - API 健康检查测试

## 🛠️ 开发计划

- [ ] 添加更多电商平台支持
- [ ] 实现价格降价提醒功能
- [ ] 优化爬虫性能和稳定性
- [ ] 添加用户收藏功能
- [ ] 支持价格趋势预测

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 开源协议

本项目基于 [MIT 协议](LICENSE) 开源。

## 👨‍💻 作者

**Shuo-Zh** - [GitHub](https://github.com/Shuo-Zh)

## 🙏 致谢

- [TDesign](https://tdesign.tencent.com/) - 腾讯设计体系
- [Cheerio](https://cheerio.js.org/) - 服务器端 HTML 解析
- [Chart.js](https://www.chartjs.org/) - 图表库
- [Express](https://expressjs.com/) - Web 框架

---

<p align="center">
  如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！
</p>
