const eventHandlers: Record<string, (...args: unknown[]) => void> = {};

const mockAutoUpdater = {
  logger: null as unknown,
  autoDownload: true,
  autoInstallOnAppQuit: false,
  checkForUpdates: jest.fn().mockResolvedValue(undefined),
  downloadUpdate: jest.fn().mockResolvedValue(undefined),
  quitAndInstall: jest.fn(),
  on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
    eventHandlers[event] = handler;
    return mockAutoUpdater;
  })
};

const mockLog = {
  info: jest.fn(),
  error: jest.fn(),
  transports: {
    file: {
      level: 'warn'
    }
  }
};

const mockDialog = {
  showMessageBox: jest.fn().mockResolvedValue({ response: 0 })
};

const mockBrowserWindow = {
  getAllWindows: jest.fn()
};

const mockApp = {
  isPackaged: false
};

jest.mock('electron-updater', () => ({
  autoUpdater: mockAutoUpdater
}));

jest.mock('electron-log', () => mockLog);

jest.mock('electron', () => ({
  app: mockApp,
  dialog: mockDialog,
  BrowserWindow: mockBrowserWindow
}));

const { initAutoUpdater, checkForUpdatesManually } = require('../../src/main/auto-updater') as {
  initAutoUpdater: () => void;
  checkForUpdatesManually: () => void;
};

describe('auto-updater', () => {
  async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockApp.isPackaged = false;
    mockAutoUpdater.checkForUpdates.mockResolvedValue(undefined);
    mockAutoUpdater.downloadUpdate.mockResolvedValue(undefined);
    mockDialog.showMessageBox.mockResolvedValue({ response: 0 });
    mockBrowserWindow.getAllWindows.mockReturnValue([]);

    for (const key of Object.keys(eventHandlers)) {
      delete eventHandlers[key];
    }
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('configures the updater logger and download flags on module load', () => {
    expect(mockAutoUpdater.logger).toBe(mockLog);
    expect(mockLog.transports.file.level).toBe('info');
    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(true);
  });

  test('skips auto-update initialization in development mode', () => {
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    initAutoUpdater();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(mockAutoUpdater.on).not.toHaveBeenCalled();
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  test('registers handlers and schedules an update check in packaged mode', async () => {
    mockApp.isPackaged = true;

    initAutoUpdater();

    expect(mockAutoUpdater.on).toHaveBeenCalledWith('checking-for-update', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-available', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-not-available', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('download-progress', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('update-downloaded', expect.any(Function));
    expect(mockAutoUpdater.on).toHaveBeenCalledWith('error', expect.any(Function));

    jest.advanceTimersByTime(3000);
    await flushPromises();

    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalled();
  });

  test('downloads an available update when the user accepts', async () => {
    mockApp.isPackaged = true;
    mockDialog.showMessageBox.mockResolvedValue({ response: 0 });

    initAutoUpdater();
    eventHandlers['update-available']?.({ version: '1.2.3' });
    await flushPromises();

    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'info',
        title: 'Update Available',
        message: 'A new version (1.2.3) is available.'
      })
    );
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled();
  });

  test('does not download an available update when the user postpones it', async () => {
    mockApp.isPackaged = true;
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 });

    initAutoUpdater();
    eventHandlers['update-available']?.({ version: '1.2.3' });
    await flushPromises();

    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  test('sends download progress to the first BrowserWindow when available', () => {
    mockApp.isPackaged = true;
    const send = jest.fn();
    mockBrowserWindow.getAllWindows.mockReturnValue([{ webContents: { send } }]);

    initAutoUpdater();
    eventHandlers['download-progress']?.({
      bytesPerSecond: 1024,
      percent: 12.34
    });

    expect(send).toHaveBeenCalledWith('update-download-progress', {
      bytesPerSecond: 1024,
      percent: 12.34
    });
  });

  test('handles download progress without a BrowserWindow', () => {
    mockApp.isPackaged = true;
    mockBrowserWindow.getAllWindows.mockReturnValue([]);

    initAutoUpdater();

    expect(() => {
      eventHandlers['download-progress']?.({
        bytesPerSecond: 0,
        percent: 0
      });
    }).not.toThrow();
  });

  test('installs a downloaded update when the user accepts restart', async () => {
    mockApp.isPackaged = true;
    mockDialog.showMessageBox.mockResolvedValue({ response: 0 });

    initAutoUpdater();
    eventHandlers['update-downloaded']?.({ version: '1.2.3' });
    await flushPromises();

    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  test('does not install a downloaded update when the user chooses later', async () => {
    mockApp.isPackaged = true;
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 });

    initAutoUpdater();
    eventHandlers['update-downloaded']?.({ version: '1.2.3' });
    await flushPromises();

    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  test('shows an error dialog when a manual update check fails', async () => {
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error('service unavailable'));

    checkForUpdatesManually();
    await flushPromises();

    expect(mockLog.error).toHaveBeenCalledWith(
      'Manual update check failed:',
      expect.any(Error)
    );
    expect(mockDialog.showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        title: 'Update Check Failed',
        detail: 'service unavailable'
      })
    );
  });
});