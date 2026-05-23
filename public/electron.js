const { app, BrowserWindow, Menu, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';

const LAST_IMPORT_DIR_FILE = () => path.join(app.getPath('userData'), 'last-import-directory.txt');

function readStoredImportDir() {
  try {
    const p = fs.readFileSync(LAST_IMPORT_DIR_FILE(), 'utf8').trim();
    if (p && fs.existsSync(p)) return p;
  } catch (_) {
    /* first run */
  }
  try {
    return app.getPath('documents');
  } catch (_) {
    return undefined;
  }
}

function writeStoredImportDir(dir) {
  if (!dir || typeof dir !== 'string') return;
  try {
    fs.writeFileSync(LAST_IMPORT_DIR_FILE(), dir, 'utf8');
  } catch (e) {
    console.warn('[electron] Could not persist last import directory:', e?.message || e);
  }
}

/** @type {string|undefined|null} null = not yet read from disk */
let lastImportDirectory = null;

let mainWindow;
const HOME_URL = 'http://localhost:3000';

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icons/icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  // Load the app - always try localhost first, fallback to file build
  const fallbackFileUrl = `file://${path.join(__dirname, '../build/index.html')}`;
  mainWindow.loadURL(HOME_URL);

  try {
    const ses = session.defaultSession;
    ses.setPermissionCheckHandler(
      (_webContents, permission) => permission === 'media' || permission === 'microphone'
    );
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      if (permission === 'media' || permission === 'microphone') {
        callback(true);
      } else {
        callback(false);
      }
    });
  } catch (e) {
    console.warn('[electron] Could not register media permission handler:', e?.message || e);
  }

  // Fallback if localhost is not available
  const handleFailLoad = () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.loadURL(fallbackFileUrl);
    }
  };
  mainWindow.webContents.once('did-fail-load', handleFailLoad);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Open DevTools in development
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App event listeners
app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers for file operations
ipcMain.handle('open-file-dialog', async () => {
  if (lastImportDirectory == null) {
    lastImportDirectory = readStoredImportDir();
  }
  const win = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(win || undefined, {
    properties: ['openFile'],
    defaultPath: lastImportDirectory || undefined,
    filters: [
      { name: '3D Models', extensions: ['glb', 'gltf', 'obj', 'fbx', 'dae', 'stl', 'vrm'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tga'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (!result.canceled && result.filePaths && result.filePaths[0]) {
    lastImportDirectory = path.dirname(result.filePaths[0]);
    writeStoredImportDir(lastImportDirectory);
  }
  return result;
});

ipcMain.handle('remember-import-directory', (_evt, dir) => {
  if (typeof dir !== 'string' || !dir.trim()) return { ok: false };
  const normalized = dir.trim();
  try {
    if (fs.existsSync(normalized)) {
      lastImportDirectory = normalized;
      writeStoredImportDir(lastImportDirectory);
      return { ok: true };
    }
  } catch (_) {
    /* ignore */
  }
  return { ok: false };
});

ipcMain.handle('save-file-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: '3D Models', extensions: ['glb', 'gltf', 'obj', 'fbx'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
});

// Create application menu
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          mainWindow.webContents.send('menu-new-project');
        }
      },
      {
        label: 'Open',
        accelerator: 'CmdOrCtrl+O',
        click: () => {
          mainWindow.webContents.send('menu-open');
        }
      },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          mainWindow.webContents.send('menu-save');
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit();
        }
      }
    ]
  },
  {
    label: 'View',
    submenu: [
      {
        label: 'Home (Localhost)',
        accelerator: 'CmdOrCtrl+H',
        click: () => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.loadURL(HOME_URL);
          }
        }
      },
      {
        label: 'Toggle Developer Tools',
        accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: () => {
          mainWindow.webContents.toggleDevTools();
        }
      },
      {
        label: 'Reload',
        accelerator: 'CmdOrCtrl+R',
        click: () => {
          mainWindow.webContents.reload();
        }
      }
    ]
  },
  {
    label: 'Help',
    submenu: [
      {
        label: 'About Open3DStudio',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About Open3DStudio',
            message: 'Open3DStudio v1.0.0',
            detail: 'A 3D AIGC application for completely locally deployed and free 3DAIGC workflows'
          });
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);

