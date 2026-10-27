/**
 * 照片编辑：双指旋转 / 缩放，单指平移，底部缩略图切换照片
 *
 * 变换顺序与 CSS 一致：先缩放、再旋转、最后平移
 *   屏幕位置 = viewport中心 + (tx, ty)
 *
 * 导出「所见即所得」：把 viewport 区域的像素烘成新图，
 * 所以 canvas 的变换链要和预览完全对齐 —— 差一个符号就会导出错位。
 */

const store = require('../../utils/store');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function touchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function touchAngle(t) {
  const dx = t[1].clientX - t[0].clientX;
  const dy = t[1].clientY - t[0].clientY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

Page({
  data: {
    photos: [],
    index: 0,
    cur: null,
    imgW: 0,
    imgH: 0,
    baseW: 0,
    baseH: 0,
    offW: 0,
    offH: 0,
    rot: 0,
    scale: 1,
    tx: 0,
    ty: 0,
    stageW: 0,
    stageH: 0,
    saving: false,
    dirty: false,
    safeTop: 64,
    safeBottom: 0,
  },

  onLoad(options) {
    const app = getApp();
    this.recordId = options.recordId || '';
    this.raw = store.getRecord(this.recordId);
    if (!this.raw || !this.raw.photos || !this.raw.photos.length) {
      wx.showToast({ title: '没有可编辑的照片', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 700);
      return;
    }

    const photos = this.raw.photos.map((p) => ({ id: p.id, path: p.path }));
    let index = photos.findIndex((p) => p.id === options.photoId);
    if (index < 0) index = 0;

    // 每张照片各自记住自己的调整
    this.transforms = {};

    this.setData({
      photos,
      index,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
    });

    this.measureThenLoad();
  },

  measureThenLoad() {
    wx.createSelectorQuery()
      .select('#stage')
      .boundingClientRect((rect) => {
        if (!rect || !rect.width) {
          setTimeout(() => this.measureThenLoad(), 120);
          return;
        }
        this.stageRect = rect;
        this.setData({ stageW: rect.width, stageH: rect.height }, () => this.loadCurrent());
      })
      .exec();
  },

  loadCurrent() {
    const p = this.data.photos[this.data.index];
    if (!p) return;
    this.setData({ cur: p });

    wx.getImageInfo({
      src: p.path,
      success: (info) => {
        this.imgW = info.width;
        this.imgH = info.height;

        const { stageW, stageH } = this.data;
        const baseScale = Math.max(stageW / info.width, stageH / info.height);
        this.baseScale = baseScale;
        const baseW = info.width * baseScale;
        const baseH = info.height * baseScale;

        const t = this.transforms[p.id] || { rot: 0, scale: 1, tx: 0, ty: 0 };

        this.setData({
          imgW: info.width,
          imgH: info.height,
          baseW,
          baseH,
          offW: -baseW / 2,
          offH: -baseH / 2,
          rot: t.rot,
          scale: t.scale,
          tx: t.tx,
          ty: t.ty,
          dirty: false,
        });
      },
      fail: () => wx.showToast({ title: '图片读不出来', icon: 'none' }),
    });
  },

  /* ---------------- 手势 ---------------- */
  onTouchStart(e) {
    const t = e.touches;
    if (t.length > 1) {
      this.start = {
        mode: 'pinch',
        dist: touchDist(t),
        angle: touchAngle(t),
        rot: this.data.rot,
        scale: this.data.scale,
      };
      return;
    }
    this.start = {
      mode: 'drag',
      x: t[0].clientX,
      y: t[0].clientY,
      tx: this.data.tx,
      ty: this.data.ty,
    };
  },

  onTouchMove(e) {
    const s = this.start;
    if (!s) return;
    const t = e.touches;

    if (t.length > 1 && s.mode === 'pinch') {
      const d = touchDist(t);
      const a = touchAngle(t);
      let rot = s.rot + (a - s.angle);
      // 归一化到 -180..180
      while (rot > 180) rot -= 360;
      while (rot < -180) rot += 360;
      const scale = clamp((s.scale * d) / s.dist, 1, 4);
      this.setData({ rot, scale, dirty: true }, () => this.applyBounds());
      return;
    }

    if (t.length === 1 && s.mode === 'drag') {
      const dx = t[0].clientX - s.x;
      const dy = t[0].clientY - s.y;
      this.setData({ tx: s.tx + dx, ty: s.ty + dy, dirty: true }, () => this.applyBounds());
    }
  },

  onTouchEnd() {
    // 双击复位
    this.start = null;
  },

  applyBounds() {
    const { baseW, baseH, scale, stageW, stageH, rot } = this.data;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad));
    const sin = Math.abs(Math.sin(rad));
    // 旋转后的外接尺寸
    const dw = baseW * scale;
    const dh = baseH * scale;
    const bw = dw * cos + dh * sin;
    const bh = dw * sin + dh * cos;
    const maxX = Math.max(0, (bw - stageW) / 2);
    const maxY = Math.max(0, (bh - stageH) / 2);
    const nx = clamp(this.data.tx, -maxX, maxX);
    const ny = clamp(this.data.ty, -maxY, maxY);
    if (nx !== this.data.tx || ny !== this.data.ty) this.setData({ tx: nx, ty: ny });
  },

  /* ---------------- 工具 ---------------- */
  resetOne() {
    this.setData({ rot: 0, scale: 1, tx: 0, ty: 0, dirty: true });
  },

  rotateStep(e) {
    const deg = Number(e.currentTarget.dataset.deg) || 0;
    let rot = this.data.rot + deg;
    while (rot > 180) rot -= 360;
    while (rot < -180) rot += 360;
    this.setData({ rot, dirty: true }, () => this.applyBounds());
  },

  pickPhoto(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (idx === this.data.index) return;
    // 记住当前这张的调整
    const cur = this.data.photos[this.data.index];
    if (cur) {
      this.transforms[cur.id] = {
        rot: this.data.rot,
        scale: this.data.scale,
        tx: this.data.tx,
        ty: this.data.ty,
      };
    }
    this.setData({ index: idx }, () => this.loadCurrent());
  },

  /* ---------------- 保存 ---------------- */
  async save() {
    if (this.data.saving || !this.data.cur) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '导出中', mask: true });

    try {
      const out = await this.exportViewport();
      const app = getApp();
      app.globalData.editResult = {
        path: out,
        recordId: this.recordId,
        photoId: this.data.cur.id,
        ts: Date.now(),
      };
      wx.hideLoading();
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: e.message || '导出失败', icon: 'none' });
    }
  },

  exportViewport() {
    const { stageW, stageH, rot, scale, tx, ty, cur } = this.data;

    const outW = 1080;
    const outH = Math.max(1, Math.round((outW * stageH) / stageW));
    const m = outW / stageW; // 屏幕 → 输出 的比例

    return new Promise((resolve, reject) => {
      let canvas = null;
      try {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: outW, height: outH });
      } catch (e) {
        return reject(new Error('当前环境不支持导出'));
      }
      if (!canvas) return reject(new Error('当前环境不支持导出'));

      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.onload = () => {
        try {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, outW, outH);

          // 与 CSS 的 translate→rotate→scale 完全对应
          ctx.translate(outW / 2 + tx * m, outH / 2 + ty * m);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.scale(this.baseScale * scale * m, this.baseScale * scale * m);
          ctx.drawImage(img, -this.imgW / 2, -this.imgH / 2, this.imgW, this.imgH);

          wx.canvasToTempFilePath({
            canvas,
            x: 0,
            y: 0,
            width: outW,
            height: outH,
            destWidth: outW,
            destHeight: outH,
            fileType: 'jpg',
            quality: 0.92,
            success: (res) => resolve(res.tempFilePath),
            fail: () => reject(new Error('导出失败')),
          });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = cur.path;
    });
  },

  close() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
