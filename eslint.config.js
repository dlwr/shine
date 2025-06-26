// @ts-check

import eslint from "@eslint/js";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strict,
  tseslint.configs.stylistic,
  eslintPluginUnicorn.configs.recommended,
  {
    ignores: [
      "**/.wrangler/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/*.mjs",
      "**/*.js",
      "**/.astro/**",
      "**/worker-configuration.d.ts",
    ],
  },
);
