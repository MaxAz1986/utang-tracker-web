const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

const dataFile = () => path.join(app.getPath('userData'), 'utang-data.json');
let win;

if (!app.requestSingleInstanceLock()) { app.quit(); }
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const winFile = () => path.join(app.getPath('userData'), 'window.json');

// Size the window to the screen it opens on: about 90% of the usable area,
// maximized on small screens, and restored to the user's last size and place.
function initialBounds() {
  const { screen } = require('electron');
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(winFile(), 'utf8')); } catch {}
  if (saved && saved.width && saved.height) {
    const area = screen.getDisplayMatching(saved).workArea;
    const visible = saved.x < area.x + area.width - 100 && saved.x + saved.width > area.x + 100 &&
                    saved.y >= area.y - 20 && saved.y < area.y + area.height - 100;
    if (visible) return { bounds: { x: saved.x, y: saved.y, width: Math.min(saved.width, area.width), height: Math.min(saved.height, area.height) }, maximized: !!saved.maximized };
  }
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  // First launch: fill the whole screen (maximized) on any monitor size.
  return { bounds: { ...area }, maximized: true };
}
function rememberBounds() {
  if (!win || win.isDestroyed()) return;
  const b = win.isMaximized() || win.isFullScreen() ? win.getNormalBounds() : win.getBounds();
  try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); let cur = {}; try { cur = JSON.parse(fs.readFileSync(winFile(), 'utf8')); } catch {} fs.writeFileSync(winFile(), JSON.stringify({ ...cur, ...b, maximized: win.isMaximized() })); } catch {}
}

function createWindow() {
  const start = initialBounds();
  win = new BrowserWindow({
    ...start.bounds, minWidth: 380, minHeight: 520, show: false,
    title: 'Utang Tracker',
    icon: path.join(__dirname, 'app', 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#111022' : '#F3F4FA',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  if (start.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  // Zoom with Ctrl + / Ctrl − / Ctrl 0 and Ctrl + mouse wheel; the level is remembered.
  let zoom = 0;
  try { zoom = JSON.parse(fs.readFileSync(winFile(), 'utf8')).zoom || 0; } catch {}
  const setZoom = z => { zoom = Math.max(-3, Math.min(4, z)); win.webContents.setZoomLevel(zoom);
    try { const cur = JSON.parse(fs.readFileSync(winFile(), 'utf8')); fs.writeFileSync(winFile(), JSON.stringify({ ...cur, zoom })); } catch { try { fs.writeFileSync(winFile(), JSON.stringify({ zoom })); } catch {} } };
  win.webContents.on('did-finish-load', () => win.webContents.setZoomLevel(zoom));
  win.webContents.on('before-input-event', (e, i) => {
    if (!i.control || i.type !== 'keyDown') return;
    if (i.key === '=' || i.key === '+') { setZoom(zoom + 0.5); e.preventDefault(); }
    else if (i.key === '-') { setZoom(zoom - 0.5); e.preventDefault(); }
    else if (i.key === '0') { setZoom(0); e.preventDefault(); }
  });
  win.webContents.on('zoom-changed', (_e, dir) => setZoom(zoom + (dir === 'in' ? 0.5 : -0.5)));

  let t; const later = () => { clearTimeout(t); t = setTimeout(rememberBounds, 400); };
  win.on('resize', later); win.on('move', later); win.on('close', rememberBounds);

  // Links to websites open in the normal browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
}

ipcMain.on('load', e => {
  try { e.returnValue = fs.readFileSync(dataFile(), 'utf8'); } catch { e.returnValue = null; }
});
ipcMain.on('save', (e, json) => {
  try {
    const f = dataFile(), tmp = f + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak');   // keep the previous save as a safety copy
    fs.writeFileSync(tmp, json, 'utf8');
    fs.renameSync(tmp, f);
  } catch (err) { console.error('save failed', err); }
});
ipcMain.on('share', async (e, subject, text) => {
  const r = await dialog.showSaveDialog(win, {
    title: 'Save backup',
    defaultPath: path.join(app.getPath('documents'), (subject || 'Utang Tracker backup') + '.json'),
    filters: [{ name: 'Utang Tracker backup', extensions: ['json'] }]
  });
  if (!r.canceled && r.filePath) { try { fs.writeFileSync(r.filePath, text, 'utf8'); e.sender.send('backup-saved', r.filePath); } catch (err) { e.sender.send('backup-saved', ''); } }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
