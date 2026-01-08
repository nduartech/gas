/**
 * Tests for the JSX transformer
 */

import { describe, test, expect } from "bun:test";
import { transformJSX, transformJSXWithMap, hasJSX } from "../src/transformer.js";
import type { ResolvedGasOptions } from "../src/types.js";
import { domBasic } from "./golden/dom-basic.js";
import { ssrBasic } from "./golden/ssr-basic.js";
import { ssrSpread } from "./golden/ssr-spread.js";
import { ssrAttrs } from "./golden/ssr-attrs.js";
import { ssrEvents } from "./golden/ssr-events.js";
import { ssrClassStyle } from "./golden/ssr-class-style.js";
import { ssrPortalFragment } from "./golden/ssr-portal-fragment.js";
import { ssrDelegation } from "./golden/ssr-delegation.js";
import { ssrNestedSpread } from "./golden/ssr-nested-spread.js";

const defaultOptions: ResolvedGasOptions = {
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
  delegatedEvents: new Set(),
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

describe("hasJSX", () => {
  test("detects JSX element", () => {
    expect(hasJSX("<div>Hello</div>")).toBe(true);
  });

  test("detects JSX fragment", () => {
    expect(hasJSX("<>Hello</>")).toBe(true);
  });

  test("detects JSX component", () => {
    expect(hasJSX("<MyComponent />")).toBe(true);
  });

  test("returns false for non-JSX", () => {
    expect(hasJSX("const x = 1 < 2;")).toBe(false);
    expect(hasJSX("function foo() { return 42; }")).toBe(false);
  });
});

describe("transformJSX", () => {
  test("avoids collisions with user-defined helper identifiers", () => {
    const source = `
      const _$template = 123;
      const el = <div>Hello</div>;
      export const value = _$template;
    `;
    const result = transformJSX(source, defaultOptions);

    // Import should not collide with existing _$template binding.
    expect(result).toContain("template as _$template2");
    // The user's reference must still point at their original variable.
    expect(result).toContain("export const value = _$template;");
  });

  test("avoids shadowing user identifiers inside embedded expressions", () => {
    const source = `
      const _el$0 = "USER";
      const el = <div>{_el$0}</div>;
    `;
    const result = transformJSX(source, defaultOptions);

    // Our generated IIFE must not declare const _el$0 = ...
    expect(result).not.toMatch(/const _el\\$0\\s*=/);
    // The inserted expression must still reference the user's _el$0 variable.
    expect(result).toContain(", _el$0,");
  });

  test("preserves shebang at the top of the file", () => {
    const source = `#!/usr/bin/env bun\nconst el = <div>Hello</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result.startsWith("#!/usr/bin/env bun\n")).toBe(true);
    // Shebang must come before generated imports
    expect(result.indexOf("#!/usr/bin/env bun")).toBeLessThan(result.indexOf("import {"));
  });

  test("preserves directive prologue before generated imports", () => {
    const source = `#!/usr/bin/env bun\n"use client";\nconst el = <div>Hello</div>;`;
    const result = transformJSX(source, defaultOptions);

    const shebangIndex = result.indexOf("#!/usr/bin/env bun");
    const directiveIndex = result.indexOf("\"use client\";");
    const importIndex = result.indexOf("import {");

    expect(shebangIndex).toBe(0);
    expect(directiveIndex).toBeGreaterThan(shebangIndex);
    expect(importIndex).toBeGreaterThan(directiveIndex);
  });

  test("respects requireImportSource pragma when set", () => {
    const optionsWithPragma: ResolvedGasOptions = { ...defaultOptions, requireImportSource: "solid-js" };

    const sourceWithPragma = `/** @jsxImportSource solid-js */\nconst el = <div>Hello</div>;`;
    const transformed = transformJSX(sourceWithPragma, optionsWithPragma);

    expect(transformed).not.toBe(sourceWithPragma);
    expect(transformed).toContain("_$template");

    const sourceWithoutPragma = `const el = <div>Hello</div>;`;
    const notTransformed = transformJSX(sourceWithoutPragma, optionsWithPragma);

    expect(notTransformed).toBe(sourceWithoutPragma);
  });

  test("handles various @jsxImportSource comment formats", () => {
    const optionsWithPragma: ResolvedGasOptions = { ...defaultOptions, requireImportSource: "solid-js" };

    // Test double-asterisk block comment
    const source1 = `/** @jsxImportSource solid-js */\nconst el = <div>Hello</div>;`;
    expect(transformJSX(source1, optionsWithPragma)).toContain("_$template");

    // Test single-asterisk block comment
    const source2 = `/* @jsxImportSource solid-js */\nconst el = <div>Hello</div>;`;
    expect(transformJSX(source2, optionsWithPragma)).toContain("_$template");

    // Test line comment
    const source3 = `// @jsxImportSource solid-js\nconst el = <div>Hello</div>;`;
    expect(transformJSX(source3, optionsWithPragma)).toContain("_$template");

    // Test with extra whitespace
    const source4 = `/*  @jsxImportSource   solid-js  */\nconst el = <div>Hello</div>;`;
    expect(transformJSX(source4, optionsWithPragma)).toContain("_$template");

    // Test pragma not at start of file
    const source5 = `// Some other comment\n/** @jsxImportSource solid-js */\nconst el = <div>Hello</div>;`;
    expect(transformJSX(source5, optionsWithPragma)).toContain("_$template");

    // Test wrong import source - should NOT transform
    const source6 = `/** @jsxImportSource react */\nconst el = <div>Hello</div>;`;
    expect(transformJSX(source6, optionsWithPragma)).toBe(source6);
  });

  test("transforms simple element", () => {
    const source = `const el = <div>Hello</div>;`;
    const result = transformJSX(source, defaultOptions);
 
    expect(result).toContain("_$template");
    expect(result).toContain("Hello");
    expect(result).toContain('import { template as _$template } from "solid-js/web"');
  });

  test("transformJSXWithMap returns a sourcemap for JSX transforms", () => {
    const source = `const el = <div>Hello</div>;`;
    const result = transformJSXWithMap(source, defaultOptions, "input.tsx");

    expect(result.code).toContain("_$template");
    expect(result.map).toBeTruthy();
    expect(result.map.sources).toContain("input.tsx");
  });

  test("uses custom effect/memo wrapper names in imports", () => {
    const customOptions: ResolvedGasOptions = {
      ...defaultOptions,
      effectWrapper: "createEffect",
      memoWrapper: "createMemo"
    };

    const source = `const el = <div class={className()}>Content</div>;`;
    const result = transformJSX(source, customOptions);

    // Should import the configured wrapper name as _$effect
    expect(result).toContain('import { template as _$template, createEffect as _$effect } from "solid-js/web"');
  });

  test("supports wrapperless mode (effectWrapper/memoWrapper: false)", () => {
    const wrapperlessOptions: ResolvedGasOptions = {
      ...defaultOptions,
      effectWrapper: false,
      memoWrapper: false
    };
    const source = `
      const el = (
        <div classList={{ active: state.active }}>
          {state.active ? good() : bad}
        </div>
      );
    `;
    const result = transformJSX(source, wrapperlessOptions);

    expect(result).not.toContain("_$effect");
    expect(result).not.toContain("_$memo");
  });


  test("transforms element with static attributes", () => {
    const source = `const el = <div id="main" class="container">Content</div>`;
    const result = transformJSX(source, defaultOptions);
 
    expect(result).toContain("id=");
    expect(result).toContain("class=");
  });

  test("omitQuotes removes quotes from safe attribute values", () => {
    // Default options have omitQuotes: true
    const source = `const el = <div class="simple">Content</div>`;
    const result = transformJSX(source, defaultOptions);
    
    // Should omit quotes for simple values
    expect(result).toContain("class=simple");
    expect(result).not.toContain('class="simple"');
  });

  test("omitQuotes keeps quotes for values with special characters", () => {
    const source = `const el = <div class="has space">Content</div>`;
    const result = transformJSX(source, defaultOptions);
    
    // Should keep quotes for values with spaces
    expect(result).toContain('class="has space"');
  });

  test("omitQuotes: false keeps all quotes", () => {
    const optionsWithQuotes: ResolvedGasOptions = { ...defaultOptions, omitQuotes: false };
    const source = `const el = <div class="simple">Content</div>`;
    const result = transformJSX(source, optionsWithQuotes);
    
    // Should keep quotes when omitQuotes is false
    expect(result).toContain('class="simple"');
  });

  test("applies closing tag minimization in DOM mode by default (babel parity)", () => {
    const optionsWithNested: ResolvedGasOptions = {
      ...defaultOptions,
      omitNestedClosingTags: true,
      omitLastClosingTag: true
    };

    const source = `const el = <div><span>First</span><span>Second</span></div>`;
    const result = transformJSX(source, optionsWithNested);

    // Last closing tags are omitted when enabled
    expect(result).toContain("_$template(`<div><span>First</span><span>Second`)");
  });


  test("transforms element with dynamic attributes", () => {
    const source = `const el = <div class={className()}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);
 
    expect(result).toContain("className()");
    expect(result).toContain("_$effect");
  });

  test("respects staticMarker on attribute expressions", () => {
    const source = `const el = <div class={/*@once*/ computeClass()}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);

    // Expression should still be present
    expect(result).toContain("computeClass()");
    // But no effect wrapper should be generated
    expect(result).not.toContain("_$effect");
  });


  test("transforms element with event handler", () => {
    const source = `const el = <button onClick={handleClick}>Click</button>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("$$click");
    expect(result).toContain("_$delegateEvents");
  });

  test("transforms element with ref", () => {
    const source = `let div; const el = <div ref={div}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("div =");
  });

  test("ref call expressions are evaluated once (babel-preset-solid parity)", () => {
    const source = `
      const getRef = () => (el) => console.log(el);
      const el = <div ref={getRef()}>Content</div>;
    `;
    const result = transformJSX(source, defaultOptions);

    // Should not attempt to assign to the call expression and should not call getRef() twice.
    expect(result).not.toContain("getRef() =");
    expect(result.match(/getRef\(\)/g)?.length).toBe(1);
    // Should introduce a temp ref var and invoke it if function.
    expect(result).toMatch(/const _ref\$\d+ = getRef\(\);/);
    expect(result).toMatch(/typeof _ref\$\d+ === "function" && _ref\$\d+\(/);
  });

  test("transforms fragment", () => {
    const source = `const el = <><span>A</span><span>B</span></>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("span");
  });

  test("transforms component", () => {
    const source = `const el = <MyComponent prop="value" />;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$createComponent");
    expect(result).toContain("MyComponent");
  });

  test("transforms built-in component", () => {
    const source = `const el = <For each={items}>{item => <div>{item}</div>}</For>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("For");
    // Built-ins are called directly, not through createComponent
    expect(result).not.toContain("_$createComponent(For");
  });

  test("transforms Show built-in with fallback", () => {
    const source = `const el = <Show when={visible()} fallback={<p>Loading</p>}><div>Content</div></Show>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("Show(");
    expect(result).toContain("visible()");
    expect(result).toContain("fallback");
    expect(result).not.toContain("_$createComponent(Show");
  });

  test("transforms Switch/Match built-ins", () => {
    const source = `const el = <Switch><Match when={a()}>A</Match><Match when={b()}>B</Match></Switch>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("Switch(");
    expect(result).toContain("Match(");
    expect(result).not.toContain("_$createComponent(Switch");
    expect(result).not.toContain("_$createComponent(Match");
  });

  test("built-in components work in SSR mode", () => {
    const ssrOptions: ResolvedGasOptions = { ...defaultOptions, generate: "ssr", hydratable: false };
    const source = `const el = <For each={items()}>{item => <span>{item}</span>}</For>;`;
    const result = transformJSX(source, ssrOptions);

    // In SSR mode, built-ins are also called directly
    expect(result).toContain("For(");
    expect(result).not.toContain("_$createComponent(For");
  });


  test("nested built-in components work correctly", () => {
    const source = `
      const el = (
        <Show when={visible()}>
          <For each={items()}>
            {item => <div>{item.name}</div>}
          </For>
        </Show>
      );
    `;
    const result = transformJSX(source, defaultOptions);

    // Both built-ins should be called directly
    expect(result).toContain("Show(");
    expect(result).toContain("For(");
    expect(result).not.toContain("_$createComponent(Show");
    expect(result).not.toContain("_$createComponent(For");
  });

  test("built-in inside custom component works correctly", () => {
    const source = `
      const el = (
        <MyComponent>
          <For each={items()}>{item => <span>{item}</span>}</For>
        </MyComponent>
      );
    `;
    const result = transformJSX(source, defaultOptions);

    // MyComponent should use createComponent, For should be called directly
    expect(result).toContain("_$createComponent(MyComponent");
    expect(result).toContain("For(");
    expect(result).not.toContain("_$createComponent(For");
  });

  test("built-in with member expression prop works correctly", () => {
    const source = `const el = <Show when={props.visible}><div>Content</div></Show>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("Show(");
    expect(result).toContain("props.visible");
  });

  test("transforms expression children", () => {
    const source = `const el = <div>{count()}</div>;`;
    const result = transformJSX(source, defaultOptions);
 
    expect(result).toContain("_$insert");
    // Zero-arg call expressions are treated as accessors (dom-expressions parity)
    expect(result).toContain(", count,");
  });

  test("treats member expressions as dynamic (dom-expressions parity)", () => {
    const source = `const el = <div>{props.name}</div>;`;
    const result = transformJSX(source, defaultOptions);

    // Member expressions should be wrapped in an accessor so they can be tracked.
    expect(result).toContain("_$insert");
    expect(result).toContain("() => props.name");
  });

  test("treats member expressions in attributes as dynamic (dom-expressions parity)", () => {
    const source = `const el = <div title={props.title}>x</div>;`;
    const result = transformJSX(source, defaultOptions);

    // Dynamic attributes should be updated inside an effect.
    expect(result).toContain("_$effect");
    expect(result).toContain('setAttribute("title", props.title)');
  });

  test("treats member expressions in component props as dynamic (dom-expressions parity)", () => {
    const source = `const el = <Comp value={props.value} />;`;
    const result = transformJSX(source, defaultOptions);

    // Dynamic component props should be getter properties.
    expect(result).toContain('get "value"() { return props.value; }');
  });

  test("respects staticMarker on child expressions", () => {
    const source = `const el = <div>{/*@once*/ count()}</div>;`;
    const result = transformJSX(source, defaultOptions);

    // Expression should be passed directly without wrapping in a function or memo
    expect(result).toContain("count()");
    expect(result).not.toContain("=> count()");
    expect(result).not.toContain("_$memo");
  });

  test("respects staticMarker with whitespace variations", () => {
    // Test various whitespace formats
    const source1 = `const el = <div>{/* @once */ count()}</div>;`;
    const result1 = transformJSX(source1, defaultOptions);
    expect(result1).toContain("count()");
    expect(result1).not.toContain("=> count()");

    const source2 = `const el = <div>{/*  @once  */ count()}</div>;`;
    const result2 = transformJSX(source2, defaultOptions);
    expect(result2).toContain("count()");
    expect(result2).not.toContain("=> count()");

    // Attribute context with whitespace
    const source3 = `const el = <div class={/* @once */ computeClass()}>Content</div>;`;
    const result3 = transformJSX(source3, defaultOptions);
    expect(result3).toContain("computeClass()");
    expect(result3).not.toContain("_$effect");
  });


  test("transforms conditional expression", () => {
    const source = `const el = <div>{show() && <span>Visible</span>}</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("show()");
  });

  test("transforms spread props", () => {
    const source = `const el = <div {...props}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$spread");
  });

  test("transforms multiple spread props with mergeProps", () => {
    const source = `const el = <Comp {...a} {...b} />;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$mergeProps");
    expect(result).toContain("a");
    expect(result).toContain("b");
  });

  test("merges spread with regular props in components", () => {
    const source = `const el = <Comp {...props} foo="bar" baz={qux()} />;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$mergeProps");
    expect(result).toContain("props");
    expect(result).toContain('"foo": "bar"');
    expect(result).toContain("qux()");
  });

  test("transforms classList", () => {
    const source = `const el = <div classList={{ active: isActive() }}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$classList");
  });

  test("transforms style object", () => {
    const source = `const el = <div style={{ color: color() }}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$style");
  });

  test("transforms use: directive", () => {
    const source = `const el = <div use:myDirective={value}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$use");
    expect(result).toContain("myDirective");
  });

  test("transforms SVG elements", () => {
    const source = `const el = <svg><circle cx="50" cy="50" r="40" /></svg>;`;
    const result = transformJSX(source, defaultOptions);
 
    expect(result).toContain("svg");
    expect(result).toContain("circle");
  });

  test("SVG elements with dynamic className use setAttribute instead of className property", () => {
    const source = `const el = <svg className={someSignal()}>Content</svg>;`;
    const result = transformJSX(source, defaultOptions);
 
    // SVG elements should use setAttribute("class", ...) in effect, not .className =
    expect(result).toContain('setAttribute("class"');
    expect(result).toContain("_$effect");
    expect(result).not.toMatch(/\.className\s*=/);
  });

  test("SVG elements with dynamic class attribute use setAttribute", () => {
    const source = `const el = <svg class={someSignal()}>Content</svg>;`;
    const result = transformJSX(source, defaultOptions);
 
    // SVG elements should use setAttribute("class", ...) not .className =
    expect(result).toContain('setAttribute("class"');
    expect(result).not.toMatch(/\.className\s*=/);
  });

  test("SVG elements with static className expression use setAttribute", () => {
    const source = `const el = <svg className={"my-class"}>Content</svg>;`;
    const result = transformJSX(source, defaultOptions);
 
    // Even static expressions on SVG should use setAttribute("class", ...) not .className =
    expect(result).toContain('setAttribute("class"');
    expect(result).not.toMatch(/\.className\s*=/);
  });

  test("Regular HTML elements with dynamic className still use className property", () => {
    const source = `const el = <div className={someSignal()}>Content</div>;`;
    const result = transformJSX(source, defaultOptions);
 
    // Regular HTML elements should use .className = not setAttribute
    expect(result).toMatch(/\.className\s*=/);
    expect(result).not.toContain('setAttribute("class"');
  });

  test("contextToCustomElements sets owner on custom elements", () => {
    const source = `const el = <my-element prop="value">Content</my-element>;`;
    const result = transformJSX(source, defaultOptions);

    // Custom elements should have _$owner = _$getOwner() set
    expect(result).toContain("_$getOwner");
    expect(result).toContain("._$owner");
  });

  test("contextToCustomElements sets owner on slot elements", () => {
    const source = `const el = <slot name="header" />;`;
    const result = transformJSX(source, defaultOptions);

    // Slot elements should have _$owner = _$getOwner() set
    expect(result).toContain("_$getOwner");
    expect(result).toContain("._$owner");
  });

  test("contextToCustomElements: false skips owner assignment", () => {
    const optionsNoContext: ResolvedGasOptions = {
      ...defaultOptions,
      contextToCustomElements: false
    };
    const source = `const el = <my-element prop="value">Content</my-element>;`;
    const result = transformJSX(source, optionsNoContext);

    // Custom elements should NOT have context assignment when disabled
    expect(result).not.toContain("_$getOwner");
    expect(result).not.toContain("._$owner");
  });

  test("supports universal runtime configuration", () => {
    const universalOptions: ResolvedGasOptions = {
      ...defaultOptions,
      generate: "ssr",
      hydratable: true,
      moduleName: "solid-js/universal",
      runtime: "universal"
    };

    const source = `const App = () => (<main><h1>{title()}</h1></main>);`;
    const result = transformJSX(source, universalOptions);

    // Uses the configured universal module
    expect(result).toContain('from "solid-js/universal"');
    // Uses SSR template helper output
    expect(result).toContain("_$ssr");
  });

  test("dev mode adds debug comments to templates", () => {
    const devOptions: ResolvedGasOptions = {
      ...defaultOptions,
      dev: true
    };
    const source = `const el = <div class="container">Hello World</div>;`;
    const result = transformJSX(source, devOptions);

    // In dev mode, templates should have HTML preview comments
    expect(result).toContain("/*");
    expect(result).toContain("*/");
  });

  test("dev mode adds debug comments to components", () => {
    const devOptions: ResolvedGasOptions = {
      ...defaultOptions,
      dev: true
    };
    const source = `const el = <MyComponent foo="bar" />;`;
    const result = transformJSX(source, devOptions);

    // In dev mode, components should have name comments
    expect(result).toContain("/* <MyComponent> */");
  });

  test("orders imports then templates then code", () => {
    const source = `const el = <div>Hello</div>;`;
    const result = transformJSX(source, defaultOptions);

    const importIndex = result.indexOf("import {");
    const tmplIndex = result.indexOf("const _tmpl$");
    const codeIndex = result.indexOf("const el =");

    expect(importIndex).toBeGreaterThanOrEqual(0);
    expect(tmplIndex).toBeGreaterThan(importIndex);
    expect(codeIndex).toBeGreaterThan(tmplIndex);
  });


  test("preserves non-JSX code", () => {
    const source = `
      import { createSignal } from "solid-js";
      const [count, setCount] = createSignal(0);
      const el = <div>{count()}</div>;
      console.log("done");
    `;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain('import { createSignal } from "solid-js"');
    expect(result).toContain("createSignal(0)");
    expect(result).toContain('console.log("done")');
  });

  test("handles multiple JSX expressions", () => {
    const source = `
      const a = <div>A</div>;
      const b = <span>B</span>;
    `;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("div");
    expect(result).toContain("span");
  });

  test("generates correct template IDs for multiple templates", () => {
    const source = `
      const a = <div>A</div>;
      const b = <span>B</span>;
      const c = <p>C</p>;
    `;
    const result = transformJSX(source, defaultOptions);

    // First template is _tmpl$, subsequent are _tmpl$2, _tmpl$3, etc.
    expect(result).toContain("const _tmpl$ = ");
    expect(result).toContain("const _tmpl$2 = ");
    expect(result).toContain("const _tmpl$3 = ");
  });

  test("handles nested components", () => {
    const source = `
      const el = (
        <Outer>
          <Inner>
            <div>Nested</div>
          </Inner>
        </Outer>
      );
    `;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("Outer");
    expect(result).toContain("Inner");
  });
});

describe("event delegation", () => {
  test("uses delegation for common events", () => {
    const source = `<button onClick={handler}>Click</button>`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("$$click");
    expect(result).toContain('_$delegateEvents(["click"])');
  });

  test("multiple delegated events are collected", () => {
    const source = `
      <div>
        <button onClick={handler1}>Click</button>
        <input onInput={handler2} />
      </div>
    `;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("$$click");
    expect(result).toContain("$$input");
    expect(result).toContain('_$delegateEvents(["click", "input"])');
  });

  test("delegateEvents: false disables event delegation", () => {
    const noDelegateOptions: ResolvedGasOptions = { ...defaultOptions, delegateEvents: false };
    const source = `<button onClick={handler}>Click</button>`;
    const result = transformJSX(source, noDelegateOptions);

    // Should NOT use delegation
    expect(result).not.toContain("$$click");
    expect(result).not.toContain("_$delegateEvents");
    // Should use addEventListener instead
    expect(result).toContain("_$addEventListener");
    expect(result).toContain('"click"');
  });

  test("on:* syntax always uses non-delegated events", () => {
    const source = `<div on:scroll={handleScroll}>Content</div>`;
    const result = transformJSX(source, defaultOptions);

    // on:* syntax should bypass delegation
    expect(result).not.toContain("$$scroll");
    expect(result).toContain("_$addEventListener");
    expect(result).toContain('"scroll"');
  });

  test("delegatedEvents extends the default delegation list", () => {
    const customDelegation: ResolvedGasOptions = {
      ...defaultOptions,
      delegatedEvents: new Set(["scroll"])
    };
    const source = `<div onScroll={handleScroll}>Content</div>`;
    const result = transformJSX(source, customDelegation);

    expect(result).toContain("$$scroll");
    expect(result).toContain('_$delegateEvents(["scroll"])');
  });

  test("oncapture:* syntax uses capture phase", () => {
    const source = `<div oncapture:click={handleCapture}>Content</div>`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("_$addEventListener");
    expect(result).toContain('"click"');
    expect(result).toContain("true"); // capture = true
  });
});

describe("dynamic children edge cases", () => {
  test("transforms element with single expression child", () => {
    const source = `const el = <div>{count()}</div>;`;
    const result = transformJSX(source, defaultOptions);

    // Should have a placeholder in template
    expect(result).toContain("<!>");
    // Should use insert for the expression
    expect(result).toContain("_$insert");
    // Zero-arg call expressions are treated as accessors (dom-expressions parity)
    expect(result).toContain(", count,");
    // Should NOT have null dereference issues
    expect(result).not.toContain("null.parentNode");
  });

  test("transforms element with multiple expression children", () => {
    const source = `const el = <div>{a()}{b()}</div>;`;
    const result = transformJSX(source, defaultOptions);

    // Should have placeholders for both expressions
    expect(result.match(/<!>/g)?.length).toBe(2);
    expect(result).toContain("_$insert");
  });

  test("transforms element with expression before static child", () => {
    const source = `const el = <div>{expr}<span>static</span></div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("<!>");
    expect(result).toContain("span");
    expect(result).toContain("_$insert");
  });

  test("transforms element with mixed children order", () => {
    const source = `const el = <div><span>A</span>{middle()}<span>B</span></div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("<!>");
    expect(result).toContain("_$insert");
  });

  test("transforms nested elements with expression children", () => {
    const source = `const el = <div><p>{inner()}</p></div>;`;
    const result = transformJSX(source, defaultOptions);

    expect(result).toContain("<!>");
    // Zero-arg call expressions are treated as accessors (dom-expressions parity)
    expect(result).toContain(", inner,");
  });

  test("template contains placeholder marker for expressions", () => {
    const source = `const el = <section>{content()}</section>`;
    const result = transformJSX(source, defaultOptions);
 
     // The template string should contain the placeholder (closing tag omitted by default)
     expect(result).toMatch(/_\$template\(`<section><!>`\)/);
   });


  test("does not duplicate dynamic nested elements", () => {
    const source = `
      const App = () => (
        <div>
          <button onClick={() => setCount(count() + 1)}>
            Count: {count()}
          </button>
        </div>
      );
    `;
    const result = transformJSX(source, defaultOptions);
 
     // Parent div template should only contain a placeholder for the dynamic button
     expect(result).toContain("_$template(`<div><!>`)");
   });

});

describe("SSR mode", () => {
  const ssrOptions: ResolvedGasOptions = {
    ...defaultOptions,
    generate: "ssr",
    hydratable: false
  };

  test("renders basic element with expressions", () => {
    const source = `const el = <div class={foo()}>{bar()}</div>;`;
    const result = transformJSX(source, ssrOptions);

    expect(result).toContain("_$ssr");
    expect(result).toContain("foo()");
    expect(result).toContain("_$escape(bar())");
  });

  test("adds hydration key when hydratable", () => {
    const source = `const el = <span id="a" />;`;
    const hydratableOptions = { ...ssrOptions, hydratable: true };
    const result = transformJSX(source, hydratableOptions);

    expect(result).toContain("_$ssrHydrationKey");
  });

  test("wraps top-level head with NoHydration when hydratable (dom-expressions parity)", () => {
    const hydratableOptions = { ...ssrOptions, hydratable: true };
    const source = `const el = <head><title>Hi</title></head>;`;
    const result = transformJSX(source, hydratableOptions);

    expect(result).toContain("_$NoHydration");
    expect(result).toContain("_$createComponent");
  });

  test("SSR doNotEscape: script/style children are not escaped", () => {
    const hydratableOptions = { ...ssrOptions, hydratable: true };
    const source = `
      const js = () => "</script><div>boom</div>";
      const a = <script>{js()}</script>;
      const b = <style>{css()}</style>;
    `;
    const result = transformJSX(source, hydratableOptions);

    // Should not wrap script/style children in escape().
    expect(result).not.toContain("_$escape(js()");
    expect(result).not.toContain("_$escape(css()");
  });

  test("SSR doNotEscape: innerHTML does not escape content or emit innerhtml attribute", () => {
    const hydratableOptions = { ...ssrOptions, hydratable: true };
    const source = `const el = <div innerHTML={html()} />;`;
    const result = transformJSX(source, hydratableOptions);

    expect(result).not.toMatch(/innerhtml=/i);
    expect(result).not.toContain("_$escape(html()");
    expect(result).toContain("html()");
  });

  test("uses runtime preset for universal module", () => {
    const universalOptions: ResolvedGasOptions = {
      ...ssrOptions,
      runtime: "universal",
      moduleName: "solid-js/universal"
    };
    const source = `const el = <div>{value}</div>;`;
    const result = transformJSX(source, universalOptions);
 
    expect(result).toContain("solid-js/universal");
  });

  test("universal mode merges spread props for elements", () => {
    const universalOptions: ResolvedGasOptions = {
      ...ssrOptions,
      runtime: "universal",
      moduleName: "solid-js/universal"
    };
    const source = `const el = <div {...props} class="test">Content</div>;`;
    const result = transformJSX(source, universalOptions);

    expect(result).toContain("solid-js/universal");
    expect(result).toContain("_$mergeProps");
  });

  test("universal runtime with custom moduleName works", () => {
    const customUniversalOptions: ResolvedGasOptions = {
      ...ssrOptions,
      runtime: "universal",
      moduleName: "@opentui/solid"
    };
    const source = `const el = <div>{value}</div>;`;
    const result = transformJSX(source, customUniversalOptions);

    expect(result).toContain("@opentui/solid");
    expect(result).toContain("_$ssr");
  });

  test("universal runtime with custom moduleName generates correct imports", () => {
    const customUniversalOptions: ResolvedGasOptions = {
      ...ssrOptions,
      runtime: "universal",
      moduleName: "@opentui/solid"
    };
    const source = `const el = <div class={cls()} onClick={handle}>Hi {name}</div>;`;
    const result = transformJSX(source, customUniversalOptions);

    // Should import from custom module
    expect(result).toContain('from "@opentui/solid"');
    // Should use SSR template helper output
    expect(result).toContain("_$ssr");
    expect(result).toContain("_$escape");
  });

  test("merges spreads with regular props", () => {
    const source = `const view = <Comp {...a} foo={bar} />;`;
    const result = transformJSX(source, ssrOptions);

    expect(result).toContain("_$mergeProps");
    expect(result).toContain("{ \"foo\": bar }");
  });

  test("SSR emits ssr() templates (dom-expressions parity)", () => {
    const ssrWithOptimization: ResolvedGasOptions = {
      ...ssrOptions,
      omitNestedClosingTags: true,
      omitLastClosingTag: true
    };
    const source = `const el = <div><span>First</span><span>Second</span></div>;`;
    const result = transformJSX(source, ssrWithOptimization);

    expect(result).toContain("_$ssr");
    expect(result).toContain("var _tmpl$");
    // DOM template helper should not appear in SSR output
    expect(result).not.toContain("_$template");
  });

  test("golden dom-basic snapshot exists", () => {
    expect(domBasic).toContain("template");
    expect(domBasic).toContain("$$click");
  });

  test("golden ssr-basic snapshot exists", () => {
    expect(ssrBasic).toContain("_$ssr");
    expect(ssrBasic).toContain("_$escape");
  });

  test("golden ssr-spread snapshot merges spreads for elements", () => {
    expect(ssrSpread).toContain("_$mergeProps");
    expect(ssrSpread).toContain("_$ssrElement");
  });

  test("golden ssr-attrs snapshot carries class/style and boolean attrs", () => {
    // SSR template output should merge base class + classList into a single class attribute,
    // and emit dynamic style/attrs via SSR helpers.
    expect(ssrAttrs).toContain('_$ssrAttribute("class"');
    expect(ssrAttrs).toContain('"base "');
    expect(ssrAttrs).toContain("_$ssrClassList");
    expect(ssrAttrs).toContain("_$ssrStyleProperty");
    expect(ssrAttrs).toContain('_$ssrAttribute("data-id"');
    expect(ssrAttrs).toContain("aria-hidden");
  });

  test("golden ssr-events snapshot keeps event props", () => {
    // SSR output should not serialize event handlers into HTML.
    expect(ssrEvents).toContain("_$ssr");
    expect(ssrEvents).not.toContain("onClick");
    expect(ssrEvents).not.toContain("onMouseDown");
    expect(ssrEvents).not.toContain("on:scroll");
  });

  test("golden ssr-class-style snapshot uses runtime class/style handling", () => {
    expect(ssrClassStyle).toContain("\"classList\": { active: on, disabled: off }");
    expect(ssrClassStyle).toContain("\"style\": { color: color(), \"font-weight\": bold ? \"700\" : \"400\" }");
    expect(ssrClassStyle).toContain("_$mergeProps");
  });

  test("golden ssr-portal-fragment snapshot includes Portal/Show", () => {
    expect(ssrPortalFragment).toContain("Portal");
    expect(ssrPortalFragment).toContain("Show");
    expect(ssrPortalFragment).toContain("_$ssr");
  });

  test("golden ssr-delegation keeps event props for delegation and direct", () => {
    // SSR output should not serialize event handlers into HTML.
    expect(ssrDelegation).toContain("_$ssr");
    expect(ssrDelegation).not.toContain("onClick");
    expect(ssrDelegation).not.toContain("onMouseEnter");
    expect(ssrDelegation).not.toContain("on:scroll");
    expect(ssrDelegation).not.toContain("onChange");
  });

  test("golden ssr-nested-spread merges nested spreads", () => {
    expect(ssrNestedSpread).toContain("_$mergeProps");
    expect(ssrNestedSpread).toContain("\"classList\": { active }");
    expect(ssrNestedSpread).toContain("_$ssrElement");
  });
});

describe("HTML validation", () => {
  test("throws for <tr> directly in <table>", () => {
    const source = `const el = <table><tr><td>Cell</td></tr></table>;`;
    expect(() => transformJSX(source, defaultOptions)).toThrow("<tr> is not a valid direct child of <table>");
  });

  test("throws for <li> outside of list", () => {
    const source = `const el = <div><li>Item</li></div>;`;
    expect(() => transformJSX(source, defaultOptions)).toThrow("<li> elements must be wrapped in <ul>");
  });

  test("allows <li> in <ul>", () => {
    const source = `const el = <ul><li>Item</li></ul>;`;
    expect(() => transformJSX(source, defaultOptions)).not.toThrow();
  });

  test("throws for <dt> outside of <dl>", () => {
    const source = `const el = <div><dt>Term</dt></div>;`;
    expect(() => transformJSX(source, defaultOptions)).toThrow("<dt> elements must be wrapped in <dl>");
  });

  test("throws for nested <a> elements", () => {
    const source = `const el = <a href="#"><a href="#">Nested</a></a>;`;
    expect(() => transformJSX(source, defaultOptions)).toThrow("<a> elements cannot be nested");
  });

  test("throws for block element in <p>", () => {
    const source = `const el = <p><div>Block</div></p>;`;
    expect(() => transformJSX(source, defaultOptions)).toThrow("<div> cannot be a child of <p>");
  });

  test("throws for nested <form> elements", () => {
    const source = `const el = <form><form></form></form>;`;
    expect(() => transformJSX(source, defaultOptions)).toThrow("<form> elements cannot be nested");
  });

  test("does not validate when validate option is false", () => {
    const noValidateOptions: ResolvedGasOptions = { ...defaultOptions, validate: false };
    const source = `const el = <table><tr><td>Cell</td></tr></table>;`;
    expect(() => transformJSX(source, noValidateOptions)).not.toThrow();
  });
});
