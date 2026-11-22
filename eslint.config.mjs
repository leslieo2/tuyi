import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";

const sharedRules = {
  curly: ["error", "multi-line"],
  eqeqeq: ["error", "always"],
  "no-eval": "error",
  "no-implied-eval": "error",
  "no-new-func": "error",
  "no-shadow": "error",
  "no-throw-literal": "error",
  "no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
    },
  ],
  "no-var": "error",
  "object-shorthand": "error",
  "prefer-const": "error",
  "prefer-template": "error",
  radix: "error",
};

export default [
  {
    ignores: [".build/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["extension/**/*.js"],
    ignores: ["extension/background.js", "extension/image-selection.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: sharedRules,
  },
  {
    files: ["extension/background.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.serviceworker,
        ...globals.webextensions,
      },
    },
    rules: sharedRules,
  },
  {
    files: ["extension/image-selection.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: sharedRules,
  },
  {
    files: ["tests/**/*.mjs", "scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: sharedRules,
  },
  eslintConfigPrettier,
];
