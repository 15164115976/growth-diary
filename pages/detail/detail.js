const store = require('../../utils/store');
const dateUtil = require('../../utils/date');
const bottleSvc = require('../../utils/bottle');

Page({
  data: {
    id: '',
    record: null,
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    timeline: [],
    emojiList: [],
    iconSheet: false,
    fromAuto: false,
    liveVideo: '',
    coverLive: '',
    liveSound: true,
    driftSheet: false,
    driftStory: '',
    driftBusy: false,
    stats: { days: 0, photos: 0, gap: '' },
  },

  onLoad(options) {
    const app = getApp();
    const id = options.id || '';
    store.setLastRecordId(id);

    this.setData({
      id,
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
      fromAuto: options.auto === '1',
    });
    this.load();
  },

  onShow() {
    this.applyCropResult();
    this.applyEditResult();
    if (this.data.id) this.load();
  },

  /** 照片编辑页保存后回来替换原图 */
  applyEditResult() {
    const app = getApp();
    const r = app.globalData && app.globalData.editResult;
    if (!r || r.recordId !== this.data.id) return;
    app.globalData.editResult = null;

    const saved = store.persistImage(r.path, 'photos');
    const records = store.listRecords();
    const rec = records.find((x) => x.id === r.recordId);
    if (!rec) return;
    const photo = (rec.photos || []).find((x) => x.id === r.photoId);
    if (!photo) return;

    const old = photo.path;
    photo.path = saved;
    if (rec.coverPath === old) rec.coverPath = saved;
    store.updateRecord(r.recordId, { photos: rec.photos, coverPath: rec.coverPath });
    store.removeFile(old);
    wx.showToast({ title: '照片已更新', icon: 'success' });
  },

  /** 裁剪页完成后回来接管结果 */
  applyCropResult() {
    const app = getApp();
    const r = app.globalData && app.globalData.cropResult;
    if (!r || r.recordId !== this.data.id) return;
    app.globalData.cropResult = null;

    const saved = store.persistImage(r.path, 'photos');

    if (r.purpose === 'cover') {
      store.setCover(this.data.id, saved);
      wx.showToast({ title: '封面已更新', icon: 'success' });
      return;
    }

    if (r.purpose === 'photo' && r.photoId) {
      const records = store.listRecords();
      const rec = records.find((x) => x.id === r.recordId);
      if (!rec) return;
      const photo = (rec.photos || []).find((x) => x.id === r.photoId);
      if (!photo) return;
      const old = photo.path;
      photo.path = saved;
      if (rec.coverPath === old) rec.coverPath = saved;
      store.updateRecord(r.recordId, { photos: rec.photos, coverPath: rec.coverPath });
      store.removeFile(old);
      wx.showToast({ title: '照片已更新', icon: 'success' });
    }
  },

  load() {
    const raw = store.getRecord(this.data.id);
    if (!raw) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) }), 600);
      return;
    }
    const record = store.decorate(raw);

    const timeline = record.photos
      .slice()
      .reverse()
      .map((p) => ({
        id: p.id,
        path: p.path,
        ts: p.ts,
        note: p.note,
        live: p.live && p.live.path ? p.live.path : '',
        dayLabel: `第 ${dateUtil.daysBetween(raw.startTs, p.ts) + 1} 天`,
        dateLabel: dateUtil.md(p.ts),
      }));

    const coverLive =
      record.latest && record.latest.live && record.latest.live.path ? record.latest.live.path : '';
    const liveSound = store.getSettings().liveSound !== false;

    const gapDays = record.latest ? dateUtil.sinceDays(record.latest.ts) : null;
    const stats = {
      days: record.days,
      photos: record.photoCount,
      gap: gapDays === null ? '—' : gapDays === 0 ? '今天' : `${gapDays} 天前`,
    };

    const emojiSet = store.EMOJI_SETS[record.category] || [];
    this.setData({
      record,
      timeline,
      stats,
      coverLive,
      liveSound,
      emojiList: emojiSet,
    });

    wx.setNavigationBarTitle({ title: record.name });
  },

  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  goEdit() {
    wx.navigateTo({ url: `/pages/edit/edit?id=${this.data.id}` });
  },

  goCapture() {
    const rec = this.data.record;
    const refId = rec && rec.latest ? rec.latest.id : '';
    wx.navigateTo({ url: `/pages/capture/capture?id=${this.data.id}&refId=${refId}` });
  },

  goCare(e) {
    const tab = e.currentTarget.dataset.tab || 'manual';
    wx.navigateTo({ url: `/pages/care/care?id=${this.data.id}&tab=${tab}` });
  },

  goSlideshow() {
    if (!this.data.record || this.data.record.photoCount < 1) {
      wx.showToast({ title: '至少需要 1 张照片', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: `/pages/slideshow/slideshow?id=${this.data.id}` });
  },

  preview(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.timeline[index];
    if (item && item.live) {
      this.setData({ liveVideo: item.live });
      return;
    }
    const urls = this.data.timeline.map((t) => t.path);
    wx.previewImage({ current: urls[index], urls });
  },

  closeLive() {
    if (this.data.liveVideo) this.setData({ liveVideo: '' });
  },

  photoMenu(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.timeline[index];
    if (!item) return;
    wx.showActionSheet({
      itemList: ['裁剪调整', '加一句备注', '查看大图', '删除这张'],
      success: (res) => {
        if (res.tapIndex === 0) this.cropPhoto(item);
        else if (res.tapIndex === 1) this.editNote(item);
        else if (res.tapIndex === 2) wx.previewImage({ current: item.path, urls: [item.path] });
        else if (res.tapIndex === 3) this.deletePhoto(item);
      },
    });
  },

  editNote(item) {
    wx.showModal({
      title: `第 ${item.dayLabel} 备注`,
      editable: true,
      placeholderText: '今天它有什么变化？',
      content: item.note || '',
      success: (res) => {
        if (!res.confirm) return;
        const records = store.listRecords();
        const rec = records.find((r) => r.id === this.data.id);
        if (!rec) return;
        const photo = (rec.photos || []).find((p) => p.id === item.id);
        if (photo) photo.note = res.content || '';
        store.updateRecord(this.data.id, { photos: rec.photos });
        this.load();
      },
    });
  },

  deletePhoto(item) {
    wx.showModal({
      title: '删除这张照片？',
      content: '删除后无法恢复，时间线会空出一格。',
      confirmColor: '#C7574E',
      success: (res) => {
        if (!res.confirm) return;
        store.removePhoto(this.data.id, item.id);
        this.load();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  /* ---------- 图标设置 ---------- */
  openIconSheet() {
    this.setData({ iconSheet: true });
  },

  closeIconSheet() {
    this.setData({ iconSheet: false });
  },

  noop() {},

  pickEmoji(e) {
    const emoji = e.currentTarget.dataset.e;
    store.updateRecord(this.data.id, { emoji, iconPath: '' });
    store.removeFile(this.data.record.iconPath);
    this.setData({
      'record.emoji': emoji,
      'record.iconPath': '',
    });
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
  },

  pickIconImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const temp = res.tempFiles[0].tempFilePath;
        const saved = store.persistImage(temp, 'icons');
        store.updateRecord(this.data.id, { iconPath: saved });
        this.setData({ 'record.iconPath': saved, iconSheet: false });
      },
    });
  },

  /* ---------- 封面 ---------- */
  playCoverLive() {
    if (!this.data.coverLive) return;
    this.setData({ liveVideo: this.data.coverLive });
  },

  changeCover() {
    const isCustom = this.data.record && this.data.record.coverIsCustom;
    const items = ['从相册选一张', '裁一张当前的'];
    if (isCustom) items.push('恢复用最新照片');

    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        if (res.tapIndex === 0) this.pickCoverFromAlbum();
        else if (res.tapIndex === 1) this.cropCurrentCover();
        else if (res.tapIndex === 2) {
          store.setCover(this.data.id, '');
          this.load();
          wx.showToast({ title: '已恢复', icon: 'none' });
        }
      },
    });
  },

  pickCoverFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const temp = res.tempFiles[0].tempFilePath;
        wx.navigateTo({
          url: `/pages/crop/crop?src=${encodeURIComponent(temp)}&purpose=cover&recordId=${this.data.id}`,
        });
      },
    });
  },

  cropCurrentCover() {
    const rec = this.data.record;
    if (!rec || !rec.coverPath) {
      wx.showToast({ title: '还没有封面图', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/crop/crop?src=${encodeURIComponent(rec.coverPath)}&purpose=cover&recordId=${this.data.id}`,
    });
  },

  cropPhoto(item) {
    wx.navigateTo({
      url: `/pages/crop/crop?src=${encodeURIComponent(item.path)}&purpose=photo&recordId=${this.data.id}&photoId=${item.id}`,
    });
  },

  /* ---------- 漂流瓶 ---------- */
  throwBottle() {
    const rec = this.data.record;
    if (!rec) return;

    // 已经投过就直接去海里看看
    if (rec.drift && rec.drift.bottleId) {
      wx.navigateTo({ url: '/pages/bottle/bottle' });
      return;
    }

    if (!rec.coverPath) {
      wx.showToast({ title: '先拍一张再投瓶', icon: 'none' });
      return;
    }

    const settings = store.getSettings();
    if (!settings.allowDrift) {
      wx.showModal({
        title: '开启投放？',
        content:
          '漂流瓶会把这条记录的名称、品种、天数、一张照片和你写的一段话放进海里，别人捞到可以点赞、订阅。随时可以在「我的」里关掉。',
        confirmText: '开启',
        success: (res) => {
          if (!res.confirm) return;
          store.saveSettings({ allowDrift: true });
          this.setData({ driftSheet: true, driftStory: '' });
        },
      });
      return;
    }
    this.setData({ driftSheet: true, driftStory: '' });
  },

  closeDrift() {
    this.setData({ driftSheet: false });
  },

  onDriftStory(e) {
    this.setData({ driftStory: e.detail.value });
  },

  async confirmDrift() {
    if (this.data.driftBusy) return;
    this.setData({ driftBusy: true });
    wx.showLoading({ title: '投放中', mask: true });

    try {
      const rec = this.data.record;
      const b = await bottleSvc.throwBottle(rec, {
        story: this.data.driftStory,
        cover: rec.coverPath,
      });
      store.updateRecord(this.data.id, {
        drift: { enabled: true, bottleId: b.id, sharedAt: Date.now() },
      });
      wx.hideLoading();
      this.setData({ driftBusy: false, driftSheet: false });
      this.load();
      wx.showToast({ title: '已放进海里', icon: 'success' });
    } catch (e) {
      wx.hideLoading();
      this.setData({ driftBusy: false });
      wx.showToast({ title: e.message || '投放失败', icon: 'none' });
    }
  },

  onShareAppMessage() {
    const rec = this.data.record;
    return {
      title: rec ? `${rec.name} 的生长记录 · 第 ${rec.days} 天` : '春生夏长',
      path: `/pages/detail/detail?id=${this.data.id}`,
      imageUrl: rec && rec.coverPath ? rec.coverPath : '',
    };
  },
});
