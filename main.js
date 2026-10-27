const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}
app.setAppUserModelId('com.amaan.hydro');

const ICON = path.join(__dirname, 'assets', 'icon.png');
const storeFile = () => path.join(app.getPath('userData'), 'hydro.json');

const TYPES = ['water', 'tea', 'herbal', 'coffee', 'other'];
const COFFEE_LIMIT_ML = 1000; // about 4 cups; warning only, still counts toward goal
const WELLNESS_MIN = 90;      // after goal is reached, a break reminder this often

// generic wellness tips. from/to = hour range (from <= hour < to); no range = any time.
// namaz tips are generic: this app does not know prayer times, your Azan app does.
const TIPS = [
  { t: 'Stand up and walk for 2-3 minutes. Stretch your neck and shoulders.' },
  { t: 'Look at something far away for 20 seconds to rest your eyes.' },
  { t: 'Take a short walk, even around the room. Long sitting strains your back.' },
  { t: 'Pray namaz on time. Step away from the screen, even for a few minutes.' },
  { t: 'Namaz is a break for body and mind. Do not delay it for work.' },
  { t: 'Check your Azan app and make wudu for the next prayer.' },
  { t: 'Sip water slowly through the day. Do not gulp it all at once.' },
  { t: 'Tea and coffee count, but make water your main drink.' },
  { t: 'Keep a fixed sleep and wake time. It helps energy more than extra coffee.' },
  { t: 'Have a proper breakfast. Protein and fruit beat sugar.', from: 8, to: 11 },
  { t: 'Lunch time: eat a proper meal. Do not skip it.', from: 12, to: 15 },
  { t: 'Pick fruit or nuts over sugary or fried snacks.', from: 15, to: 18 },
  { t: 'Eat an early, light dinner. Finish 2-3 hours before sleep.', from: 19, to: 22 },
  { t: 'Wind down: dim screens, finish work, aim for 7-8 hours of sleep tonight.', from: 20, to: 22 },
];

const DEFAULTS = {
  settings: { weightKg: null, activityBump: 0, goalMl: 2500, intervalMin: 45, popupSec: 30, wakeStart: 8, wakeEnd: 22, autoStart: true },
  days: {},
  lastRemindAt: 0,
  snoozeUntil: 0,
  selectedType: 'water',
  tipCounter: 0,
  currentTip: '',
  popupMode: 'drink',
};

let state;
let tray, mainWin, popupWin, popupTimer;
let quitting = false;

function load() {
  try {
    const s = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    state = { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...s.settings } };
  } catch {
    state = structuredClone(DEFAULTS);
  }
}
function save() {
  try { fs.writeFileSync(storeFile(), JSON.stringify(state, null, 2)); } catch (e) { console.error('save failed', e); }
}

const dayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const entries = () => state.days[dayKey()] || [];
const total = () => entries().reduce((s, e) => s + e.ml, 0);

// old entries have no type: they count as water
function byType() {
  const o = { water: 0, tea: 0, herbal: 0, coffee: 0, other: 0 };
  for (const e of entries()) o[TYPES.includes(e.type) ? e.type : 'water'] += e.ml;
  return o;
}

function snapshot() {
  const t = total();
  const goal = state.settings.goalMl;
  const bt = byType();
  return {
    settings: state.settings,
    entries: entries(),
    total: t,
    goal,
    remaining: Math.max(0, goal - t),
    reached: t >= goal,
    byType: bt,
    coffeeWarn: bt.coffee >= COFFEE_LIMIT_ML,
    selectedType: state.selectedType,
    tip: state.currentTip,
    mode: state.popupMode,
    ...nextReminder(),
  };
}
function broadcast() {
  const s = snapshot();
  [mainWin, popupWin].forEach(w => { if (w && !w.isDestroyed()) w.webContents.send('state', s); });
  if (tray) tray.setToolTip(`Hydro - ${s.total}/${s.goal} ml${s.reached ? ' (goal reached)' : ''}`);
}

