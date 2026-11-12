import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * ESLint flat configuration.
 *
 * The rules below are not stylistic preferences. Each one exists because of a
 * mistake that is easy to make in this codebase and expensive to make in a
 * system that handles health information.
 */
const config = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "services/**",
      "src/db/migrations/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "next-env.d.ts",
    ],
  },

  ...coreWebVitals,
  ...nextTypescript,

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },

  {
    // Components render. They never reach the database and never call a
    // service directly: data is loaded in a server component or a server
    // action and passed in.
    files: ["src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db",
              message:
                "Components must not reach the database. Load data in a server component or a server action and pass it in as a prop.",
            },
            {
              name: "postgres",
              message: "Components must not open a database connection.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/*/service", "@/lib/*/queries", "@/lib/jobs/*", "@/lib/storage"],
              message:
                "Components must not call service or query modules directly. Pass the data in, or call a server action.",
            },
          ],
        },
      ],
    },
  },

  {
    files: ["tests/**/*.ts", "e2e/**/*.ts", "scripts/**/*.{ts,mjs}"],
    rules: {
      "no-console": "off",
    },
  },
];

export default config;
