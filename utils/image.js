/**
 * 图片工具：按角度旋转（用于重力翻转后把照片转正）
 */
function rotateImage(src, degrees) {
  return new Promise((resolve) => {
    const deg = ((degrees % 360) + 360) % 360;
    if (!deg) return resolve(src);

    wx.getImageInfo({
      src,
      success: (info) => {
        const w0 = info.width;
        const h0 = info.height;
        const swap = deg === 90 || deg === 270;
        const w = swap ? h0 : w0;
        const h = swap ? w0 : h0;

        let canvas = null;
        try {
          canvas = wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
        } catch (e) {
          return resolve(src); // 低版本没有离屏 canvas，退回原图
        }
        if (!canvas) return resolve(src);

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        ctx.translate(w / 2, h / 2);
        ctx.rotate((deg * Math.PI) / 180);

        const img = canvas.createImage();
        img.onload = () => {
          ctx.drawImage(img, -w0 / 2, -h0 / 2, w0, h0);
          wx.canvasToTempFilePath({
            canvas,
            x: 0,
            y: 0,
            width: w,
            height: h,
            destWidth: w,
            destHeight: h,
            fileType: 'jpg',
            quality: 0.92,
            success: (res) => resolve(res.tempFilePath),
            fail: () => resolve(src),
          });
        };
        img.onerror = () => resolve(src);
        img.src = src;
      },
      fail: () => resolve(src),
    });
  });
}

/** 压缩到指定最长边（识别前用，减小上传体积） */
function compressTo(src, maxSide = 1080, quality = 80) {
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success: (info) => {
        const long = Math.max(info.width, info.height);
        if (long <= maxSide && !wx.compressImage) return resolve(src);
        wx.compressImage({
          src,
          quality,
          compressedWidth: long > maxSide ? Math.round((info.width * maxSide) / long) : undefined,
          success: (res) => resolve(res.tempFilePath || src),
          fail: () => resolve(src),
        });
      },
      fail: () => resolve(src),
    });
  });
}

module.exports = { rotateImage, compressTo };
