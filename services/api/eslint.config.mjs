import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**"],
  },
  {
    ...js.configs.recommended,
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
