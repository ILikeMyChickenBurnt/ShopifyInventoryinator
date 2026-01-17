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
  testTimeout: 10000
};
