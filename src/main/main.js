const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./database');
const { registerIpcHandlers } = require('./ipc-handlers');
const { getStoreUrl } = require('./config');
const { initAutoUpdater } = require('./auto-updater');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,  // Don't show until ready to prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // Security: isolate context
      nodeIntegration: false,       // Security: disable node in renderer
      sandbox: true                 // Security: enable sandbox
    },
    icon: path.join(__dirname, '../../build/icon.png')
  });

  // Load the renderer HTML
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Show window when content is ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Log renderer console messages to help diagnose blank screens
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer console [${level}]: ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error(`Renderer process gone: ${details.reason}`, details);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer is unresponsive');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Renderer finished loading');
  });

  // Open DevTools in development mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App lifecycle events
app.whenReady().then(() => {
  // Initialize database with stored store URL (if available)
  const storedStoreUrl = getStoreUrl();
  initDatabase(storedStoreUrl);
  
  // Register IPC handlers for communication with renderer
  registerIpcHandlers(ipcMain);
  
  // Create main window
  createWindow();
  
  // Initialize auto-updater (checks for updates in packaged app)
  initAutoUpdater();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
