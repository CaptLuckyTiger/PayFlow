module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  testMatch: ['**/test/e2e/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/test/tsconfig.json' }],
  },
  testTimeout: 30000,
};
