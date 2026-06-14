import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["src/**/*.{js,jsx,mjs}", "vite.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.es2022,
        ...globals.nodeBuiltin,
        console: "readonly",
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "no-undef": "error",
      "no-use-before-define": ["error", { functions: false, classes: true, variables: true }],
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-duplicate-imports": "error",
      "no-unreachable": "error",
      "no-unsafe-optional-chaining": "error",
      "no-constant-binary-expression": "error",
      "no-self-assign": "error",
      "no-import-assign": "error",
      "no-async-promise-executor": "error",
      "require-atomic-updates": "warn",
      "react/jsx-no-undef": "error",
      "react/jsx-key": "error",
      "react/no-unknown-property": "error",
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];
