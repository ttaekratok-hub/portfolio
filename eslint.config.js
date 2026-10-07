// ESLint configuration. ESLint is a linter: it reads the code without running
// it (static analysis) and flags likely bugs and risky patterns. TypeScript
// checks types; ESLint checks how the code is written, like React's rules for
// hooks or a missing alt text. `npm run lint` runs both (`eslint . && tsc`),
// and CI runs it before any build, so a problem fails in seconds.
//
// This is a "flat config": a list of config objects. Each one adds settings
// and rules, and where two disagree, the later one wins. defineConfig accepts
// the nested lists some plugins export (tseslint.configs.recommended is one).
//
// Try it:
//   npx eslint --print-config site/src/App.tsx
//     prints the final, merged rule set ESLint uses for that file.
//   Add <img src="/favicon.svg" /> to Hero.tsx and run npx eslint site/src:
//     jsx-a11y/alt-text reports the missing alt text. Then undo.
// Learn more: https://eslint.org/docs/latest/use/configure/configuration-files
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default defineConfig(
  // Build output: generated code (minified, in dist/) that isn't ours to fix.
  // (ESLint already skips node_modules by default; listing it is just explicit.)
  { ignores: ["dist", "dist-ssr", "node_modules"] },
  // ESLint's core rules for any JavaScript, e.g. no-unused-vars, no-undef (a
  // name that doesn't exist), no-unreachable (code after a return).
  js.configs.recommended,
  // typescript-eslint: a parser that understands TypeScript syntax (ESLint's
  // own only reads JavaScript), plus rules such as no-explicit-any (`any`
  // switches type checking off) and ban-ts-comment (@ts-ignore hides errors).
  // It also turns off core rules TypeScript already covers, like no-undef, and
  // makes `eslint .` lint .ts/.tsx files too. This preset works without type
  // information, so it's fast; the stricter recommendedTypeChecked preset
  // would ask TypeScript for types too. Learn more: https://typescript-eslint.io/
  tseslint.configs.recommended,
  // React's hook rules. rules-of-hooks: call hooks only at the top level of a
  // component or custom hook, never inside a condition or loop, because React
  // tells hooks apart by their call order on every render. exhaustive-deps:
  // an effect's dependency array lists every value the effect reads, so it
  // never runs with stale values. The rest come from the React Compiler, e.g.
  // purity (no Math.random() or Date.now() while rendering) and refs (no
  // reading ref.current while rendering). Both "recommended" and
  // "recommended-latest" are flat-config presets; "-latest" also turns on the
  // plugin's newest, experimental compiler rules (such as void-use-memo).
  // Learn more: https://react.dev/reference/rules/rules-of-hooks
  reactHooks.configs.flat["recommended-latest"],
  // Accessibility rules for JSX: alt text, labels, valid ARIA, keyboard use.
  // ARIA attributes (aria-label, aria-pressed...) describe elements to screen
  // readers. A linter can only catch what's visible in the code; the role
  // queries in tests/app.test.tsx and trying the page with a screen reader
  // cover the rest. ("a11y" is short for accessibility: a, 11 letters, y.)
  // Learn more: https://github.com/jsx-eslint/eslint-plugin-jsx-a11y
  jsxA11y.flatConfigs.recommended,
  {
    // Global variables the code may use without importing them. The repo has
    // both kinds of code: browser code in site/src (window, document) and
    // Node.js code in scripts/, tests/ and the configs (process). In .ts/.tsx
    // files TypeScript already knows the globals; this matters for the plain
    // .js and .mjs files, where no-undef is still on: without it,
    // scripts/prerender.mjs would fail lint for using console and URL.
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
);
