const { getBaseUrl } = require('../../../config/compare');

Page({
  data: {
    groupId: '',
    groupInfo: {
      groupId: '',
      sampleTitle: ''
    },
    products: [],
    loading: false,
    error: '',
  },

  onLoad(query) {
    const groupId = query.groupId || '';
    const title = query.title || '';
    if (!groupId) {
      wx.showToast({ title: '缺少分组信息', icon: 'none' });
      wx.navigateBack();
      return;
    }
    this.setData({
      groupId,
      groupInfo: {
        groupId,
        sampleTitle: title
      }
    });
    this.onRefresh();
  },

  onRefresh() {
    if (this.data.loading) return;
    const baseUrl = getBaseUrl();
    const { groupId, groupInfo } = this.data;
    
    this.setData({ loading: true, error: '' });
    wx.showLoading({ title: '正在爬取各网站价格...', mask: true });

    wx.request({
      url: `${baseUrl}/api/compare/group`,
      method: 'POST',
      timeout: 60000,
      header: { 'content-type': 'application/json' },
      data: {
        groupId,
        title: groupInfo.sampleTitle,
        platforms: ['mytheresa', 'shopbop', 'luisaviaroma', 'matchesfashion', 'revolve', 'fwrd', 's24', 'farfetch', 'jd', 'taobao', 'pdd', 'stockx']
      },
      success: (res) => {
        const data = res.data || {};
        if (res.statusCode !== 200) {
          this.setData({ error: data.message || '请求失败' });
          return;
        }
        this.setData({
          products: data.products || [],
          error: ''
        });
      },
      fail: () => {
        this.setData({ error: `请求失败：${baseUrl}（请确认后端 3001 已启动）` });
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ loading: false });
      },
    });
  },

  onProductTap(e) {
    const { idx } = e.currentTarget.dataset || {};
    const index = Number(idx);
    const item = (this.data.products || [])[index];
    if (!item || !item.url) return;

    try {
      wx.setStorageSync('compare:last_item_tap_v1', {
        platform: item.platform || '',
        id: item.id || '',
        title: item.title || '',
        image: item.image || '',
        url: item.url || '',
        priceCny: item.priceCny || item.price || 0,
        currency: item.currency || 'CNY',
        matchGroupId: this.data.groupId || '',
      });
    } catch (_e) {
      // ignore
    }

    wx.navigateTo({
      url: '/pages/item/index',
      fail: () => wx.redirectTo({ url: '/pages/item/index' }),
    });
  },

  onShowTitle(e) {
    const title = e.currentTarget.dataset.title || '';
    if (!title) return;
    wx.showModal({
      title: '商品名称',
      content: title,
      showCancel: false,
    });
  },

  onImgError(e) {
    const { idx } = e.currentTarget.dataset || {};
    const index = Number(idx);
    if (!Number.isFinite(index) || index < 0) return;
    const path = `products[${index}].image`;
    this.setData({ [path]: '' });
  },

  onBack() {
    wx.navigateBack();
  },
});