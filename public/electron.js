const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

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
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '3D Models', extensions: ['glb', 'gltf', 'obj', 'fbx', 'dae', 'stl'] },
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'tga'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return result;
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

