import { describe, test, expect } from "bun:test";
import { parseJSX } from "../src/parser.js";
import { generateSolidCode } from "../src/generator.js";
import { transformJSX } from "../src/transformer.js";
import type { ResolvedGasOptions } from "../src/types.js";

const domOptions: ResolvedGasOptions = {
  generate: "dom",
  hydratable: false,
  moduleName: "solid-js/web",
  runtime: undefined,
  builtIns: new Set([
    "For",
    "Show",
    "Switch",
    "Match",
    "Suspense",
    "SuspenseList",
    "Portal",
    "Index",
    "Dynamic",
    "ErrorBoundary"
  ]),
  delegateEvents: true,
  delegatedEvents: new Set<string>(),
  wrapConditionals: true,
  omitNestedClosingTags: false,
  omitLastClosingTag: true,
  omitQuotes: true,
  requireImportSource: false,
  contextToCustomElements: true,
  staticMarker: "@once",
  effectWrapper: "effect",
  memoWrapper: "memo",
  validate: true,
  dev: false,
  sourceMap: false,
  filter: /\.[tj]sx$/
};

const hydratableDomOptions: ResolvedGasOptions = {
  ...domOptions,
  hydratable: true
};

describe("regression tests", () => {
  describe("spread props in DOM components", () => {
    test("handles single spread with regular props in component", () => {
      const jsx = parseJSX(`<Component {...props} foo="bar" />`);
      const result = generateSolidCode(jsx, domOptions);

      expect(result.imports.has("mergeProps")).toBe(true);
      expect(result.code).toContain("mergeProps");
    });

    test("handles multiple spreads in component", () => {
      const jsx = parseJSX(`<Component {...a} {...b} c="d" />`);
      const result = generateSolidCode(jsx, domOptions);

      expect(result.imports.has("mergeProps")).toBe(true);
      expect(result.code).toContain("mergeProps");
    });

    test("handles spread after regular props in component", () => {
      const jsx = parseJSX(`<Component foo="bar" {...props} />`);
      const result = generateSolidCode(jsx, domOptions);

      expect(result.imports.has("mergeProps")).toBe(true);
      expect(result.code).toContain("mergeProps");
    });
  });

  describe("non-hydratable DOM child references", () => {
    test("uses unique variable names for sibling refs", () => {
      const jsx = parseJSX(`<div>{a}{b}{c}</div>`);
      const result = generateSolidCode(jsx, domOptions);

      const elRefDefs = result.code.match(/const _el\$\d+ = /g);
      expect(elRefDefs).toBeDefined();
      if (elRefDefs) {
        const uniqueDefs = new Set(elRefDefs);
        expect(uniqueDefs.size).toBe(elRefDefs.length);
      }
    });

    test("does not collide with template variable names", () => {
      const jsx = parseJSX(`<div>{a}{b}</div>`);
      const result = generateSolidCode(jsx, domOptions);

      const tmplCount = (result.code.match(/_tmpl\$/g) || []).length;
      const elCount = (result.code.match(/_el\$/g) || []).length;
      expect(tmplCount).toBeGreaterThan(0);
      expect(elCount).toBeGreaterThan(0);
    });
  });

  describe("static-marker comment variants in JSX attributes", () => {
    test("recognizes /* @once */ format", () => {
      const source = `const x = <div class={/* @once */ cls()} />;`;
      const result = transformJSX(source, domOptions);

      expect(result).not.toContain("_$effect");
      expect(result).toContain("className");
    });

    test("recognizes /** @once */ JSDoc format", () => {
      const source = `const x = <div class={/** @once */ cls()} />;`;
      const result = transformJSX(source, domOptions);

      expect(result).not.toContain("_$effect");
      expect(result).toContain("className");
    });

    test("recognizes /*@once*/ without spaces", () => {
      const source = `const x = <div class={/*@once*/ cls()} />;`;
      const result = transformJSX(source, domOptions);

      expect(result).not.toContain("_$effect");
      expect(result).toContain("className");
    });

    test("recognizes /*  @once  */ with extra whitespace", () => {
      const source = `const x = <div class={/*  @once  */ cls()} />;`;
      const result = transformJSX(source, domOptions);

      expect(result).not.toContain("_$effect");
      expect(result).toContain("className");
    });
  });
});
