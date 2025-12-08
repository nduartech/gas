import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { transformJSX } from "../src/transformer.js";
import type { ResolvedGasOptions } from "../src/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureDir = path.join(__dirname, "fixtures", "cross", "simple");

const BUILT_INS = [
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
  builtIns: new Set(BUILT_INS),
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

const ssrOptions: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/web",
  runtime: "ssr",
  builtIns: new Set(BUILT_INS),
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

describe("cross validation fixtures", () => {
  test("dom output matches reference", () => {
    const input = readFileSync(path.join(fixtureDir, "input.tsx"), "utf8");
    const expected = readFileSync(path.join(fixtureDir, "output.dom.js"), "utf8").trim();
    const result = transformJSX(input, domOptions).trim();
    expect(result).toBe(expected);
  });

  test("ssr output matches reference", () => {
    const input = readFileSync(path.join(fixtureDir, "input.tsx"), "utf8");
    const expected = readFileSync(path.join(fixtureDir, "output.ssr.js"), "utf8").trim();
    const result = transformJSX(input, ssrOptions).trim();
    expect(result).toBe(expected);
  });
});
