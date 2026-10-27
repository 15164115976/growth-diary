const store = require('../../utils/store');
const dateUtil = require('../../utils/date');
const transition = require('../../utils/transition');
const orientation = require('../../utils/orientation');

Page({
  data: {
    id: '',
    record: null,
    photos: [],
    index: 0,
    current: null,
    layers: [
      { src: '', k: 'init-a', z: 1, out: false, dir: 'in' },
      { src: '', k: 'init-b', z: 0, out: false, dir: 'out' },
    ],
    playing: true,
    showUI: true,
    aiMode: false,
    aiConfigured: false,
    aiBusy: false,
    aiVideo: '',
    aiHint: '',
    liveVideo: '',
    hasLive: false,
    livePlaying: false,
    liveAuto: false,
    landscape: false,
    calendarVisible: false,
    calendarMonths: [],
    careVisible: false,
    careItems: [],
    careRecent: [],
    interval: 3200,
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    total: 0,
  },

  onLoad(options) {
    const app = getApp();
    const id = options.id || '';
    const raw = store.getRecord(id);
    if (!raw) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const record = store.decorate(raw);
    const photos = record.photos;
    if (!photos.length) {
      wx.showToast({ title: '还没有照片', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }

    const settings = store.getSettings();
    this.startTs = raw.startTs;
    this.seq = 0;

    this.setData(
      {
        id,
        record,
        photos,
        total: photos.length,
        statusBarHeight: app.globalData.statusBarHeight,
        safeTop: app.globalData.safeTop,
        safeBottom: app.globalData.safeBottom,
        aiMode: !!settings.aiTransition,
        aiConfigured: !!settings.aiEndpoint,
        liveAuto: settings.liveAuto !== false,
        interval: settings.autoPlayInterval || 3200,
      },
      () => {
        this.renderSlide(options.start ? Number(options.start) : 0, true);
        this.startAuto();
        this.watchOrientation();
      }
    );
  },

  onUnload() {
    this.clearTimer();
    clearTimeout(this.aiTimer);
    clearTimeout(this.liveTimer);
    if (this.orientWatcher) this.orientWatcher.stop();
  },

  /** 横屏时把画面整体转 90°，竖屏还原 */
  watchOrientation() {
    this.orientWatcher = orientation.watchOrientation(
      ({ angle }) => {
        const landscape = angle === 90 || angle === 270;
        if (landscape === this.data.landscape) return;
        this.setData({ landscape });
      },
      { settle: 0 }
    );
  },

  onHide() {
    this.setData({ playing: false });
    this.clearTimer();
  },

  onShow() {
    this.applyEditResult();
  },

  /** 编辑页保存后回来，替换当前照片并重绘 */
  applyEditResult() {
    const app = getApp();
    const r = app.globalData && app.globalData.editResult;
    if (!r || r.recordId !== this.data.id) return;
    app.globalData.editResult = null;

    const saved = store.persistImage(r.path, 'photos');
    const raw = store.getRecord(this.data.id);
    if (!raw) return;
    const photo = (raw.photos || []).find((x) => x.id === r.photoId);
    if (!photo) return;

    const oldPath = photo.path;
    photo.path = saved;
    if (raw.coverPath === oldPath) raw.coverPath = saved;
    store.updateRecord(this.data.id, { photos: raw.photos, coverPath: raw.coverPath });
    store.removeFile(oldPath);

    // 刷新本地数据并重画当前帧
    const record = store.decorate(store.getRecord(this.data.id));
    this.setData({ photos: record.photos, record }, () => {
      this.renderSlide(this.data.index, true);
      wx.showToast({ title: '已更新', icon: 'success' });
    });
  },

  /* ---------------- 渲染一帧 ---------------- */
  paint(item, i) {
    const photos = this.data.photos;
    const prev = i > 0 ? photos[i - 1] : null;
    const d = new Date(item.ts);
    return {
      path: item.path,
      date: `${d.getMonth() + 1} 月 ${d.getDate()} 日`,
      year: d.getFullYear(),
      weekday: `周${dateUtil.weekday(item.ts)}`,
      dayLabel: `第 ${dateUtil.daysBetween(this.startTs, item.ts) + 1} 天`,
      note: item.note || '',
      gap: prev ? `距上一张 ${dateUtil.daysBetween(prev.ts, item.ts)} 天` : '故事从这里开始',
      seq: `${i + 1}`,
    };
  },

  renderSlide(idx, immediate) {
    const photos = this.data.photos;
    if (!photos.length) return;
    const i = ((idx % photos.length) + photos.length) % photos.length;
    const item = photos[i];
    this.seq += 1;
    this.clearLive();

    if (immediate || this.cur === undefined) {
      this.cur = 0;
      this.setData({
        index: i,
        current: this.paint(item, i),
        hasLive: !!(item.live && item.live.path),
        'layers[0].src': item.path,
        'layers[0].k': `s${this.seq}`,
        'layers[0].z': 2,
        'layers[0].out': false,
        'layers[0].dir': 'in',
        'layers[1].z': 1,
        'layers[1].out': false,
      });
      this.maybeAutoLive(item);
      return;
    }

    const cur = this.cur;
    const nxt = 1 - cur;

    this.setData({
      index: i,
      current: this.paint(item, i),
      hasLive: !!(item.live && item.live.path),
      [`layers[${nxt}].src`]: item.path,
      [`layers[${nxt}].k`]: `s${this.seq}`,
      [`layers[${nxt}].z`]: 3,
      [`layers[${nxt}].out`]: false,
      [`layers[${nxt}].dir`]: this.seq % 2 === 0 ? 'in' : 'out',
      [`layers[${cur}].z`]: 2,
      [`layers[${cur}].out`]: true,
    });
    this.cur = nxt;
    this.maybeAutoLive(item);
  },

  /** 开了「自动播动图」就在切到这张后播一遍 */
  maybeAutoLive(item) {
    clearTimeout(this.liveTimer);
    if (!this.data.liveAuto) return;
    if (!item || !item.live || !item.live.path) return;
    this.liveTimer = setTimeout(() => this.playLive(), 620);
  },

  /* ---------------- Live 片段 ---------------- */
  clearLive() {
    if (this.liveTimer) {
      clearTimeout(this.liveTimer);
      this.liveTimer = null;
    }
    if (this.data.liveVideo) this.setData({ liveVideo: '' });
  },

  /** 播放当前照片的动态片段 */
  playLive() {
    const p = this.data.photos[this.data.index];
    if (!p || !p.live || !p.live.path) return;
    if (this.data.livePlaying) return;
    this.setData({ livePlaying: true, liveVideo: p.live.path });
  },

  /** LIVE 按钮：切换「切换照片时是否自动播动图」 */
  toggleLiveAuto() {
    const next = !this.data.liveAuto;
    this.setData({ liveAuto: next });
    store.saveSettings({ liveAuto: next });
    wx.showToast({
      title: next ? '已开：换图自动播动图' : '已关：只在短按时播',
      icon: 'none',
    });
    if (next) this.playLive();
  },

  /** 短按画面：有动图就播，没有就当暂停/继续 */
  onShortTap() {
    const p = this.data.photos[this.data.index];
    if (p && p.live && p.live.path) {
      if (this.data.livePlaying) {
        this.setData({ liveVideo: '', livePlaying: false });
      } else {
        this.playLive();
      }
      return;
    }
    this.togglePlay();
  },

  /** 进编辑 */
  goEdit() {
    const p = this.data.photos[this.data.index];
    if (!p) return;
    wx.navigateTo({
      url: `/pages/photo-edit/photo-edit?recordId=${this.data.id}&photoId=${p.id}`,
    });
  },

  onLiveEnd() {
    this.setData({ liveVideo: '', livePlaying: false });
  },

  /* ---------------- 手势：上滑日历 / 下滑养护 ---------------- */
  onStageTouchStart(e) {
    this.stageStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  },

  onStageTouchEnd(e) {
    const s = this.stageStart;
    this.stageStart = null;
    if (!s) return;
    if (this.data.calendarVisible || this.data.careVisible) return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;

    // 纵向：上滑日历 / 下滑养护
    if (Math.abs(dy) > 90 && Math.abs(dy) > Math.abs(dx) * 1.3) {
      if (dy < 0) this.openCalendar();
      else this.openCare();
      return;
    }

    // 横向：左右切换
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      this.renderSlide(dx < 0 ? this.data.index + 1 : this.data.index - 1);
      this.startAuto();
    }
  },

  /* ---------------- 拍摄日历 ---------------- */
  openCalendar() {
    this.setData({ calendarVisible: true, calendarMonths: this.buildCalendar() });
    this.pauseForPanel();
  },

  closeCalendar() {
    this.setData({ calendarVisible: false });
  },

  pauseForPanel() {
    this.setData({ playing: false });
    this.clearTimer();
  },

  buildCalendar() {
    const photos = this.data.photos;
    const byDate = {};
    photos.forEach((p, i) => {
      if (!byDate[p.date]) byDate[p.date] = { index: i, count: 0 };
      byDate[p.date].count += 1;
    });

    const months = {};
    Object.keys(byDate).forEach((d) => {
      const key = d.slice(0, 7);
      if (!months[key]) months[key] = {};
      months[key][d] = byDate[d];
    });

    return Object.keys(months)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((key) => {
        const parts = key.split('-');
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const startWeek = new Date(y, m - 1, 1).getDay();
        const daysInMonth = new Date(y, m, 0).getDate();
        const cells = [];
        for (let i = 0; i < startWeek; i += 1) cells.push({ key: 'e' + i, empty: true });
        for (let d = 1; d <= daysInMonth; d += 1) {
          const ds = key + '-' + (d < 10 ? '0' + d : d);
          const hit = months[key][ds];
          cells.push({
            key: ds,
            day: d,
            has: !!hit,
            index: hit ? hit.index : -1,
            count: hit ? hit.count : 0,
          });
        }
        return {
          key,
          label: y + ' 年 ' + m + ' 月',
          cells,
          total: Object.keys(months[key]).length,
        };
      });
  },

  jumpToDate(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx) || idx < 0) return;
    this.renderSlide(idx);
    this.setData({ calendarVisible: false });
  },

  /* ---------------- 养护面板 ---------------- */
  openCare() {
    const rec = this.data.record;
    const plan = rec.carePlan || {};

    const careItems = store.CARE_TYPES.map((t) => {
      const p = plan[t.key] || {};
      return {
        key: t.key,
        name: t.name,
        icon: t.icon,
        color: t.color,
        every: p.every || 0,
        amount: p.amount || '',
        enabled: !!p.enabled && (p.every || 0) > 0,
      };
    }).filter((x) => x.enabled);

    const careRecent = (rec.careLogs || []).slice(0, 4).map((l) => {
      const t = store.careTypeOf(l.type);
      return {
        id: l.id,
        icon: t.icon,
        name: t.name,
        note: l.note,
        time: dateUtil.friendlyDay(l.ts) + ' ' + dateUtil.hm(l.ts),
      };
    });

    this.setData({ careVisible: true, careItems, careRecent });
    this.pauseForPanel();
  },

  closeCare() {
    this.setData({ careVisible: false });
  },

  goCare() {
    this.setData({ careVisible: false });
    wx.navigateTo({ url: '/pages/care/care?id=' + this.data.id + '&tab=log' });
  },

  /* ---------------- 播放控制 ---------------- */
  startAuto() {
    this.clearTimer();
    if (!this.data.playing) return;
    this.timer = setInterval(() => {
      this.next(true);
    }, this.data.interval);
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  next(auto) {
    if (this.data.aiBusy) return;
    if (auto && !this.data.playing) return;

    const photos = this.data.photos;
    if (photos.length <= 1) return;

    const nextIdx = (this.data.index + 1) % photos.length;
    const from = photos[this.data.index];
    const to = photos[nextIdx];

    // AI 模式：命中缓存就播过渡视频，否则本地过渡并在后台生成
    if (this.data.aiMode && this.data.aiConfigured && !auto) {
      const cached = transition.getCached(from.path, to.path);
      if (cached) {
        this.playAiVideo(cached, nextIdx);
        return;
      }
      this.triggerAi(from, to);
    } else if (this.data.aiMode && this.data.aiConfigured && auto) {
      const cached = transition.getCached(from.path, to.path);
      if (cached) {
        this.playAiVideo(cached, nextIdx);
        return;
      }
    }

    this.renderSlide(nextIdx);
    if (!auto) this.startAuto();
  },

  prev() {
    if (this.data.aiBusy) return;
    this.renderSlide(this.data.index - 1);
    this.startAuto();
  },

  togglePlay() {
    const playing = !this.data.playing;
    this.setData({ playing });
    if (playing) this.startAuto();
    else this.clearTimer();
  },

  /* ---------------- AI 过渡 ---------------- */
  async triggerAi(from, to) {
    if (this.data.aiBusy) return;
    const settings = store.getSettings();
    if (!settings.aiEndpoint) return;

    this.setData({ aiBusy: true, aiHint: 'AI 正在生成过渡…' });
    try {
      const video = await transition.requestAITransition({
        fromPath: from.path,
        toPath: to.path,
        endpoint: settings.aiEndpoint,
        duration: 3,
      });
      this.setData({ aiBusy: false, aiHint: video ? 'AI 过渡已就绪' : '' });
      if (video) {
        wx.showToast({ title: '过渡已生成', icon: 'none' });
      }
    } catch (e) {
      this.setData({ aiBusy: false, aiHint: '' });
      wx.showToast({ title: 'AI 过渡生成失败，已用本地过渡', icon: 'none' });
    }
    clearTimeout(this.aiTimer);
    this.aiTimer = setTimeout(() => this.setData({ aiHint: '' }), 2600);
  },

  playAiVideo(src, nextIdx) {
    this.setData({ aiVideo: src, aiBusy: true });
    this.pendingIdx = nextIdx;
  },

  onAiVideoEnd() {
    const idx = this.pendingIdx;
    this.setData({ aiVideo: '', aiBusy: false });
    if (idx !== undefined && idx !== null) this.renderSlide(idx);
    this.startAuto();
  },

  toggleAi() {
    if (!this.data.aiConfigured) {
      wx.showModal({
        title: 'AI 过渡未配置',
        content:
          'AI 过渡需要把相邻两张照片交给生成式模型合成中间帧。请先在「我的 → AI 过渡服务」里填写你的接口地址，未配置时使用本地丝滑过渡（Ken Burns + 交叉溶解）。',
        confirmText: '去配置',
        success: (res) => {
          if (res.confirm) {
            wx.setStorageSync('gd_goto_ai_setting', 1);
            wx.switchTab({ url: '/pages/profile/profile' });
          }
        },
      });
      return;
    }
    const on = !this.data.aiMode;
    this.setData({ aiMode: on });
    store.saveSettings({ aiTransition: on });
    wx.showToast({ title: on ? '已开启 AI 过渡' : '已切回本地过渡', icon: 'none' });
  },

  close() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },

  noop() {},
});
