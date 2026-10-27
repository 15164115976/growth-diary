/**
 * store.js —— 本地数据层
 * 全部数据落在 wx storage，图片落在本地用户目录（USER_DATA_PATH）
 * 无后端依赖，可直接跑起来；后续接云开发只需替换 persistImage / request 部分
 */

const dateUtil = require('./date');

const RECORDS_KEY = 'gd_records_v1';
const SETTINGS_KEY = 'gd_settings_v1';
const LAST_KEY = 'gd_last_record_v1';
const ONBOARD_KEY = 'gd_onboard_v1';

const PHOTO_DIR = 'photos';
const ICON_DIR = 'icons';
const LIVE_DIR = 'lives';

/* ------------------------------------------------------------------ *
 * 分类定义（花鸟鱼虫四大类）
 * ------------------------------------------------------------------ */
const CATEGORIES = [
  {
    key: 'flower',
    name: '花',
    icon: '🌸',
    color: '#DE6A8C',
    soft: '#FCEFF3',
    hint: '多肉 · 观叶 · 观花',
    slogan: '一天一个样',
  },
  {
    key: 'bird',
    name: '鸟',
    icon: '🐦',
    color: '#3F86D4',
    soft: '#EAF1FB',
    hint: '鹦鹉 · 文鸟 · 雀类',
    slogan: '换羽、学语、长成',
  },
  {
    key: 'fish',
    name: '鱼',
    icon: '🐟',
    color: '#1BA096',
    soft: '#E6F6F4',
    hint: '雷龙 · 斗鱼 · 锦鲤',
    slogan: '鳞色随日子变深',
  },
  {
    key: 'insect',
    name: '虫',
    icon: '🦗',
    color: '#8878D6',
    soft: '#F1EEFC',
    hint: '甲虫 · 螳螂 · 蜘蛛',
    slogan: '每一次蜕皮都是新生',
  },
];

/** 每类可选的图标（emoji）—— 用户也可传自己的图片 */
const EMOJI_SETS = {
  flower: [
    '🌸', '🌿', '🌱', '🪴', '🌵', '🌻', '🌷', '🍀', '🌾', '🎍',
    '🌺', '🌼', '🌳', '🌲', '🍃', '🌹', '🌴', '🍄', '🌰', '🎋',
  ],
  bird: [
    '🐦', '🦜', '🕊️', '🐤', '🦩', '🦉', '🐧', '🪶', '🥚', '🎵',
    '🦆', '🦢', '🐓', '🐥', '🦃', '🐣', '🎶', '🪺', '🐔', '🦚',
  ],
  fish: [
    '🐟', '🐠', '🐡', '🦈', '🦐', '🐢', '🦞', '🫧', '🌊', '🐙',
    '🐳', '🐬', '🦀', '🐚', '🪸', '🐋', '🦑', '🐸', '🦭', '🌿',
  ],
  insect: [
    '🦗', '🪲', '🦋', '🐛', '🐜', '🕷️', '🦂', '🐝', '🐌', '🥚',
    '🦟', '🪰', '🐞', '🦠', '🕸️', '🪳', '🦎', '🐍',
  ],
};

/** 养护动作类型 */
const CARE_TYPES = [
  { key: 'feed', name: '喂食', icon: '🍚', color: '#D98A3D' },
  { key: 'water', name: '换水/浇水', icon: '💧', color: '#3F86D4' },
  { key: 'clean', name: '清洁', icon: '🧹', color: '#7C8B72' },
  { key: 'light', name: '光照/日照', icon: '☀️', color: '#D9A73D' },
  { key: 'med', name: '用药/除虫', icon: '💊', color: '#C7574E' },
  { key: 'other', name: '其他', icon: '📝', color: '#7A7A7A' },
];

