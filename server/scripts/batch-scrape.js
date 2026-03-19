import axios from 'axios';

const BASE_URL = 'http://localhost:3001';

const KEYWORDS = [
  'dress',
  'shirt',
  'jacket',
  'coat',
  'pants',
  'jeans',
  'skirt',
  'sweater',
  'hoodie',
  't-shirt',
  'blouse',
  'shorts',
  'suit',
  'blazer',
  'cardigan',
  'vest',
  'jumpsuit',
  'romper',
  'leggings',
  'trousers',
  'bag',
  'handbag',
  'backpack',
  'wallet',
  'belt',
  'hat',
  'cap',
  'scarf',
  'gloves',
  'sunglasses',
  'watch',
  'jewelry',
  'necklace',
  'bracelet',
  'earrings',
  'ring',
  'boots',
  'heels',
  'sandals',
  'flats',
  'loafers',
  'slippers',
  'sneakers',
  'Nike',
  'Adidas',
  'Puma',
  'Reebok',
  'Converse',
  'Vans',
  'New Balance',
  'Jordan',
  'Balenciaga',
  'Gucci',
  'Prada',
  'Dior',
  'Versace',
  'Fendi',
  'Burberry',
  'Loewe',
  'Bottega Veneta',
  'Valentino',
  'Givenchy',
  'Saint Laurent',
  'Off-White',
  'Alexander McQueen',
  'Common Projects',
  'Golden Goose',
  'Yeezy',
  'Louis Vuitton',
  'Chanel',
  'Hermes',
  'Celine',
  'Miu Miu',
  'Dolce Gabbana',
  'Max Mara',
  'Theory',
  'Vince',
  'Equipment',
  ' rag bone',
  'Alice Olivia',
  'Rebecca Minkoff',
  'Tory Burch',
  'Michael Kors',
  'Coach',
  'Kate Spade',
  'Marc Jacobs',
  'Stuart Weitzman',
  'Jimmy Choo',
  'Manolo Blahnik',
  'Christian Louboutin',
  'Salvatore Ferragamo',
  'Tod s',
  'Brunello Cucinelli',
  'Loro Piana',
  'Ermenegildo Zegna',
  'Canali',
  'Hugo Boss',
  'Armani',
  'Dolce',
  'Gabbana',
];

async function getCurrentCount() {
  const res = await axios.get(`${BASE_URL}/api/products?limit=10000`);
  return res.data.items.length;
}

async function scrapeKeyword(keyword, limit = 50, page = 1) {
  try {
    const res = await axios.post(`${BASE_URL}/api/scrape`, {
      keyword,
      platforms: ['farfetch'],
      limit,
      page,
      viaJina: true,
      renderChart: false,
    }, { timeout: 60000 });
    return res.data.products?.length || 0;
  } catch (error) {
    console.error(`爬取 "${keyword}" 失败: ${error.message}`);
    return 0;
  }
}

async function main() {
  console.log('开始批量爬取商品数据...\n');
  
  let currentCount = await getCurrentCount();
  console.log(`当前数据库商品数量: ${currentCount}`);
  
  const targetCount = 1000;
  let totalScraped = 0;
  let keywordIndex = 0;
  
  while (currentCount < targetCount && keywordIndex < KEYWORDS.length) {
    const keyword = KEYWORDS[keywordIndex];
    console.log(`正在爬取: "${keyword}"...`);
    
    for (let page = 1; page <= 3 && currentCount < targetCount; page++) {
      const count = await scrapeKeyword(keyword, 50, page);
      if (count === 0) break;
      
      totalScraped += count;
      console.log(`  - 第${page}页爬取到 ${count} 条商品`);
      
      currentCount = await getCurrentCount();
      console.log(`  - 当前数据库总数: ${currentCount}`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    keywordIndex++;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n爬取完成!`);
  console.log(`- 本次爬取商品数: ${totalScraped}`);
  console.log(`- 最终数据库总数: ${currentCount}`);
}

main().catch(console.error);
