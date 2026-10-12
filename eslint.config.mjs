import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Type-checked rules for src .ts/.tsx files (requires parserOptions).
  {
    files: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.mts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // General overrides.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vercel build output (generated bundles/launchers — bukan source):
    ".vercel/**",
    // Agent Manager worktrees: duplicate full copy of the repo (generated):
    ".kilo/worktrees/**",
    // Local audit / Playwright E2E harness (bukan source app):
    ".audit/**",
    ".e2e-tmp/**",
    "test-results/**",
    // macOS AppleDouble metadata:
    "**/._*",
  ]),
]);

export default eslintConfig;
