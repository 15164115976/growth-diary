const store = require('../../utils/store');
const dateUtil = require('../../utils/date');

Page({
  data: {
    statusBarHeight: 20,
    safeTop: 64,
    navBarHeight: 44,
    safeBottom: 0,
    greeting: '',
    todayText: '',
    focus: null,
    groups: [],
    totalPhotos: 0,
    totalCount: 0,
    hasData: false,
    enterMode: 'last',
    scrollInto: '',
  },

  onLoad() {
    const app = getApp();
    const now = new Date();
    const hour = now.getHours();
    let greeting = '晚上好';
    if (hour < 6) greeting = '夜深了';
    else if (hour < 11) greeting = '早上好';
    else if (hour < 14) greeting = '中午好';
    else if (hour < 18) greeting = '下午好';

    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      navBarHeight: app.globalData.navBarHeight,
      safeBottom: app.globalData.safeBottom,
      greeting,
      todayText: `${now.getMonth() + 1} 月 ${now.getDate()} 日 · 周${dateUtil.weekday()}`,
    });
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar) tabBar.setData({ selected: 0 });

    this.refresh();
    this.maybeAutoEnter();
  },

  onPullDownRefresh() {
    this.refresh();
    wx.stopPullDownRefresh();
  },

  refresh() {
    const all = store.getAll();
    const settings = store.getSettings();
    const groups = store.groupByCategory().map((g) => ({
      key: g.category.key,
      category: g.category,
      records: g.records,
      count: g.records.length,
    }));

    // 焦点记录：指定记录 > 上次打开 > 最近更新 > 第一条
    let focus = null;
    if (settings.enterMode === 'fixed' && settings.fixedRecordId) {
      focus = all.find((r) => r.id === settings.fixedRecordId) || null;
    }
    if (!focus) {
      const lastId = store.getLastRecordId();
      focus = all.find((r) => r.id === lastId) || null;
    }
    if (!focus) {
      const withPhoto = all.filter((r) => r.photoCount > 0);
      const pool = withPhoto.length ? withPhoto : all;
      focus = pool.sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
    }

    const totalPhotos = all.reduce((sum, r) => sum + r.photoCount, 0);

    this.setData({
      groups,
      focus,
      totalPhotos,
      totalCount: all.length,
      hasData: all.length > 0,
      enterMode: settings.enterMode,
    });
  },

  /** 冷启动时按设置直达上次记录（仅一次） */
  maybeAutoEnter() {
    const app = getApp();
    if (app.globalData.autoEntered) return;
    app.globalData.autoEntered = true;

    const settings = store.getSettings();
    let targetId = '';

    if (settings.enterMode === 'last') {
      targetId = store.getLastRecordId();
    } else if (settings.enterMode === 'fixed') {
      targetId = settings.fixedRecordId;
    }

    if (!targetId) return;
    if (!store.getRecord(targetId)) return;

    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/detail/detail?id=${targetId}&auto=1`,
        fail: () => {},
      });
    }, 320);
  },

  openRecord(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    store.setLastRecordId(id);
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  quickShoot(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({ url: `/pages/capture/capture?id=${id}` });
  },

  addRecord(e) {
    const { cat } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/edit/edit?category=${cat || 'flower'}` });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  goBottle() {
    wx.navigateTo({ url: '/pages/bottle/bottle' });
  },

  goSettings() {
    wx.switchTab({ url: '/pages/profile/profile' });
  },

  onShareAppMessage() {
    return {
      title: '春生夏长 · 把花鸟鱼虫的日子拍下来',
      path: '/pages/index/index',
    };
  },
});
