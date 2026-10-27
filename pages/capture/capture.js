const store = require('../../utils/store');
const dateUtil = require('../../utils/date');
const orientation = require('../../utils/orientation');
const imageUtil = require('../../utils/image');

Page({
  data: {
    id: '',
    record: null,
    mode: 'view', // view | confirm
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,

    // 取景参数
    refPhoto: null, // 参考底（上一次拍的照片）
    showRef: true,
    refOpacity: 38,
    showGrid: true,
    flash: 'off',
    device: 'back',
    camReady: false,
    camError: '',
    flip: 0, // 仅仅控制预览：0 正向 / 180 倒置
    shootAngle: 0, // 拍照瞬间的真实角度，入库前按它转正
    gravityFlip: true,

    // Live
    liveOn: true,
    liveDuration: 2200,
    shooting: false,
    recording: false,

    // 拍摄结果
    captured: '',
    capturedLive: '',
    capturedFrom: 'camera',
    note: '',
    splitPos: 50,
    comparing: false,
    saving: false,
    compareScore: null,
    todayText: '',
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
    const settings = store.getSettings();

    let refPhoto = record.latest;
    if (options.refId && raw.photos) {
      const found = raw.photos.find((p) => p.id === options.refId);
      if (found) refPhoto = found;
    }

    this.setData({
      id,
      record,
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
      refPhoto: refPhoto
        ? {
            id: refPhoto.id,
            path: refPhoto.path,
            ts: refPhoto.ts,
            dayLabel: `第 ${dateUtil.daysBetween(raw.startTs, refPhoto.ts) + 1} 天`,
          }
        : null,
      refOpacity: settings.refOpacity || 38,
      showGrid: settings.showGrid !== false,
      gravityFlip: settings.gravityFlip !== false,
      liveOn: settings.livePhoto !== false,
      liveDuration: settings.liveDuration || 2200,
      todayText: `${dateUtil.md()} 周${dateUtil.weekday()}`,
    });
  },

  onReady() {
    if (this.data.gravityFlip) {
      this.watcher = orientation.watchOrientation(({ angle, flip }) => {
        if (this.data.mode !== 'view') return;
        this.setData({ flip, shootAngle: angle });
      });
    }
  },

  onUnload() {
    if (this.watcher) this.watcher.stop();
    if (this.liveTimer) clearTimeout(this.liveTimer);
  },

  /* ---------------- 取景控制 ---------------- */
  onCamInit() {
    this.setData({ camReady: true, camError: '' });
  },

  onCamError(e) {
    const msg = (e.detail && e.detail.errMsg) || '';
    let tip = '相机启动失败';
    if (msg.indexOf('auth') > -1 || msg.indexOf('permission') > -1) {
      tip = '需要相机权限才能拍摄';
    }
    this.setData({ camError: tip, camReady: false });
  },

  toggleRef() {
    this.setData({ showRef: !this.data.showRef });
  },

  cycleRefOpacity() {
    const steps = [20, 38, 55, 75];
    const cur = this.data.refOpacity;
    const idx = steps.indexOf(cur);
    const next = steps[(idx + 1) % steps.length];
    this.setData({ refOpacity: next });
    store.saveSettings({ refOpacity: next });
  },

  toggleGrid() {
    const next = !this.data.showGrid;
    this.setData({ showGrid: next });
    store.saveSettings({ showGrid: next });
  },

  toggleLive() {
    const next = !this.data.liveOn;
    this.setData({ liveOn: next });
    store.saveSettings({ livePhoto: next });
    wx.showToast({ title: next ? '已开启动态图' : '只拍静态图', icon: 'none' });
  },

  toggleFlash() {
    this.setData({ flash: this.data.flash === 'off' ? 'on' : 'off' });
  },

  flipCamera() {
    this.setData({ device: this.data.device === 'back' ? 'front' : 'back' });
  },

  /** 自动翻转判断不对时，手动接管画面方向 */
  manualFlip() {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
    const next = this.data.flip === 180 ? 0 : 180;
    this.setData({ flip: next });
    wx.showToast({
      title: next === 180 ? '画面已倒转，改为手动' : '画面已回正，改为手动',
      icon: 'none',
    });
  },

  openSetting() {
    wx.openSetting({});
  },

  /* ---------------- 拍摄 ---------------- */
  async shoot() {
    if (!this.data.camReady || this.data.shooting) return;
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    this.setData({ shooting: true });

    const ctx = wx.createCameraContext();
    let still = '';
    try {
      still = await new Promise((resolve, reject) => {
        ctx.takePhoto({
          quality: 'high',
          success: (r) => resolve(r.tempImagePath),
          fail: reject,
        });
      });
    } catch (e) {
      this.setData({ shooting: false });
      wx.showToast({ title: '拍摄失败，请重试', icon: 'none' });
      return;
    }

    // 拍完接着录一小段，凑成一组 Live
    let livePath = '';
    if (this.data.liveOn) {
      this.setData({ recording: true });
      livePath = await this.recordClip(ctx);
      this.setData({ recording: false });
    }

    await this.finishShot(still, livePath);
  },

  /** 录一段固定时长的小视频；失败就返回空串，不影响出图 */
  recordClip(ctx) {
    return new Promise((resolve) => {
      let settled = false;
      const stop = () => {
        if (settled) return;
        settled = true;
        if (this.liveTimer) {
          clearTimeout(this.liveTimer);
          this.liveTimer = null;
        }
        try {
          ctx.stopRecord({
            success: (res) => resolve(res.tempVideoPath || ''),
            fail: () => resolve(''),
          });
        } catch (e) {
          resolve('');
        }
      };

      try {
        ctx.startRecord({
          timeoutCallback: stop,
          fail: () => {
            settled = true;
            resolve('');
          },
        });
      } catch (e) {
        settled = true;
        resolve('');
        return;
      }
      this.liveTimer = setTimeout(stop, this.data.liveDuration);
    });
  },

  async finishShot(still, livePath) {
    // 交给 EXIF 判断，而不是猜设备朝向：
    // camera 输出的照片绝大多数本身就是正的，按陀螺仪再转一次反而会转歪。
    // 只有图片自己声明了非正向（right/down/left）才真的转。
    const finalStill = await imageUtil.normalizeOrientation(still);
    this.setData({
      mode: 'confirm',
      captured: finalStill,
      capturedLive: livePath || '',
      capturedFrom: 'camera',
      note: '',
      comparing: !!this.data.refPhoto,
      compareScore: null,
      splitPos: 50,
      shooting: false,
      recording: false,
    });

    // 和上一次比构图相似度（小程序拿不到激光测距，用「像不像」代替「近不近」）
    if (this.data.refPhoto) {
      imageUtil.similarity(finalStill, this.data.refPhoto.path).then((score) => {
        if (score === null || this.data.mode !== 'confirm') return;
        this.setData({ compareScore: Math.round(score * 100) });
      });
    }
  },

  pickFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({
          mode: 'confirm',
          captured: res.tempFiles[0].tempFilePath,
          capturedLive: '',
          capturedFrom: 'album',
          note: '',
          comparing: !!this.data.refPhoto,
          splitPos: 50,
        });
      },
    });
  },

  retake() {
    this.setData({
      mode: 'view',
      captured: '',
      capturedLive: '',
      comparing: false,
      splitPos: 50,
    });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  toggleCompare() {
    if (!this.data.refPhoto) {
      wx.showToast({ title: '还没有上一次的照片', icon: 'none' });
      return;
    }
    this.setData({ comparing: !this.data.comparing });
  },

  onCmpStart() {
    wx.createSelectorQuery()
      .select('#cmp')
      .boundingClientRect((rect) => {
        this.cmpRect = rect;
      })
      .exec();
  },

  onCmpMove(e) {
    if (!this.cmpRect || !this.cmpRect.width) return;
    const x = e.touches[0].clientX;
    let p = ((x - this.cmpRect.left) / this.cmpRect.width) * 100;
    p = Math.max(3, Math.min(97, p));
    this.setData({ splitPos: p });
  },

  /* ---------------- 保存 ---------------- */
  async save() {
    if (this.data.saving) return;
    if (!this.data.captured) return;

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中', mask: true });

    try {
      await store.addPhoto(this.data.id, {
        tempPath: this.data.captured,
        livePath: this.data.capturedLive,
        liveDuration: this.data.liveDuration,
        orientation: this.data.shootAngle || 0,
        note: this.data.note,
        refId: this.data.refPhoto ? this.data.refPhoto.id : '',
      });
      wx.hideLoading();
      wx.showToast({ title: '已记下今天', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({
          fail: () => wx.redirectTo({ url: `/pages/detail/detail?id=${this.data.id}` }),
        });
      }, 700);
    } catch (err) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    }
  },

  close() {
    wx.navigateBack({
      fail: () => wx.redirectTo({ url: `/pages/detail/detail?id=${this.data.id}` }),
    });
  },
});
