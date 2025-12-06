import { describe, test, expect } from "bun:test";
import { parseJSX } from "../src/parser.js";
import { generateSolidCode } from "../src/generator.js";
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
  wrapConditionals: true,
  contextToCustomElements: true,
  dev: false,
  filter: /\.[tj]sx$/
};

const ssrOptions: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/web",
  runtime: "ssr",
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
  wrapConditionals: true,
  contextToCustomElements: true,
  dev: false,
  filter: /\.[tj]sx$/
};

describe("generateSolidCode (DOM)", () => {
  test("emits template for fully static element", () => {
    const jsx = parseJSX(`<div class="a">Hello</div>`);
    const result = generateSolidCode(jsx, domOptions);

    expect(result.imports.has("template")).toBe(true);
    expect(result.templates.length).toBeGreaterThan(0);
    expect(result.code).toContain("_tmpl$");
  });

  test("handles dynamic props, events, spreads, refs, and expressions", () => {
    const jsx = parseJSX(
      `<button {...props} class={cls()} style={{ color: color() }} onClick={handle} ref={el} use:foo={bar}>Hi {name}</button>`
    );

    const result = generateSolidCode(jsx, domOptions);

    expect(result.imports.has("template")).toBe(true);
    expect(result.imports.has("spread")).toBe(true);
    expect(result.imports.has("style")).toBe(true);
    // At least one event helper should be present (delegated or direct)
    // DOM path may use direct handlers without registering event helpers when non-delegated
    const hasEventHelper =
      result.imports.has("delegateEvents") ||
      result.imports.has("addEventListener") ||
      result.code.includes("$$click") ||
      result.code.includes("addEventListener");
    expect(hasEventHelper).toBe(true);
    expect(result.code).toContain("_$spread");
    expect(result.code).toContain("_$style");
    expect(result.code).toContain("handle");
    expect(result.code).toContain("name");
  });
});

describe("generateSolidCode (SSR)", () => {
  test("emits SSR helpers for attributes, classList, and style", () => {
    const jsx = parseJSX(
      `<div classList={{ active: isActive }} style={{ color: color() }} {...rest} prop:checked={checked} attr:data-id={id} on:scroll={handleScroll}>Text</div>`
    );

    const result = generateSolidCode(jsx, ssrOptions);

    expect(result.imports.has("ssrElement")).toBe(true);
    expect(result.imports.has("ssrClassList")).toBe(true);
    expect(result.imports.has("ssrStyle")).toBe(true);
    // ssrAttribute only needed for boolean attrs; prop: / attr: are direct
    expect(result.imports.has("ssrAttribute") || result.imports.has("mergeProps")).toBe(true);
    expect(result.code).toContain("_$ssrElement");
    expect(result.code).toContain("ssrClassList");
    expect(result.code).toContain("ssrStyle");
    expect(result.code).toContain("data-id");
  });
});
