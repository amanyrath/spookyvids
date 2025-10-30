import { app, BrowserWindow, session } from 'electron';
import * as path from 'path';
import { setupIpcHandlers, setMainWindow } from './ipc-handlers';

// Load environment variables from .env file
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load .env file only in development mode (optional - users can also enter keys in UI)
// In packaged mode, users enter keys through the UI and they're stored in userData/settings.json
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

if (isDev) {
  // Development: load .env from project root if it exists (optional)
  const envPath = path.join(__dirname, '../..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log('Loaded environment variables from .env (dev mode):', envPath);
  } else {
    console.log('No .env file found in dev mode - use UI to enter keys or create .env');
  }
}

let mainWindow: BrowserWindow;

function createWindow() {
  // Get the correct path for preload script
  const isDevMode = process.env.NODE_ENV === 'development' || !app.isPackaged;
  const preloadPath = isDevMode 
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

  // Handle permissions for screen recording
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    // Allow display capture and media permissions for screen recording
    if (permission === 'display-capture' || permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Handle media access requests (for getUserMedia with desktop sources)
  // Note: setPermissionCheckHandler has different valid permission types than setPermissionRequestHandler
  session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    // Only check for 'media' here as 'display-capture' is not valid for this handler
    if (permission === 'media') {
      return true;
    }
    return false;
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

