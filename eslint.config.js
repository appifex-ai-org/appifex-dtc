// Source: eslint.org flat config docs + typescript-eslint.io getting-started
// Phase 1 Plan 03 (D-01, GATE-01): ESLint flat config enforcing our ESM .js-in-.ts convention
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import importX from 'eslint-plugin-import-x'
import prettier from 'eslint-config-prettier'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'sidecar/dist/**',
      'bin/**',
      'cli/__tests__/__fixtures__/**',
      '**/*.tsbuildinfo',
      'packages/core/skills/**',
      '.planning/**',
      '.claude/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        (await import('eslint-import-resolver-typescript')).createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: [
            'tsconfig.json',
            'packages/*/tsconfig.json',
            'cli/tsconfig.json',
          ],
        }),
      ],
    },
    rules: {
      // ESM .js-in-.ts convention — see CONVENTIONS.md
      'import-x/extensions': [
        'error',
        'ignorePackages',
        { ts: 'never', tsx: 'never', js: 'always' },
      ],
      'import-x/no-unresolved': 'error',
      // project style
      '@typescript-eslint/no-explicit-any': 'warn', // 33 existing `as any` usages — warn, not block
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off', // CLI tool — heavy intentional console usage
    },
  },
  {
    files: ['cli/src/views/**/*.tsx'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  prettier, // MUST be last to win conflicts
)