/** 四类默认养护手册 —— 可直接用，也可在手册页增删改 */
const MANUAL_TEMPLATES = {
  flower: [
    {
      title: '光照',
      body: '多数观叶植物喜欢明亮散射光，避免正午直射。观花类需要每天 4 小时以上直射光才能稳定开花。判断标准：叶片发白变薄＝光太强；节间拉长、叶色发暗＝光不足。',
    },
    {
      title: '浇水',
      body: '见干见湿，宁少勿多。手指插入表土下 2cm，干了再浇，一次浇到盆底出水为止。托盘里的积水 20 分钟内倒掉，防烂根。',
    },
    {
      title: '施肥',
      body: '生长期（春秋）每月一次稀薄液肥，浓度约为标注的 1/2。盛夏高温与冬季低温停肥，避免烧根。',
    },
    {
      title: '换盆',
      body: '1–2 年春季换盆一次。新盆直径比旧盆大 2–3cm 即可，配土要求疏松透气，换盆后缓苗一周不放肥。',
    },
    {
      title: '常见问题',
      body: '黄叶先从底部起→老叶自然代谢；整株发黄→浇水过多或烂根。叶背有黏腻小点→介壳虫，用酒精棉签擦除后隔离。',
    },
  ],
  bird: [
    {
      title: '笼舍清洁',
      body: '每天清理底盘粪便与残食，每周用宠物安全消毒剂整笼擦洗一次，栖木定期刷洗晾干。',
    },
    {
      title: '饮食',
      body: '主食为专用谷物或滋养丸（占 60% 以上），搭配少量新鲜蔬果。饮水每天更换，水罐每天刷洗。禁喂：牛油果、洋葱、巧克力、含咖啡因食物。',
    },
    {
      title: '洗浴与日照',
      body: '每周 1–2 次浅水盆沐浴，水温接近室温。每天 15–30 分钟温和日照（非正午直射），有助合成维生素 D3 与改善羽色。',
    },
    {
      title: '环境',
      body: '温度 20–28℃，避免穿堂风与厨房油烟。夜间保证 10 小时以上的安静黑暗环境，有助于减少应激性啄羽。',
    },
    {
      title: '健康信号',
      body: '健康：羽毛紧实贴身、粪便成型有白色尿酸盐、双眼清亮。警示：炸毛嗜睡、粪便稀散发绿、单脚久站缩头——出现任意一项建议尽快就医。',
    },
  ],
  fish: [
    {
      title: '水质',
      body: '氨与亚硝酸盐应长期为 0。每周换水 1/3，新水需除氯并调至同温。滤材用缸内老水轻洗，切勿用自来水冲，避免破坏硝化菌群。',
    },
    {
      title: '水温',
      body: '雷龙类 24–28℃，斗鱼 24–27℃，锦鲤 18–24℃。换水前后温差不超过 2℃，温差过大易诱发白点病。',
    },
    {
      title: '喂食',
      body: '每天 1–2 次，以 3 分钟内吃完为准。雷龙偏肉食，可用虾肉、红虫交替；每周停食一天，帮助肠胃排空。',
    },
    {
      title: '防跳与造景',
      body: '雷龙、斗鱼跳缸概率极高，缸必须加盖并留缝透气。造景留出躲避空间能显著降低应激，也让拍摄角度更容易固定。',
    },
    {
      title: '常见病症',
      body: '白点病→升温至 30℃ 并配合白点净；蒙眼→多为水质问题，加强换水；腹胀立鳞→停食并隔离观察。',
    },
  ],
  insect: [
    {
      title: '温湿度',
      body: '多数品种适宜 22–28℃、湿度 60–80%。湿度不足会导致蜕皮失败，过高则易长霉，可用温湿度计贴盒监测。',
    },
    {
      title: '垫材',
      body: '椰土或腐殖土，捏成团不散、松手即散为宜。每 1–2 个月整体更换，发现霉点或小飞虫立即换。',
    },
    {
      title: '喂食',
      body: '甲虫用专用果冻，2–3 天更换一次并清理残渣；螳螂、蜘蛛投喂活饵，按体长选择合适大小的饲料虫，避免反杀。',
    },
    {
      title: '蜕皮期',
      body: '蜕皮前后 3 天不打扰、不投喂活饵，保持湿度稳定。刚蜕皮的虫体柔软，切勿上手把玩。',
    },
    {
      title: '通风',
      body: '盒盖打孔保证空气流通。闷湿是不开背、霉病与死亡的首要原因，湿度高时务必加强通风。',
    },
  ],
};

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */
const fs = (() => {
  try {
    return wx.getFileSystemManager();
  } catch (e) {
    return null;
  }
})();

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function userPath(sub) {
  const base = (wx.env && wx.env.USER_DATA_PATH) || '';
  return sub ? `${base}/${sub}` : base;
}

