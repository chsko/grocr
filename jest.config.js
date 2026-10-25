/** App tests (jest-expo). Convex backend tests run in Vitest, see vitest.config.mts. */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/convex/', '<rootDir>/scripts/'],
  moduleNameMapper: {
    '^@/convex/(.*)$': '<rootDir>/convex/$1',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
