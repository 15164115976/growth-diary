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

    // 拖动排序
    dragging: false,
    dragId: '',
    dragCat: '',

    // 分类编辑
    catSheet: false,
    catDraft: { key: '', name: '', icon: '' },
    catEmojis: [],
  },

  onLoad() {
    const app = getApp();
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.windowWidth = win.windowWidth || 375;
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

  /* ---------------- 拖动排序 ---------------- */
  onCardTouchStart(e) {
    const { cat, index } = e.currentTarget.dataset;
    this.touch = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      cat,
      index: Number(index),
    };
  },

  onCardLongPress(e) {
    if (!this.touch) return;
    const { cat, index } = e.currentTarget.dataset;
    const gi = this.data.groups.findIndex((g) => g.key === cat);
    if (gi < 0) return;
    const rec = this.data.groups[gi].records[Number(index)];
    if (!rec) return;

    wx.vibrateShort && wx.vibrateShort({ type: 'medium' });
    // 卡片 184rpx + 间距 20rpx
    const itemW = (204 / 750) * this.windowWidth;
    this.drag = Object.assign({}, this.touch, {
      cat,
      cur: Number(index),
      itemW,
    });
    this.setData({ dragging: true, dragId: rec.id, dragCat: cat });
  },

  onCardTouchMove(e) {
    const d = this.drag;
    if (!d) return;
    const gi = this.data.groups.findIndex((g) => g.key === d.cat);
    if (gi < 0) return;
    const len = this.data.groups[gi].records.length;

    const dx = e.touches[0].clientX - d.x;
    const step = Math.round(dx / d.itemW);
    if (step === 0) return;

    const from = d.cur;
    const to = Math.max(0, Math.min(len - 1, from + step));
    if (to === from) return;

    const arr = this.data.groups[gi].records.slice();
    const moved = arr.splice(from, 1)[0];
    arr.splice(to, 0, moved);

    d.cur = to;
    d.x = e.touches[0].clientX; // 重置基准，避免位移累积
    this.setData({ [`groups[${gi}].records`]: arr });
  },

  onCardTouchEnd() {
    const d = this.drag;
    this.touch = null;
    if (!d) return;
    this.drag = null;

    const gi = this.data.groups.findIndex((g) => g.key === d.cat);
    if (gi > -1) {
      const ids = this.data.groups[gi].records.map((r) => r.id);
      store.reorderInCategory(d.cat, ids);
    }
    // 拖动结束后短暂屏蔽 click，避免误进详情
    this.justDragged = true;
    setTimeout(() => {
      this.justDragged = false;
    }, 320);
    this.setData({ dragging: false, dragId: '', dragCat: '' });
  },

  /* ---------------- 分类编辑 ---------------- */
  openCatEdit(e) {
    const key = e.currentTarget.dataset.cat;
    const cat = store.categoryOf(key);
    this.setData({
      catSheet: true,
      catDraft: { key, name: cat.name, icon: cat.icon },
      catEmojis: store.EMOJI_SETS[key] || [],
    });
  },

  closeCatEdit() {
    this.setData({ catSheet: false });
  },

  onCatName(e) {
    this.setData({ 'catDraft.name': e.detail.value });
  },

  pickCatEmoji(e) {
    this.setData({ 'catDraft.icon': e.currentTarget.dataset.e });
  },

  saveCatEdit() {
    const d = this.data.catDraft;
    const name = (d.name || '').trim();
    if (!name) {
      wx.showToast({ title: '起个名字', icon: 'none' });
      return;
    }
    store.saveCategory(d.key, { name, icon: d.icon });
    this.setData({ catSheet: false });
    this.refresh();
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  resetCat() {
    store.resetCategory(this.data.catDraft.key);
    this.setData({ catSheet: false });
    this.refresh();
    wx.showToast({ title: '已恢复默认', icon: 'none' });
  },

  openRecord(e) {
    if (this.justDragged) return;
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

  noop() {},

  onShareAppMessage() {
    return {
      title: '春生夏长 · 把花鸟鱼虫的日子拍下来',
      path: '/pages/index/index',
    };
  },
});
