import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-plugin-prettier'

export default [
  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node, // ← ganti dari browser ke node
      },
    },
    plugins: {
      prettier,
    },
    rules: {
      'prettier/prettier': 'error',

      // backend friendly rules
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',
    },
  },
]
