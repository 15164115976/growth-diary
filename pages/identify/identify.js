const store = require('../../utils/store');
const recognizeUtil = require('../../utils/recognize');
const orientation = require('../../utils/orientation');

Page({
  data: {
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,

    mode: 'camera', // camera | scanning | result
    flip: 0,
    gravityFlip: true,
    camReady: false,
    camError: '',
    shot: '',

    result: null, // 识别结果
    matched: null, // 命中的已有记录
    failed: false, // 识别失败（或没有识别通道）

    records: [],
    lastRecord: null,
    recognizeOn: false,
    recognizeHint: '',
  },

  onLoad(options) {
    const app = getApp();
    const settings = store.getSettings();

    // 关掉「启动先识别」就直接回主页；带 force 时是用户主动点进来的
    if (!settings.startWithIdentify && !(options && options.force)) {
      wx.switchTab({ url: '/pages/index/index' });
      return;
    }

    const avail = recognizeUtil.availability(app.globalData.cloudReady);
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
      gravityFlip: settings.gravityFlip !== false,
      recognizeOn: avail.ready,
      recognizeHint: avail.ready ? '' : '还没接识别服务，直接选你记录过的生物就好',
    });
    this.loadRecords();
  },

  onShow() {
    if (this.data.mode === 'camera') this.loadRecords();
  },

  onReady() {
    if (this.data.gravityFlip) {
      this.watcher = orientation.watchOrientation(({ flip }) => {
        this.setData({ flip });
      });
    }
  },

  onUnload() {
    if (this.watcher) this.watcher.stop();
  },

  loadRecords() {
    const all = store.getAll();
    const lastId = store.getLastRecordId();
    const last = all.find((r) => r.id === lastId) || all[0] || null;
    this.setData({
      records: all.slice(0, 8).map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        iconPath: r.iconPath,
        catName: r.catName,
        catColor: r.catColor,
        catSoft: r.catSoft,
        days: r.days,
        cover: r.coverPath,
      })),
      lastRecord: last
        ? { id: last.id, name: last.name, emoji: last.emoji }
        : null,
    });
  },

  /* ---------------- 相机 ---------------- */
  onCamInit() {
    this.setData({ camReady: true, camError: '' });
  },

  onCamError() {
    this.setData({ camError: '需要相机权限才能识别', camReady: false });
  },

  openSetting() {
    wx.openSetting({});
  },

  /* ---------------- 拍照 ---------------- */
  shoot() {
    if (!this.data.camReady) {
      wx.showToast({ title: '相机还没准备好', icon: 'none' });
      return;
    }
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    const ctx = wx.createCameraContext();
    ctx.takePhoto({
      quality: 'high',
      success: (res) => this.handleShot(res.tempImagePath),
      fail: () => wx.showToast({ title: '拍摄失败，请重试', icon: 'none' }),
    });
  },

  pickFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => this.handleShot(res.tempFiles[0].tempFilePath),
    });
  },

  async handleShot(path) {
    this.setData({ shot: path, mode: 'scanning', result: null, matched: null, failed: false });

    const app = getApp();
    let result = null;
    if (this.data.recognizeOn) {
      try {
        result = await recognizeUtil.recognize(path, { useCloud: app.globalData.cloudReady });
      } catch (e) {
        result = null;
      }
    }

    if (!result) {
      this.setData({ mode: 'result', failed: true });
      return;
    }

    const cat = store.categoryOf(result.category);
    result = Object.assign({}, result, {
      emoji: cat.icon,
      catName: cat.name,
      confPct: Math.round((result.confidence || 0) * 100),
    });

    // 命中已有记录？
    const all = store.getAll();
    const key = (result.name || '').toLowerCase();
    const matched =
      all.find(
        (r) =>
          r.category === result.category &&
          key &&
          (r.name.toLowerCase().indexOf(key) > -1 ||
            key.indexOf(r.name.toLowerCase()) > -1 ||
            (result.species && r.species && r.species === result.species))
      ) || null;

    this.setData({
      mode: 'result',
      result,
      matched: matched
        ? { id: matched.id, name: matched.name, emoji: matched.emoji, days: matched.days }
        : null,
      failed: false,
    });
  },

  /* ---------------- 结果处理 ---------------- */
  useResult() {
    const r = this.data.result;
    if (!r) return;

    // 已经记录过就直接进去
    if (this.data.matched) {
      this.enterRecord(this.data.matched.id);
      return;
    }

    const cat = store.categoryOf(r.category);
    const name = r.name || r.species || `${cat.name} · 未命名`;
    const rec = store.createRecord({
      category: r.category,
      name,
      species: r.species || '',
      emoji: cat.icon,
    });
    this.enterRecord(rec.id);
  },

  retry() {
    this.setData({ shot: '', mode: 'camera', result: null, matched: null, failed: false });
  },

  createManual() {
    wx.navigateTo({
      url: `/pages/edit/edit${this.data.result ? `?category=${this.data.result.category}` : ''}`,
    });
  },

  pickExisting(e) {
    this.enterRecord(e.currentTarget.dataset.id);
  },

  openLast() {
    if (this.data.lastRecord) this.enterRecord(this.data.lastRecord.id);
  },

  enterRecord(id) {
    store.setLastRecordId(id);
    wx.redirectTo({ url: `/pages/detail/detail?id=${id}` });
  },

  goHome() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
      return;
    }
    wx.switchTab({ url: '/pages/index/index' });
  },
});
