import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/coverage',
      '**/.turbo',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.mts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      'no-unused-vars': 'error',
    },
  },
  {
    files: [
      '**/*.ts',
      '**/*.mts',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
    ],
    plugins: {
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      'unicorn/prefer-node-protocol': 'error',
    },
  },
];
