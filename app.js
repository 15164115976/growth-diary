const store = require('./utils/store');

App({
  globalData: {
    statusBarHeight: 20,
    navBarHeight: 44,
    // 胶囊按钮下沿：页面顶部内容必须从这里之后开始，否则会被微信自己的胶囊挡住
    safeTop: 64,
    menuRight: 0,
    safeBottom: 0,
    windowWidth: 375,
    currentRecordId: '',
    cloudReady: false,
    autoEntered: false,
  },

  onLaunch() {
    this.measureLayout();
    store.init();
    this.initCloud();
  },

  /** 云开发是可选能力：识别与漂流瓶用它，没开通就静默降级 */
  initCloud() {
    if (!wx.cloud) return;
    const settings = store.getSettings();
    try {
      wx.cloud.init({
        env: settings.cloudEnv || undefined,
        traceUser: true,
      });
      this.globalData.cloudReady = true;
    } catch (e) {
      this.globalData.cloudReady = false;
    }
  },

  measureLayout() {
    let win = {};
    try {
      win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    } catch (e) {
      win = {};
    }
    const windowWidth = win.windowWidth || 375;
    const statusBarHeight = win.statusBarHeight || 20;

    let menu = null;
    let navBarHeight = 44;
    let safeTop = statusBarHeight + navBarHeight;

    try {
      if (wx.getMenuButtonBoundingClientRect) {
        menu = wx.getMenuButtonBoundingClientRect();
        if (menu && menu.height) {
          navBarHeight = (menu.top - statusBarHeight) * 2 + menu.height;
          // 胶囊底部再留 8px 呼吸位，顶部内容从这里开始就一定不会压到胶囊
          safeTop = menu.bottom + 8;
        }
      }
    } catch (e) {
      /* 用默认值 */
    }

    let safeBottom = 0;
    if (win.safeArea && win.screenHeight) {
      safeBottom = Math.max(0, win.screenHeight - win.safeArea.bottom);
    }

    this.globalData.statusBarHeight = statusBarHeight;
    this.globalData.navBarHeight = Math.round(navBarHeight);
    this.globalData.safeTop = Math.round(safeTop);
    this.globalData.menuRight = menu && menu.right ? windowWidth - menu.right : 0;
    this.globalData.safeBottom = safeBottom;
    this.globalData.windowWidth = windowWidth;
  },
});
