const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let miniPlayerWindow = null;
let currentTrackInfo = {
  title: 'Not Playing',
  artist: '-',
  thumbnail: '',
  isPlaying: false
};

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

// Read living background script
function getLivingBackgroundJS() {
  const jsPath = path.join(__dirname, 'scripts', 'living-background.js');
  try {
    return fs.readFileSync(jsPath, 'utf8');
  } catch (e) {
    console.error('Could not load living background:', e);
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

    // Inject living background
    const livingBgJS = getLivingBackgroundJS();
    if (livingBgJS) {
      mainWindow.webContents.executeJavaScript(livingBgJS);
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

    // Re-inject living background
    const livingBgJS = getLivingBackgroundJS();
    if (livingBgJS) {
      mainWindow.webContents.executeJavaScript(livingBgJS);
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

// Create Mini Player Window
function createMiniPlayer() {
  if (miniPlayerWindow) {
    miniPlayerWindow.focus();
    return;
  }

  miniPlayerWindow = new BrowserWindow({
    width: 300,
    height: 120,
    minWidth: 300,
    minHeight: 120,
    maxWidth: 300,
    maxHeight: 120,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  miniPlayerWindow.loadFile('mini-player.html');

  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null;
  });

  // Send current track info when mini player is ready
  miniPlayerWindow.webContents.on('did-finish-load', () => {
    if (miniPlayerWindow) {
      miniPlayerWindow.webContents.send('player-update', currentTrackInfo);
    }
  });
}

// Setup Mini Player IPC handlers
function setupMiniPlayerIPC() {
  // Handle toggle mini player
  ipcMain.on('toggle-mini-player', () => {
    if (miniPlayerWindow) {
      miniPlayerWindow.close();
    } else {
      createMiniPlayer();
    }
  });

  // Handle mini player ready
  ipcMain.on('mini-player-ready', () => {
    if (miniPlayerWindow) {
      miniPlayerWindow.webContents.send('player-update', currentTrackInfo);
    }
  });

  // Handle mini player controls
  ipcMain.on('mini-player-control', (event, action) => {
    // Handle close first
    if (action === 'close') {
      if (miniPlayerWindow) {
        miniPlayerWindow.close();
      }
      return;
    }

    // Handle seek action (object with action and percent)
    if (typeof action === 'object' && action.action === 'seek') {
      if (mainWindow) {
        const percent = action.percent;
        mainWindow.webContents.executeJavaScript(`
          (function() {
            const progressBar = document.querySelector('#progress-bar');
            if (progressBar) {
              const rect = progressBar.getBoundingClientRect();
              const x = rect.left + (rect.width * ${percent} / 100);
              const y = rect.top + rect.height / 2;
              
              const mousedown = new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y });
              const mouseup = new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y });
              const click = new MouseEvent('click', { bubbles: true, clientX: x, clientY: y });
              
              progressBar.dispatchEvent(mousedown);
              progressBar.dispatchEvent(mouseup);
              progressBar.dispatchEvent(click);
            }
          })();
        `);
      }
      return;
    }

    if (!mainWindow) return;

    switch (action) {
      case 'play-pause':
        mainWindow.webContents.executeJavaScript(`
          document.querySelector('.play-pause-button')?.click();
        `);
        break;
      case 'next':
        mainWindow.webContents.executeJavaScript(`
          document.querySelector('.next-button')?.click();
        `);
        break;
      case 'previous':
        mainWindow.webContents.executeJavaScript(`
          document.querySelector('.previous-button')?.click();
        `);
        break;
      case 'like':
        mainWindow.webContents.executeJavaScript(`
          document.querySelector('.like.ytmusic-like-button-renderer button, #like-button-renderer button, .like-button-renderer-like-button')?.click();
        `);
        break;
      case 'dislike':
        mainWindow.webContents.executeJavaScript(`
          document.querySelector('.dislike.ytmusic-like-button-renderer button, #dislike-button-renderer button, .like-button-renderer-dislike-button')?.click();
        `);
        break;
    }
  });

  // Handle track info updates from main window
  ipcMain.on('track-info-update', (event, info) => {
    currentTrackInfo = { ...currentTrackInfo, ...info };
    if (miniPlayerWindow) {
      miniPlayerWindow.webContents.send('player-update', currentTrackInfo);
    }
  });
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
  setupMiniPlayerIPC();

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
