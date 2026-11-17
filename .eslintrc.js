module.exports = {
  root: true,
  env: { browser: true, node: true, es2021: true },
  extends: [
    'eslint:recommended',
    'plugin:vue/vue3-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    parser: '@typescript-eslint/parser',
    sourceType: 'module',
    ecmaVersion: 2022,
    extraFileExtensions: ['.vue'],
  },
  rules: {
    'no-console': 'error',
    'no-debugger': 'error',
    'vue/no-v-html': 'error',
    // Native Rancher machine/credential forms edit their parent's model.
    'vue/no-mutating-props': 'off',
    '@typescript-eslint/no-var-requires': 'off',
  },
};
