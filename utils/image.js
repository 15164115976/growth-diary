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

/**
 * 按 EXIF 方向把图片转正 —— 这是最可靠的做法
 *
 * 不去猜设备朝向，而是问微信：「这张图本身是什么朝向？」
 * wx.getImageInfo 会把 EXIF 里的 Orientation 翻译成 up/down/left/right，
 * 非 up 才需要真的转一次，是 up 就原样返回，零开销。
 *
 * 为什么不再用传感器角度：camera 输出的照片本身可能已经是"所见即所得"的正图，
 * 再按陀螺仪转一次就会过头 —— 之前方向一直不对就是这个原因。
 */
function normalizeOrientation(src) {
  return new Promise((resolve) => {
    wx.getImageInfo({
      src,
      success: (info) => {
        const o = info.orientation;
        // left / right 的含义是「相对正向逆/顺时针转了 90」，需要转回来
        const degMap = { right: 90, down: 180, left: 270 };
        const deg = degMap[o];
        if (!deg) return resolve(src); // up 或镜像类，保持原样
        rotateImage(src, deg).then(resolve);
      },
      fail: () => resolve(src),
    });
  });
}

module.exports.normalizeOrientation = normalizeOrientation;

/**
 * 构图相似度：把两张图缩到同一尺寸的灰度图，比平均绝对差
 *
 * 这是「判断是否同一角度」的可行做法 —— 小程序拿不到 LiDAR 数据，
 * 但「这张和上次拍得像不像」是可以算的，对齐度低就说明机位变了。
 *
 * @returns {Promise<number|null>} 0~1，1 表示几乎完全一致
 */
function loadGray(path, size) {
  return new Promise((resolve) => {
    let canvas = null;
    try {
      canvas = wx.createOffscreenCanvas({ type: '2d', width: size, height: size });
    } catch (e) {
      return resolve(null);
    }
    if (!canvas) return resolve(null);

    const ctx = canvas.getContext('2d');
    const img = canvas.createImage();
    img.onload = () => {
      try {
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const gray = new Float32Array(size * size);
        for (let i = 0; i < size * size; i += 1) {
          gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
        }
        resolve(gray);
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = path;
  });
}

async function similarity(pathA, pathB, size = 32) {
  if (!pathA || !pathB) return null;
  const [ga, gb] = await Promise.all([loadGray(pathA, size), loadGray(pathB, size)]);
  if (!ga || !gb) return null;

  let diff = 0;
  for (let i = 0; i < ga.length; i += 1) diff += Math.abs(ga[i] - gb[i]);
  const mae = diff / ga.length / 255;
  return Math.max(0, Math.min(1, 1 - mae));
}

module.exports.similarity = similarity;
