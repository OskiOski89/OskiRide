const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('node:url');

const appPage = path.join(__dirname, 'index.html');
const appPageUrl = pathToFileURL(appPage).href;
const studioPageUrl = pathToFileURL(path.join(__dirname, 'grafika', 'index.html')).href;
const stravaUploadUrl = 'https://www.strava.com/upload/select';
const localPages = new Set([appPageUrl, studioPageUrl]);

// Enable Web Bluetooth API in Electron on Windows & macOS
app.commandLine.appendSwitch('enable-experimental-web-platform-features');
app.commandLine.appendSwitch('enable-web-bluetooth');

function createWindow() {
  const iconFile = process.platform === 'win32' ? 'oskiride-icon.ico' : 'oskiride-icon.png';
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'OskiRide — 3D Cycling Simulator',
    backgroundColor: '#172B23',
    icon: path.join(__dirname, 'grafika', 'marka-oskiride', iconFile),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      preload: path.join(__dirname, 'shifter-preload.cjs'),
      additionalArguments: [`--oskiride-ride-url=${appPageUrl}`],
    },
  });

  const contents = mainWindow.webContents;
  let controllerScan = null;
  let bluetoothCallback = null;
  let bluetoothScanTimeout = null;

  function isRideFrame(frame) {
    return Boolean(frame && frame === contents.mainFrame && frame.url.split('#', 1)[0] === appPageUrl);
  }

  function requireOskiRideFrame(event) {
    if (event.sender !== contents || !isRideFrame(event.senderFrame)) {
      throw new Error('Device connections are available in the OskiRide window.');
    }
  }

  function enforceLocalNavigation(details) {
    if (!details.isMainFrame || !localPages.has(details.url.split('#', 1)[0])) details.preventDefault();
  }

  contents.on('will-frame-navigate', enforceLocalNavigation);
  contents.on('will-navigate', enforceLocalNavigation);
  contents.on('will-redirect', enforceLocalNavigation);
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    if (url === stravaUploadUrl && isRideFrame(contents.mainFrame)) {
      void shell.openExternal(stravaUploadUrl).catch(error => console.error('Unable to open Strava:', error.message));
    }
    return { action: 'deny' };
  });

  // Web Bluetooth uses the device chooser below, independent of Chromium permission prompts.
  contents.session.setPermissionCheckHandler(() => false);
  contents.session.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (request, respond) => {
    respond({ cancel: request.webContentsId === contents.id });
  });

  function finishControllerScan(id = '') {
    const scan = controllerScan;
    if (!scan) return;
    controllerScan = null;
    clearTimeout(scan.timeout);
    scan.callback?.(id);
  }

  function selectController(id = '') {
    const scan = controllerScan;
    if (!scan || (id !== '' && !scan.ids.has(id))) return false;
    if (scan.callback) finishControllerScan(id);
    else scan.cancelled = true;
    return true;
  }

  function finishDeviceScan(id = '') {
    clearTimeout(bluetoothScanTimeout);
    bluetoothScanTimeout = null;
    const callback = bluetoothCallback;
    bluetoothCallback = null;
    callback?.(id);
  }

  contents.ipc.handle('shifter:scan-start', event => {
    requireOskiRideFrame(event);
    if (controllerScan || bluetoothCallback) throw new Error('A Bluetooth scan is already in progress.');
    controllerScan = { ids: new Set(), timeout: setTimeout(selectController, 30000) };
  });
  contents.ipc.handle('shifter:scan-pick', (event, id) => {
    requireOskiRideFrame(event);
    return typeof id === 'string' && selectController(id);
  });
  contents.ipc.handle('shifter:scan-stop', event => {
    requireOskiRideFrame(event);
    finishControllerScan();
  });

  const stopBluetoothScans = () => {
    finishControllerScan();
    finishDeviceScan();
  };
  contents.on('did-start-navigation', details => {
    if (details.isMainFrame && !details.isSameDocument) stopBluetoothScans();
  });
  contents.on('render-process-gone', stopBluetoothScans);
  contents.on('destroyed', stopBluetoothScans);

  // Dotychczasowy automatyczny wybór trenażera i czujników.
  const cyclingKeywords = [
    'kickr', 'tacx', 'wahoo', 'elite', 'direto', 'suito', 'justo', 'avanti',
    'drivo', 'saris', 'hammer', 'magene', 'thinkrider', 'zycle', 'van rysel',
    'd100', 'd500', 'd900', 'wattbike', 'stages', 'zwift', 'hub', 'ride',
    'trainer', 'bike', 'schwinn', 'bowflex', 'ic4', 'c6', 'keiser', 'yesoul',
    'renpho', 'domyos', 'oreka', 'bkool', 'power', 'assioma', 'rally',
    'vector', '4iiii', 'quarq', 'srm', 'rotor', 'speed', 'cadence', 'hrm',
    'heart', 'polar', 'garmin', 'coospo', 'tickr'
  ];

  contents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    if (!isRideFrame(contents.mainFrame) || contents.mainFrame.frames.length > 0) {
      callback('');
      return;
    }
    if (controllerScan) {
      controllerScan.callback = callback;
      if (controllerScan.cancelled) {
        finishControllerScan();
        return;
      }
      const devices = (deviceList || []).map(({ deviceId, deviceName }) => ({ id: deviceId, name: deviceName }));
      controllerScan.ids = new Set(devices.map(device => device.id));
      contents.send('shifter:devices', devices);
      return;
    }
    bluetoothCallback = callback;

    if (!deviceList?.length) {
      clearTimeout(bluetoothScanTimeout);
      bluetoothScanTimeout = setTimeout(finishDeviceScan, 30000);
      return;
    }

    let bestDevice = null;
    let bestScore = -1;

    for (const dev of deviceList) {
      const name = (dev.deviceName || '').toLowerCase();
      let score = 0;

      for (const kw of cyclingKeywords) {
        if (name.includes(kw)) {
          score += 10;
        }
      }

      if (dev.deviceName && dev.deviceName.trim().length > 0) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestDevice = dev;
      }
    }

    if (bluetoothScanTimeout) clearTimeout(bluetoothScanTimeout);

    // Jeśli wykryto urządzenie kolarskie o wysokim dopasowaniu, wybierz po 350ms debouncingu
    const waitMs = bestScore >= 10 ? 350 : 1500;

    bluetoothScanTimeout = setTimeout(finishDeviceScan, waitMs, bestDevice?.deviceId ?? '');
  });

  mainWindow.loadFile(appPage);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
