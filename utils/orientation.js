/**
 * orientation.js —— 重力 / 姿态方向监听
 *
 * 两个用途：
 *   1) 预览：手机倒置时把取景画面转 180°，UI 不跟着转
 *   2) 入库：记录拍照瞬间的真实角度（0 / 90 / 180 / 270），保存前把照片转正
 *
 * 不用加速度计的 y 符号判断：iOS 与 Android 上报的正负号不统一，
 * 写死符号会出现「正常拿着反而被翻转」。
 * 改用 deviceMotion 的姿态角：
 *      beta  绕 x 轴，竖立 ≈ +90、倒置 ≈ -90
 *      gamma 绕 y 轴，横握 ≈ ±90
 * 退化到加速度计时也不看绝对符号，只判断「相对首次基准翻转了没有」。
 *
 * 回调参数：{ angle: 0|90|180|270, flip: 0|180 }
 *   angle 给入库用，flip 只给预览用（横屏不转预览，转了宽高会错位）
 */

function classify(beta, gamma) {
  const ab = Math.abs(beta);
  const ag = Math.abs(gamma);
  if (ab > 50 && ab > ag) return beta > 0 ? 0 : 180;
  if (ag > 50 && ag > ab) return gamma < 0 ? 90 : 270;
  return null; // 平放或角度不明，不参与判断
}

function watchOrientation(onChange, options = {}) {
  const need = options.stable || 3;
  const settle = options.settle === undefined ? 900 : options.settle;

  let alive = true;
  let armed = false;
  let current = 0; // 只记 0 / 180 两种预览态
  let candidate = 0;
  let stable = 0;
  let usingMotion = false;
  let baseSign = 0;
  let lastAngle = 0;
  let lastEmitted = -1;

  const armTimer = setTimeout(() => {
    armed = true;
    current = 0; // 页面初始 flip 恒为 0，对齐它
  }, settle);

  function emit(angle) {
    lastAngle = angle;
    const flip = angle === 180 ? 180 : 0;
    if (!armed) {
      current = flip;
      candidate = flip;
      lastEmitted = angle;
      return;
    }
    // 完整角度变化就通知（横屏 90/270 也要让页面知道，用来做横屏全屏）
    if (angle !== lastEmitted) {
      lastEmitted = angle;
      current = flip;
      onChange({ angle, flip });
    }
  }

  function feed(angle) {
    if (!alive || angle === null) return;
    const flip = angle === 180 ? 180 : 0;
    if (flip === candidate) {
      stable += 1;
    } else {
      candidate = flip;
      stable = 1;
    }
    if (stable >= need) {
      stable = 0;
      emit(angle);
    }
  }

  /* 1. 姿态角（首选） */
  const motionHandler = (res) => {
    if (!alive) return;
    usingMotion = true;
    const angle = classify(res.beta || 0, res.gamma || 0);
    if (angle !== null) feed(angle);
  };

  try {
    wx.startDeviceMotionListening({ interval: 'normal', fail: () => {} });
    wx.onDeviceMotionChange(motionHandler);
  } catch (e) {
    /* 走加速度计 */
  }

  /* 2. 加速度计（兜底，只判相对） */
  const accHandler = (res) => {
    if (!alive || usingMotion) return;
    const y = res.y || 0;
    const x = res.x || 0;
    if (Math.abs(y) < 0.5 && Math.abs(x) < 0.5) return;
    const sign = Math.abs(y) >= Math.abs(x) ? (y > 0 ? 1 : -1) : x > 0 ? 2 : -2;
    if (!baseSign) {
      baseSign = sign;
      return;
    }
    feed(sign === baseSign ? 0 : 180);
  };

  try {
    wx.startAccelerometer({ interval: 'normal', fail: () => {} });
    wx.onAccelerometerChange(accHandler);
  } catch (e) {
    /* 都不可用就静默降级 */
  }

  return {
    stop() {
      alive = false;
      clearTimeout(armTimer);
      try {
        wx.offDeviceMotionChange(motionHandler);
        wx.stopDeviceMotionListening({ fail: () => {} });
      } catch (e) {
        /* ignore */
      }
      try {
        wx.offAccelerometerChange(accHandler);
        wx.stopAccelerometer({ fail: () => {} });
      } catch (e) {
        /* ignore */
      }
    },
    /** 拍照瞬间取当前角度（不依赖回调是否已触发过） */
    getAngle() {
      return lastAngle;
    },
  };
}

module.exports = { watchOrientation };
