// Jest config — uses the jest-expo preset (Expo SDK 54) so React Native and Expo
// modules transform and mock correctly. moduleNameMapper mirrors the path aliases
// in tsconfig.json (jest does not read tsconfig `paths`), so `@/...` imports
// resolve in tests exactly as they do in the app.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/app/(.*)$': '<rootDir>/app/$1',
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/features/(.*)$': '<rootDir>/src/features/$1',
    '^@/lib/(.*)$': '<rootDir>/src/lib/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/styles/(.*)$': '<rootDir>/src/styles/$1',
    '^@/hooks/(.*)$': '<rootDir>/src/hooks/$1',
    '^@/constants/(.*)$': '<rootDir>/src/constants/$1',
    '^@/(.*)$': '<rootDir>/$1',
  },
};
