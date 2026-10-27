/**
 * transition.js —— 幻灯片过渡引擎
 *
 * 两种过渡：
 * 1) local（默认，零成本）：Ken Burns 缓慢推近 + 交叉溶解，本地即可丝滑
 * 2) ai（可选）：把相邻两张照片交给生成式模型，产出一段首尾帧之间的过渡视频
 *
 * AI 过渡是「可插拔」的：配置了 endpoint 才会走网络，没配置就自动降级到本地过渡。
 *
 * ---- 服务端接口约定（endpoint 指向你自己的服务，建议放云函数） ----
 * POST {endpoint}/frames     multipart/form-data, field: file   -> { url }
 * POST {endpoint}/transition  json {from, to, duration, aspect} -> { videoUrl, taskId? }
 * GET  {endpoint}/transition/{taskId}                          -> { status, videoUrl }
 */

const CACHE_KEY = 'gd_ai_trans_cache_v1';
const MAX_CACHE = 24;
const CACHE_DIR = 'transitions';

const fs = (() => {
  try {
    return wx.getFileSystemManager();
  } catch (e) {
    return null;
  }
})();

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function keyOf(fromPath, toPath) {
  return `${hash(fromPath)}-${hash(toPath)}`;
}

function readCache() {
  try {
    const v = wx.getStorageSync(CACHE_KEY);
    return (typeof v === 'string' ? JSON.parse(v) : v) || {};
  } catch (e) {
    return {};
  }
}

function writeCache(map) {
  const keys = Object.keys(map);
  if (keys.length > MAX_CACHE) {
    keys
      .sort((a, b) => (map[a].ts || 0) - (map[b].ts || 0))
      .slice(0, keys.length - MAX_CACHE)
      .forEach((k) => {
        if (map[k].path) removeFile(map[k].path);
        delete map[k];
      });
  }
  try {
    wx.setStorageSync(CACHE_KEY, map);
  } catch (e) {
    /* 忽略 */
  }
}

function removeFile(path) {
  if (!path || !fs || path.indexOf('transitions') < 0) return;
  try {
    fs.unlinkSync(path);
  } catch (e) {
    /* 已删 */
  }
}

/** 查缓存：返回本地视频路径或 null */
function getCached(fromPath, toPath) {
  const map = readCache();
  const item = map[keyOf(fromPath, toPath)];
  if (!item || !item.path) return null;
  try {
    fs.accessSync(item.path);
    return item.path;
  } catch (e) {
    delete map[keyOf(fromPath, toPath)];
    writeCache(map);
    return null;
  }
}

function putCache(fromPath, toPath, path) {
  const map = readCache();
  map[keyOf(fromPath, toPath)] = { path, ts: Date.now() };
  writeCache(map);
}

function uploadFrame(endpoint, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${endpoint.replace(/\/$/, '')}/frames`,
      filePath,
      name: 'file',
      success: (res) => {
        try {
          const data = JSON.parse(res.data);
          if (data && data.url) resolve(data.url);
          else reject(new Error('上传返回异常'));
        } catch (e) {
          reject(new Error('上传返回解析失败'));
        }
      },
      fail: reject,
    });
  });
}

function requestTask(endpoint, payload) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${endpoint.replace(/\/$/, '')}/transition`,
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: payload,
      success: (res) => {
        const d = res.data || {};
        if (d.videoUrl) return resolve(d.videoUrl);
        if (d.taskId) return resolve({ taskId: d.taskId });
        return reject(new Error(d.message || '生成失败'));
      },
      fail: reject,
    });
  });
}

function pollTask(endpoint, taskId, tries = 20) {
  return new Promise((resolve, reject) => {
    const tick = (n) => {
      wx.request({
        url: `${endpoint.replace(/\/$/, '')}/transition/${taskId}`,
        success: (res) => {
          const d = res.data || {};
          if (d.status === 'done' && d.videoUrl) return resolve(d.videoUrl);
          if (d.status === 'failed') return reject(new Error('生成失败'));
          if (n <= 0) return reject(new Error('生成超时'));
          setTimeout(() => tick(n - 1), 2000);
        },
        fail: reject,
      });
    };
    tick(tries);
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    const dir = `${wx.env.USER_DATA_PATH}/${CACHE_DIR}`;
    try {
      fs.accessSync(dir);
    } catch (e) {
      try {
        fs.mkdirSync(dir, true);
      } catch (err) {
        /* ignore */
      }
    }
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) return reject(new Error('下载失败'));
        const dest = `${dir}/tr_${Date.now()}.mp4`;
        try {
          fs.saveFileSync(res.tempFilePath, dest);
          resolve(dest);
        } catch (e) {
          resolve(res.tempFilePath);
        }
      },
      fail: reject,
    });
  });
}

/**
 * 请求一段 AI 过渡
 * @returns {Promise<string|null>} 本地视频路径；条件不满足时返回 null（调用方降级）
 */
async function requestAITransition({ fromPath, toPath, endpoint, duration = 3 }) {
  if (!endpoint) return null;

  const cached = getCached(fromPath, toPath);
  if (cached) return cached;

  const fromUrl = await uploadFrame(endpoint, fromPath);
  const toUrl = await uploadFrame(endpoint, toPath);
  const result = await requestTask(endpoint, { from: fromUrl, to: toUrl, duration, aspect: '3:4' });
  const videoUrl = typeof result === 'string' ? result : await pollTask(endpoint, result.taskId);
  const local = await download(videoUrl);
  putCache(fromPath, toPath, local);
  return local;
}

/** 清空 AI 过渡缓存 */
function clearCache() {
  const map = readCache();
  Object.keys(map).forEach((k) => removeFile(map[k].path));
  try {
    wx.removeStorageSync(CACHE_KEY);
  } catch (e) {
    /* ignore */
  }
}

function cacheSize() {
  const map = readCache();
  return Object.keys(map).length;
}

module.exports = {
  getCached,
  requestAITransition,
  clearCache,
  cacheSize,
  keyOf,
};
