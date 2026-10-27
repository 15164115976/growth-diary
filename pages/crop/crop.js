/**
 * 图片裁剪：拖动平移、双指缩放、按比例裁切、导出
 *
 * 坐标关系（全部以裁剪框所在 stage 的左上角为原点）：
 *   图片中心     : (stageW/2 + tx, stageH/2 + ty)
 *   图片显示尺寸 : baseW * scale, baseH * scale
 *   裁剪框       : (boxX, boxY, boxW, boxH)，居中
 * 导出时把裁剪框的四个角反算回原图坐标，用 drawImage 的九参数版本取样。
 */

const imageUtil = require('../../utils/image');

const RATIOS = [
  { key: 'free', label: '原图', r: 0 },
  { key: '1:1', label: '1:1', r: 1 },
  { key: '3:4', label: '3:4', r: 3 / 4 },
  { key: '4:3', label: '4:3', r: 4 / 3 },
  { key: '9:16', label: '9:16', r: 9 / 16 },
];

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function touchDist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

Page({
  data: {
    src: '',
    ready: false,
    scale: 1,
    tx: 0,
    ty: 0,
    baseW: 0,
    baseH: 0,
    offW: 0,
    offH: 0,
    boxX: 0,
    boxY: 0,
    boxW: 0,
    boxH: 0,
    stageW: 0,
    stageH: 0,
    ratio: 'free',
    ratios: RATIOS,
    saving: false,
    safeTop: 64,
    safeBottom: 0,
  },

  onLoad(options) {
    const app = getApp();
    this.purpose = options.purpose || 'photo';
    this.recordId = options.recordId || '';
    this.photoId = options.photoId || '';
    let src = options.src || '';
    try {
      src = decodeURIComponent(src);
    } catch (e) {
      /* 已经是明文就原样用 */
    }
    this.setData({
      src,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
    });
    this.loadImage();
  },

  loadImage() {
    if (!this.data.src) return;
    wx.getImageInfo({
      src: this.data.src,
      success: (info) => {
        this.imgW = info.width;
        this.imgH = info.height;
        // 横图默认用 16:9 之类更顺手，但这里统一保持原图比例，用户可自行切换
        this.imgRatio = info.width / info.height;
        this.measure();
      },
      fail: () => wx.showToast({ title: '图片读不出来', icon: 'none' }),
    });
  },

  measure(retry) {
    const attempt = retry || 0;
    wx.createSelectorQuery()
      .select('#stage')
      .boundingClientRect((rect) => {
        if (!rect || !rect.width) {
          // 布局还没稳，稍等再量一次
          if (attempt < 3) setTimeout(() => this.measure(attempt + 1), 120);
          return;
        }
        this.setData({ stageW: rect.width, stageH: rect.height }, () => {
          this.layout(this.data.ratio);
        });
      })
      .exec();
  },

  layout(ratioKey) {
    const { stageW, stageH } = this.data;
    if (!stageW || !this.imgW) return;

    const item = RATIOS.find((x) => x.key === ratioKey) || RATIOS[0];
    const r = item.r || this.imgRatio;
    const pad = 24;
    const maxW = stageW - pad * 2;
    const maxH = stageH - pad * 2;

    let boxW = maxW;
    let boxH = boxW / r;
    if (boxH > maxH) {
      boxH = maxH;
      boxW = boxH * r;
    }

    const baseScale = Math.max(boxW / this.imgW, boxH / this.imgH);
    this.baseScale = baseScale;

    const baseW = this.imgW * baseScale;
    const baseH = this.imgH * baseScale;

    this.setData({
      ratio: ratioKey,
      boxW,
      boxH,
      boxX: (stageW - boxW) / 2,
      boxY: (stageH - boxH) / 2,
      baseW,
      baseH,
      // 负值先算好，WXML 里只做插值，避免一元负号解析歧义
      offW: -baseW / 2,
      offH: -baseH / 2,
      scale: 1,
      tx: 0,
      ty: 0,
      ready: true,
    });
  },

  pickRatio(e) {
    this.layout(e.currentTarget.dataset.key);
  },

  reset() {
    this.layout(this.data.ratio);
  },

  /* ---------------- 手势 ---------------- */
  onTouchStart(e) {
    const t = e.touches;
    this.start = {
      x: t[0].clientX,
      y: t[0].clientY,
      tx: this.data.tx,
      ty: this.data.ty,
      scale: this.data.scale,
      dist: t.length > 1 ? touchDist(t) : 0,
    };
  },

  onTouchMove(e) {
    if (!this.start) return;
    const t = e.touches;

    if (t.length > 1 && this.start.dist) {
      const d = touchDist(t);
      const s = clamp((this.start.scale * d) / this.start.dist, 1, 5);
      this.setData({ scale: s }, () => this.applyBounds());
      return;
    }

    if (t.length === 1 && !this.start.dist) {
      const dx = t[0].clientX - this.start.x;
      const dy = t[0].clientY - this.start.y;
      this.setData({ tx: this.start.tx + dx, ty: this.start.ty + dy }, () => this.applyBounds());
    }
  },

  onTouchEnd() {
    this.start = null;
  },

  /** 把图片限制在裁剪框内，避免导出时取到画布外 */
  applyBounds() {
    const { baseW, baseH, boxW, boxH, scale, tx, ty } = this.data;
    const dw = baseW * scale;
    const dh = baseH * scale;
    const maxX = Math.max(0, (dw - boxW) / 2);
    const maxY = Math.max(0, (dh - boxH) / 2);
    const nx = clamp(tx, -maxX, maxX);
    const ny = clamp(ty, -maxY, maxY);
    if (nx !== tx || ny !== ty) this.setData({ tx: nx, ty: ny });
  },

  /* ---------------- 导出 ---------------- */
  async save() {
    if (this.data.saving || !this.data.ready) return;
    this.setData({ saving: true });
    wx.showLoading({ title: '处理中', mask: true });

    try {
      const out = await this.exportImage();
      const app = getApp();
      app.globalData.cropResult = {
        path: out,
        purpose: this.purpose,
        recordId: this.recordId,
        photoId: this.photoId,
        ts: Date.now(),
      };
      wx.hideLoading();
      wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
    } catch (e) {
      wx.hideLoading();
      this.setData({ saving: false });
      wx.showToast({ title: e.message || '处理失败', icon: 'none' });
    }
  },

  exportImage() {
    const { stageW, stageH, boxX, boxY, boxW, boxH, scale, tx, ty, src } = this.data;
    const k = this.baseScale * scale;

    // 图片左上角（相对 stage）
    const imgLeft = stageW / 2 + tx - (this.data.baseW * scale) / 2;
    const imgTop = stageH / 2 + ty - (this.data.baseH * scale) / 2;

    let sx = (boxX - imgLeft) / k;
    let sy = (boxY - imgTop) / k;
    let sw = boxW / k;
    let sh = boxH / k;

    // 双保险：夹在原图范围内
    sx = clamp(sx, 0, Math.max(0, this.imgW - 1));
    sy = clamp(sy, 0, Math.max(0, this.imgH - 1));
    sw = Math.min(sw, this.imgW - sx);
    sh = Math.min(sh, this.imgH - sy);

    const outW = Math.min(1440, Math.round(sw));
    const outH = Math.round((outW * sh) / sw);

    return new Promise((resolve, reject) => {
      let canvas = null;
      try {
        canvas = wx.createOffscreenCanvas({ type: '2d', width: outW, height: outH });
      } catch (e) {
        return reject(new Error('当前环境不支持裁剪'));
      }
      if (!canvas) return reject(new Error('当前环境不支持裁剪'));

      const ctx = canvas.getContext('2d');
      const img = canvas.createImage();
      img.onload = () => {
        try {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, outW, outH);
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
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
      img.src = src;
    });
  },

  close() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },
});
