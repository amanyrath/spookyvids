import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { setupIpcHandlers, setMainWindow } from './ipc-handlers';

let mainWindow: BrowserWindow;

function createWindow() {
  // Get the correct path for preload script
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const preloadPath = isDev 
    ? path.join(__dirname, 'preload.js')
    : path.join(process.resourcesPath, 'app.asar', 'dist', 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      sandbox: false,
      webSecurity: false  // Allow file access for drag-and-drop
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Handle file drop on window
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  setupIpcHandlers();
  // Make mainWindow available to IPC handlers
  setMainWindow(mainWindow);
});

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

