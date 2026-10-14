import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import tseslint from "typescript-eslint";

const currentDir = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: currentDir });

const eslintConfig = [
  // .agents y .claude guardan skills instaladas (scripts de terceros), no código de la app.
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts", ".agents/**", ".claude/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      // La regla naming-convention con `types: ["function"]` requiere type info
      parserOptions: { projectService: true, tsconfigRootDir: currentDir },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/naming-convention": [
        "error",
        // Funciones y métodos: snake_case
        { selector: "function", format: ["snake_case"] },
        { selector: "method", format: ["snake_case"] },
        { selector: "variable", types: ["function"], format: ["snake_case"] },
        // Clases, interfaces y tipos: PascalCase
        { selector: "class", format: ["PascalCase"] },
        { selector: "interface", format: ["PascalCase"] },
        { selector: "typeAlias", format: ["PascalCase"] },
        // Variables: camelCase
        { selector: "variable", format: ["camelCase"] },
      ],
    },
  },
  {
    // Los componentes React (JSX) requieren PascalCase por el propio framework
    files: ["**/*.tsx"],
    rules: {
      "@typescript-eslint/naming-convention": [
        "error",
        { selector: "function", format: ["snake_case", "PascalCase"] },
        { selector: "method", format: ["snake_case"] },
        {
          selector: "variable",
          types: ["function"],
          format: ["snake_case", "PascalCase"],
        },
        { selector: "class", format: ["PascalCase"] },
        { selector: "interface", format: ["PascalCase"] },
        { selector: "typeAlias", format: ["PascalCase"] },
        { selector: "variable", format: ["camelCase"] },
      ],
    },
  },
];

export default eslintConfig;
