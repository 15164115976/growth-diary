/**
 * 云函数 bottle —— 漂流瓶的全部动作
 *
 * 部署：微信开发者工具 → 右键 cloudfunctions/bottle → 上传并部署（云端安装依赖）
 * 需要先创建 4 个集合：bottles / bottle_interactions / bottle_consents / bottle_comments
 * 权限建议统一设为「仅创建者可读写」，所有读写都走本云函数，越权逻辑在这里挡。
 */
const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

const C = {
  bottles: () => db.collection('bottles'),
  inter: () => db.collection('bottle_interactions'),
  consent: () => db.collection('bottle_consents'),
  comments: () => db.collection('bottle_comments'),
};

const ok = (data) => ({ ok: true, data });
const fail = (error) => ({ ok: false, error });

function pack(doc, extra) {
  return Object.assign(
    {
      id: doc._id,
      category: doc.category,
      name: doc.name,
      species: doc.species || '',
      emoji: doc.emoji || '',
      story: doc.story || '',
      days: doc.days || 0,
      photoCount: doc.photoCount || 0,
      likeCount: doc.likeCount || 0,
      subCount: doc.subCount || 0,
      cover: doc.coverFileID || '',
      ownerName: doc.ownerName || '某个养东西的人',
      createdAt: doc.createdAt || 0,
    },
    extra || {}
  );
}

/* ---------------- 投放 ---------------- */
async function throwBottle(event, openid) {
  if (!event.name || !event.category) return fail('缺少必要信息');

  const exist = await C.bottles()
    .where({ ownerOpenid: openid, recordLocalId: event.recordLocalId })
    .get();

  const data = {
    ownerOpenid: openid,
    recordLocalId: event.recordLocalId || '',
    category: event.category,
    name: String(event.name).slice(0, 40),
    species: String(event.species || '').slice(0, 60),
    emoji: event.emoji || '',
    story: String(event.story || '').slice(0, 200),
    days: event.days || 0,
    photoCount: event.photoCount || 0,
    coverFileID: event.coverFileID || '',
    status: 'active',
    updatedAt: Date.now(),
  };

  // 同一条记录只保留一只，重复投放就更新内容
  if (exist.data.length) {
    const id = exist.data[0]._id;
    await C.bottles().doc(id).update({ data });
    return ok({ id });
  }

  const res = await C.bottles().add({ data: Object.assign(data, { likeCount: 0, subCount: 0, createdAt: Date.now() }) });
  return ok({ id: res._id });
}

/* ---------------- 捞一个 ---------------- */
async function pick(event, openid) {
  const exclude = Array.isArray(event.exclude) ? event.exclude.slice(0, 30) : [];
  const where = {
    status: 'active',
    ownerOpenid: _.neq(openid),
  };
  if (exclude.length) where._id = _.nin(exclude);

  const res = await C.bottles()
    .aggregate()
    .match(where)
    .sample({ size: 1 })
    .end();

  if (!res.list || !res.list.length) return ok(null);

  const doc = res.list[0];
  const mine = await C.inter().where({ bottleId: doc._id, openid }).get();
  const liked = mine.data.some((x) => x.type === 'like');
  const subscribed = mine.data.some((x) => x.type === 'subscribe');
  const consentDoc = await C.consent().where({ bottleId: doc._id, requesterOpenid: openid }).get();

  return ok(
    pack(doc, {
      liked,
      subscribed,
      consent: consentDoc.data.length ? consentDoc.data[0].status : 'none',
      isOwner: false,
    })
  );
}

/* ---------------- 详情 ---------------- */
async function detail(event, openid) {
  const res = await C.bottles().doc(event.id).get().catch(() => null);
  if (!res || !res.data) return fail('瓶子不见了');

  const doc = res.data;
  const isOwner = doc.ownerOpenid === openid;
  const mine = await C.inter().where({ bottleId: event.id, openid }).get();
  const consentDoc = await C.consent().where({ bottleId: event.id, requesterOpenid: openid }).get();

  return ok(
    pack(doc, {
      liked: mine.data.some((x) => x.type === 'like'),
      subscribed: mine.data.some((x) => x.type === 'subscribe'),
      consent: isOwner
        ? 'owner'
        : consentDoc.data.length
        ? consentDoc.data[0].status
        : 'none',
      isOwner,
    })
  );
}

/* ---------------- 点赞 / 订阅 ---------------- */
async function toggleInter(event, openid, type) {
  const { id } = event;
  if (!id) return fail('缺少瓶子 id');

  const exist = await C.inter().where({ bottleId: id, openid, type }).get();
  const field = type === 'like' ? 'likeCount' : 'subCount';

  if (exist.data.length) {
    await C.inter().doc(exist.data[0]._id).remove();
    await C.bottles()
      .doc(id)
      .update({ data: { [field]: _.inc(-1) } })
      .catch(() => {});
    return ok({ [type]: false });
  }

  await C.inter().add({
    data: { bottleId: id, openid, type, createdAt: Date.now() },
  });
  await C.bottles()
    .doc(id)
    .update({ data: { [field]: _.inc(1) } })
    .catch(() => {});
  return ok({ [type]: true });
}

