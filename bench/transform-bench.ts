import { performance } from "perf_hooks";
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

function run(label: string, iterations: number, source: string, options: ResolvedGasOptions) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    transformJSX(source, options);
  }
  const elapsed = performance.now() - start;
  console.log(`${label}: ${iterations} iters in ${elapsed.toFixed(2)}ms (${(elapsed / iterations).toFixed(3)} ms/iter)`);
}

run("dom basic", 500, domSource, domOptions);
run("ssr hydratable", 250, ssrSource, ssrOptions);
run("universal", 250, universalSource, universalOptions);
