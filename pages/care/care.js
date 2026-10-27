const store = require('../../utils/store');
const dateUtil = require('../../utils/date');

/** 建议养护周期（天），用于提醒；0 表示不提醒 */
const CARE_CYCLE = {
  feed: 1,
  water: 3,
  clean: 7,
  light: 2,
  med: 0,
  other: 0,
};

Page({
  data: {
    id: '',
    record: null,
    tab: 'manual',
    statusBarHeight: 20,
    safeTop: 64,
    safeBottom: 0,
    manual: [],
    openIds: [],
    careTypes: [],
    cycles: [],
    groups: [],
    logCount: 0,

    planItems: [],
    planDirty: false,

    editorVisible: false,
    editorMode: 'add', // add | edit
    editorIndex: -1,
    draftTitle: '',
    draftBody: '',
  },

  onLoad(options) {
    const app = getApp();
    const id = options.id || '';
    const raw = store.getRecord(id);
    if (!raw) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    this.setData({
      id,
      statusBarHeight: app.globalData.statusBarHeight,
      safeTop: app.globalData.safeTop,
      safeBottom: app.globalData.safeBottom,
      tab: options.tab === 'log' ? 'log' : 'manual',
    });
    this.load();
  },

  onShow() {
    if (this.data.id) this.load();
  },

  load() {
    const raw = store.getRecord(this.data.id);
    if (!raw) return;
    const record = store.decorate(raw);
    const logs = (record.careLogs || []).slice().sort((a, b) => b.ts - a.ts);

    // 按日期分组
    const map = {};
    logs.forEach((l) => {
      const key = dateUtil.ymd(l.ts);
      if (!map[key]) map[key] = [];
      map[key].push(
        Object.assign({}, l, {
          time: dateUtil.hm(l.ts),
          typeName: store.careTypeOf(l.type).name,
          typeIcon: store.careTypeOf(l.type).icon,
          typeColor: store.careTypeOf(l.type).color,
        })
      );
    });
    const groups = Object.keys(map)
      .sort((a, b) => (a < b ? 1 : -1))
      .map((k) => ({
        date: k,
        label: dateUtil.friendlyDay(new Date(k.replace(/-/g, '/')).getTime()),
        items: map[k],
      }));

    const plan = record.carePlan || {};

    // 养护周期概览：以自定义计划为准，没设计划的就当作不提醒
    const cycles = store.CARE_TYPES.map((t) => {
      const last = record.lastCare[t.key] || 0;
      const since = last ? dateUtil.sinceDays(last) : null;
      const p = plan[t.key] || {};
      const need = p.enabled ? p.every || 0 : 0;
      const overdue = need > 0 && (since === null || since >= need);
      return {
        key: t.key,
        name: t.name,
        icon: t.icon,
        color: t.color,
        since,
        need,
        overdue,
        amount: p.amount || '',
        sinceText: since === null ? '还没记录' : since === 0 ? '今天' : `${since} 天前`,
      };
    });

    const openIds = this.data.openIds.length
      ? this.data.openIds
      : record.manual[0]
      ? [record.manual[0].id]
      : [];
    const manual = (record.manual || []).map((m) => ({
      id: m.id,
      title: m.title,
      body: m.body,
      open: openIds.indexOf(m.id) > -1,
    }));

    const planItems = store.CARE_TYPES.map((t) => {
      const item = plan[t.key] || {};
      return {
        key: t.key,
        name: t.name,
        icon: t.icon,
        color: t.color,
        enabled: !!item.enabled,
        every: item.every || 0,
        amount: item.amount || '',
      };
    });

    this.setData({
      record,
      manual,
      openIds,
      groups,
      cycles,
      logCount: logs.length,
      careTypes: store.CARE_TYPES,
      planItems,
      planDirty: false,
    });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  /* ---------------- 手册 ---------------- */
  toggleFold(e) {
    const index = e.currentTarget.dataset.index;
    const key = `manual[${index}].open`;
    this.setData({ [key]: !this.data.manual[index].open });
  },

  openAdd() {
    this.setData({
      editorVisible: true,
      editorMode: 'add',
      editorIndex: -1,
      draftTitle: '',
      draftBody: '',
    });
  },

  openEdit(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.manual[index];
    this.setData({
      editorVisible: true,
      editorMode: 'edit',
      editorIndex: index,
      draftTitle: item.title,
      draftBody: item.body,
    });
  },

  closeEditor() {
    this.setData({ editorVisible: false });
  },

  onTitleInput(e) {
    this.setData({ draftTitle: e.detail.value });
  },

  onBodyInput(e) {
    this.setData({ draftBody: e.detail.value });
  },

  saveManual() {
    const title = (this.data.draftTitle || '').trim();
    const body = (this.data.draftBody || '').trim();
    if (!title) {
      wx.showToast({ title: '写个标题', icon: 'none' });
      return;
    }
    const manual = this.data.manual.slice();
    if (this.data.editorMode === 'add') {
      manual.push({ id: store.uid('man'), title, body, builtin: false });
    } else {
      manual[this.data.editorIndex] = Object.assign({}, manual[this.data.editorIndex], { title, body });
    }
    store.saveManual(this.data.id, manual);
    this.setData({ editorVisible: false });
    this.load();
    wx.showToast({ title: '已保存', icon: 'none' });
  },

  deleteManual() {
    wx.showModal({
      title: '删除这条要点？',
      confirmColor: '#C7574E',
      success: (res) => {
        if (!res.confirm) return;
        const manual = this.data.manual.slice();
        manual.splice(this.data.editorIndex, 1);
        store.saveManual(this.data.id, manual);
        this.setData({ editorVisible: false });
        this.load();
      },
    });
  },

  resetManual() {
    wx.showModal({
      title: '恢复默认手册？',
      content: '会覆盖你当前的手册内容，恢复成该分类的默认模板。',
      success: (res) => {
        if (!res.confirm) return;
        const cat = store.categoryOf(this.data.record.category);
        const tpl = (store.MANUAL_TEMPLATES[cat.key] || []).map((m) => ({
          id: store.uid('man'),
          title: m.title,
          body: m.body,
          builtin: true,
        }));
        store.saveManual(this.data.id, tpl);
        this.load();
        wx.showToast({ title: '已恢复默认', icon: 'none' });
      },
    });
  },

  /* ---------------- 养护计划 ---------------- */
  togglePlan(e) {
    const key = e.currentTarget.dataset.key;
    const idx = this.data.planItems.findIndex((x) => x.key === key);
    if (idx < 0) return;
    const enabled = e.detail.value;
    const item = this.data.planItems[idx];
    const patch = { [`planItems[${idx}].enabled`]: enabled, planDirty: true };
    if (enabled && !item.every) patch[`planItems[${idx}].every`] = 1;
    this.setData(patch);
  },

  onEvery(e) {
    const key = e.currentTarget.dataset.key;
    const idx = this.data.planItems.findIndex((x) => x.key === key);
    if (idx < 0) return;
    let v = parseInt(e.detail.value, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (v > 365) v = 365;
    this.setData({ [`planItems[${idx}].every`]: v, planDirty: true });
  },

  onAmount(e) {
    const key = e.currentTarget.dataset.key;
    const idx = this.data.planItems.findIndex((x) => x.key === key);
    if (idx < 0) return;
    this.setData({ [`planItems[${idx}].amount`]: e.detail.value, planDirty: true });
  },

  savePlan() {
    const plan = {};
    this.data.planItems.forEach((item) => {
      plan[item.key] = {
        enabled: !!item.enabled,
        every: item.enabled ? item.every || 1 : 0,
        amount: item.amount || '',
      };
    });
    store.saveCarePlan(this.data.id, plan);
    this.setData({ planDirty: false });
    wx.showToast({ title: '计划已保存', icon: 'success' });
    this.load();
  },

  resetPlan() {
    wx.showModal({
      title: '恢复推荐计划？',
      content: '会按这类生物重新给一份推荐的周期和用量，你现在的设置会被覆盖。',
      success: (res) => {
        if (!res.confirm) return;
        const cat = store.categoryOf(this.data.record.category);
        store.saveCarePlan(this.data.id, store.defaultCarePlan(cat.key));
        this.load();
        wx.showToast({ title: '已恢复推荐', icon: 'none' });
      },
    });
  },

  /* ---------------- 打卡 ---------------- */
  checkIn(e) {
    const { type } = e.currentTarget.dataset;
    this.setData({ tab: 'log' });
    wx.showModal({
      title: `记录一次${store.careTypeOf(type).name}`,
      editable: true,
      placeholderText: '备注（可留空）',
      confirmText: '记下',
      success: (res) => {
        if (!res.confirm) return;
        store.addCareLog(this.data.id, { type, note: res.content || '' });
        this.load();
        wx.vibrateShort && wx.vibrateShort({ type: 'light' });
        wx.showToast({ title: '已打卡', icon: 'success' });
      },
    });
  },

  deleteLog(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除这条记录？',
      confirmColor: '#C7574E',
      success: (res) => {
        if (!res.confirm) return;
        store.removeCareLog(this.data.id, id);
        this.load();
      },
    });
  },

  /* ---------------- 拍照 ---------------- */
  goCapture() {
    wx.navigateTo({ url: `/pages/capture/capture?id=${this.data.id}` });
  },
});
