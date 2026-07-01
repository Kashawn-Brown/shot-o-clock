// Metro bundler configuration.
//
// Windows note: `expo run:android` produces transient CMake temp dirs
// (`android/.cxx/.../CMakeTmp/...`, including copies under node_modules) during
// the native build. Without Watchman, Metro's fallback file-watcher tries to
// watch those dirs and crashes with ENOENT the moment the build deletes them.
// Excluding the native build output from the watcher/resolver keeps Metro stable
// on Windows dev machines. See build-log — Phase 17 icon/splash dev-build test.

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore native (Android) build artifacts — Metro never needs to bundle them,
// and watching them is what crashes the Windows fallback watcher.
const nativeBuildExclusions = [
  /[/\\]\.cxx[/\\].*/, // CMake native build intermediates (the crash source)
  /[/\\]android[/\\]build[/\\].*/, // android/build outputs
  /[/\\]android[/\\]app[/\\]build[/\\].*/, // android/app/build outputs
];

config.resolver.blockList = config.resolver.blockList
  ? [].concat(config.resolver.blockList, nativeBuildExclusions)
  : nativeBuildExclusions;

module.exports = config;
