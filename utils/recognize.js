/**
 * recognize.js —— 生物识别
 *
 * 两条通道，谁配好走谁：
 *   1) 自建 endpoint：POST {endpoint}/recognize  multipart file -> { category, species, confidence }
 *   2) 云函数 recognize：上传云存储 -> 调用视觉模型 -> 返回同结构
 *
 * 两条都不通就返回 null，界面自动降级到「我记录过的生物」让用户手选。
 * 识别只是加速入口，绝不能阻塞主流程。
 */

const store = require('./store');
const imageUtil = require('./image');

const KEYS = ['flower', 'bird', 'fish', 'insect'];

const ALIAS = {
  flower: ['花', '植物', '绿植', '草木', '多肉', '花卉', '盆栽', 'plant', 'flower', 'foliage'],
  bird: ['鸟', '禽', '鹦鹉', '雀', '羽', 'bird', 'parrot'],
  fish: ['鱼', '水族', '观赏鱼', '锦鲤', '雷龙', 'fish', 'aquarium', 'betta'],
  insect: ['虫', '昆虫', '甲虫', '蜘蛛', '螳螂', '兜虫', 'insect', 'bug', 'beetle', 'spider'],
};

function normalizeCategory(raw) {
  if (!raw) return '';
  const s = String(raw).toLowerCase().trim();
  if (KEYS.indexOf(s) > -1) return s;
  for (let i = 0; i < KEYS.length; i += 1) {
    const k = KEYS[i];
    if (ALIAS[k].some((a) => s.indexOf(a.toLowerCase()) > -1)) return k;
  }
  return '';
}

function normalize(data) {
  if (!data || typeof data !== 'object') return null;
  const category = normalizeCategory(data.category || data.type || data.kind);
  if (!category) return null;
  const species = String(data.species || data.breed || data.variety || '').trim();
  const name = String(data.name || species || '').trim();
  return {
    category,
    species,
    name,
    confidence: Number(data.confidence || data.score || 0) || 0,
    source: data.source || 'ai',
  };
}

function uploadToEndpoint(endpoint, filePath) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${endpoint.replace(/\/$/, '')}/recognize`,
      filePath,
      name: 'file',
      timeout: 25000,
      success: (res) => {
        try {
          resolve(JSON.parse(res.data));
        } catch (e) {
          reject(new Error('返回格式异常'));
        }
      },
      fail: reject,
    });
  });
}

async function callCloud(filePath) {
  if (!wx.cloud) throw new Error('未启用云开发');
  const cloudPath = `recognize/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  const up = await new Promise((resolve, reject) => {
    wx.cloud.uploadFile({ cloudPath, filePath, success: resolve, fail: reject });
  });
  const res = await new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'recognize',
      data: { fileID: up.fileID },
      success: resolve,
      fail: reject,
    });
  });
  return res.result;
}

/**
 * @param {string} imagePath 本地图片路径
 * @param {{useCloud?:boolean}} options
 * @returns {Promise<null|{category:string,species:string,name:string,confidence:number,source:string}>}
 */
async function recognize(imagePath, options = {}) {
  const settings = store.getSettings();
  const prepared = await imageUtil.compressTo(imagePath, 1024, 80);

  if (settings.recognizeEndpoint) {
    try {
      const data = await uploadToEndpoint(settings.recognizeEndpoint, prepared);
      const n = normalize(data);
      if (n) return n;
    } catch (e) {
      /* 落到下一条通道 */
    }
  }

  if (options.useCloud) {
    try {
      const data = await callCloud(prepared);
      const n = normalize(data);
      if (n) return n;
    } catch (e) {
      /* 降级 */
    }
  }

  return null;
}

/** 当前有没有可用的识别通道 */
function availability(cloudReady) {
  const settings = store.getSettings();
  return {
    endpoint: !!settings.recognizeEndpoint,
    cloud: !!cloudReady,
    ready: !!settings.recognizeEndpoint || !!cloudReady,
  };
}

module.exports = { recognize, availability, normalizeCategory, KEYS };
