/**
 * 日期与天数工具
 */

const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

/** 2026-10-22 */
function ymd(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 10/22 */
function md(ts = Date.now()) {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

/** 19:46 */
function hm(ts = Date.now()) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 今天 / 昨天 / 3天前 / 10-12 */
function friendlyDay(ts) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(ts);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff > 2 && diff < 30) return `${diff} 天前`;
  return md(ts);
}

/** 两个时间点相差的自然天数 */
function daysBetween(a, b) {
  const d1 = new Date(a);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(b);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d2 - d1) / 86400000);
}

/** 从起始日到今天的天数（第 N 天，1 起算） */
function dayIndex(startTs, nowTs = Date.now()) {
  return daysBetween(startTs, nowTs) + 1;
}

/** 距离上次某件事过去了几天 */
function sinceDays(ts, nowTs = Date.now()) {
  if (!ts) return null;
  return daysBetween(ts, nowTs);
}

/** 星期几 */
function weekday(ts = Date.now()) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(ts).getDay()];
}

module.exports = {
  pad,
  ymd,
  md,
  hm,
  friendlyDay,
  daysBetween,
  dayIndex,
  sinceDays,
  weekday,
};
