import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.ts'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.jest.json'
    }]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@?better-sqlite3)/)'
  ],
  testTimeout: 10000,
  collectCoverage: false,
  collectCoverageFrom: [
    'src/main/**/*.{js,jsx,ts,tsx}',
    '!src/main/main.js',
    '!src/main/preload.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/renderer/'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageProvider: 'v8',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 35,
      lines: 55,
      statements: 55
    },
    './src/main/': {
      branches: 68,
      functions: 30,
      lines: 52,
      statements: 52
    },
    './src/main/sync-orchestrator.ts': {
      branches: 80,
      functions: 90,
      lines: 95,
      statements: 95
    },
    './src/main/config.ts': {
      branches: 85,
      functions: 85,
      lines: 88,
      statements: 88
    },
    './src/main/database.ts': {
      branches: 60,
      functions: 30,
      lines: 45,
      statements: 45
    }
  }
};

export default config;