// logs with the currently selected drink type, then resets selection to water
function addWater(ml) {
  const type = TYPES.includes(state.selectedType) ? state.selectedType : 'water';
  state.selectedType = 'water';
  const prev = total();
  const k = dayKey();
  (state.days[k] = state.days[k] || []).push({ ml, at: Date.now(), type });
  state.snoozeUntil = 0; // drinking cancels any pending snooze
  // goal just reached: start the break-reminder clock now, not from an old popup
  if (prev < state.settings.goalMl && total() >= state.settings.goalMl) state.lastRemindAt = Date.now();
  save();
  broadcast();
}

// ---- scheduler -----------------------------------------------------------
function pickTip() {
  const h = new Date().getHours();
  const pool = TIPS.filter(x => x.from === undefined || (h >= x.from && h < x.to));
  const tip = pool[state.tipCounter % pool.length].t;
  state.tipCounter++;
  return tip;
}

// mirrors tick(): when will the next popup fire? used for the dashboard countdown
function nextReminder() {
  const s = state.settings;
  const now = Date.now();
  const d = new Date();
  const startToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.wakeStart).getTime();
  const endToday = new Date(d.getFullYear(), d.getMonth(), d.getDate(), s.wakeEnd).getTime();
  const startTomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, s.wakeStart).getTime();
  if (now < startToday) return { nextAt: startToday, note: 'wake' };
  if (now >= endToday) return { nextAt: startTomorrow, note: 'wake' };

  const reached = total() >= s.goalMl;
  let at;
  if (state.snoozeUntil > now) {
    at = state.snoozeUntil;
  } else if (state.snoozeUntil) {
    at = now; // snooze just ended, fires on next tick
  } else if (reached) {
    at = Math.max(now, state.lastRemindAt + WELLNESS_MIN * 60000);
  } else {
    const list = entries();
    const lastDrink = list.length ? list[list.length - 1].at : 0;
    const base = Math.max(state.lastRemindAt, lastDrink);
    const behind = total() < expectedByNow();
    const threshold = behind ? Math.max(1, s.intervalMin / 2) : s.intervalMin;
    at = Math.max(now, base + threshold * 60000);
  }
  if (at >= endToday) return { nextAt: startTomorrow, note: 'wake' };
  return { nextAt: at, note: reached ? 'wellness' : 'interval' };
}

function expectedByNow() {
  const { wakeStart, wakeEnd, goalMl } = state.settings;
  const n = new Date();
  const h = n.getHours() + n.getMinutes() / 60;
  if (h <= wakeStart) return 0;
  if (h >= wakeEnd) return goalMl;
  return goalMl * (h - wakeStart) / (wakeEnd - wakeStart);
}

function tick() {
  const { intervalMin, wakeStart, wakeEnd, goalMl } = state.settings;
  const now = Date.now();
  const hour = new Date().getHours();
  if (hour < wakeStart || hour >= wakeEnd) return;
  if (now < state.snoozeUntil) return;
  if (state.snoozeUntil && now >= state.snoozeUntil) {
    // snooze ended: remind right now, regardless of the normal interval
    state.snoozeUntil = 0;
    save();
    showPopup();
    return;
  }
  if (total() >= goalMl) {
    // goal done: no drink popups, only an occasional wellness break
    if (now - state.lastRemindAt >= WELLNESS_MIN * 60000) showPopup('wellness');
    return;
  }

  const list = entries();
  const lastDrink = list.length ? list[list.length - 1].at : 0;
  const since = (now - Math.max(state.lastRemindAt, lastDrink)) / 60000;
  const behind = total() < expectedByNow();
  const threshold = behind ? Math.max(1, intervalMin / 2) : intervalMin;
  if (since >= threshold) showPopup('drink');
}

