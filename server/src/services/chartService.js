import fs from 'fs/promises';
import path from 'path';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

const width = 980;
const height = 560;
const chart = new ChartJSNodeCanvas({ width, height, backgroundColour: 'white' });

export async function renderPriceChart(platformBest, keyword) {
  const labels = platformBest.map((item) => item.platform);
  const prices = platformBest.map((item) => item.priceCny);

  const config = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '最低价（CNY）',
        data: prices,
        backgroundColor: ['#0ea5e9', '#22c55e', '#f97316', '#e11d48', '#6366f1', '#14b8a6']
      }]
    },
    options: {
      plugins: {
        title: {
          display: true,
          text: `同款候选最低价对比 - ${keyword}`
        },
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: false }
      }
    }
  };

  const outputBuffer = await chart.renderToBuffer(config);
  const dir = path.join('tmp', 'images');
  await fs.mkdir(dir, { recursive: true });

  const fileName = `compare-${Date.now()}.png`;
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, outputBuffer);

  return `images/${fileName}`;
}

export async function renderTrendChart(trends, keyword, { days = 30 } = {}) {
  const points = Array.isArray(trends?.points) ? trends.points : [];
  const { labels, datasets } = buildTrendSeries(points);

  const config = {
    type: 'line',
    data: {
      labels,
      datasets
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `价格趋势（近${days}天）- ${keyword}`
        },
        legend: { display: true, position: 'bottom' }
      },
      elements: {
        line: { tension: 0.35, borderWidth: 3 },
        point: { radius: 3, hoverRadius: 5 }
      },
      scales: {
        y: { beginAtZero: false }
      }
    }
  };

  const outputBuffer = await chart.renderToBuffer(config);
  const dir = path.join('tmp', 'images');
  await fs.mkdir(dir, { recursive: true });

  const fileName = `trend-${Date.now()}.png`;
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, outputBuffer);
  return `images/${fileName}`;
}

function buildTrendSeries(points) {
  // Aggregate by day and platform: min price per day.
  const dayMap = new Map(); // day -> Map(platform -> minPrice)
  const platforms = new Set();

  for (const p of points) {
    const at = String(p.at || '');
    const day = at.slice(0, 10) || '';
    const platform = String(p.platform || 'UNKNOWN') || 'UNKNOWN';
    const price = Number(p.priceCny || 0);
    if (!day || !Number.isFinite(price) || price <= 0) continue;

    platforms.add(platform);
    const m = dayMap.get(day) || new Map();
    const prev = m.get(platform);
    if (prev === undefined || price < prev) m.set(platform, price);
    dayMap.set(day, m);
  }

  const labels = Array.from(dayMap.keys()).sort(); // YYYY-MM-DD
  const platformList = Array.from(platforms.values()).slice(0, 6);
  const colors = ['#2563eb', '#16a34a', '#f97316', '#e11d48', '#7c3aed', '#0ea5e9'];

  const datasets = platformList.map((platform, idx) => ({
    label: platform,
    data: labels.map((d) => {
      const m = dayMap.get(d);
      const v = m ? m.get(platform) : null;
      return v === undefined ? null : v;
    }),
    spanGaps: false,
    borderColor: colors[idx % colors.length],
    backgroundColor: 'transparent'
  }));

  // If no history, show empty series to keep chart generation stable.
  if (!labels.length) {
    return {
      labels: ['-'],
      datasets: [{
        label: '暂无数据',
        data: [null],
        borderColor: '#94a3b8',
        backgroundColor: 'transparent'
      }]
    };
  }

  return { labels, datasets };
}

export async function renderScrapePriceChart(products, keyword, { platform = '' } = {}) {
  const rows = Array.isArray(products) ? products : [];
  const filtered = platform ? rows.filter((p) => String(p.platform || '').toLowerCase() === String(platform).toLowerCase()) : rows;

  const priced = filtered
    .map((p) => ({
      id: String(p.id || p.item_id || '').trim(),
      title: String(p.title || '').trim(),
      price: Number(p.priceCny || p.price || 0),
    }))
    .filter((p) => p.id && p.title && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.price - b.price)
    .slice(0, 30);

  const labels = priced.map((p, idx) => `#${idx + 1}`);
  const data = priced.map((p) => p.price);

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: '价格（CNY）',
        data,
        borderColor: '#111827',
        backgroundColor: 'transparent'
      }]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `${platform || '抓取'}价格曲线（按低到高排序）- ${keyword}`
        },
        legend: { display: false }
      },
      elements: {
        line: { tension: 0.35, borderWidth: 3 },
        point: { radius: 3, hoverRadius: 5 }
      },
      scales: {
        y: { beginAtZero: false }
      }
    }
  };

  const outputBuffer = await chart.renderToBuffer(config);
  const dir = path.join('tmp', 'images');
  await fs.mkdir(dir, { recursive: true });

  const fileName = `scrape-${Date.now()}.png`;
  const fullPath = path.join(dir, fileName);
  await fs.writeFile(fullPath, outputBuffer);
  return `images/${fileName}`;
}