function ensureDir(dir) {
  if (!fs) return;
  try {
    fs.accessSync(dir);
  } catch (e) {
    try {
      fs.mkdirSync(dir, true);
    } catch (err) {
      /* 目录已存在或并发创建，忽略 */
    }
  }
}

function readJSON(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    if (!v) return fallback;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    wx.showToast({ title: '存储空间不足', icon: 'none' });
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * 图片持久化
 * ------------------------------------------------------------------ */
function compress(src, quality = 82) {
  return new Promise((resolve) => {
    if (!wx.compressImage) return resolve(src);
    wx.compressImage({
      src,
      quality,
      success: (res) => resolve(res.tempFilePath || src),
      fail: () => resolve(src),
    });
  });
}

/** 把临时文件搬到小程序用户目录，返回可长期使用的路径 */
function persistFile(tempPath, kind, fallbackExt = '.bin') {
  const dir = userPath(kind);
  ensureDir(dir);
  const m = tempPath.match(/\.(png|jpe?g|webp|mp4|mov)$/i);
  const ext = m ? m[0].toLowerCase() : fallbackExt;
  const dest = `${dir}/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}${ext}`;
  try {
    if (fs && fs.saveFileSync) {
      fs.saveFileSync(tempPath, dest);
      return dest;
    }
  } catch (e) {
    /* 落到 copyFile */
  }
  try {
    if (fs && fs.copyFileSync) {
      fs.copyFileSync(tempPath, dest);
      return dest;
    }
  } catch (e) {
    /* 保底用临时路径 */
  }
  return tempPath;
}

function persistImage(tempPath, kind = PHOTO_DIR) {
  return persistFile(tempPath, kind, '.jpg');
}

function removeFile(path) {
  if (!path || !fs) return;
  if (path.indexOf('wxfile://') === 0 || path.indexOf(userPath()) !== 0) return;
  try {
    fs.unlinkSync(path);
  } catch (e) {
    /* 已删除 */
  }
}

/* ------------------------------------------------------------------ *
 * 记录 CRUD
 * ------------------------------------------------------------------ */
const CATEGORY_KEY = 'gd_categories_v1';
let _catCache = null;

/** 分类定义，允许用户改名/换图标，存在本地覆盖默认值 */
function getCategories() {
  if (_catCache) return _catCache;
  const custom = readJSON(CATEGORY_KEY, {});
  _catCache = CATEGORIES.map((c) => Object.assign({}, c, custom[c.key] || {}));
  return _catCache;
}

function saveCategory(key, patch) {
  const custom = readJSON(CATEGORY_KEY, {});
  custom[key] = Object.assign({}, custom[key] || {}, patch || {});
  writeJSON(CATEGORY_KEY, custom);
  _catCache = null;
  return getCategories();
}

function resetCategory(key) {
  const custom = readJSON(CATEGORY_KEY, {});
  delete custom[key];
  writeJSON(CATEGORY_KEY, custom);
  _catCache = null;
  return getCategories();
}

function categoryOf(key) {
  const list = getCategories();
  return list.find((c) => c.key === key) || list[0];
}

function careTypeOf(key) {
  return CARE_TYPES.find((c) => c.key === key) || CARE_TYPES[CARE_TYPES.length - 1];
}

function listRecords() {
  return readJSON(RECORDS_KEY, []);
}

function saveAll(records) {
  return writeJSON(RECORDS_KEY, records);
}

function getRecord(id) {
  return listRecords().find((r) => r.id === id) || null;
}

/** 各类的生物钟不同，给一份合理的初始养护计划，之后用户可随时改 */
const CARE_PLAN_TEMPLATES = {
  flower: {
    water: { every: 3, amount: '浇到盆底出水' },
    light: { every: 1, amount: '散射光 6 小时' },
    feed: { every: 30, amount: '稀薄液肥 1 次' },
    clean: { every: 14, amount: '擦叶、清理枯叶' },
    med: { every: 0, amount: '' },
    other: { every: 0, amount: '' },
  },
  bird: {
    feed: { every: 1, amount: '谷物 2 勺 + 蔬果少量' },
    water: { every: 1, amount: '换清水、刷水罐' },
    clean: { every: 1, amount: '清底盘、换垫纸' },
    light: { every: 1, amount: '温和日照 20 分钟' },
    med: { every: 0, amount: '' },
    other: { every: 0, amount: '' },
  },
  fish: {
    feed: { every: 1, amount: '3 粒粮，3 分钟内吃完' },
    water: { every: 3, amount: '换 1/3，除氯同温' },
    clean: { every: 7, amount: '洗滤棉（用缸水）' },
    light: { every: 1, amount: '开灯 6 小时' },
    med: { every: 0, amount: '' },
    other: { every: 0, amount: '' },
  },
  insect: {
    feed: { every: 3, amount: '果冻 1 颗 / 活饵 1 只' },
    water: { every: 3, amount: '喷湿垫材表面' },
    clean: { every: 14, amount: '清残饵、换垫材' },
    light: { every: 0, amount: '' },
    med: { every: 0, amount: '' },
    other: { every: 0, amount: '' },
  },
};

function defaultCarePlan(category) {
  const tpl = CARE_PLAN_TEMPLATES[category] || CARE_PLAN_TEMPLATES.flower;
  const plan = {};
  CARE_TYPES.forEach((t) => {
    const item = tpl[t.key] || { every: 0, amount: '' };
    plan[t.key] = {
      enabled: item.every > 0,
      every: item.every,
      amount: item.amount || '',
    };
  });
  return plan;
}

/** 分类内重排（首页卡片拖动排序用） */
function reorderInCategory(category, orderedIds) {
  const records = listRecords();
  orderedIds.forEach((id, i) => {
    const r = records.find((x) => x.id === id);
    if (r && r.category === category) r.catOrder = i;
  });
  saveAll(records);
  return records;
}

function createRecord(input = {}) {
  const category = input.category || 'flower';
  const cat = categoryOf(category);
  const now = Date.now();
  const record = {
    id: uid('rec'),
    category,
    name: input.name || `${cat.name} · 未命名`,
    species: input.species || '',
    emoji: input.emoji || cat.icon,
    iconPath: input.iconPath || '',
    startTs: input.startTs || now,
    note: input.note || '',
    coverPath: '',
    coverTs: 0,
    customCover: '', // 从相册导入的封面，优先于最新照片
    sortOrder: -1, // 越小越靠前，新建的排最前面
    catOrder: -1, // 分类内顺序
    photos: [],
    careLogs: [],
    carePlan: defaultCarePlan(category),
    manual: (MANUAL_TEMPLATES[category] || []).map((m) => ({
      id: uid('man'),
      title: m.title,
      body: m.body,
      builtin: true,
    })),
    // 漂流瓶：默认不公开，必须显式开启
    drift: { enabled: false, bottleId: '', sharedAt: 0 },
    createdAt: now,
    updatedAt: now,
  };
  const records = listRecords();
  records.unshift(record);
  saveAll(records);
  normalizeOrder();
  return record;
}

/** 把所有记录的 sortOrder 重排成连续的 0..n-1 */
function normalizeOrder() {
  const records = listRecords();
  records.sort((a, b) => {
    const sa = typeof a.sortOrder === 'number' ? a.sortOrder : 9999;
    const sb = typeof b.sortOrder === 'number' ? b.sortOrder : 9999;
    if (sa !== sb) return sa - sb;
    const ta = (a.photos && a.photos.length ? a.photos[a.photos.length - 1].ts : a.createdAt) || 0;
    const tb = (b.photos && b.photos.length ? b.photos[b.photos.length - 1].ts : b.createdAt) || 0;
    return tb - ta;
  });
  records.forEach((r, i) => {
    r.sortOrder = i;
  });
  saveAll(records);
  return records;
}

/** 按给定 id 顺序重排（置顶 / 上移 / 下移 都走这里） */
function reorderRecords(orderedIds) {
  const records = listRecords();
  const map = {};
  records.forEach((r) => {
    map[r.id] = r;
  });
  const out = [];
  orderedIds.forEach((id) => {
    if (map[id]) {
      out.push(map[id]);
      delete map[id];
    }
  });
  // 没出现在列表里的保持原顺序补在后面
  records.forEach((r) => {
    if (map[r.id]) out.push(r);
  });
  out.forEach((r, i) => {
    r.sortOrder = i;
  });
  saveAll(out);
  return out;
}

/** 设置自定义封面；path 为空表示恢复用最新照片 */
function setCover(recordId, path) {
  return updateRecord(recordId, { customCover: path || '' });
}

/** 保存养护计划 */
function saveCarePlan(recordId, plan) {
  return updateRecord(recordId, { carePlan: plan });
}

function updateRecord(id, patch = {}) {
  const records = listRecords();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  records[idx] = Object.assign({}, records[idx], patch, { updatedAt: Date.now() });
  saveAll(records);
  return records[idx];
}

function removeRecord(id) {
  const records = listRecords();
  const target = records.find((r) => r.id === id);
  if (target) {
    (target.photos || []).forEach((p) => {
      removeFile(p.path);
      if (p.live && p.live.path) removeFile(p.live.path);
    });
    removeFile(target.iconPath);
  }
  saveAll(records.filter((r) => r.id !== id));
  if (getLastRecordId() === id) setLastRecordId('');
  return true;
}

/** 新增一张照片（内部已做压缩 + 落盘） */
async function addPhoto(recordId, options = {}) {
  const tempPath = options.tempPath;
  if (!tempPath) throw new Error('缺少图片');

  const compressed = await compress(tempPath, options.quality || 82);
  const finalPath = persistImage(compressed, PHOTO_DIR);
  if (finalPath !== compressed) removeFile(compressed);

  // 动态片段：拍照后紧跟的一小段视频，和静图配成一组 Live
  let live = null;
  if (options.livePath) {
    const livePath = persistFile(options.livePath, LIVE_DIR, '.mp4');
    if (livePath && livePath.indexOf('http') !== 0) {
      live = {
        path: livePath,
        duration: options.liveDuration || 2200,
      };
    }
  }

  const photo = {
    id: uid('ph'),
    path: finalPath,
    ts: options.ts || Date.now(),
    date: dateUtil.ymd(options.ts || Date.now()),
    note: options.note || '',
    refId: options.refId || '',
    orientation: options.orientation || 0, // 拍摄时的真实角度，已按此转正
    live,
  };

  const records = listRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx < 0) throw new Error('记录不存在');

  const rec = records[idx];
  rec.photos = (rec.photos || []).concat(photo);
  // 无条件按时间倒序排列，保证 cover 是最新一张
  rec.photos.sort((a, b) => a.ts - b.ts);
  const latest = rec.photos[rec.photos.length - 1];
  rec.coverPath = latest.path;
  rec.coverTs = latest.ts;
  rec.updatedAt = Date.now();
  saveAll(records);
  setLastRecordId(recordId);
  return { photo, record: rec };
}

