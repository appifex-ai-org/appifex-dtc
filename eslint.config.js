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
      'scripts/**',
    ],
  },
  js.configs.recommended,
  // Deviation (Rule 3): brownfield codebase → use `recommended` (non-typed) instead of
  // `recommendedTypeChecked` which produced 830+ errors. Typed linting can be adopted
  // incrementally in a future hardening phase. Still scoped to .ts/.tsx only.
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['**/*.ts', '**/*.tsx'],
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [
        (await import('eslint-import-resolver-typescript')).createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: ['tsconfig.json', 'packages/*/tsconfig.json', 'cli/tsconfig.json'],
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
      // Deviation (Rule 3): dropped to 'warn' — 5 unresolvable deep-import paths from
      // @modelcontextprotocol/sdk subpaths that don't resolve without building. Revisit
      // once a future plan reworks the MCP SDK imports.
      'import-x/no-unresolved': 'warn',
      // project style — brownfield, existing violations kept as warnings
      '@typescript-eslint/no-explicit-any': 'warn', // 33 existing `as any` usages — warn, not block
      // Deviation (Rule 3): 49 existing inline `import('x').Y` annotations in brownfield
      // code — warn for now, clean up in a future hardening plan.
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off', // CLI tool — heavy intentional console usage
      // Brownfield pragmatism — pre-existing patterns to clean up later
      'no-useless-escape': 'warn',
      'no-useless-catch': 'warn',
      'no-irregular-whitespace': 'warn',
      'no-control-regex': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
    },
  },
  {
    // Root-level JS/MJS config files — no typed linting (not in any tsconfig)
    files: ['*.js', '*.mjs', '*.cjs', '**/*.config.js', '**/*.config.mjs'],
    languageOptions: {
      globals: { ...globals.node },
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
