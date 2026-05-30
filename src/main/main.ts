import { app, BrowserWindow, ipcMain, type BrowserWindowConstructorOptions } from 'electron';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

import { initDatabase } from './database';
import { registerIpcHandlers } from './ipc-handlers';
import { getStoreUrl } from './config';
import { initAutoUpdater } from './auto-updater';

let mainWindow: BrowserWindow | null = null;

function configureDevelopmentRuntimePaths(): void {
  if (app.isPackaged) {
    return;
  }

  const userDataDir = path.join(__dirname, '../../data/electron-user-data');
  const sessionDataDir = path.join(userDataDir, 'session');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(sessionDataDir, { recursive: true });
  app.setPath('userData', userDataDir);
  app.setPath('sessionData', sessionDataDir);
}

function createWindow(): void {
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1400,
    height: 900,
    show: false, // Don't show until ready to prevent flash
    webPreferences: {
      // We now always use the compiled preload (dist/main/preload.js).
      // During development, run `npm run dev:watch` (or `watch:main`) in another terminal
      // so the watcher keeps the compiled preload up to date.
      preload: path.join(__dirname, '../../dist/main/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    icon: path.join(__dirname, '../../build/icon.png')
  };

  mainWindow = new BrowserWindow(windowOptions);

  // Load the modern renderer from a single dist output.
  void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Show window when content is ready to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Log renderer console messages to help diagnose blank screens.
  mainWindow.webContents.on('console-message', (event) => {
    console.log(`Renderer console [${event.level}]: ${event.message} (${event.sourceId}:${event.lineNumber})`);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Renderer failed to load: ${errorDescription} (${errorCode}) at ${validatedURL}`);
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
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
// Note: The three promise rules (no-misused-promises, prefer-promise-reject-errors, no-floating-promises)
// are known to produce noise in Electron main process lifecycle code. We tolerate the remaining
// minor warnings in this file as they are common and accepted in Electron main files.
configureDevelopmentRuntimePaths();

void app.whenReady().then(() => {
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
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception:', error);
});

process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});
