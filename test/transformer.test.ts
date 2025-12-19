/**
 * Tests for the JSX transformer
 */

import { describe, test, expect } from "bun:test";
import { transformJSX, hasJSX } from "../src/transformer.js";
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

  test("ignores closing tag optimization in DOM mode (browser requires valid HTML)", () => {
    const optionsWithNested: ResolvedGasOptions = {
      ...defaultOptions,
      omitNestedClosingTags: true,
      omitLastClosingTag: true
    };

    const source = `const el = <div><span>First</span><span>Second</span></div>`;
    const result = transformJSX(source, optionsWithNested);

    // DOM templates must have valid HTML for browser parsing - closing tags are always included
    expect(result).toContain("_$template(`<div><span>First</span><span>Second</span></div>`)");
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
    expect(result).toContain("count()");
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
    // Still contains SSR helpers
    expect(result).toContain("_$ssrElement");
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
    expect(result).toContain("count()");
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
    expect(result).toContain("inner()");
  });

  test("template contains placeholder marker for expressions", () => {
    const source = `const el = <section>{content()}</section>`;
    const result = transformJSX(source, defaultOptions);
 
     // The template string should contain the placeholder and closing tag
     expect(result).toMatch(/_\$template\(`<section><!><\/section>`\)/);
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
     expect(result).toContain("_$template(`<div><!></div>`)");
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

    expect(result).toContain("_$ssrElement(\"div\"");
    expect(result).toContain("foo()");
    expect(result).toContain("_$escape(bar())");
  });

  test("adds hydration key when hydratable", () => {
    const source = `const el = <span id="a" />;`;
    const hydratableOptions = { ...ssrOptions, hydratable: true };
    const result = transformJSX(source, hydratableOptions);

    expect(result).toContain("_$ssrElement");
    expect(result).toContain("_$ssrHydrationKey");
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

  test("universal mode uses ssrSpread for spread props", () => {
    const universalOptions: ResolvedGasOptions = {
      ...ssrOptions,
      runtime: "universal",
      moduleName: "solid-js/universal"
    };
    const source = `const el = <div {...props} class="test">Content</div>;`;
    const result = transformJSX(source, universalOptions);

    // Universal mode should use ssrSpread like SSR mode
    expect(result).toContain("solid-js/universal");
    expect(result).toContain("_$ssrSpread");
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
    expect(result).toContain("_$ssrElement");
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
    // Should use SSR helpers
    expect(result).toContain("_$ssrElement");
    expect(result).toContain("_$ssrClassList");
  });

  test("merges spreads with regular props", () => {
    const source = `const view = <Comp {...a} foo={bar} />;`;
    const result = transformJSX(source, ssrOptions);

    expect(result).toContain("_$mergeProps");
    expect(result).toContain("{ \"foo\": bar }");
  });

  test("SSR uses ssrElement helper - closing tag options don't apply at compile time", () => {
    // SSR mode uses ssrElement helper which generates HTML at runtime
    // The omitNestedClosingTags and omitLastClosingTag options don't apply
    // because closing tags are handled by the runtime helper, not compile-time generation
    const ssrWithOptimization: ResolvedGasOptions = {
      ...ssrOptions,
      omitNestedClosingTags: true,
      omitLastClosingTag: true
    };
    const source = `const el = <div><span>First</span><span>Second</span></div>;`;
    const result = transformJSX(source, ssrWithOptimization);

    // SSR generates ssrElement calls, not raw HTML templates
    // Closing tag optimization would only apply to raw HTML string generation
    expect(result).toContain("_$ssrElement(\"div\"");
    expect(result).toContain("_$ssrElement(\"span\"");
    // The ssrElement helper handles closing tags at runtime
    expect(result).not.toContain("_$template");
  });

  test("golden dom-basic snapshot exists", () => {
    expect(domBasic).toContain("template");
    expect(domBasic).toContain("$$click");
  });

  test("golden ssr-basic snapshot exists", () => {
    expect(ssrBasic).toContain("data-hk");
    expect(ssrBasic).toContain("_$escape");
  });

  test("golden ssr-spread snapshot uses ssrSpread for spread props", () => {
    expect(ssrSpread).toContain("_$ssrSpread");
    expect(ssrSpread).toContain("data-hk");
  });

  test("golden ssr-attrs snapshot carries class/style and boolean attrs", () => {
    expect(ssrAttrs).toContain("\"class\": \"base\"");
    expect(ssrAttrs).toContain("\"class\": _$ssrClassList");
    expect(ssrAttrs).toContain("\"style\": _$ssrStyle");
    expect(ssrAttrs).toContain("\"data-id\": id");
    expect(ssrAttrs).toContain("\"aria-hidden\": \"\"");
  });

  test("golden ssr-events snapshot keeps event props", () => {
    expect(ssrEvents).toContain("onClick");
    expect(ssrEvents).toContain("onMouseDown");
    expect(ssrEvents).toContain("on:scroll");
  });

  test("golden ssr-class-style snapshot uses helpers", () => {
    expect(ssrClassStyle).toContain("_$ssrClassList");
    expect(ssrClassStyle).toContain("_$ssrStyle");
    expect(ssrClassStyle).toContain("_$ssrSpread");
  });

  test("golden ssr-portal-fragment snapshot includes Portal/Show", () => {
    expect(ssrPortalFragment).toContain("Portal");
    expect(ssrPortalFragment).toContain("Show");
    expect(ssrPortalFragment).toContain("_$ssrElement");
  });

  test("golden ssr-delegation keeps event props for delegation and direct", () => {
    expect(ssrDelegation).toContain("onClick");
    expect(ssrDelegation).toContain("onMouseEnter");
    expect(ssrDelegation).toContain("on:scroll");
    expect(ssrDelegation).toContain("onChange");
  });

  test("golden ssr-nested-spread uses ssrSpread and helpers", () => {
    expect(ssrNestedSpread).toContain("_$ssrSpread");
    expect(ssrNestedSpread).toContain("_$ssrClassList");
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
