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

const cases = [
  {
    name: "dom static and dynamic",
    source: `const view = <div class={cls()} onClick={handle}>Hi {name}</div>;`,
    options: domOptions
  },
  {
    name: "ssr with hydration",
    source: `const view = <main><h1 title={title()}>Hello</h1><For each={items()}>{item => <span>{item}</span>}</For></main>;`,
    options: ssrOptions
  },
  {
    name: "universal basic",
    source: `const view = <section><button onClick={click}>Go</button></section>;`,
    options: universalOptions
  }
];

describe("transform snapshots", () => {
  for (const testCase of cases) {
    test(testCase.name, () => {
      const result = transformJSX(testCase.source, testCase.options);
      expect(result).toMatchSnapshot();
    });
  }
});
