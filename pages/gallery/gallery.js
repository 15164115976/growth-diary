const store = require('../../utils/store');
const dateUtil = require('../../utils/date');

// 左滑露出的操作区宽度（rpx）
const ACTIONS_RPX = 246;

Page({
  data: {
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    list: [],
    totalPhotos: 0,
    totalRecords: 0,
    longest: 0,
    offsets: {},
    openId: '',
    draggingId: '',
    actionsW: 0,
  },

  onLoad() {
    const app = getApp();
    const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
      actionsW: Math.round(((win.windowWidth || 375) / 750) * ACTIONS_RPX),
    });
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar) tabBar.setData({ selected: 1 });
    this.refresh();
  },

  refresh() {
    const all = store.getAll();
    const list = all
      .filter((r) => r.photoCount > 0)
      .map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        iconPath: r.iconPath,
        cover: r.coverPath,
        coverIsCustom: r.coverIsCustom,
        species: r.species || r.catName,
        days: r.days,
        photoCount: r.photoCount,
        catColor: r.catColor,
        catSoft: r.catSoft,
        lastText: r.latest ? dateUtil.friendlyDay(r.latest.ts) : '',
        startText: dateUtil.md(r.startTs),
      }));

    const totalPhotos = list.reduce((s, r) => s + r.photoCount, 0);
    const longest = all.reduce((m, r) => Math.max(m, r.days), 0);

    const offsets = {};
    list.forEach((r) => {
      offsets[r.id] = 0;
    });

    this.setData({
      list,
      totalPhotos,
      totalRecords: list.length,
      longest,
      offsets,
      openId: '',
    });
  },

  /* ---------------- 左滑 ---------------- */
  onTouchStart(e) {
    const id = e.currentTarget.dataset.id;
    // 拖动新卡片前先收起其他打开的
    if (this.data.openId && this.data.openId !== id) {
      const reset = {};
      this.data.list.forEach((r) => {
        reset[r.id] = 0;
      });
      this.setData({ offsets: reset, openId: '' });
    }
    this.swipe = {
      id,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      base: this.data.openId === id ? -this.data.actionsW : 0,
      locked: false,
      dead: false,
    };
  },

  onTouchMove(e) {
    const s = this.swipe;
    if (!s || s.dead) return;

    const dx = e.touches[0].clientX - s.startX;
    const dy = e.touches[0].clientY - s.startY;

    if (!s.locked) {
      // 先判定横滑还是纵向滚动，纵向就放行给页面
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) {
        s.dead = true;
        return;
      }
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        s.locked = true;
      } else {
        return;
      }
    }

    const max = this.data.actionsW;
    let next = s.base + dx;
    if (next > 0) next = 0;
    if (next < -max) next = -max;
    this.setData({ [`offsets.${s.id}`]: next, draggingId: s.id });
  },

  onTouchEnd() {
    const s = this.swipe;
    this.swipe = null;
    if (!s || s.dead || !s.locked) return;

    const cur = this.data.offsets[s.id] || 0;
    const shouldOpen = cur < -this.data.actionsW / 2;
    const offsets = {};
    this.data.list.forEach((r) => {
      offsets[r.id] = 0;
    });
    if (shouldOpen) offsets[s.id] = -this.data.actionsW;

    this.setData({
      offsets,
      openId: shouldOpen ? s.id : '',
      draggingId: '',
    });
  },

  closeSwipe() {
    const offsets = {};
    this.data.list.forEach((r) => {
      offsets[r.id] = 0;
    });
    this.setData({ offsets, openId: '', draggingId: '' });
  },

  /* ---------------- 排序 / 删除 ---------------- */
  moveTop(e) {
    const id = e.currentTarget.dataset.id;
    const ids = this.data.list.map((x) => x.id);
    const idx = ids.indexOf(id);
    if (idx <= 0) {
      this.closeSwipe();
      return;
    }
    ids.splice(idx, 1);
    ids.unshift(id);
    store.reorderRecords(ids);
    this.refresh();
    wx.showToast({ title: '已置顶', icon: 'none' });
  },

  moveUp(e) {
    const id = e.currentTarget.dataset.id;
    const ids = this.data.list.map((x) => x.id);
    const idx = ids.indexOf(id);
    if (idx <= 0) {
      this.closeSwipe();
      wx.showToast({ title: '已经在最前了', icon: 'none' });
      return;
    }
    ids.splice(idx, 1);
    ids.splice(idx - 1, 0, id);
    store.reorderRecords(ids);
    this.refresh();
  },

  moveDown(e) {
    const id = e.currentTarget.dataset.id;
    const ids = this.data.list.map((x) => x.id);
    const idx = ids.indexOf(id);
    if (idx < 0 || idx >= ids.length - 1) {
      this.closeSwipe();
      wx.showToast({ title: '已经在最后了', icon: 'none' });
      return;
    }
    ids.splice(idx, 1);
    ids.splice(idx + 1, 0, id);
    store.reorderRecords(ids);
    this.refresh();
  },

  removeOne(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((x) => x.id === id);
    wx.showModal({
      title: `删除「${item ? item.name : '这条'}」？`,
      content: '记录和它所有的照片都会被删掉，无法恢复。',
      confirmColor: '#C7574E',
      confirmText: '删除',
      success: (res) => {
        if (!res.confirm) return;
        store.removeRecord(id);
        this.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  onLongPress(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['置顶', '上移一位', '下移一位', '删除'],
      success: (res) => {
        const fake = { currentTarget: { dataset: { id } } };
        if (res.tapIndex === 0) this.moveTop(fake);
        else if (res.tapIndex === 1) this.moveUp(fake);
        else if (res.tapIndex === 2) this.moveDown(fake);
        else if (res.tapIndex === 3) this.removeOne(fake);
      },
    });
  },

  /* ---------------- 打开 ---------------- */
  play(e) {
    if (this.data.openId) {
      this.closeSwipe();
      return;
    }
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/slideshow/slideshow?id=${id}` });
  },

  openDetail(e) {
    const { id } = e.currentTarget.dataset;
    store.setLastRecordId(id);
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
