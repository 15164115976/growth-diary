const bottleSvc = require('../../utils/bottle');
const store = require('../../utils/store');
const dateUtil = require('../../utils/date');

Page({
  data: {
    id: '',
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    bottle: null,
    loading: true,
    liked: false,
    subscribed: false,
    consent: 'none', // none | pending | accepted | rejected
    isOwner: false,
    comments: [],
    draft: '',
    submitting: false,
    consentBusy: false,
  },

  onLoad(options) {
    const app = getApp();
    this.setData({
      id: options.id || '',
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
    });
    this.load();
  },

  async load() {
    try {
      const b = await bottleSvc.getBottle(this.data.id);
      const cat = store.categoryOf(b.category);
      const comments = await bottleSvc.listComments(this.data.id);

      this.setData({
        bottle: Object.assign({}, b, {
          emoji: b.emoji || cat.icon,
          catName: cat.name,
          gradient: `linear-gradient(150deg, ${cat.soft} 0%, ${cat.color}38 100%)`,
          createdText: b.createdAt ? dateUtil.friendlyDay(b.createdAt) : '',
        }),
        liked: !!b.liked,
        subscribed: !!b.subscribed,
        consent: b.consent || 'none',
        isOwner: !!b.isOwner,
        comments: (comments || []).map((c) =>
          Object.assign({}, c, {
            timeText: c.createdAt ? dateUtil.friendlyDay(c.createdAt) : '',
            avatar: c.mine ? '我' : (c.name || '匿').slice(0, 1),
          })
        ),
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: e.message || '瓶子不见了', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
    }
  },

  async toggleLike() {
    const next = !this.data.liked;
    this.setData({ liked: next });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    try {
      await bottleSvc.toggleLike(this.data.id);
    } catch (e) {
      this.setData({ liked: !next });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async toggleSubscribe() {
    const next = !this.data.subscribed;
    this.setData({ subscribed: next });
    try {
      await bottleSvc.toggleSubscribe(this.data.id);
      wx.showToast({
        title: next ? '已订阅，有更新会通知你' : '已取消订阅',
        icon: 'none',
      });
    } catch (e) {
      this.setData({ subscribed: !next });
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async requestComment() {
    if (this.data.consentBusy) return;
    this.setData({ consentBusy: true });
    try {
      await bottleSvc.requestComment(this.data.id);
      this.setData({ consent: 'pending', consentBusy: false });
      // 演示环境里对方会自动同意，稍后再拉一次状态
      setTimeout(() => this.load(), 1800);
    } catch (e) {
      this.setData({ consentBusy: false });
      wx.showToast({ title: e.message || '发不出去', icon: 'none' });
    }
  },

  onDraft(e) {
    this.setData({ draft: e.detail.value });
  },

  async submitComment() {
    const text = (this.data.draft || '').trim();
    if (!text || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      await bottleSvc.addComment(this.data.id, text);
      this.setData({ draft: '', submitting: false });
      this.load();
    } catch (e) {
      this.setData({ submitting: false });
      wx.showToast({ title: e.message || '发送失败', icon: 'none' });
    }
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },

  onShareAppMessage() {
    const b = this.data.bottle;
    return {
      title: b ? `捞到一只漂流瓶：${b.name} 的第 ${b.days} 天` : '漂流瓶',
      path: `/pages/bottle-view/bottle-view?id=${this.data.id}`,
    };
  },
});
