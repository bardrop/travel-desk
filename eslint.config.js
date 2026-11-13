// Lints this project's own code. The vendored runtime (site/runtime) and the
// vendored agentify-website tools are third-party copies and stay unchanged.
import js from "@eslint/js";
import globals from "globals";

export default [
  // tests/support/stub_*.mjs and scripted_model.mjs are copied unchanged from the skill templates.
  { ignores: ["site/runtime/**", "tools/**", "node_modules/**", "site/bridge/**", "tests/support/stub_*.mjs", "tests/support/scripted_model.mjs"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
