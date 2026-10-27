/**
 * bottle.js —— 漂流瓶服务层
 *
 * 两条通道：
 *   1) 云开发：wx.cloud.callFunction 到 bottle 云函数（真实环境，跨用户）
 *   2) 本地演示：没开通云环境时用内置样本跑通整套交互（点赞/订阅/授权评论）
 *
 * 对外返回结构在两条通道里保持一致，页面不用关心走的是哪条。
 *
 * ---- 漂流规则 ----
 * 投瓶：默认关闭，必须在「我的」里显式开启 allowDrift，或对单条记录手动开
 * 点赞：单向，不需要对方同意
 * 订阅：单向关注，不需要对方同意
 * 评论：必须双方同意（发起申请 -> 对方通过 -> 才能评论）
 */

const MOCK_BOTTLES = [
  {
    id: 'demo-1',
    ownerName: '阿澜',
    category: 'flower',
    name: '龟背竹',
    species: 'Monstera deliciosa',
    emoji: '🪴',
    story: '去年冬天只剩两片叶子，今年发了第七片，裂得比我还规矩。',
    days: 128,
    photoCount: 96,
    likeCount: 24,
    subCount: 8,
  },
  {
    id: 'demo-2',
    ownerName: '小满',
    category: 'fish',
    name: '斗鱼',
    species: '半月斗鱼',
    emoji: '🐠',
    story: '尾巴从透明养成了深蓝，每天开门它都会冲到缸边。',
    days: 74,
    photoCount: 61,
    likeCount: 41,
    subCount: 13,
  },
  {
    id: 'demo-3',
    ownerName: '老陈',
    category: 'bird',
    name: '玄凤',
    species: '玄凤鹦鹉',
    emoji: '🦜',
    story: '换羽期掉了一地绒毛，现在冠羽长回来了，比之前更翘。',
    days: 210,
    photoCount: 156,
    likeCount: 62,
    subCount: 27,
  },
  {
    id: 'demo-4',
    ownerName: '雨林',
    category: 'insect',
    name: '独角仙',
    species: '双叉犀金龟',
    emoji: '🪲',
    story: '从三龄幼虫养到羽化，第一次看到它把鞘翅撑开的时候有点感动。',
    days: 168,
    photoCount: 88,
    likeCount: 35,
    subCount: 19,
  },
];

const MOCK_KEY = 'gd_bottle_mock_v1';
const STATE_KEY = 'gd_bottle_state_v1';

function readJSON(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    if (!v) return fallback;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, v) {
  try {
    wx.setStorageSync(key, v);
  } catch (e) {
    /* ignore */
  }
}

function cloudReady() {
  const app = getApp();
  return !!(app && app.globalData && app.globalData.cloudReady && wx.cloud);
}

function callCloud(action, payload) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'bottle',
      data: Object.assign({ action }, payload),
      success: (res) => {
        const r = res.result || {};
        if (r.ok) resolve(r.data);
        else reject(new Error(r.error || '操作失败'));
      },
      fail: (err) => reject(new Error(err.errMsg || '网络异常')),
    });
  });
}

/* ------------------------------------------------------------------ *
 * 本地演示状态
 * ------------------------------------------------------------------ */
function getMockState() {
  const s = readJSON(STATE_KEY, null);
  if (s) return s;
  const init = { liked: {}, subscribed: {}, consent: {}, comments: {}, myBottles: [] };
  writeJSON(STATE_KEY, init);
  return init;
}

function saveMockState(s) {
  writeJSON(STATE_KEY, s);
}

function decorateMock(b) {
  const s = getMockState();
  return Object.assign({}, b, {
    cover: '',
    liked: !!s.liked[b.id],
    subscribed: !!s.subscribed[b.id],
    consent: s.consent[b.id] || 'none',
    isOwner: false,
    mock: true,
  });
}

/* ------------------------------------------------------------------ *
 * 对外 API
 * ------------------------------------------------------------------ */

