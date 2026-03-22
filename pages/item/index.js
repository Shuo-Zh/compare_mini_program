const { getBaseUrl } = require('../../config/compare');

const ITEM_TAP_KEY = 'compare:last_item_tap_v1';

function formatDateTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return isoString;
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

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

    // Allow opening item detail directly with a URL (for debugging / deep links).
    // Example: /pages/item/index?url=https%3A%2F%2Fwww.farfetch.com%2F...&platform=Farfetch&itemId=123
    const url = q.url ? safeDecode(String(q.url)) : '';
    const platform = q.platform ? String(q.platform) : '';
    const itemId = q.itemId ? String(q.itemId) : '';
    const title = q.title ? safeDecode(String(q.title)) : '';
    const image = q.image ? safeDecode(String(q.image)) : '';
    const priceCny = q.priceCny ? Number(q.priceCny) : 0;

    console.log('[onLoad] URL params:', { url, platform, itemId, title, image, priceCny });

    if (url) {
      // 如果URL参数存在，直接使用URL参数
      this.setData({
        item: {
          platform: platform || this.data.item.platform || '',
          id: itemId || this.data.item.id || '',
          title: title || this.data.item.title || '',
          image: image || this.data.item.image || '',
          url,
          priceCny: priceCny || this.data.item.priceCny || 0,
          currency: this.data.item.currency || 'CNY',
          matchGroupId: this.data.item.matchGroupId || '',
        },
      }, () => {
        console.log('[onLoad] Item data set via URL params:', this.data.item);
        // Auto-refresh on enter to "crawl history" for this specific product.
        this.onRefresh();
      });
    } else {
      // 否则从存储中恢复数据
      this.restoreItem(key, () => {
        // Auto-refresh on enter to "crawl history" for this specific product.
        this.onRefresh();
      });
    }
  },

  restoreItem(key, callback) {
    if (!key) {
      if (callback) callback();
      return;
    }
    try {
      const cached = wx.getStorageSync(key);
      console.log('[restoreItem] Key:', key, 'Cached data:', cached);
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
        }, () => {
          console.log('[restoreItem] Restored item url:', this.data.item.url);
          if (callback) callback();
        });
      } else {
        console.log('[restoreItem] No valid cached data found');
        if (callback) callback();
      }
    } catch (_e) {
      console.log('[restoreItem] Error:', _e);
      if (callback) callback();
    }
  },

  onPullDownRefresh() {
    console.log('[onPullDownRefresh] Triggered');
    this.onRefresh(() => {
      wx.stopPullDownRefresh();
      console.log('[onPullDownRefresh] Stopped');
    });
  },

  onRefresh(callback) {
    if (this.data.loading) {
      if (callback) callback();
      return;
    }
    const baseUrl = getBaseUrl();
    const it = this.data.item || {};
    console.log('[onRefresh] Item data:', it);
    console.log('[onRefresh] Item URL:', it.url);
    if (!it.url) {
      console.log('[onRefresh] ERROR: Missing URL');
      this.setData({ error: '缺少商品链接，无法刷新' });
      if (callback) callback();
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
          snapshots: Array.isArray(data.snapshots) ? data.snapshots.slice().reverse().map(s => ({
            ...s,
            createdAtFormatted: formatDateTime(s.createdAt)
          })) : [],
          stats: data.stats ? {
            ...data.stats,
            lastAtFormatted: formatDateTime(data.stats.lastAt)
          } : null,
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
          this.setData({ _retriedBaseUrl: true }, () => this.onRefresh(callback));
          return;
        }
        this.setData({ error: `请求失败：${baseUrl}（请确认后端 3001 已启动，且小程序后端地址为局域网IP）` });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ loading: false });
        if (callback) callback();
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
    if (!item || !item.url) {
      console.log('[onRelatedTap] No item or url found, idx:', idx, 'item:', item);
      return;
    }

    console.log('[onRelatedTap] Tapped item:', item.title, 'url:', item.url);

    // 直接通过URL参数传递商品数据
    const target = `/pages/item/index?url=${encodeURIComponent(item.url)}&platform=${encodeURIComponent(item.platform)}&itemId=${encodeURIComponent(item.itemId || item.id)}&title=${encodeURIComponent(item.title)}&image=${encodeURIComponent(item.image)}&priceCny=${item.priceCny}`;
    console.log('[onRelatedTap] Navigating to:', target);

    // 先尝试 redirectTo（关闭当前页面打开新页面）
    wx.redirectTo({
      url: target,
      success: () => console.log('[onRelatedTap] redirectTo success'),
      fail: (err) => {
        console.log('[onRelatedTap] redirectTo failed:', err);
        // 如果 redirectTo 失败，尝试 reLaunch
        wx.reLaunch({
          url: target,
          success: () => console.log('[onRelatedTap] reLaunch success'),
          fail: (err2) => {
            console.log('[onRelatedTap] reLaunch failed:', err2);
            const msg = err2?.errMsg || err?.errMsg || 'unknown';
            wx.showModal({ title: '无法打开商详页', content: msg, showCancel: false });
          },
        });
      },
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
    if (!url) {
      wx.showToast({ title: '暂无商品链接', icon: 'none' });
      return;
    }
    // 复制链接到剪贴板
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showModal({
          title: '链接已复制',
          content: '商品链接已复制到剪贴板，请在浏览器中打开',
          showCancel: false,
          confirmText: '我知道了'
        });
      },
      fail: () => {
        wx.showToast({ title: '复制失败', icon: 'none' });
      }
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
