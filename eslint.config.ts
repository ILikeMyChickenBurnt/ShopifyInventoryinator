import js from '@eslint/js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';
import vueParser from 'vue-eslint-parser';

const configDir = dirname(fileURLToPath(import.meta.url));
const projectFiles = ['./tsconfig.json', './tsconfig.eslint.json'];

export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ['**/*.{js,cjs,mjs}'],
    ...js.configs.recommended,
  },

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        project: projectFiles,
        tsconfigRootDir: configDir,
        extraFileExtensions: ['.vue'],
      },
    },
  },

  {
    files: ['**/*.{js,cjs,mjs}', 'tests/**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
    rules: {
      ...(tseslint.configs.disableTypeChecked.rules ?? {}),
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['eslint.config.ts', 'jest.config.ts', 'vite.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    languageOptions: {
      parserOptions: {
        project: projectFiles,
        tsconfigRootDir: configDir,
      },
    },
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      'no-undef': 'off',
    },
  },

  {
    ignores: [
      '.grok/',
      'build/',
      'lint-report.json',
      'node_modules/',
      'dist/',
      'coverage/',
      'src/dist/',
      '**/*.min.js',
    ],
  }
);