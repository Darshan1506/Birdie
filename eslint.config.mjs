import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, chrome: "readonly" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    files: ["tests/**/*.ts", "scripts/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { globals: { ...globals.node } },
  },
);
