import { describe, test, expect } from "bun:test";
import { transformJSX } from "../src/transformer.js";
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
  ...domOptions,
  generate: "ssr",
  hydratable: true,
  runtime: "ssr",
  moduleName: "solid-js/web"
};

describe("nested JSX expressions", () => {
  test("handles JSX inside expression children (dom)", () => {
    const source = `const view = <div>{items().map(item => <span>{item}</span>)}</div>;`;
    const result = transformJSX(source, domOptions);

    expect(result).not.toContain("jsxDEV");
    expect(result).toContain("_$template");
    expect(result).toContain("<span>");
  });

  test("handles JSX values in component props (dom)", () => {
    const source = `const view = <Comp content={<span>Hi</span>} />;`;
    const result = transformJSX(source, domOptions);

    expect(result).not.toContain("jsxDEV");
    expect(result).toContain("_$createComponent");
    expect(result).toContain("<span>");
  });

  test("handles nested JSX in hydratable SSR", () => {
    const source = `const view = <section>{items().map(item => <article><span>{item}</span></article>)}</section>;`;
    const result = transformJSX(source, ssrOptions);

    expect(result).not.toContain("jsxDEV");
    expect(result).toContain("_$ssr");
    expect(result).toContain("article");
  });

  test("templates omit last closing tag when enabled (babel parity)", () => {
    // babel-preset-solid/dom-expressions omit the last closing tag by default
    const source = `const view = <div class="wrapper">{content()}</div>;`;
    const result = transformJSX(source, domOptions);

    expect(result).toMatch(/_\$template\(`<div class=wrapper><!>`\)/);
  });

  test("For loop with nested button has valid template structure", () => {
    // Regression test: ThemeToggle pattern - For loop returning buttons
    const source = `
      function Toggle() {
        return (
          <div class="container">
            <For each={options}>
              {(option) => (
                <button type="button" onClick={() => setOption(option.value)}>
                  {option.label}
                </button>
              )}
            </For>
          </div>
        );
      }
    `;
    const result = transformJSX(source, domOptions);

    // Container div template should have placeholder (last closing tag omitted by default)
    expect(result).toMatch(/_\$template\(`<div class=container><!>`\)/);
    
    // Button template should have placeholder (last closing tag omitted by default)
    expect(result).toMatch(/_\$template\(`<button type=button><!>`\)/);
    
    // Should use insert for dynamic content placement
    expect(result).toContain("_$insert");
    
    // No raw jsxDEV calls should remain
    expect(result).not.toContain("jsxDEV");
  });

  test("can force full closing tags by disabling omitLastClosingTag", () => {
    const fullCloseOptions: ResolvedGasOptions = { ...domOptions, omitLastClosingTag: false };
    const source = `const el = <div><section><article><p>Text</p></article></section></div>;`;
    const result = transformJSX(source, fullCloseOptions);

    // All closing tags must be present when omitLastClosingTag is disabled
    expect(result).toContain("</p>");
    expect(result).toContain("</article>");
    expect(result).toContain("</section>");
    expect(result).toContain("</div>");
  });

  test("innerHTML with dynamic children does not create placeholders", () => {
    // Regression test: solid-icons pattern - innerHTML replaces children
    // When innerHTML is dynamic, child expressions would be destroyed anyway
    const source = `
      function Icon(props) {
        return (
          <svg innerHTML={content()}>
            {isServer && ssr(rawContent())}
          </svg>
        );
      }
    `;
    const result = transformJSX(source, domOptions);

    // Template should NOT have placeholder since innerHTML will replace all children
    expect(result).not.toMatch(/<svg[^>]*><!>/);
    
    // Should still set innerHTML
    expect(result).toContain("innerHTML");
    expect(result).toContain("content()");
    
    // Should NOT try to insert children (they would be destroyed by innerHTML)
    expect(result).not.toContain("firstChild.parentNode");
  });

  test("textContent with dynamic children does not create placeholders", () => {
    const source = `const el = <div textContent={text()}>{dynamic()}</div>;`;
    const result = transformJSX(source, domOptions);

    // Template should NOT have placeholder
    expect(result).not.toMatch(/<div[^>]*><!>/);
    
    // Should NOT try to insert children
    expect(result).not.toContain("firstChild.parentNode");
  });
});
