const { getBaseUrl } = require('../../config/compare');

const ITEM_TAP_KEY = 'compare:last_item_tap_v1';

Page({
  data: {
    key: '',
    item: {
      platform: '',
      id: '',
      title: '',
      image: '',
      url: '',
      priceCny: 0,
      currency: 'CNY',
      matchGroupId: '',
    },
    loading: false,
    error: '',
    days: 180,
    total: 0,
    trendImageUrl: '',
    snapshots: [],
    stats: null,
    related: [],
    relatedLoading: false,
    _retriedBaseUrl: false,
  },

  onLoad(query) {
    const q = query || {};
    // 1) Prefer explicit key
    // 2) Fallback to the default "last tapped" key so devs can open /pages/item/index directly
    const key = q.key ? String(q.key) : ITEM_TAP_KEY;
    this.setData({ key });
    this.restoreItem(key);

    // Allow opening item detail directly with a URL (for debugging / deep links).
    // Example: /pages/item/index?url=https%3A%2F%2Fwww.farfetch.com%2F...&platform=Farfetch&itemId=123
    const url = q.url ? safeDecode(String(q.url)) : '';
    const platform = q.platform ? String(q.platform) : '';
    const itemId = q.itemId ? String(q.itemId) : '';
    const title = q.title ? safeDecode(String(q.title)) : '';
    const image = q.image ? safeDecode(String(q.image)) : '';
    if (url) {
      this.setData({
        item: {
          platform: platform || this.data.item.platform || '',
          id: itemId || this.data.item.id || '',
          title: title || this.data.item.title || '',
          image: image || this.data.item.image || '',
          url,
          priceCny: this.data.item.priceCny || 0,
          currency: this.data.item.currency || 'CNY',
          matchGroupId: this.data.item.matchGroupId || '',
        },
      });
    }

    // Auto-refresh on enter to "crawl history" for this specific product.
    this.onRefresh();
  },

  restoreItem(key) {
    if (!key) return;
    try {
      const cached = wx.getStorageSync(key);
      if (cached && typeof cached === 'object') {
        this.setData({
          item: {
            platform: cached.platform || '',
            id: cached.id || '',
            title: cached.title || '',
            image: cached.image || '',
            url: cached.url || '',
            priceCny: cached.priceCny || 0,
            currency: cached.currency || 'CNY',
            matchGroupId: cached.matchGroupId || '',
          },
        });
      }
    } catch (_e) {
      // ignore
    }
  },

  onRefresh() {
    if (this.data.loading) return;
    const baseUrl = getBaseUrl();
    const it = this.data.item || {};
    if (!it.url) {
      this.setData({ error: '缺少商品链接，无法刷新' });
      return;
    }

    const url = String(it.url || '');
    // Farfetch item pages work well via r.jina.ai without a browser.
    // Most other luxury retailers are JS-heavy and need browser rendering to get price/title reliably.
    const useBrowser = !(url.includes('farfetch.com'));

    this.setData({ loading: true, error: '' });
    wx.showLoading({ title: '正在紧密搜罗中！', mask: true });

    wx.request({
      url: `${baseUrl}/api/item/refresh`,
      method: 'POST',
      timeout: useBrowser ? 65000 : 25000,
      header: { 'content-type': 'application/json' },
      data: {
        url: it.url,
        platform: it.platform,
        itemId: it.id,
        days: this.data.days,
        limit: 400,
        useBrowser,
      },
      success: (res) => {
        const data = res.data || {};
        if (res.statusCode !== 200) {
          this.setData({ error: data.message || '请求失败' });
          return;
        }
        const current = data.current || {};
        this.setData({
          item: {
            platform: current.platform || it.platform,
            id: current.id || it.id,
            title: current.title || it.title,
            image: current.image || it.image,
            url: current.url || it.url,
            priceCny: current.priceCny || 0,
            currency: current.currency || 'CNY',
            matchGroupId: it.matchGroupId || '',
          },
          total: Number(data.total || 0),
          trendImageUrl: data.imageUrl || '',
          snapshots: Array.isArray(data.snapshots) ? data.snapshots.slice().reverse() : [],
          stats: data.stats || null,
        });

        // Fetch related products after we have a stable title.
        const title = current.title || it.title;
        if (title) this.fetchRelated(title);
      },
      fail: () => {
        // If dev baseUrl override is stale (Wi-Fi changed), retry once after clearing it.
        if (!this.data._retriedBaseUrl) {
          try {
            wx.removeStorageSync('compare:dev_base_url');
          } catch (_e) {
            // ignore
          }
          this.setData({ _retriedBaseUrl: true }, () => this.onRefresh());
          return;
        }
        this.setData({ error: `请求失败：${baseUrl}（请确认后端 3001 已启动，且小程序后端地址为局域网IP）` });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ loading: false });
      },
    });
  },

  fetchRelated(title) {
    if (this.data.relatedLoading) return;
    const baseUrl = getBaseUrl();
    const it = this.data.item || {};
    this.setData({ relatedLoading: true });
    wx.request({
      url: `${baseUrl}/api/item/related`,
      method: 'GET',
      timeout: 12000,
      data: {
        title,
        limit: 12,
        excludePlatform: it.platform,
        excludeItemId: it.id,
      },
      success: (res) => {
        const data = res.data || {};
        if (res.statusCode !== 200) return;
        const items = Array.isArray(data.items) ? data.items : [];
        this.setData({ related: items });
      },
      complete: () => {
        this.setData({ relatedLoading: false });
      },
    });
  },

  onRelatedTap(e) {
    const { idx } = e.currentTarget.dataset || {};
    const i = Number(idx);
    const item = (Number.isFinite(i) && i >= 0) ? (this.data.related || [])[i] : null;
    if (!item || !item.url) return;

    try {
      wx.setStorageSync(ITEM_TAP_KEY, {
        platform: item.platform || '',
        id: item.itemId || item.id || '',
        title: item.title || '',
        image: item.image || '',
        url: item.url || '',
        priceCny: item.priceCny || 0,
        currency: item.currency || 'CNY',
        matchGroupId: '',
      });
    } catch (_e) {
      // ignore
    }
    const target = `/pages/item/index?key=${encodeURIComponent(ITEM_TAP_KEY)}`;
    wx.navigateTo({
      url: target,
      fail: (err) => wx.redirectTo({
        url: target,
        fail: (err2) => wx.reLaunch({
          url: target,
          fail: (err3) => {
            const msg = err3?.errMsg || err2?.errMsg || err?.errMsg || 'unknown';
            wx.showModal({ title: '无法打开商详页', content: msg, showCancel: false });
          },
        }),
      }),
    });
  },

  onMainImgError() {
    this.setData({ 'item.image': '' });
  },

  onRelatedImgError(e) {
    const { idx } = e.currentTarget.dataset || {};
    const i = Number(idx);
    if (!Number.isFinite(i) || i < 0 || i >= (this.data.related || []).length) return;
    const path = `related[${i}].image`;
    this.setData({ [path]: '' });
  },

  onOpenWeb() {
    const url = (this.data.item && this.data.item.url) ? this.data.item.url : '';
    if (!url) return;
    wx.navigateTo({
      url: `/pages/compare/webview/index?url=${encodeURIComponent(url)}`,
      fail: () => wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制' }) }),
    });
  },
});

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch (_e) {
    return s;
  }
}
