Page({
  data: {
    url: ''
  },

  onLoad(query) {
    const url = query && query.url ? decodeURIComponent(query.url) : '';
    this.setData({ url });
  }
});