/** 投放一个漂流瓶 */
async function throwBottle(record, options = {}) {
  const story = (options.story || '').slice(0, 200);
  const cover = options.cover || '';

  if (cloudReady()) {
    let coverFileID = '';
    if (cover && cover.indexOf('cloud://') !== 0) {
      const up = await new Promise((resolve, reject) => {
        wx.cloud.uploadFile({
          cloudPath: `bottles/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`,
          filePath: cover,
          success: resolve,
          fail: reject,
        });
      });
      coverFileID = up.fileID;
    } else {
      coverFileID = cover;
    }

    return callCloud('throw', {
      recordLocalId: record.id,
      category: record.category,
      name: record.name,
      species: record.species,
      emoji: record.emoji,
      story,
      days: record.days,
      photoCount: record.photoCount,
      coverFileID,
    });
  }

  // 本地演示：只记在自己的列表里
  const s = getMockState();
  const bottle = {
    id: `mine-${Date.now()}`,
    ownerName: '我',
    category: record.category,
    name: record.name,
    species: record.species,
    emoji: record.emoji,
    story,
    days: record.days,
    photoCount: record.photoCount,
    likeCount: 0,
    subCount: 0,
    cover,
    isOwner: true,
    mock: true,
    createdAt: Date.now(),
  };
  s.myBottles = (s.myBottles || []).concat(bottle);
  saveMockState(s);
  return bottle;
}

/** 捞一个：随机、不重复、不捞自己的 */
async function pickBottle(excludeIds = []) {
  if (cloudReady()) {
    return callCloud('pick', { exclude: excludeIds });
  }
  const pool = MOCK_BOTTLES.filter((b) => excludeIds.indexOf(b.id) < 0);
  const list = pool.length ? pool : MOCK_BOTTLES;
  const pick = list[Math.floor(Math.random() * list.length)];
  return decorateMock(pick);
}

/** 详情（含互动状态） */
async function getBottle(id) {
  if (cloudReady()) {
    return callCloud('detail', { id });
  }
  const mine = (getMockState().myBottles || []).find((b) => b.id === id);
  if (mine) return decorateMock(mine);
  const b = MOCK_BOTTLES.find((x) => x.id === id);
  if (!b) throw new Error('瓶子不见了');
  return decorateMock(b);
}

/** 点赞（切换） */
async function toggleLike(id) {
  if (cloudReady()) return callCloud('like', { id });
  const s = getMockState();
  s.liked[id] = !s.liked[id];
  saveMockState(s);
  return { liked: s.liked[id] };
}

/** 订阅（关注这条生物的后续） */
async function toggleSubscribe(id) {
  if (cloudReady()) return callCloud('subscribe', { id });
  const s = getMockState();
  s.subscribed[id] = !s.subscribed[id];
  saveMockState(s);
  return { subscribed: s.subscribed[id] };
}

/** 申请评论授权 */
async function requestComment(id) {
  if (cloudReady()) return callCloud('requestComment', { id });
  const s = getMockState();
  s.consent[id] = 'pending';
  saveMockState(s);
  // 演示环境里对方 1.4 秒后自动同意，方便把流程走完
  setTimeout(() => {
    const cur = getMockState();
    if (cur.consent[id] === 'pending') {
      cur.consent[id] = 'accepted';
      saveMockState(cur);
    }
  }, 1400);
  return { consent: 'pending' };
}

/** 对方回应授权（真实环境里由瓶子主人调用） */
async function respondConsent(id, accept) {
  if (cloudReady()) return callCloud('respondConsent', { id, accept });
  const s = getMockState();
  s.consent[id] = accept ? 'accepted' : 'rejected';
  saveMockState(s);
  return { consent: s.consent[id] };
}

/** 评论列表 */
async function listComments(id) {
  if (cloudReady()) return callCloud('comments', { id });
  const s = getMockState();
  return s.comments[id] || [];
}

/** 发评论（需要已授权） */
async function addComment(id, content) {
  const text = (content || '').trim().slice(0, 200);
  if (!text) throw new Error('说点什么');

  if (cloudReady()) return callCloud('addComment', { id, content: text });

  const s = getMockState();
  if (s.consent[id] !== 'accepted') throw new Error('对方还没同意互动');
  const list = s.comments[id] || [];
  const c = {
    id: `c-${Date.now()}`,
    name: '我',
    content: text,
    createdAt: Date.now(),
    mine: true,
  };
  s.comments[id] = list.concat(c);
  saveMockState(s);
  return c;
}

/** 我投放的瓶子 */
async function myBottles() {
  if (cloudReady()) return callCloud('mine');
  return getMockState().myBottles || [];
}

/** 我收到的互动申请（等我来同意） */
async function pendingRequests() {
  if (cloudReady()) return callCloud('pending');
  return [];
}

module.exports = {
  cloudReady,
  throwBottle,
  pickBottle,
  getBottle,
  toggleLike,
  toggleSubscribe,
  requestComment,
  respondConsent,
  listComments,
  addComment,
  myBottles,
  pendingRequests,
};