function removePhoto(recordId, photoId) {
  const records = listRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx < 0) return null;
  const rec = records[idx];
  const target = (rec.photos || []).find((p) => p.id === photoId);
  if (target) {
    removeFile(target.path);
    if (target.live && target.live.path) removeFile(target.live.path);
  }
  rec.photos = (rec.photos || []).filter((p) => p.id !== photoId);
  const latest = rec.photos[rec.photos.length - 1];
  rec.coverPath = latest ? latest.path : '';
  rec.coverTs = latest ? latest.ts : 0;
  rec.updatedAt = Date.now();
  saveAll(records);
  return rec;
}

/* ------------------------------------------------------------------ *
 * 养护记录
 * ------------------------------------------------------------------ */
function addCareLog(recordId, { type = 'feed', note = '', ts = Date.now() } = {}) {
  const records = listRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx < 0) return null;
  const rec = records[idx];
  rec.careLogs = (rec.careLogs || []).concat({
    id: uid('care'),
    type,
    note,
    ts,
  });
  rec.careLogs.sort((a, b) => b.ts - a.ts);
  rec.updatedAt = Date.now();
  saveAll(records);
  return rec;
}

function removeCareLog(recordId, logId) {
  const records = listRecords();
  const idx = records.findIndex((r) => r.id === recordId);
  if (idx < 0) return null;
  const rec = records[idx];
  rec.careLogs = (rec.careLogs || []).filter((l) => l.id !== logId);
  saveAll(records);
  return rec;
}

