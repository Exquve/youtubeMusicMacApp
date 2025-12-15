const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Read custom CSS
function getCustomCSS() {
  const cssPath = path.join(__dirname, 'styles', 'theme.css');
  try {
    return fs.readFileSync(cssPath, 'utf8');
  } catch (e) {
    console.error('Could not load custom CSS:', e);
    return '';
  }
}

// Read lyrics enhancer script
function getLyricsEnhancerJS() {
  const jsPath = path.join(__dirname, 'scripts', 'lyrics-enhancer.js');
  try {
    return fs.readFileSync(jsPath, 'utf8');
  } catch (e) {
    console.error('Could not load lyrics enhancer:', e);
    return '';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset', // macOS native title bar with inset traffic lights
    trafficLightPosition: { x: 15, y: 15 },
    vibrancy: 'under-window', // macOS vibrancy effect
    visualEffectState: 'active',
    transparent: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // Load YouTube Music
  mainWindow.loadURL('https://music.youtube.com');

  // Inject custom CSS and JS when page loads
  mainWindow.webContents.on('did-finish-load', () => {
    const customCSS = getCustomCSS();
    if (customCSS) {
      mainWindow.webContents.insertCSS(customCSS);
    }

    // Inject lyrics enhancer
    const lyricsJS = getLyricsEnhancerJS();
    if (lyricsJS) {
      mainWindow.webContents.executeJavaScript(lyricsJS);
    }
  });

  // Re-inject CSS and JS on navigation
  mainWindow.webContents.on('did-navigate-in-page', () => {
    const customCSS = getCustomCSS();
    if (customCSS) {
      mainWindow.webContents.insertCSS(customCSS);
    }

    // Re-inject lyrics enhancer
    const lyricsJS = getLyricsEnhancerJS();
    if (lyricsJS) {
      mainWindow.webContents.executeJavaScript(lyricsJS);
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools in development
  if (process.argv.includes('--enable-logging')) {
    mainWindow.webContents.openDevTools();
  }
}

// Register media key handlers
function registerMediaKeys() {
  // Play/Pause
  globalShortcut.register('MediaPlayPause', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        document.querySelector('.play-pause-button')?.click();
      `);
    }
  });

  // Next track
  globalShortcut.register('MediaNextTrack', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        document.querySelector('.next-button')?.click();
      `);
    }
  });

  // Previous track
  globalShortcut.register('MediaPreviousTrack', () => {
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        document.querySelector('.previous-button')?.click();
      `);
    }
  });
}

// App ready
app.whenReady().then(() => {
  createWindow();
  registerMediaKeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  callback(true);
});
