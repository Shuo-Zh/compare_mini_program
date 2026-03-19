const { getBaseUrl, getDefaultDevBaseUrl } = require('../../config/compare');

let activeRequestId = 0;
const CACHE_KEY = 'compare:last_result_v2';
const CRAWL_CACHE_KEY = 'crawl:farfetch:last_result_v2';
const ITEM_TAP_KEY = 'compare:last_item_tap_v1';
const DEV_BASEURL_KEY = 'compare:dev_base_url';

Page({
  data: {
    view: 'search', // 'search' | 'results'
    // Default input; user can type anything (e.g. "T-shirt").
    query: 'Nike Dunk',
    baseUrl: '',
    showDev: false,
    devBaseUrlInput: '',
    pingMsg: '',
    enableExtraPlatforms: false,
    searchedInput: '',
    searchedQuery: '',
    sourceUrl: '',
    loading: false,
    imageUrl: '',
    platformBest: [],
    failures: [],
    stats: null,
    generatedAt: '',
    historyId: '',
    products: [],
    displayProducts: [],
    pageSize: 3,
    pageIndex: 0,
    combinedProducts: [],
    combinedDisplayProducts: [],
    combinedPageIndex: 0,
    combinedPageSize: 3,
    error: '',
    minLoadingMs: 800,

    crawlLoading: false,
    crawlError: '',
    crawlSearchedInput: '',
    crawlSearchedQuery: '',
    crawlSourceUrl: '',
    crawlGeneratedAt: '',
    crawlEvidenceUrl: '',
    crawlChartUrl: '',
    crawlProducts: [],
    crawlDisplayProducts: [],
    crawlPageSize: 3,
    crawlPageIndex: 0,
    crawlRemotePage: 1,
    crawlHasMore: true,
    navError: '',
  },

  noop() {},

  normalizeBaseUrl(input) {
    return String(input || '').trim().replace(/\/+$/, '');
  },

  onShowTitle(e) {
    const title = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.title)
      ? String(e.currentTarget.dataset.title)
      : '';
    if (!title) return;
    wx.showModal({
      title: '商品名称',
      content: title,
      showCancel: false,
    });
  },

  openItemDetail(item) {
    if (!item || !item.url) {
      wx.showToast({ title: '该条目缺少链接', icon: 'none' });
      return;
    }

    try {
      wx.setStorageSync(ITEM_TAP_KEY, {
        platform: item.platform || '',
        id: item.id || '',
        title: item.title || '',
        image: item.image || '',
        url: item.url || '',
        priceCny: item.priceCny || item.price || 0,
        currency: item.currency || 'CNY',
        matchGroupId: item.matchGroupId || '',
      });
    } catch (_e) {
      // ignore
    }

    // Keep the navigation URL extremely short. Some WeChat builds have fragile URL parsing/limits
    // that can mis-handle query strings and report "page ... is not found".
    // The detail page defaults to reading ITEM_TAP_KEY from storage when query is empty.
    const target = '/pages/item/index';
    this.setData({ navError: '' });

    const report = (errLike, stage) => {
      const msg = (errLike && errLike.errMsg) ? String(errLike.errMsg) : 'unknown';
      const full = `${stage}: ${msg}`;
      this.setData({ navError: full });
      console.warn(full, errLike);
      wx.showModal({
        title: '无法打开商详页',
        content: `${full}\n\ntarget=${target}\n\n常见原因：\n1) 页面栈已满(10)\n2) 路由未编译或页面不存在\n\n可尝试：返回到首页后再试，或重新编译小程序`,
        showCancel: false,
      });
    };

    const pages = (typeof getCurrentPages === 'function') ? getCurrentPages() : [];
    const stackLen = Array.isArray(pages) ? pages.length : 0;

    const doReLaunch = (err2, stage2) => {
      wx.reLaunch({
        url: target,
        fail: (err3) => report(err3 || err2, stage2 ? `${stage2} -> reLaunch` : 'reLaunch'),
      });
    };

    const doRedirect = (err, stage) => {
      wx.redirectTo({
        url: target,
        fail: (err2) => doReLaunch(err2 || err, stage ? `${stage} -> redirectTo` : 'redirectTo'),
      });
    };

    // Avoid page stack overflow: use redirect when stack is close to 10.
    if (stackLen >= 9) {
      doRedirect({ errMsg: `page stack near limit (${stackLen})` }, 'precheck');
      return;
    }

    wx.navigateTo({
      url: target,
      fail: (err) => doRedirect(err, 'navigateTo'),
    });
  },

  onLoad() {
    try { wx.removeStorageSync(DEV_BASEURL_KEY); } catch (_e) { /* ignore */ }
    this.bootstrapBaseUrl();
    this.restoreCache();
    this.restoreCrawlCache();
    this.normalizeCachedResourceUrls();
    this.rebuildCombined();
  },

  onShow() {
    // In DevTools, pages can be cached; restore to make result "stick".
    try { wx.removeStorageSync(DEV_BASEURL_KEY); } catch (_e) { /* ignore */ }
    this.bootstrapBaseUrl();
    this.restoreCache();
    this.restoreCrawlCache();
    this.normalizeCachedResourceUrls();
    this.rebuildCombined();
  },

  normalizeCachedResourceUrls() {
    const baseUrl = (this.data.baseUrl || getBaseUrl() || '').replace(/\/+$/, '');
    if (!baseUrl) return;
    const patch = {};

    const rewrite = (u) => {
      try {
        const url = new URL(String(u || ''));
        const path = url.pathname || '';
        // Rebind local resources to current baseUrl (Wi-Fi IP changes frequently).
        // Always use current baseUrl for local resources to ensure correct port
        if (path.startsWith('/images/') || path.startsWith('/evidence/')) {
          return `${baseUrl}${path}`;
        }
        // Fix wrong port numbers (e.g., 3002 -> 3001)
        const correctPort = baseUrl.match(/:(\d+)/)?.[1] || '3001';
        if (url.port && url.port !== correctPort && (url.hostname === '172.20.10.4' || url.hostname.startsWith('192.168.') || url.hostname.startsWith('10.') || url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
          url.port = correctPort;
          return url.toString();
        }
      } catch (_e) {
        // ignore
      }
      return u;
    };

    if (this.data.imageUrl) patch.imageUrl = rewrite(this.data.imageUrl);
    if (this.data.crawlEvidenceUrl) patch.crawlEvidenceUrl = rewrite(this.data.crawlEvidenceUrl);
    if (this.data.crawlChartUrl) patch.crawlChartUrl = rewrite(this.data.crawlChartUrl);

    // Also fix product images with wrong port
    if (Array.isArray(this.data.crawlProducts)) {
      const fixedProducts = this.data.crawlProducts.map(p => ({
        ...p,
        image: rewrite(p.image)
      }));
      if (JSON.stringify(fixedProducts) !== JSON.stringify(this.data.crawlProducts)) {
        patch.crawlProducts = fixedProducts;
        patch.crawlDisplayProducts = fixedProducts.slice(0, this.data.crawlPageSize);
      }
    }

    if (!Object.keys(patch).length) return;
    this.setData(patch);
    this.persistCache({ imageUrl: patch.imageUrl || this.data.imageUrl });
    this.persistCrawlCache({
      crawlEvidenceUrl: patch.crawlEvidenceUrl || this.data.crawlEvidenceUrl,
      crawlChartUrl: patch.crawlChartUrl || this.data.crawlChartUrl,
      crawlProducts: patch.crawlProducts || this.data.crawlProducts,
      crawlDisplayProducts: patch.crawlDisplayProducts || this.data.crawlDisplayProducts,
    });
  },

  bootstrapBaseUrl() {
    const current = getBaseUrl();
    const devDefault = getDefaultDevBaseUrl();
    const initial = this.normalizeBaseUrl(devDefault || current);

    // Prefer default dev baseUrl to avoid stale overrides after Wi‑Fi IP changes.
    if (devDefault && devDefault !== current) {
      try { wx.setStorageSync(DEV_BASEURL_KEY, devDefault); } catch (_e) { /* ignore */ }
    }

    this.setData({ baseUrl: initial, devBaseUrlInput: initial });

    // If initial fails, try the other candidate (override or default).
    this.pingOnce(initial, (ok) => {
      if (ok) return;
      const fallback = this.normalizeBaseUrl((initial === current) ? devDefault : current);
      if (fallback && fallback !== initial) {
        this.pingOnce(fallback, (ok2) => {
          if (ok2) {
            this.setData({ baseUrl: fallback, devBaseUrlInput: fallback, pingMsg: '已自动切换到可用后端地址' }, () => {
              this.normalizeCachedResourceUrls();
            });
            return;
          }
          this.setData({ pingMsg: `后端不可达：${initial}（点“设置”更新）` });
        });
        return;
      }
      this.setData({ pingMsg: `后端不可达：${initial}（点“设置”更新）` });
    });
  },

  onChartImgError() {
    // Chart image sometimes points to a stale IP (Wi-Fi changed) or comes from cached URL.
    const baseUrl = (this.data.baseUrl || getBaseUrl() || '').replace(/\/+$/, '');
    const u = String(this.data.crawlChartUrl || '');
    if (!baseUrl || !u) return;
    try {
      const parsed = new URL(u);
      const path = parsed.pathname || '';
      const correctPort = baseUrl.match(/:(\d+)/)?.[1] || '3001';
      // Fix both path-based URLs and wrong port numbers
      let rewritten = u;
      if (path.startsWith('/images/')) {
        rewritten = `${baseUrl}${path}`;
      } else if (parsed.port && parsed.port !== correctPort) {
        parsed.port = correctPort;
        rewritten = parsed.toString();
      }
      if (rewritten !== u) {
        this.setData({ crawlChartUrl: rewritten });
        this.persistCrawlCache({ crawlChartUrl: rewritten });
      }
    } catch (_e) {
      // ignore
    }
  },

  pingOnce(baseUrl, cb) {
    const u = this.normalizeBaseUrl(baseUrl);
    if (!u) return cb && cb(false);
    wx.request({
      url: `${u}/health`,
      method: 'GET',
      timeout: 4500,
      success: (res) => cb && cb(res.statusCode === 200),
      fail: (err) => {
        const msg = err && err.errMsg ? String(err.errMsg) : 'request fail';
        this.setData({ pingMsg: `连接失败：${msg}` });
        cb && cb(false);
      },
    });
  },

  restoreCache() {
    try {
      const cached = wx.getStorageSync(CACHE_KEY);
      if (!cached || typeof cached !== 'object') return;

      this.setData({
        query: cached.query || this.data.query,
        searchedInput: cached.searchedInput || '',
        searchedQuery: cached.searchedQuery || '',
        sourceUrl: cached.sourceUrl || '',
        imageUrl: cached.imageUrl || '',
        platformBest: cached.platformBest || [],
        failures: cached.failures || [],
        stats: cached.stats || null,
        generatedAt: cached.generatedAt || '',
        historyId: cached.historyId || '',
        products: cached.products || [],
        displayProducts: cached.displayProducts || [],
        pageIndex: cached.pageIndex || 0,
        combinedProducts: cached.combinedProducts || [],
        combinedDisplayProducts: cached.combinedDisplayProducts || [],
        combinedPageIndex: cached.combinedPageIndex || 0,
        error: '',
      });
    } catch (_e) {
      // ignore
    }
  },

  restoreCrawlCache() {
    try {
      const cached = wx.getStorageSync(CRAWL_CACHE_KEY);
      if (!cached || typeof cached !== 'object') return;
      console.log('[restoreCrawlCache] Restoring from cache...');
      console.log('[restoreCrawlCache] crawlProducts count:', cached.crawlProducts?.length);
      if (cached.crawlProducts && cached.crawlProducts.length > 0) {
        console.log('[restoreCrawlCache] First product image:', cached.crawlProducts[0]?.image);
      }
      this.setData({
        crawlSearchedInput: cached.crawlSearchedInput || '',
        crawlSearchedQuery: cached.crawlSearchedQuery || '',
        crawlSourceUrl: cached.crawlSourceUrl || '',
        crawlGeneratedAt: cached.crawlGeneratedAt || '',
        crawlEvidenceUrl: cached.crawlEvidenceUrl || '',
        crawlChartUrl: cached.crawlChartUrl || '',
        crawlProducts: cached.crawlProducts || [],
        crawlDisplayProducts: cached.crawlDisplayProducts || [],
        crawlPageIndex: cached.crawlPageIndex || 0,
        crawlRemotePage: cached.crawlRemotePage || 1,
        crawlHasMore: cached.crawlHasMore !== undefined ? !!cached.crawlHasMore : true,
        crawlError: '',
      });
    } catch (_e) {
      // ignore
    }
  },

  persistCache(patch = {}) {
    try {
      const payload = {
        query: this.data.query,
        searchedInput: this.data.searchedInput,
        searchedQuery: this.data.searchedQuery,
        sourceUrl: this.data.sourceUrl,
        imageUrl: this.data.imageUrl,
        platformBest: this.data.platformBest,
        failures: this.data.failures,
        stats: this.data.stats,
        generatedAt: this.data.generatedAt,
        historyId: this.data.historyId,
        products: this.data.products,
        displayProducts: this.data.displayProducts,
        pageIndex: this.data.pageIndex,
        combinedProducts: this.data.combinedProducts,
        combinedDisplayProducts: this.data.combinedDisplayProducts,
        combinedPageIndex: this.data.combinedPageIndex,
        ...patch,
      };
      wx.setStorageSync(CACHE_KEY, payload);
    } catch (_e) {
      // ignore
    }
  },

  persistCrawlCache(patch = {}) {
    try {
      const payload = {
        crawlSearchedInput: this.data.crawlSearchedInput,
        crawlSearchedQuery: this.data.crawlSearchedQuery,
        crawlSourceUrl: this.data.crawlSourceUrl,
        crawlGeneratedAt: this.data.crawlGeneratedAt,
        crawlEvidenceUrl: this.data.crawlEvidenceUrl,
        crawlChartUrl: this.data.crawlChartUrl,
        crawlProducts: this.data.crawlProducts,
        crawlDisplayProducts: this.data.crawlDisplayProducts,
        crawlPageIndex: this.data.crawlPageIndex,
        ...patch,
      };
      wx.setStorageSync(CRAWL_CACHE_KEY, payload);
    } catch (_e) {
      // ignore
    }
  },

  rebuildCombined() {
    const compare = Array.isArray(this.data.products) ? this.data.products : [];
    const crawl = Array.isArray(this.data.crawlProducts) ? this.data.crawlProducts : [];
    console.log('[rebuildCombined] compare products:', compare.length);
    console.log('[rebuildCombined] crawl products:', crawl.length);
    const merged = [];
    const seen = new Set();
    const add = (it, source) => {
      if (!it) return;
      const key = `${it.platform || ''}:${it.id || it.itemId || it.url || ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ ...it, _source: source });
    };
    compare.forEach((it) => add(it, 'compare'));
    crawl.forEach((it) => add(it, 'crawl'));

    console.log('[rebuildCombined] merged products:', merged.length);
    console.log('[rebuildCombined] First 3 merged items:');
    merged.slice(0, 3).forEach((p, i) => {
      console.log(`  [${i}] id=${p.id}, image=${p.image}, title=${p.title?.substring(0, 30)}`);
    });

    const priceOf = (it) => {
      const raw = (it && (it.priceCny || it.price)) ? Number(it.priceCny || it.price) : NaN;
      return Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
    };
    merged.sort((a, b) => priceOf(a) - priceOf(b));

    const pageSize = this.data.combinedPageSize || this.data.pageSize || 3;
    const pageIndex = Math.max(1, Number(this.data.combinedPageIndex || 1));
    const display = merged.slice(0, pageIndex * pageSize);

    console.log('[rebuildCombined] display products:', display.length);
    console.log('[rebuildCombined] First display item image:', display[0]?.image);

    this.setData({
      combinedProducts: merged,
      combinedDisplayProducts: display,
      combinedPageIndex: display.length ? pageIndex : 0,
    });

    this.persistCache({
      combinedProducts: merged,
      combinedDisplayProducts: display,
      combinedPageIndex: display.length ? pageIndex : 0,
    });
  },

  onInput(e) {
    this.setData({ query: e.detail.value });
  },

  onInputBlur(e) {
    // Ensure the latest text is committed before tapping the button.
    const v = (e && e.detail && e.detail.value) ? e.detail.value : this.data.query;
    this.setData({ query: v });
  },

  onInputConfirm(e) {
    // On some IME flows, bindinput may lag; use confirm payload as source of truth.
    const v = (e && e.detail && e.detail.value) ? e.detail.value : this.data.query;
    this.setData({ query: v }, () => this.onCompare());
  },

  onCompare() {
    if (this.data.loading) return;

    const query = (this.data.query || '').trim();
    if (!query) {
      this.setData({ error: '请输入关键词或粘贴商品链接' });
      return;
    }
    const baseUrl = this.normalizeBaseUrl(this.data.baseUrl || getBaseUrl());
    this.setData({ pingMsg: '连接测试中...' });
    this.pingOnce(baseUrl, (ok) => {
      if (!ok) {
        this.setData({ error: `后端连接失败：${baseUrl}（点“设置”更新）`, pingMsg: '连接失败' });
        return;
      }
      this.setData({ pingMsg: '连接正常' });
      this.doCompare(baseUrl, query);
    });
  },

  doCompare(baseUrl, query) {
    const requestId = (activeRequestId += 1);
    const startedAt = Date.now();

    let pending = 2;
    const doneOne = () => {
      pending -= 1;
      if (pending > 0) return;
      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, (this.data.minLoadingMs || 0) - elapsed);
      setTimeout(() => {
        if (requestId !== activeRequestId) return;
        wx.hideLoading();
        this.setData({ loading: false, crawlLoading: false });
      }, wait);
    };

    // Tie results to the search input at the time the user tapped "比价".
    // Clear previous results to avoid mismatch between input and displayed data.
    this.setData({
      searchedInput: query,
      searchedQuery: query,
      sourceUrl: '',
      crawlSearchedInput: query,
      crawlSearchedQuery: query,
      crawlSourceUrl: '',
      loading: true,
      crawlLoading: true,
      error: '',
      crawlError: '',

      imageUrl: '',
      platformBest: [],
      failures: [],
      generatedAt: '',
      historyId: '',
      products: [],
      displayProducts: [],
      pageIndex: 0,
      combinedProducts: [],
      combinedDisplayProducts: [],
      combinedPageIndex: 0,

      crawlGeneratedAt: '',
      crawlEvidenceUrl: '',
      crawlChartUrl: '',
      crawlProducts: [],
      crawlDisplayProducts: [],
      crawlPageIndex: 0,
      crawlRemotePage: 1,
      crawlHasMore: true,
    });
    wx.showLoading({ title: '紧锣密鼓的搜罗中！请稍等！', mask: true });

    wx.request({
      url: `${baseUrl}/api/compare`,
      method: 'GET',
      timeout: 20000,
      data: {
        keyword: query,
        pages: 10,
        limitPerSource: 20,
        strictMode: false,
        nikeOnly: false,
        // Trend chart has moved to item detail. Keep search page focused on "current" price results.
        persist: false,
      },
      success: (res) => {
        if (requestId !== activeRequestId) return;
        const data = res.data || {};
        if (res.statusCode !== 200) {
          this.setData({ error: `${data.message || '请求失败'}${data.detail ? `：${data.detail}` : ''}` });
          return;
        }
        // Prefer absolute URL provided by server to avoid stale baseUrl/IP issues.
        const imageUrl = data.imageUrl || (data.imagePath ? `${baseUrl}/${data.imagePath}` : '');
        const products = data.products || [];
        const displayProducts = products.slice(0, this.data.pageSize);
        const derivedKeyword = data.keyword || query;
        this.setData({
          view: 'results',
          imageUrl,
          platformBest: data.platformBest || [],
          failures: data.failures || [],
          stats: data.stats || null,
          generatedAt: data.generatedAt || '',
          historyId: data.historyId || '',
          searchedQuery: derivedKeyword,
          sourceUrl: data.sourceUrl || '',
          products,
          displayProducts,
          pageIndex: 1,
          error: '',
        }, () => this.rebuildCombined());

        this.persistCache({
          query,
          searchedInput: query,
          searchedQuery: derivedKeyword,
          sourceUrl: data.sourceUrl || '',
          view: 'results',
          imageUrl,
          platformBest: data.platformBest || [],
          failures: data.failures || [],
          stats: data.stats || null,
          generatedAt: data.generatedAt || '',
          historyId: data.historyId || '',
          products,
          displayProducts,
          pageIndex: 1,
        });
      },
      fail: () => {
        if (requestId !== activeRequestId) return;
        this.setData({ error: `请求失败：${baseUrl}（请确认后端 3001 已启动）` });
      },
      complete: () => {
        if (requestId !== activeRequestId) return;
        doneOne();
      },
    });

    // Also run Farfetch crawler with the same keyword and show results below.
    const extraPlatforms = ['mytheresa', 'shopbop', 'luisaviaroma', 'matchesfashion', 'revolve', 'fwrd', 's24'];
    wx.request({
      url: `${baseUrl}/api/scrape`,
      method: 'POST',
      timeout: 45000,
      data: {
        keyword: query,
        // Default to Farfetch (stable via r.jina.ai). Extra platforms are experimental and often blocked.
        platforms: this.data.enableExtraPlatforms ? ['farfetch'].concat(extraPlatforms) : ['farfetch'],
        limit: 24,
        // Extra platforms (Mytheresa/Shopbop etc) usually require browser rendering.
        useBrowser: !!this.data.enableExtraPlatforms,
        // Keep Jina enabled for sites where it works; server will fallback to browser when Jina yields 0 items.
        viaJina: true,
        page: 1,
        renderChart: true,
        platformTimeoutMs: this.data.enableExtraPlatforms ? 45000 : 8000,
      },
      success: (res) => {
        if (requestId !== activeRequestId) return;
        const data = res.data || {};
        if (res.statusCode !== 200) {
          this.setData({ crawlError: `${data.message || '爬取失败'}${data.detail ? `：${data.detail}` : ''}` });
          return;
        }
        const products = data.products || [];
        console.log('[compare] Crawl products received:', products.length);
        console.log('[compare] First 3 products image check:');
        products.slice(0, 3).forEach((p, i) => {
          console.log(`  [${i}] id=${p.id}, image=${p.image}, title=${p.title?.substring(0, 30)}`);
        });
        const crawlDisplayProducts = products.slice(0, this.data.crawlPageSize);
        const evidenceUrl = (data.evidence && data.evidence[0] && data.evidence[0].evidenceUrl) ? data.evidence[0].evidenceUrl : '';
        // Prefer absolute URL provided by server to avoid stale baseUrl/IP issues.
        const chartUrl = data.chartImageUrl || (data.chartImagePath ? `${baseUrl}/${data.chartImagePath}` : '');
        const derivedKeyword = data.keyword || query;

        this.setData({
          crawlGeneratedAt: data.createdAt || '',
          crawlEvidenceUrl: evidenceUrl,
          crawlChartUrl: chartUrl,
          crawlSearchedQuery: derivedKeyword,
          crawlSourceUrl: data.sourceUrl || '',
          crawlProducts: products,
          crawlDisplayProducts,
          crawlPageIndex: products.length ? 1 : 0,
          crawlRemotePage: 1,
          crawlHasMore: true,
          crawlError: products.length ? '' : '未抓到商品（可能被风控或关键词无结果）',
        }, () => this.rebuildCombined());

        this.persistCrawlCache({
          crawlSearchedInput: query,
          crawlSearchedQuery: derivedKeyword,
          crawlSourceUrl: data.sourceUrl || '',
          crawlGeneratedAt: data.createdAt || '',
          crawlEvidenceUrl: evidenceUrl,
          crawlChartUrl: chartUrl,
          crawlProducts: products,
          crawlDisplayProducts,
          crawlPageIndex: products.length ? 1 : 0,
          crawlRemotePage: 1,
          crawlHasMore: true,
        });
      },
      fail: (err) => {
        if (requestId !== activeRequestId) return;
        console.log('[compare] Crawler request failed:', err);
        this.setData({ crawlError: `爬虫请求失败：${baseUrl}（请确认后端 3001 已启动）` });
      },
      complete: () => {
        if (requestId !== activeRequestId) return;
        doneOne();
      },
    });
  },

  onToggleDev() {
    this.setData({ showDev: !this.data.showDev, pingMsg: '' });
  },

  onDevBaseUrlInput(e) {
    this.setData({ devBaseUrlInput: e.detail.value });
  },

  onSaveBaseUrl() {
    const v = this.normalizeBaseUrl(this.data.devBaseUrlInput);
    if (!v) return;
    try {
      wx.setStorageSync(DEV_BASEURL_KEY, v);
    } catch (_e) {
      // ignore
    }
    this.setData({ baseUrl: v, devBaseUrlInput: v, pingMsg: '已保存，将使用新的后端地址' });
  },

  onPing() {
    const baseUrl = this.normalizeBaseUrl(this.data.baseUrl || getBaseUrl());
    this.setData({ pingMsg: '连接测试中...' });
    wx.request({
      url: `${baseUrl}/health`,
      method: 'GET',
      timeout: 6000,
      success: (res) => {
        if (res.statusCode === 200) this.setData({ pingMsg: '连接正常' });
        else this.setData({ pingMsg: `连接异常：HTTP ${res.statusCode}` });
      },
      fail: () => {
        this.setData({ pingMsg: `连接失败：${baseUrl}（IP 变化时请点“设置”更新）` });
      },
    });
  },

  onToggleExtra(e) {
    this.setData({ enableExtraPlatforms: !!(e?.detail?.value) });
  },

  onImgError(e) {
    const ds = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : {};
    const idx = Number(ds.idx);
    console.log('[onImgError] Image load failed, idx:', idx);
    if (!Number.isFinite(idx) || idx < 0) return;
    if (!this.data.combinedDisplayProducts || idx >= this.data.combinedDisplayProducts.length) return;
    const product = this.data.combinedDisplayProducts[idx];
    console.log('[onImgError] Failed image URL:', product?.image);
    // 不再清空image字段，保持原始URL以便重试
  },

  onReachBottom() {
    const didLocal = this.loadMoreCombined();
    if (didLocal) return;
    // If local merged list exhausted, try to fetch next remote crawl page.
    this.loadMoreCrawlRemote();
  },

  loadMore() {
    this.loadMoreCombined();
  },

  loadMoreCrawl() {
    this.loadMoreCombined();
  },

  loadMoreCombined() {
    const combined = Array.isArray(this.data.combinedProducts) ? this.data.combinedProducts : [];
    const display = Array.isArray(this.data.combinedDisplayProducts) ? this.data.combinedDisplayProducts : [];
    const pageSize = this.data.combinedPageSize || this.data.pageSize || 3;
    const pageIndex = this.data.combinedPageIndex || 0;
    const start = pageIndex * pageSize;
    if (start >= combined.length) return false;
    const next = combined.slice(start, start + pageSize);
    const merged = display.concat(next);
    const nextIndex = pageIndex + 1;
    this.setData({ combinedDisplayProducts: merged, combinedPageIndex: nextIndex });
    this.persistCache({ combinedDisplayProducts: merged, combinedPageIndex: nextIndex });
    return true;
  },

  onPullDownRefresh() {
    // Pull to refresh: re-run compare with current query.
    if (this.data.loading || this.data.crawlLoading) {
      wx.stopPullDownRefresh();
      return;
    }
    wx.showLoading({ title: '正在紧密搜罗中！', mask: false });
    this.onCompare();
    // onCompare will hideLoading when both requests finish; also stop the pull-down spinner after a short delay.
    setTimeout(() => wx.stopPullDownRefresh(), 800);
  },

  loadMoreCrawlRemote() {
    if (this.data.crawlLoading) return;
    if (!this.data.crawlHasMore) return;
    const query = (this.data.crawlSearchedQuery || this.data.searchedQuery || '').trim();
    if (!query) return;

    const baseUrl = this.data.baseUrl || getBaseUrl();
    const nextPage = Math.max(1, Number(this.data.crawlRemotePage || 1)) + 1;

    this.setData({ crawlLoading: true, crawlError: '' });
    wx.showLoading({ title: '正在紧密搜罗中！', mask: false });

    const extraPlatforms = ['mytheresa', 'shopbop', 'luisaviaroma', 'matchesfashion', 'revolve', 'fwrd', 's24'];
    wx.request({
      url: `${baseUrl}/api/scrape`,
      method: 'POST',
      timeout: this.data.enableExtraPlatforms ? 65000 : 25000,
      data: {
        keyword: query,
        platforms: this.data.enableExtraPlatforms ? ['farfetch'].concat(extraPlatforms) : ['farfetch'],
        limit: 24,
        useBrowser: !!this.data.enableExtraPlatforms,
        viaJina: true,
        page: nextPage,
        renderChart: false,
        platformTimeoutMs: this.data.enableExtraPlatforms ? 45000 : 12000,
      },
      success: (res) => {
        const data = res.data || {};
        if (res.statusCode !== 200) {
          this.setData({ crawlError: `${data.message || '爬取失败'}${data.detail ? `：${data.detail}` : ''}` });
          return;
        }

        const newItems = Array.isArray(data.products) ? data.products : [];
        const existing = this.data.crawlProducts || [];
        const seen = new Set(existing.map((x) => `${x.platform || ''}:${x.id || x.url || ''}`));
        const merged = existing.slice();
        let added = 0;
        for (const it of newItems) {
          const k = `${it.platform || ''}:${it.id || it.url || ''}`;
          if (seen.has(k)) continue;
          seen.add(k);
          merged.push(it);
          added += 1;
        }

        // If this "page" returns no new unique items, treat as end-of-feed to avoid endless loading.
        const hasMore = added > 0;
        const crawlDisplayProducts = merged.slice(0, (this.data.crawlPageIndex || 0) * this.data.crawlPageSize + this.data.crawlPageSize);
        const crawlPageIndex = Math.ceil(crawlDisplayProducts.length / this.data.crawlPageSize);

        this.setData({
          crawlProducts: merged,
          crawlDisplayProducts,
          crawlPageIndex,
          crawlRemotePage: nextPage,
          crawlHasMore: hasMore,
          crawlError: hasMore ? '' : '没有更多了',
        }, () => this.rebuildCombined());

        this.persistCrawlCache({
          crawlProducts: merged,
          crawlDisplayProducts,
          crawlPageIndex,
          crawlRemotePage: nextPage,
          crawlHasMore: hasMore,
        });
      },
      fail: () => {
        this.setData({ crawlError: `爬虫请求失败：${baseUrl}（请确认后端 3001 已启动）` });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ crawlLoading: false });
      },
    });
  },

  onCardTap(e) {
    const { idx } = e.currentTarget.dataset || {};
    const i = Number(idx);
    const list = this.data.combinedDisplayProducts || [];
    const item = (Number.isFinite(i) && i >= 0) ? list[i] : null;
    if (!item) return;
    this.openItemDetail(item);
  },

  onOpenDetail(e) {
    // Dedicated "详情" button: reuse onCardTap behavior with the same dataset.
    this.onCardTap(e);
  },

  onCopyLink(e) {
    const { url, idx } = e.currentTarget.dataset || {};
    let link = url;
    if (!link && idx !== undefined) {
      const index = Number(idx);
      const item = (this.data.combinedProducts || [])[index];
      if (item) {
        link = item.url;
      }
    }
    if (!link) return;
    wx.setClipboardData({
      data: link,
      success: () => wx.showToast({ title: '链接已复制' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
  },

  onOpenEvidence(e) {
    const { url } = e.currentTarget.dataset;
    if (!url) return;
    wx.navigateTo({
      url: `/pages/compare/webview/index?url=${encodeURIComponent(url)}`,
      fail: () => {
        wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制' }) });
      },
    });
  },

  onGroupTap(e) {
    const { groupid, title } = e.currentTarget.dataset || {};
    if (!groupid) return;
    wx.navigateTo({
      url: `/pages/compare/group-detail/index?groupId=${encodeURIComponent(groupid)}&title=${encodeURIComponent(title || '')}`,
      fail: () => wx.redirectTo({ url: `/pages/compare/group-detail/index?groupId=${encodeURIComponent(groupid)}&title=${encodeURIComponent(title || '')}` }),
    });
  },

  onOpenSource(e) {
    const { url } = e.currentTarget.dataset || {};
    if (!url) return;
    wx.navigateTo({
      url: `/pages/compare/webview/index?url=${encodeURIComponent(url)}`,
      fail: () => wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制' }) }),
    });
  },

  onClear() {
    try {
      wx.removeStorageSync(CACHE_KEY);
      wx.removeStorageSync(CRAWL_CACHE_KEY);
    } catch (_e) {
      // ignore
    }
    this.setData({
      view: 'search',
      searchedInput: '',
      searchedQuery: '',
      sourceUrl: '',
      imageUrl: '',
      platformBest: [],
      failures: [],
      stats: null,
      generatedAt: '',
      historyId: '',
      products: [],
      displayProducts: [],
      pageIndex: 0,
      combinedProducts: [],
      combinedDisplayProducts: [],
      combinedPageIndex: 0,
      error: '',

      crawlSearchedInput: '',
      crawlSearchedQuery: '',
      crawlSourceUrl: '',
      crawlGeneratedAt: '',
      crawlEvidenceUrl: '',
      crawlChartUrl: '',
      crawlProducts: [],
      crawlDisplayProducts: [],
      crawlPageIndex: 0,
      crawlRemotePage: 1,
      crawlHasMore: true,
      crawlError: '',
    });
    console.log('[onClear] Cache cleared, all data reset');
  },

});