function showPopup(mode) {
  mode = mode || (total() >= state.settings.goalMl ? 'wellness' : 'drink');
  state.popupMode = mode;
  state.currentTip = pickTip();
  state.lastRemindAt = Date.now();
  save();
  broadcast(); // refresh the dashboard countdown
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();

  const wa = screen.getPrimaryDisplay().workArea;
  const w = 420, h = mode === 'wellness' ? 260 : 350;
  popupWin = new BrowserWindow({
    width: w, height: h, useContentSize: true,
    x: wa.x + wa.width - w - 16,
    y: wa.y + wa.height - h - 16,
    frame: false, resizable: false, minimizable: false, maximizable: false,
    alwaysOnTop: true, skipTaskbar: true, show: false, icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  popupWin.setAlwaysOnTop(true, 'screen-saver');
  popupWin.loadFile('popup.html');
  // showInactive: appear without stealing keyboard focus from what you are typing
  popupWin.once('ready-to-show', () => popupWin.showInactive());
  popupWin.on('closed', () => { clearTimeout(popupTimer); popupWin = null; });
  clearTimeout(popupTimer);
  popupTimer = setTimeout(closePopup, Math.max(3, state.settings.popupSec || 30) * 1000);
}
function closePopup() {
  if (popupWin && !popupWin.isDestroyed()) popupWin.close();
}

// ---- windows ---------------------------------------------------------------
function createMain(show) {
  mainWin = new BrowserWindow({
    width: 940, height: 660, useContentSize: true, minWidth: 900, minHeight: 620, show, icon: ICON, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWin.loadFile('index.html');
  // close = hide to tray, like the azan app. Real exit only via tray > Quit.
  mainWin.on('close', e => { if (!quitting) { e.preventDefault(); mainWin.hide(); } });
}
function showMain() {
  if (!mainWin || mainWin.isDestroyed()) createMain(true);
  mainWin.show();
  mainWin.focus();
}

function createTray() {
  const img = nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Hydro', click: showMain },
    { type: 'separator' },
    { label: '+250 ml', click: () => addWater(250) },
    { label: '+500 ml', click: () => addWater(500) },
    { label: 'Remind me now', click: () => showPopup() },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showMain);
}

function applyAutoStart() {
  // only meaningful for the installed build; in dev it would register electron.exe
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: !!state.settings.autoStart, args: ['--hidden'] });
}

// ---- IPC -------------------------------------------------------------------
ipcMain.handle('get-state', () => snapshot());
ipcMain.handle('add', (_, ml) => { if (Number.isFinite(ml) && ml > 0 && ml < 5000) addWater(Math.round(ml)); });
ipcMain.handle('set-type', (_, t) => {
  if (TYPES.includes(t)) { state.selectedType = t; save(); broadcast(); }
});
ipcMain.handle('undo', () => {
  const list = state.days[dayKey()];
  if (list && list.length) { list.pop(); save(); broadcast(); }
});
ipcMain.handle('save-settings', (_, patch) => {
  const s = state.settings;
  const num = (v, lo, hi, fb) => (Number.isFinite(v) && v >= lo && v <= hi ? v : fb);
  s.goalMl = num(patch.goalMl, 500, 10000, s.goalMl);
  s.intervalMin = num(patch.intervalMin, 1, 480, s.intervalMin);
  s.popupSec = num(patch.popupSec, 3, 600, s.popupSec);
  s.wakeStart = num(patch.wakeStart, 0, 23, s.wakeStart);
  s.wakeEnd = num(patch.wakeEnd, 1, 24, s.wakeEnd);
  if (patch.weightKg !== undefined) s.weightKg = patch.weightKg;
  if (patch.activityBump !== undefined) s.activityBump = patch.activityBump;
  if (patch.autoStart !== undefined) s.autoStart = !!patch.autoStart;
  save(); applyAutoStart(); broadcast();
});
ipcMain.handle('calc-goal', (_, weightKg, activityBump) => {
  if (!(weightKg >= 30 && weightKg <= 300)) return null;
  const goal = Math.round((weightKg * 35 + activityBump) / 50) * 50;
  state.settings.weightKg = weightKg;
  state.settings.activityBump = activityBump;
  state.settings.goalMl = goal;
  save(); broadcast();
  return goal;
});
ipcMain.handle('snooze', (_, min) => { state.snoozeUntil = Date.now() + min * 60000; save(); broadcast(); closePopup(); });
ipcMain.handle('close-popup', () => closePopup());
ipcMain.handle('remind-now', () => showPopup());
ipcMain.handle('show-main', () => { closePopup(); showMain(); });

// ---- lifecycle -------------------------------------------------------------
app.on('second-instance', showMain);
app.whenReady().then(() => {
  load();
  createTray();
  applyAutoStart();
  createMain(!process.argv.includes('--hidden'));
  setInterval(tick, 5 * 1000);
  setInterval(broadcast, 60 * 1000); // keeps tray tooltip right after midnight rollover
});
// stay alive in tray when all windows are closed/hidden
app.on('window-all-closed', e => e.preventDefault());
