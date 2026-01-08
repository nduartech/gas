import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { transformJSX } from "../src/transformer.js";
import type { ResolvedGasOptions } from "../src/types.js";

const fixtureRoot = path.join(import.meta.dir, "fixtures", "fixture-based");
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

const domOptions: ResolvedGasOptions = {
  generate: "dom",
  hydratable: false,
  moduleName: "solid-js/web",
  runtime: undefined,
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

const domHydratableOptions: ResolvedGasOptions = {
  ...domOptions,
  hydratable: true
};

const ssrOptions: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/web",
  runtime: "ssr",
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

const hydratableOptions: ResolvedGasOptions = {
  ...ssrOptions,
  hydratable: true,
  runtime: "ssr",
  moduleName: "solid-js/web"
};

const universalOptions: ResolvedGasOptions = {
  ...ssrOptions,
  hydratable: true,
  runtime: "universal",
  moduleName: "solid-js/universal"
};

const modeOptions: Record<string, ResolvedGasOptions> = {
  dom: domOptions,
  domHydratable: domHydratableOptions,
  ssr: ssrOptions,
  hydratable: hydratableOptions,
  universal: universalOptions
};

function collectFixtures(kind: keyof typeof modeOptions): string[] {
  const dir = path.join(fixtureRoot, kind);
  if (!readdirSync(dir, { withFileTypes: true }).length) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(dir, entry.name));
}

describe("fixture-based runner parity", () => {
  for (const kind of Object.keys(modeOptions)) {
    test(`${kind} fixtures`, () => {
      for (const dir of collectFixtures(kind as keyof typeof modeOptions)) {
        const input = readFileSync(path.join(dir, "input.tsx"), "utf8");
        const expected = readFileSync(path.join(dir, "output.js"), "utf8").trim();
        const result = transformJSX(input, modeOptions[kind]!).trim();
        expect(result).toBe(expected);
      }
    });
  }
});
