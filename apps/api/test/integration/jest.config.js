module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  testMatch: ['**/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/test/tsconfig.json' }],
  },
  testTimeout: 30000,
};
