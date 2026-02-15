import prettierPlugin from "eslint-plugin-prettier";
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";

// Source
import customRule from "./dist/eslint.customRule.js";

const configIgnore = {
    ignores: [
        ".cache",
        ".config",
        ".ipython",
        ".jupyter",
        ".lmstudio",
        ".local",
        ".npm",
        ".nv",
        ".paddlex",
        ".pki",
        "certificate",
        "dist",
        "node_modules",
        "public",
        "src-tauri"
    ]
};

const configBase = {
    languageOptions: {
        globals: Object.assign({}, global.browser, global.node),
        sourceType: "module",
        parserOptions: {
            ecmaVersion: 2022
        }
    },
    plugins: {
        prettier: prettierPlugin
    },
    rules: {
        "no-console": "error",
        "no-debugger": "error",
        "prettier/prettier": [
            "error",
            {
                proseWrap: "always",
                printWidth: 150,
                arrowParens: "always",
                bracketSpacing: true,
                embeddedLanguageFormatting: "auto",
                htmlWhitespaceSensitivity: "css",
                quoteProps: "as-needed",
                semicolons: true,
                singleQuote: false,
                trailingComma: "none",
                endOfLine: "lf"
            }
        ]
    }
};

const configTypescript = {
    files: ["eslint.customRule.ts", "global.d.ts", "src/**/*.{ts,tsx}", "file/input/**/*.{ts,tsx}"],
    languageOptions: {
        ...configBase.languageOptions,
        parser: typescriptParser,
        parserOptions: {
            ...configBase.languageOptions.parserOptions,
            tsconfigRootDir: "./",
            project: "./tsconfig.json"
        }
    },
    plugins: {
        ...configBase.plugins,
        "custom-rule": customRule,
        "@typescript-eslint": typescriptPlugin
    },
    rules: {
        ...configBase.rules,
        "custom-rule/no-array-assignment-for-object-type": "error",
        "@typescript-eslint/no-explicit-any": "error",
        "@typescript-eslint/no-unused-vars": [
            "error",
            {
                varsIgnorePattern: "^jsxFactory$"
            }
        ]
    }
};

const configJavascript = {
    files: ["eslint.config.js", "webpack.build.js", "src/**/*.{js,jsx}", "file/input/**/*.{js,jsx}"],
    languageOptions: {
        ...configBase.languageOptions
    },
    plugins: {
        ...configBase.plugins
    },
    rules: {
        ...configBase.rules
    }
};

export default [configIgnore, configTypescript, configJavascript];