/* ---------------- 评论授权 ---------------- */
async function requestComment(event, openid) {
  const { id } = event;
  const bottle = await C.bottles().doc(id).get().catch(() => null);
  if (!bottle || !bottle.data) return fail('瓶子不见了');
  if (bottle.data.ownerOpenid === openid) return ok({ consent: 'owner' });

  const exist = await C.consent().where({ bottleId: id, requesterOpenid: openid }).get();
  if (exist.data.length) {
    const cur = exist.data[0];
    if (cur.status === 'accepted') return ok({ consent: 'accepted' });
    if (cur.status === 'pending') return ok({ consent: 'pending' });
    await C.consent().doc(cur._id).update({ data: { status: 'pending', updatedAt: Date.now() } });
    return ok({ consent: 'pending' });
  }

  await C.consent().add({
    data: {
      bottleId: id,
      ownerOpenid: bottle.data.ownerOpenid,
      requesterOpenid: openid,
      requesterName: event.name || '',
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  return ok({ consent: 'pending' });
}

/** 瓶子主人同意 / 拒绝 */
async function respondConsent(event, openid) {
  const { id, accept, requesterOpenid } = event;
  const bottle = await C.bottles().doc(id).get().catch(() => null);
  if (!bottle || !bottle.data) return fail('瓶子不见了');
  if (bottle.data.ownerOpenid !== openid) return fail('只有瓶子主人可以回应');

  const q = { bottleId: id };
  if (requesterOpenid) q.requesterOpenid = requesterOpenid;
  const list = await C.consent().where(q).get();
  if (!list.data.length) return fail('没有待处理的申请');

  await Promise.all(
    list.data.map((c) =>
      C.consent()
        .doc(c._id)
        .update({ data: { status: accept ? 'accepted' : 'rejected', updatedAt: Date.now() } })
    )
  );
  return ok({ consent: accept ? 'accepted' : 'rejected' });
}

/** 我收到的待处理申请 */
async function pending(event, openid) {
  const list = await C.consent().where({ ownerOpenid: openid, status: 'pending' }).get();
  const bottleIds = list.data.map((c) => c.bottleId);
  if (!bottleIds.length) return ok([]);

  const bottles = await C.bottles().where({ _id: _.in(bottleIds) }).get();
  const map = {};
  bottles.data.forEach((b) => {
    map[b._id] = b;
  });

  return ok(
    list.data.map((c) => ({
      consentId: c._id,
      bottleId: c.bottleId,
      bottleName: map[c.bottleId] ? map[c.bottleId].name : '已下架的瓶子',
      requesterOpenid: c.requesterOpenid,
      createdAt: c.createdAt,
    }))
  );
}

/* ---------------- 评论 ---------------- */
async function comments(event) {
  const list = await C.comments().where({ bottleId: event.id }).orderBy('createdAt', 'asc').limit(100).get();
  return ok(
    list.data.map((c) => ({
      id: c._id,
      name: c.name || '匿名',
      content: c.content,
      createdAt: c.createdAt,
      mine: false,
    }))
  );
}

async function addComment(event, openid) {
  const { id } = event;
  const content = String(event.content || '').trim().slice(0, 200);
  if (!content) return fail('说点什么');

  const bottle = await C.bottles().doc(id).get().catch(() => null);
  if (!bottle || !bottle.data) return fail('瓶子不见了');

  const isOwner = bottle.data.ownerOpenid === openid;
  if (!isOwner) {
    const list = await C.consent().where({ bottleId: id, requesterOpenid: openid }).get();
    const accepted = list.data.some((c) => c.status === 'accepted');
    if (!accepted) return fail('对方还没同意互动');
  }

  const res = await C.comments().add({
    data: {
      bottleId: id,
      openid,
      name: isOwner ? '瓶子主人' : event.name || '路过的人',
      content,
      createdAt: Date.now(),
    },
  });
  return ok({ id: res._id });
}

/* ---------------- 我投放的 ---------------- */
async function mine(event, openid) {
  const list = await C.bottles().where({ ownerOpenid: openid }).orderBy('createdAt', 'desc').limit(50).get();
  return ok(list.data.map((d) => pack(d, { isOwner: true })));
}

/* ---------------- 入口 ---------------- */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return fail('拿不到用户身份');

  try {
    switch (event.action) {
      case 'throw':
        return await throwBottle(event, OPENID);
      case 'pick':
        return await pick(event, OPENID);
      case 'detail':
        return await detail(event, OPENID);
      case 'like':
        return await toggleInter(event, OPENID, 'like');
      case 'subscribe':
        return await toggleInter(event, OPENID, 'subscribe');
      case 'requestComment':
        return await requestComment(event, OPENID);
      case 'respondConsent':
        return await respondConsent(event, OPENID);
      case 'pending':
        return await pending(event, OPENID);
      case 'comments':
        return await comments(event);
      case 'addComment':
        return await addComment(event, OPENID);
      case 'mine':
        return await mine(event, OPENID);
      default:
        return fail('未知操作');
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
