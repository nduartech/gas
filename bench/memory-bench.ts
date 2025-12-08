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

const source = `const view = <div class={cls()} onClick={handle}>Hi {name}</div>;`;

function formatMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function snapshot(label: string) {
  const mem = process.memoryUsage();
  console.log(label, {
    rss: formatMB(mem.rss),
    heapTotal: formatMB(mem.heapTotal),
    heapUsed: formatMB(mem.heapUsed),
    external: formatMB(mem.external)
  });
}

function run(iterations: number) {
  console.log(`Running ${iterations} dom transforms...`);
  snapshot("before");
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    transformJSX(source, domOptions);
  }
  const elapsed = performance.now() - start;
  snapshot("after");
  console.log(`Elapsed: ${elapsed.toFixed(2)}ms (${(elapsed / iterations).toFixed(3)} ms/iter)`);
}

run(1000);
