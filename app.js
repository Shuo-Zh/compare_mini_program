import updateManager from './common/updateManager';

App({
  onLaunch: function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'your-env-id', // 替换为您的云开发环境 ID
        traceUser: true,    // 记录用户访问
      });
      console.log('云开发初始化成功');
    }
  },
  onShow: function () {
    updateManager();
  },
});
