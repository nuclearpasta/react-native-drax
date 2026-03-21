import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import { defineConfig, globalIgnores } from 'eslint/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const reactNativePrettier = fixupConfigRules(
  compat.extends('@react-native', 'prettier')
);

export default defineConfig([
  // Global ignores
  globalIgnores([
    '**/node_modules/',
    'lib/',
    '.yarn/',
    'example/dist/',
    'docs-site/build/',
    'docs-site/.docusaurus/',
    'docs-site/.vercel/',
    '**/.expo/',
  ]),

  // src/** — @react-native + prettier (strict, no DOM)
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: reactNativePrettier,
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // src/compat/** — allow require() for runtime version detection
  {
    files: ['src/compat/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // example/** — @react-native + prettier, but no-inline-styles off
  {
    files: ['example/**/*.{ts,tsx}'],
    extends: reactNativePrettier,
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-native/no-inline-styles': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },

  // docs-site/** — prettier only with TS parser (no react-native plugin)
  {
    files: ['docs-site/**/*.{ts,tsx,js,jsx}'],
    extends: fixupConfigRules(compat.extends('prettier')),
    languageOptions: {
      parser: tsParser,
    },
  },
]);
