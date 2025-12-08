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
    const source = `const el = <span id=\"a\" />;`;
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


  test("merges spreads with regular props", () => {
    const source = `const view = <Comp {...a} foo={bar} />;`;
    const result = transformJSX(source, ssrOptions);

    expect(result).toContain("_$mergeProps");
    expect(result).toContain("{ \"foo\": bar }");
  });

  test("golden dom-basic snapshot exists", () => {
    expect(domBasic).toContain("template");
    expect(domBasic).toContain("$$click");
  });

  test("golden ssr-basic snapshot exists", () => {
    expect(ssrBasic).toContain("data-hk");
    expect(ssrBasic).toContain("_$escape");
  });

  test("golden ssr-spread snapshot merges spreads", () => {
    expect(ssrSpread).toContain("_$mergeProps");
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
    expect(ssrClassStyle).toContain("_$mergeProps");
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

  test("golden ssr-nested-spread merges spreads and helpers", () => {
    expect(ssrNestedSpread).toContain("_$mergeProps");
    expect(ssrNestedSpread).toContain("_$ssrClassList");
    expect(ssrNestedSpread).toContain("_$ssrElement");
  });
});
