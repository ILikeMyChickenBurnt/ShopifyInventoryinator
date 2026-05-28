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

  // Coverage thresholds
  //
  // Coverage is collected in the Docker-based `coverage` job using a real compiled
  // better-sqlite3 (REAL_DB_COVERAGE=1). This gives us one authoritative report with
  // good numbers for database.js and the rest of the app.
  //
  // The fast `test` job only runs `npm test` (no coverage) for quick feedback.
  //
  // See docs/TESTING_PATTERNS.md for the full picture.
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
      // These thresholds are now realistic because coverage for this file is collected
      // exclusively in the Docker-based `coverage` job (with a real compiled better-sqlite3).
      branches: 60,
      functions: 30,
      lines: 45,
      statements: 45
    }
  }
};
