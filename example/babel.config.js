const path = require('path');
const { getConfig } = require('react-native-builder-bob/babel-config');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

/**
 * Expo SDK 58's Metro babel transformer computes its cache key with
 * `loadPartialConfigSync` and no filename. Babel throws on string/RegExp
 * `include` patterns in that case, so turn bob's path include into an
 * equivalent function pattern (functions are allowed without a filename).
 */
const toFunctionPattern = (dir) => (filename) =>
  typeof filename === 'string' &&
  (filename === dir || filename.startsWith(dir + path.sep));

module.exports = function (api) {
  api.cache(true);

  const config = getConfig(
    {
      presets: ['babel-preset-expo'],
    },
    { root, pkg }
  );

  return {
    ...config,
    overrides: config.overrides?.map((override) =>
      typeof override.include === 'string'
        ? { ...override, include: toFunctionPattern(override.include) }
        : override
    ),
  };
};
