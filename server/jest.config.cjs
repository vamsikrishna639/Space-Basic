/** Jest + ts-jest (transpile only; `npm run typecheck` does type checking). */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', isolatedModules: true }] },
  // Read @spacebasic/shared from its TypeScript source. (A mapping, not customExportConditions: custom
  // conditions also apply to every dependency and broke the MongoDB driver's handshake metadata.)
  moduleNameMapper: { '^@spacebasic/shared$': '<rootDir>/../shared/src/index.ts' },
  setupFiles: ['<rootDir>/src/test/env.ts'],
  testTimeout: 30000,
};
