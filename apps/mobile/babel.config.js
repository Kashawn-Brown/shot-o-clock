// Babel config. Mirrors Expo SDK 54's default (babel-preset-expo) so the bundler
// behaves identically with this file present — Metro already applies this preset.
// jest/babel-jest, unlike Metro, needs an explicit config on disk to transform
// TypeScript and JSX in test files.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
