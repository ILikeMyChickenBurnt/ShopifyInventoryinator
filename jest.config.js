module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.js'
  },
  // Don't transform node_modules except for ESM modules if needed
  transformIgnorePatterns: [
    'node_modules/(?!(@?better-sqlite3)/)'
  ],
  // Increase timeout for database operations
  testTimeout: 10000,

  // Coverage configuration (Phase 4)
  collectCoverage: false, // only enable explicitly via --coverage or npm run test:coverage
  collectCoverageFrom: [
    'src/main/**/*.{js,jsx}',
    '!src/renderer/vue.js'
  ],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'src/renderer/'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  // V8 provider is more compatible with our dependency overrides (minimatch pins etc.)
  coverageProvider: 'v8',

  // Thresholds updated after the 2026 comprehensive testing + real native DB coverage initiative
  // (Docker + better-sqlite3 from source). These numbers reflect what is sustainably achievable
  // when the hard modules (database.js, sync-orchestrator) are exercised with real paths.
  // See CLAUDE.md "Testing & Security Culture" section for the patterns that made this possible.
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
    './src/main/sync-orchestrator.js': {
      branches: 80,
      functions: 90,   // 100% is too brittle due to non-fatal error paths + coverage collection differences in Docker
      lines: 95,
      statements: 95
    },
    './src/main/config.js': {
      branches: 85,
      functions: 85,
      lines: 88,
      statements: 88
    },
    './src/main/database.js': {
      // Measured via the REAL_DB_COVERAGE=1 Docker job. This is the bar for the native DB module.
      branches: 65,
      functions: 25,
      lines: 40,
      statements: 40
    }
  }
};
