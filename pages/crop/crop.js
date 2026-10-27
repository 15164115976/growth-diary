/**
 * 图片裁剪：自由框（可拖动位置、可拉边框改大小）+ 图片平移缩放 + 手动旋转
 *
 * 坐标关系（以 stage 左上角为原点）：
 *   图片中心   : (stageW/2 + tx, stageH/2 + ty)
 *   图片显示尺寸: baseW * scale, baseH * scale
 *   裁剪框     : box { x, y, w, h }，可自由调整
 *
 * 约束：
 *   1) 框始终在 stage 内，且不小于最小尺寸
 *   2) 框不超过图片的显示尺寸（否则导出会出现空白）
 *   3) 图片始终覆盖框（applyBounds 负责）
 */

const imageUtil = require('../../utils/image');

const MIN_BOX = 120; // px，框的最小边长
const RATIOS = [
  { key: 'free', label: '自由', r: 0 },
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
    box: { x: 0, y: 0, w: 0, h: 0 },
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
      /* 明文就用原样 */
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
          if (attempt < 3) setTimeout(() => this.measure(attempt + 1), 120);
          return;
        }
        this.stageLeft = rect.left;
        this.stageTop = rect.top;
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
    const pad = 18;
    const maxW = stageW - pad * 2;
    const maxH = stageH - pad * 2;
    const r = item.r || this.imgRatio;

    let w = maxW;
    let h = w / r;
    if (h > maxH) {
      h = maxH;
      w = h * r;
    }

    const baseScale = Math.max(w / this.imgW, h / this.imgH);
    const baseW = this.imgW * baseScale;
    const baseH = this.imgH * baseScale;
    this.baseScale = baseScale;

    this.setData({
      ratio: ratioKey,
      box: { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h },
      baseW,
      baseH,
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

  /** 手动转 90°，自动方向判断不合意时兜底 */
  rotate() {
    if (this.data.saving) return;
    wx.showLoading({ title: '旋转中', mask: true });
    imageUtil.rotateImage(this.data.src, 90).then((out) => {
      wx.hideLoading();
      this.setData({ src: out, ready: false });
      this.loadImage();
    });
  },

  /* ---------------- 命中判定 ---------------- */
  hitTest(x, y) {
    const b = this.data.box;
    const T = 26; // 触摸容差
    const nearL = Math.abs(x - b.x) < T;
    const nearR = Math.abs(x - (b.x + b.w)) < T;
    const nearT = Math.abs(y - b.y) < T;
    const nearB = Math.abs(y - (b.y + b.h)) < T;
    const inX = x > b.x - T && x < b.x + b.w + T;
    const inY = y > b.y - T && y < b.y + b.h + T;

    if (!inX || !inY) return 'image';
    if (nearL && nearT) return 'tl';
    if (nearR && nearT) return 'tr';
    if (nearL && nearB) return 'bl';
    if (nearR && nearB) return 'br';
    if (nearL) return 'l';
    if (nearR) return 'r';
    if (nearT) return 't';
    if (nearB) return 'b';
    return 'image';
  },

  /* ---------------- 手势 ---------------- */
  onTouchStart(e) {
    const t = e.touches;
    if (t.length > 1) {
      this.start = {
        mode: 'pinch',
        dist: touchDist(t),
        scale: this.data.scale,
      };
      return;
    }

    const x = t[0].clientX - this.stageLeft;
    const y = t[0].clientY - this.stageTop;
    this.start = {
      mode: this.hitTest(x, y),
      x,
      y,
      box: Object.assign({}, this.data.box),
      tx: this.data.tx,
      ty: this.data.ty,
      scale: this.data.scale,
      dist: 0,
    };
  },

  onTouchMove(e) {
    const s = this.start;
    if (!s) return;
    const t = e.touches;

    // 双指缩放图片
    if (t.length > 1 && s.dist) {
      const d = touchDist(t);
      const scale = clamp((s.scale * d) / s.dist, 1, 5);
      this.setData({ scale }, () => this.applyBounds());
      return;
    }

    if (t.length !== 1 || s.mode === 'pinch') return;

    const x = t[0].clientX - this.stageLeft;
    const y = t[0].clientY - this.stageTop;
    const dx = x - s.x;
    const dy = y - s.y;

    // 框内 / 框外拖动 → 移动图片
    if (s.mode === 'image') {
      this.setData({ tx: s.tx + dx, ty: s.ty + dy }, () => this.applyBounds());
      return;
    }

    // 拖边框 → 调整裁剪框
    const { stageW, stageH, baseW, baseH, scale } = this.data;
    const maxW = Math.min(stageW, baseW * scale);
    const maxH = Math.min(stageH, baseH * scale);
    let bx = s.box.x;
    let by = s.box.y;
    let w = s.box.w;
    let h = s.box.h;
    const m = s.mode;

    if (m.indexOf('l') > -1) {
      const nx = clamp(bx + dx, 0, bx + w - MIN_BOX);
      w += bx - nx;
      bx = nx;
    }
    if (m.indexOf('r') > -1) {
      w = clamp(w + dx, MIN_BOX, Math.min(maxW, stageW - bx));
    }
    if (m.indexOf('t') > -1) {
      const ny = clamp(by + dy, 0, by + h - MIN_BOX);
      h += by - ny;
      by = ny;
    }
    if (m.indexOf('b') > -1) {
      h = clamp(h + dy, MIN_BOX, Math.min(maxH, stageH - by));
    }

    this.setData({ box: { x: bx, y: by, w, h } }, () => this.applyBounds());
  },

  onTouchEnd() {
    this.start = null;
  },

  /** 保证图片覆盖裁剪框 */
  applyBounds() {
    const { baseW, baseH, box, scale, tx, ty } = this.data;
    const dw = baseW * scale;
    const dh = baseH * scale;
    const maxX = Math.max(0, (dw - box.w) / 2);
    const maxY = Math.max(0, (dh - box.h) / 2);
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
    const { stageW, stageH, box, scale, tx, ty, src } = this.data;
    const k = this.baseScale * scale;

    const imgLeft = stageW / 2 + tx - (this.data.baseW * scale) / 2;
    const imgTop = stageH / 2 + ty - (this.data.baseH * scale) / 2;

    let sx = (box.x - imgLeft) / k;
    let sy = (box.y - imgTop) / k;
    let sw = box.w / k;
    let sh = box.h / k;

    sx = clamp(sx, 0, Math.max(0, this.imgW - 1));
    sy = clamp(sy, 0, Math.max(0, this.imgH - 1));
    sw = Math.min(sw, this.imgW - sx);
    sh = Math.min(sh, this.imgH - sy);

    const outW = Math.min(1440, Math.round(sw));
    const outH = Math.max(1, Math.round((outW * sh) / sw));

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
          ctx.fillStyle = '#ffffff';
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
