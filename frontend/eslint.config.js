import globals from 'globals';
import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,vue}'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      // Specs declaram componentes stub inline.
      'vue/one-component-per-file': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  }
);
