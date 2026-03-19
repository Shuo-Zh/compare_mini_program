import { BaseAdapter } from './baseAdapter.js';

export class DewuAdapter extends BaseAdapter {
  constructor() {
    super('得物');
  }

  async fetchProductsPage(keyword, page = 1) {
    const seed = buildNikeDunkSeed(keyword);
    const pageSize = 4;
    const start = (page - 1) * pageSize;
    return seed.slice(start, start + pageSize);
  }
}

function buildNikeDunkSeed(keyword) {
  const q = keyword || 'Nike Dunk';
  return [
    {
      platform: '得物',
      id: 'dw-dd1503-101',
      title: `${q} Low Panda DD1503-101`,
      image: 'https://du.hupucdn.com/70f0f7f7e6f3d5f6.png',
      attributes: { brand: 'Nike', modelCode: 'DD1503-101', sizeRange: '36-45' },
      price: 799,
      currency: 'CNY',
      url: 'https://www.dewu.com/'
    },
    {
      platform: '得物',
      id: 'dw-dd1391-103',
      title: `${q} Low Retro White Black DD1391-103`,
      image: 'https://du.hupucdn.com/4ed95ce2d0f4f0e5.png',
      attributes: { brand: 'Nike', modelCode: 'DD1391-103', sizeRange: '40-47.5' },
      price: 869,
      currency: 'CNY',
      url: 'https://www.dewu.com/'
    },
    {
      platform: '得物',
      id: 'dw-fn7801-001',
      title: `${q} Low Cacao Wow FN7801-001`,
      image: 'https://du.hupucdn.com/cf4fd5af7f5f09bb.png',
      attributes: { brand: 'Nike', modelCode: 'FN7801-001', sizeRange: '36-44.5' },
      price: 939,
      currency: 'CNY',
      url: 'https://www.dewu.com/'
    },
    {
      platform: '得物',
      id: 'dw-dv0833-100',
      title: `${q} Low Vintage Navy DV0833-100`,
      image: 'https://du.hupucdn.com/986e9d1eb809f886.png',
      attributes: { brand: 'Nike', modelCode: 'DV0833-100', sizeRange: '40-46' },
      price: 918,
      currency: 'CNY',
      url: 'https://www.dewu.com/'
    },
    {
      platform: '得物',
      id: 'dw-fj4178-100',
      title: `${q} Low Photon Dust FJ4178-100`,
      image: 'https://du.hupucdn.com/5063e57e725f95cc.png',
      attributes: { brand: 'Nike', modelCode: 'FJ4178-100', sizeRange: '35.5-44.5' },
      price: 887,
      currency: 'CNY',
      url: 'https://www.dewu.com/'
    }
  ];
}
