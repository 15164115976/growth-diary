Component({
  data: {
    selected: 0,
    safeBottom: 0,
    list: [
      { pagePath: '/pages/index/index', text: '记录', icon: 'leaf' },
      { pagePath: '/pages/gallery/gallery', text: '影集', icon: 'film' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: 'user' },
    ],
  },

  attached() {
    const app = getApp();
    if (app && app.globalData) {
      this.setData({ safeBottom: app.globalData.safeBottom || 0 });
    }
  },

  methods: {
    onTap(e) {
      const { index, path } = e.currentTarget.dataset;
      if (index === this.data.selected) return;
      wx.switchTab({ url: path });
    },
  },
});
