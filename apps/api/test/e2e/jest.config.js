module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  testMatch: ['**/test/e2e/**/*.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/apps/api/test/tsconfig.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@nestjs|rxjs|uuid|class-transformer|class-validator|tslib))'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30000,
};