/* ------------------------------------------------------------------ *
 * 手册
 * ------------------------------------------------------------------ */
function saveManual(recordId, manual) {
  return updateRecord(recordId, { manual });
}

/* ------------------------------------------------------------------ *
 * 设置
 * ------------------------------------------------------------------ */
const DEFAULT_SETTINGS = {
  // 启动
  startWithIdentify: true, // 进入小程序先识别生物
  enterMode: 'last', // last | fixed | home
  fixedRecordId: '',
  // 取景
  gravityFlip: true, // 根据重力自动翻转取景
  showGrid: true,
  refOpacity: 38, // 参考底透明度 %
  // 拍摄
  livePhoto: true, // 拍照后录制动态片段
  liveDuration: 2200,
  liveAuto: true, // 幻灯片里换图时自动播动图
  // 幻灯片
  aiTransition: false,
  aiEndpoint: '',
  transitionDuration: 2200,
  autoPlayInterval: 3200,
  // 识别
  recognizeEndpoint: '',
  cloudEnv: '',
  // 漂流瓶
  allowDrift: false, // 默认不把生物发出去
  driftAnonymous: true,
};

function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, readJSON(SETTINGS_KEY, {}));
}

function saveSettings(patch) {
  const next = Object.assign({}, getSettings(), patch);
  writeJSON(SETTINGS_KEY, next);
  return next;
}

