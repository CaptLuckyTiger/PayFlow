module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  testMatch: ['**/test/e2e/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/apps/api/test/e2e/setup.cjs'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/apps/api/test/tsconfig.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@nestjs|rxjs|uuid|class-transformer|class-validator|tslib))'],
  moduleNameMapper: {
    '^@nestjs/throttler$': '<rootDir>/apps/api/test/mocks/throttler.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30000,
};
