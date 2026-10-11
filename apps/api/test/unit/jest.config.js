module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  testMatch: ['**/test/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/test/tsconfig.json' }],
  },
  collectCoverageFrom: ['apps/api/src/**/*.ts', '!**/node_modules/**'],
};
