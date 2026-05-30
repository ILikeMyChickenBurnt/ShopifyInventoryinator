// Jest test setup
// This file runs before each test file

// Set test environment variables
process.env.NODE_ENV = 'test';

// Mock electron app for tests
jest.mock('electron', () => require('./__mocks__/electron'));

// Suppress console.log in tests (optional - comment out for debugging)
// global.console.log = jest.fn();
