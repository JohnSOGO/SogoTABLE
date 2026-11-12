// ESLint flat config: the recommended JavaScript rules for the browser app,
// the Worker, and the Node tooling. Formatting is Prettier's job, not ESLint's.
import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      ".wrangler/**",
      "AI/**",
      "bugreport/**",
      "test-results/**",
      "playwright-report/**",
      "src/sogotable/static/vendor/**",
      "workers/games/wnyk/decks.js",
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["workers/**/*.js"],
    // WebSocketPair is a Cloudflare Workers runtime global.
    languageOptions: { globals: { ...globals.worker, ...globals.node, WebSocketPair: "readonly" } },
  },
  {
    files: ["scripts/**", "tests/**", "workers/tests/**", "*.config.js"],
    languageOptions: { globals: { ...globals.node } },
  },
];
