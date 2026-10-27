const store = require('../../utils/store');
const dateUtil = require('../../utils/date');

Page({
  data: {
    id: '',
    isNew: true,
    categories: [],
    categoryKey: 'flower',
    emojiList: [],
    emoji: '🌸',
    iconPath: '',
    name: '',
    species: '',
    startDate: '',
    note: '',
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    dirty: false,
  },

  onLoad(options) {
    const app = getApp();
    const id = options.id || '';
    const categories = store.CATEGORIES;

    if (id) {
      const raw = store.getRecord(id);
      if (!raw) {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
        return;
      }
      this.setData({
        id,
        isNew: false,
        categories,
        categoryKey: raw.category,
        emojiList: store.EMOJI_SETS[raw.category] || [],
        emoji: raw.emoji,
        iconPath: raw.iconPath || '',
        name: raw.name,
        species: raw.species || '',
        startDate: dateUtil.ymd(raw.startTs),
        note: raw.note || '',
        statusBarHeight: app.globalData.statusBarHeight,
        safeTop: app.globalData.safeTop,
        safeBottom: app.globalData.safeBottom,
      });
    } else {
      const cat = options.category || 'flower';
      const c = store.categoryOf(cat);
      this.setData({
        isNew: true,
        categories,
        categoryKey: cat,
        emojiList: store.EMOJI_SETS[cat] || [],
        emoji: c.icon,
        startDate: dateUtil.ymd(),
        statusBarHeight: app.globalData.statusBarHeight,
        safeTop: app.globalData.safeTop,
        safeBottom: app.globalData.safeBottom,
      });
    }
  },

  pickCategory(e) {
    const key = e.currentTarget.dataset.key;
    const c = store.categoryOf(key);
    this.setData({
      categoryKey: key,
      emojiList: store.EMOJI_SETS[key] || [],
      emoji: this.data.iconPath ? this.data.emoji : c.icon,
    });
  },

  pickEmoji(e) {
    this.setData({ emoji: e.currentTarget.dataset.e, iconPath: '' });
  },

  pickIcon() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const saved = store.persistImage(res.tempFiles[0].tempFilePath, 'icons');
        this.setData({ iconPath: saved });
      },
    });
  },

  clearIcon() {
    this.setData({ iconPath: '' });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onSpecies(e) {
    this.setData({ species: e.detail.value });
  },

  onDate(e) {
    this.setData({ startDate: e.detail.value });
  },

  onNote(e) {
    this.setData({ note: e.detail.value });
  },

  save() {
    const name = (this.data.name || '').trim();
    if (!name) {
      wx.showToast({ title: '给它起个名字', icon: 'none' });
      return;
    }
    const startTs = new Date(this.data.startDate.replace(/-/g, '/')).getTime() || Date.now();

    if (this.data.isNew) {
      const rec = store.createRecord({
        category: this.data.categoryKey,
        name,
        species: this.data.species.trim(),
        emoji: this.data.emoji,
        iconPath: this.data.iconPath,
        startTs,
        note: this.data.note.trim(),
      });
      store.setLastRecordId(rec.id);
      wx.showToast({ title: '已创建', icon: 'success' });
      setTimeout(() => {
        wx.redirectTo({ url: `/pages/detail/detail?id=${rec.id}` });
      }, 500);
    } else {
      store.updateRecord(this.data.id, {
        category: this.data.categoryKey,
        name,
        species: this.data.species.trim(),
        emoji: this.data.emoji,
        iconPath: this.data.iconPath,
        startTs,
        note: this.data.note.trim(),
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 500);
    }
  },

  remove() {
    wx.showModal({
      title: `删除「${this.data.name}」？`,
      content: '这条记录和它的所有照片都会被删掉，无法恢复。',
      confirmColor: '#C7574E',
      confirmText: '删除',
      success: (res) => {
        if (!res.confirm) return;
        store.removeRecord(this.data.id);
        wx.showToast({ title: '已删除', icon: 'none' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 500);
      },
    });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
