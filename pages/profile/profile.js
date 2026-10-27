const store = require('../../utils/store');
const transition = require('../../utils/transition');
const dateUtil = require('../../utils/date');

Page({
  data: {
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    settings: {},
    records: [],
    stats: { records: 0, photos: 0, careLogs: 0, longest: 0 },
    pickerVisible: false,
    aiEndpoint: '',
    recognizeEndpoint: '',
    cloudEnv: '',
    aiCacheCount: 0,
    cloudReady: false,
    enterModes: [
      { key: 'last', name: '上次那条', desc: '打开就回到你最近在看的记录' },
      { key: 'fixed', name: '指定一条', desc: '固定进入同一条记录' },
      { key: 'home', name: '停在首页', desc: '每次都先看全部四类' },
    ],
    focusName: '',
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
    });
  },

  onShow() {
    const tabBar = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
    if (tabBar) tabBar.setData({ selected: 2 });
    this.refresh();
  },

  refresh() {
    const all = store.getAll();
    const settings = store.getSettings();
    const stats = {
      records: all.length,
      photos: all.reduce((s, r) => s + r.photoCount, 0),
      careLogs: all.reduce((s, r) => s + (r.careLogs || []).length, 0),
      longest: all.reduce((m, r) => Math.max(m, r.days), 0),
    };
    const focus = all.find((r) => r.id === settings.fixedRecordId);

    this.setData({
      settings,
      records: all.map((r) => ({
        id: r.id,
        name: r.name,
        emoji: r.emoji,
        iconPath: r.iconPath,
        catName: r.catName,
        days: r.days,
      })),
      stats,
      aiEndpoint: settings.aiEndpoint || '',
      recognizeEndpoint: settings.recognizeEndpoint || '',
      cloudEnv: settings.cloudEnv || '',
      aiCacheCount: transition.cacheSize(),
      cloudReady: !!(getApp().globalData && getApp().globalData.cloudReady),
      focusName: focus ? `${focus.emoji} ${focus.name}` : '',
    });
  },

  /* ---------- 启动识别 / 重力 / Live ---------- */
  onStartIdentify(e) {
    const v = e.detail.value;
    store.saveSettings({ startWithIdentify: v });
    this.setData({ 'settings.startWithIdentify': v });
  },

  onGravityChange(e) {
    const v = e.detail.value;
    store.saveSettings({ gravityFlip: v });
    this.setData({ 'settings.gravityFlip': v });
  },

  onSoundChange(e) {
    const v = e.detail.value;
    store.saveSettings({ liveSound: v });
    this.setData({ 'settings.liveSound': v });
  },

  onLiveAutoChange(e) {
    const v = e.detail.value;
    store.saveSettings({ liveAuto: v });
    this.setData({ 'settings.liveAuto': v });
  },

  onLiveChange(e) {
    const v = e.detail.value;
    store.saveSettings({ livePhoto: v });
    this.setData({ 'settings.livePhoto': v });
  },

  onDriftChange(e) {
    const v = e.detail.value;
    store.saveSettings({ allowDrift: v });
    this.setData({ 'settings.allowDrift': v });
    if (v) {
      wx.showToast({ title: '投放时仍会逐条确认', icon: 'none' });
    }
  },

  goBottle() {
    wx.navigateTo({ url: '/pages/bottle/bottle' });
  },

  goIdentify() {
    wx.navigateTo({ url: '/pages/identify/identify?force=1' });
  },

  /* ---------- 识别服务 ---------- */
  onRecognizeEndpoint(e) {
    this.setData({ recognizeEndpoint: e.detail.value });
  },

  saveRecognizeEndpoint() {
    const url = (this.data.recognizeEndpoint || '').trim();
    if (url && !/^https:\/\//.test(url)) {
      wx.showToast({ title: '需为 https 地址', icon: 'none' });
      return;
    }
    store.saveSettings({ recognizeEndpoint: url });
    this.setData({ 'settings.recognizeEndpoint': url });
    wx.showToast({ title: url ? '已保存识别接口' : '已清空', icon: 'none' });
  },

  onCloudEnv(e) {
    this.setData({ cloudEnv: e.detail.value });
  },

  saveCloudEnv() {
    const env = (this.data.cloudEnv || '').trim();
    store.saveSettings({ cloudEnv: env });
    this.setData({ 'settings.cloudEnv': env });
    wx.showModal({
      title: '已保存',
      content: '云环境 ID 需要重启小程序才生效（右上角胶囊 → 重新进入）。',
      showCancel: false,
    });
  },

  /* ---------- 启动方式 ---------- */
  setEnterMode(e) {
    const { key } = e.currentTarget.dataset;
    store.saveSettings({ enterMode: key });
    this.setData({ 'settings.enterMode': key });
    if (key === 'fixed' && !this.data.settings.fixedRecordId) {
      this.openPicker();
    }
  },

  openPicker() {
    if (!this.data.records.length) {
      wx.showToast({ title: '还没有记录', icon: 'none' });
      return;
    }
    this.setData({ pickerVisible: true });
  },

  closePicker() {
    this.setData({ pickerVisible: false });
  },

  pickRecord(e) {
    const { id, name, emoji } = e.currentTarget.dataset;
    store.saveSettings({ fixedRecordId: id, enterMode: 'fixed' });
    store.setLastRecordId(id);
    this.setData({
      pickerVisible: false,
      'settings.fixedRecordId': id,
      'settings.enterMode': 'fixed',
      focusName: `${emoji} ${name}`,
    });
  },

  /* ---------- 拍照 ---------- */
  onGridChange(e) {
    const v = e.detail.value;
    store.saveSettings({ showGrid: v });
    this.setData({ 'settings.showGrid': v });
  },

  onRefOpacity(e) {
    const v = e.detail.value;
    store.saveSettings({ refOpacity: v });
    this.setData({ 'settings.refOpacity': v });
  },

  /* ---------- 幻灯片 ---------- */
  onInterval(e) {
    const v = e.detail.value;
    store.saveSettings({ autoPlayInterval: v });
    this.setData({ 'settings.autoPlayInterval': v });
  },

  onAiToggle(e) {
    const v = e.detail.value;
    store.saveSettings({ aiTransition: v });
    this.setData({ 'settings.aiTransition': v });
    if (v && !this.data.settings.aiEndpoint) {
      wx.showToast({ title: '记得填上服务地址', icon: 'none' });
    }
  },

  onEndpoint(e) {
    this.setData({ aiEndpoint: e.detail.value });
  },

  saveEndpoint() {
    const url = (this.data.aiEndpoint || '').trim();
    if (url && !/^https:\/\//.test(url)) {
      wx.showToast({ title: '需为 https 地址', icon: 'none' });
      return;
    }
    store.saveSettings({ aiEndpoint: url });
    this.setData({ 'settings.aiEndpoint': url });
    wx.showToast({ title: url ? '已保存接口' : '已清空', icon: 'none' });
  },

  clearAiCache() {
    wx.showModal({
      title: '清除过渡缓存？',
      content: `当前缓存了 ${this.data.aiCacheCount} 段 AI 过渡视频，清除后下次需要重新生成。`,
      success: (res) => {
        if (!res.confirm) return;
        transition.clearCache();
        this.setData({ aiCacheCount: 0 });
        wx.showToast({ title: '已清除', icon: 'none' });
      },
    });
  },

  /* ---------- 数据 ---------- */
  exportData() {
    const all = store.listRecords().map((r) => ({
      name: r.name,
      species: r.species,
      category: r.category,
      start: dateUtil.ymd(r.startTs),
      photos: (r.photos || []).map((p) => ({ date: p.date, note: p.note })),
      care: (r.careLogs || []).map((c) => ({ type: c.type, date: dateUtil.ymd(c.ts) })),
    }));
    wx.setClipboardData({
      data: JSON.stringify(all, null, 2),
      success: () => wx.showToast({ title: '数据已复制', icon: 'none' }),
    });
  },

  clearAll() {
    wx.showModal({
      title: '清空所有数据？',
      content: '所有记录、照片和养护日志都会被删除，且无法恢复。',
      confirmColor: '#C7574E',
      confirmText: '全部清空',
      success: (res) => {
        if (!res.confirm) return;
        store.listRecords().forEach((r) => store.removeRecord(r.id));
        try {
          // 写成空数组而不是删除 key，避免下次启动重新生成示例数据
          wx.setStorageSync('gd_records_v1', []);
          wx.removeStorageSync('gd_last_record_v1');
        } catch (e) {
          /* ignore */
        }
        transition.clearCache();
        this.refresh();
        wx.showToast({ title: '已清空', icon: 'none' });
      },
    });
  },

  noop() {},
});
