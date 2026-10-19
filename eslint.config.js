import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // supabase/functions run on Deno and are checked there, not here. The rest
  // is build and test output.
  globalIgnores(['dist', 'supabase', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-unused-vars': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/exhaustive-deps': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  // Node scripts: data imports and asset pipelines.
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
  // TypeScript: parse ts/tsx and turn off the core rules the compiler already
  // covers (no-undef and friends). Type errors come from `npm run typecheck`.
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.base, tseslint.configs.eslintRecommended],
  },
])