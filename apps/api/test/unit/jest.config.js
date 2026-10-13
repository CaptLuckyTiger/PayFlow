module.exports = {
  rootDir: '../../../..',
  testEnvironment: 'node',
  testMatch: ['**/test/unit/**/*.spec.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/apps/api/test/tsconfig.json' }],
  },
  transformIgnorePatterns: ['node_modules/(?!(@nestjs|rxjs|uuid|class-transformer|class-validator|tslib))'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['apps/api/src/**/*.ts', '!**/node_modules/**'],
};
