const bottleSvc = require('../../utils/bottle');
const store = require('../../utils/store');

Page({
  data: {
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    bottle: null,
    loading: false,
    seen: [],
    mine: [],
    isDemo: false,
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
      isDemo: !bottleSvc.cloudReady(),
    });
  },

  onShow() {
    this.loadMine();
    if (!this.data.bottle && !this.data.loading) this.pick();
  },

  async loadMine() {
    try {
      const mine = await bottleSvc.myBottles();
      this.setData({ mine: (mine || []).slice(0, 8) });
    } catch (e) {
      this.setData({ mine: [] });
    }
  },

  async pick() {
    if (this.data.loading) return;
    this.setData({ loading: true });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });

    try {
      const b = await bottleSvc.pickBottle(this.data.seen);
      const cat = store.categoryOf(b.category);
      const decorated = Object.assign({}, b, {
        emoji: b.emoji || cat.icon,
        catName: cat.name,
        gradient: `linear-gradient(150deg, ${cat.soft} 0%, ${cat.color}38 100%)`,
      });
      const seen = this.data.seen.concat(b.id).slice(-20);
      this.setData({ bottle: decorated, loading: false, seen });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '捞不到，等会儿再试', icon: 'none' });
    }
  },

  openBottle() {
    if (!this.data.bottle) return;
    wx.navigateTo({ url: `/pages/bottle-view/bottle-view?id=${this.data.bottle.id}` });
  },

  openMine(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/bottle-view/bottle-view?id=${id}` });
  },

  goThrow() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
