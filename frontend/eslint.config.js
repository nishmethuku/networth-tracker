import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

const reactRules = {
  ...react.configs.recommended.rules,
  // Only the two long-established hooks rules — eslint-plugin-react-hooks
  // v7's "recommended" bundles a much larger set of React Compiler
  // preview rules (set-state-in-render, purity, gating, ...), which
  // this codebase doesn't use React Compiler and isn't targeting yet.
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",
  "react/react-in-jsx-scope": "off", // Vite's JSX transform doesn't need React in scope
  "react/prop-types": "off", // no PropTypes in this codebase; TypeScript is the planned path for prop validation
  "react/no-unescaped-entities": "off", // stylistic only (raw ' and " in JSX text) -- not a real bug class
  "react-refresh/only-export-components": "warn",
};

export default [
  { ignores: ["dist/**", "dev-dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.es2021, ...globals.node },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactRules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // .ts/.tsx: syntax-only TS parsing (no type-checked lint rules — that's
  // what `tsc --noEmit` is for) plus the same React rules as the .jsx
  // config above, so the api/utils layer gets real linting instead of
  // being silently skipped for having TypeScript syntax ESLint's default
  // parser can't read.
  ...tseslint.config({
    files: ["**/*.{ts,tsx}"],
    extends: [...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.es2021, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks, "react-refresh": reactRefresh },
    settings: { react: { version: "detect" } },
    rules: {
      ...reactRules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "off", // incremental adoption -- `any` is the deliberate boundary type for untyped backend JSON
    },
  }),
  {
    // vitest.config.js sets test.globals: true, so describe/it/expect/vi/
    // beforeEach/afterEach are available unimported in test files.
    files: ["**/*.test.js", "**/__tests__/**", "src/test-setup.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
  prettierConfig,
];
