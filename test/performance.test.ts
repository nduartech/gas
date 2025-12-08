import { describe, test, expect } from "bun:test";
import { transformJSX } from "../src/transformer.js";
import type { ResolvedGasOptions } from "../src/types.js";

const builtIns = [
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
];

const baseOptions: Omit<ResolvedGasOptions, "generate" | "hydratable" | "moduleName" | "runtime"> = {
  builtIns: new Set(builtIns),
  delegateEvents: true,
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
  filter: /\.[tj]sx$/
};

const domOptions: ResolvedGasOptions = {
  ...baseOptions,
  generate: "dom",
  hydratable: false,
  moduleName: "solid-js/web",
  runtime: undefined
};

const ssrOptions: ResolvedGasOptions = {
  ...baseOptions,
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/web",
  runtime: "ssr"
};

const universalOptions: ResolvedGasOptions = {
  ...baseOptions,
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/universal",
  runtime: "universal"
};

const domSource = `const view = <div class={cls()} onClick={handle}>Hi {name}</div>;`;
const ssrSource = `const view = <main><h1 title={title()}>Hello</h1><For each={items()}>{item => <span>{item}</span>}</For></main>;`;
const universalSource = `const view = <section><button onClick={click}>Go</button></section>;`;

describe("performance smoke", () => {
  test("transform dom basic", () => {
    const iterations = 200;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      transformJSX(domSource, domOptions);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  test("transform ssr hydratable", () => {
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      transformJSX(ssrSource, ssrOptions);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  test("transform universal", () => {
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      transformJSX(universalSource, universalOptions);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});