function getLastRecordId() {
  try {
    return wx.getStorageSync(LAST_KEY) || '';
  } catch (e) {
    return '';
  }
}

function setLastRecordId(id) {
  try {
    wx.setStorageSync(LAST_KEY, id || '');
  } catch (e) {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * 派生数据
 * ------------------------------------------------------------------ */
function decorate(record) {
  if (!record) return null;
  const cat = categoryOf(record.category);
  const photos = (record.photos || []).slice().sort((a, b) => a.ts - b.ts);
  const latest = photos[photos.length - 1] || null;
  const prev = photos[photos.length - 2] || null;
  const days = dateUtil.dayIndex(record.startTs);
  const today = dateUtil.ymd();
  const shotToday = photos.some((p) => p.date === today);

  const lastCare = {};
  (record.careLogs || []).forEach((l) => {
    if (!lastCare[l.type] || lastCare[l.type] < l.ts) lastCare[l.type] = l.ts;
  });

  return Object.assign({}, record, {
    photos,
    latest,
    prev,
    photoCount: photos.length,
    days,
    shotToday,
    catName: cat.name,
    catColor: cat.color,
    catSoft: cat.soft,
    lastCare,
    drift: record.drift || { enabled: false, bottleId: '', sharedAt: 0 },
    carePlan: record.carePlan || defaultCarePlan(record.category),
    coverIsCustom: !!record.customCover,
    coverPath: record.customCover || (latest ? latest.path : record.coverPath || ''),
    lastShotText: latest ? dateUtil.friendlyDay(latest.ts) : '还没有记录',
  });
}

function getAll() {
  const list = listRecords().map(decorate);
  list.sort((a, b) => {
    const sa = typeof a.sortOrder === 'number' ? a.sortOrder : 9999;
    const sb = typeof b.sortOrder === 'number' ? b.sortOrder : 9999;
    return sa - sb;
  });
  return list;
}

function groupByCategory() {
  const all = getAll();
  return getCategories().map((c) => {
    const records = all.filter((r) => r.category === c.key);
    records.sort((a, b) => {
      const sa = typeof a.catOrder === 'number' ? a.catOrder : 9999;
      const sb = typeof b.catOrder === 'number' ? b.catOrder : 9999;
      return sa - sb;
    });
    return { category: c, records };
  });
}

/** 首次启动写入示例记录，避免首页空白 */
function seedIfEmpty() {
  if (readJSON(RECORDS_KEY, null)) return;
  const seeds = [
    { category: 'fish', name: '雷龙', species: '七彩雷龙', emoji: '🐟' },
    { category: 'flower', name: '龟背竹', species: 'Monstera', emoji: '🪴' },
    { category: 'bird', name: '玄凤', species: '玄凤鹦鹉', emoji: '🦜' },
    { category: 'insect', name: '独角仙', species: '双叉犀金龟', emoji: '🪲' },
  ];
  const records = seeds.map((s, i) => {
    const cat = categoryOf(s.category);
    const now = Date.now() - (30 - i * 3) * 86400000;
    return {
      id: uid('rec'),
      category: s.category,
      name: s.name,
      species: s.species,
      emoji: s.emoji,
      iconPath: '',
      startTs: now,
      note: '',
      coverPath: '',
      coverTs: 0,
      photos: [],
      careLogs: [],
      manual: (MANUAL_TEMPLATES[s.category] || []).map((m) => ({
        id: uid('man'),
        title: m.title,
        body: m.body,
        builtin: true,
      })),
      createdAt: now,
      updatedAt: now,
      demo: true,
    };
  });
  writeJSON(RECORDS_KEY, records);
}

function init() {
  ensureDir(userPath(PHOTO_DIR));
  ensureDir(userPath(ICON_DIR));
  ensureDir(userPath(LIVE_DIR));
  seedIfEmpty();
  normalizeOrder();
}

module.exports = {
  CATEGORIES,
  EMOJI_SETS,
  CARE_TYPES,
  MANUAL_TEMPLATES,
  categoryOf,
  getCategories,
  saveCategory,
  resetCategory,
  careTypeOf,
  init,
  listRecords,
  getAll,
  groupByCategory,
  getRecord,
  decorate,
  createRecord,
  updateRecord,
  removeRecord,
  addPhoto,
  removePhoto,
  addCareLog,
  removeCareLog,
  saveManual,
  normalizeOrder,
  reorderRecords,
  reorderInCategory,
  setCover,
  saveCarePlan,
  defaultCarePlan,
  CARE_PLAN_TEMPLATES,
  getSettings,
  saveSettings,
  getLastRecordId,
  setLastRecordId,
  persistImage,
  persistFile,
  removeFile,
  ensureDir,
  uid,
  LIVE_DIR,
  ONBOARD_KEY,
};
