import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import { app, dialog, BrowserWindow } from 'electron';
import log from 'electron-log';

// Configure logging
autoUpdater.logger = log;

// electron-log typing is incomplete for the transports object; use a narrow unknown cast
const loggerWithTransports = autoUpdater.logger as unknown as {
  transports?: {
    file?: { level?: string };
  };
};
if (loggerWithTransports.transports?.file) {
  loggerWithTransports.transports.file.level = 'info';
}

// Disable auto-download - we'll prompt the user first
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

// Note: ProgressInfo and UpdateInfo are imported from 'electron-updater' for event handler typing.

function initAutoUpdater(): void {
  // Only check for updates in packaged app
  if (!app.isPackaged) {
    console.log('Skipping auto-update check in development mode');
    return;
  }

  // Check for updates after a short delay (let app fully load)
  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch((err: unknown) => {
      console.error('Error checking for updates:', err);
    });
  }, 3000);

  // ═══════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log.info('Update available:', info.version);
    
    void dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (${info.version}) is available.`,
      detail: 'Would you like to download it now?',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        void autoUpdater.downloadUpdate();
      }
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log.info('No updates available. Current version:', info.version);
  });

  autoUpdater.on('download-progress', (progressObj: ProgressInfo) => {
    const message = `Download speed: ${formatBytes(progressObj.bytesPerSecond)}/s - ` +
                    `${progressObj.percent.toFixed(1)}% complete`;
    log.info(message);
    
    // Send progress to renderer (optional - for progress bar)
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log.info('Update downloaded:', info.version);
    
    void dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded successfully!',
      detail: 'The update will be installed when you restart the app. Restart now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1
    }).then((result) => {
      if (result.response === 0) {
        void autoUpdater.quitAndInstall(false, true);
      }
    });
  });

  autoUpdater.on('error', (error: Error) => {
    log.error('Auto-updater error:', error);
    // Don't show dialog for update errors - just log them
    // Users don't need to know if update check failed
  });
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Manually check for updates (can be triggered from menu/button)
 */
function checkForUpdatesManually(): void {
  void autoUpdater.checkForUpdates().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Please try again later.';
    log.error('Manual update check failed:', err);
    void dialog.showMessageBox({
      type: 'error',
      title: 'Update Check Failed',
      message: 'Could not check for updates',
      detail: message
    });
  });
}

export { initAutoUpdater, checkForUpdatesManually };

// Keep CommonJS interop for any remaining .js consumers during transition
module.exports = { initAutoUpdater, checkForUpdatesManually };
