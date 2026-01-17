// Mock Electron module for tests
module.exports = {
  app: {
    isPackaged: false,
    getPath: (name) => {
      switch (name) {
        case 'userData':
          return '/tmp/test-app-data';
        case 'home':
          return '/tmp/test-home';
        default:
          return '/tmp/test-path';
      }
    },
    quit: jest.fn(),
    on: jest.fn(),
    whenReady: () => Promise.resolve()
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(),
    loadURL: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
      openDevTools: jest.fn()
    },
    on: jest.fn(),
    close: jest.fn(),
    show: jest.fn()
  })),
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn()
  },
  ipcRenderer: {
    invoke: jest.fn(),
    on: jest.fn(),
    send: jest.fn()
  },
  contextBridge: {
    exposeInMainWorld: jest.fn()
  },
  shell: {
    openExternal: jest.fn()
  },
  dialog: {
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
    showErrorBox: jest.fn()
  }
};
