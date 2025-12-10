/**
 * Tests for the JSX parser
 */

import { describe, test, expect } from "bun:test";
import { findJSXExpressions, parseJSX, JSXParseError } from "../src/parser.js";
import { findJSXExpressionsAST } from "../src/ast.js";

describe("findJSXExpressions", () => {
  test("finds simple JSX element", () => {
    const source = `const el = <div>Hello</div>;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe("<div>Hello</div>");
  });

  test("finds self-closing JSX element", () => {
    const source = `const el = <input type="text" />;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe(`<input type="text" />`);
  });

  test("finds JSX fragment", () => {
    const source = `const el = <>Hello World</>;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe("<>Hello World</>");
  });

  test("finds nested JSX elements", () => {
    const source = `const el = <div><span>Hello</span></div>;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe("<div><span>Hello</span></div>");
  });

  test("finds JSX with expression children", () => {
    const source = `const el = <div>{count()}</div>;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe("<div>{count()}</div>");
  });

  test("finds multiple JSX expressions", () => {
    const source = `
      const a = <div>A</div>;
      const b = <span>B</span>;
    `;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(2);
  });

  test("skips JSX in strings", () => {
    const source = `const str = "<div>Not JSX</div>";`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(0);
  });

  test("skips JSX in template literals", () => {
    const source = "const str = `<div>Not JSX</div>`;";
    const results = findJSXExpressions(source);

    expect(results.length).toBe(0);
  });

  test("finds JSX with complex expressions", () => {
    const source = `const el = <div class={active ? "active" : ""}>{items.map(i => <span>{i}</span>)}</div>;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
  });

  test("handles component names", () => {
    const source = `const el = <MyComponent prop="value" />;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe(`<MyComponent prop="value" />`);
  });

  test("handles member expression components", () => {
    const source = `const el = <Foo.Bar.Baz />;`;
    const results = findJSXExpressions(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toBe("<Foo.Bar.Baz />");
  });

  test("AST finder skips nested JSX inside expressions", () => {
    const source = `function Comp() { return (<div><For each={items}>{(item) => { const Icon = item.Icon; return (<button class={item.cls}><Icon /></button>); }}</For></div>); }`;
    const results = findJSXExpressionsAST(source);

    expect(results.length).toBe(1);
    expect(results[0]!.jsx).toContain("<div>");
    expect(results[0]!.jsx).toContain("<button");
  });
});

describe("parseJSX", () => {
  test("parses simple element", () => {
    const result = parseJSX("<div>Hello</div>");

    expect(result.type).toBe("element");
    expect(result.tag).toBe("div");
    expect(result.children.length).toBe(1);
    expect(result.children[0]!.type).toBe("text");
  });

  test("parses element with attributes", () => {
    const result = parseJSX(`<div id="main" class="container">Content</div>`);

    expect(result.tag).toBe("div");
    expect(result.props.length).toBe(2);
    expect(result.props[0]!.name).toBe("id");
    expect(result.props[0]!.value).toEqual({ type: "string", value: "main" });
    expect(result.props[1]!.name).toBe("class");
    expect(result.props[1]!.value).toEqual({ type: "string", value: "container" });
  });

  test("parses element with expression attributes", () => {
    const result = parseJSX(`<div class={className()}>Content</div>`);

    expect(result.props.length).toBe(1);
    expect(result.props[0]!.name).toBe("class");
    expect(result.props[0]!.value).toEqual({ type: "expression", value: "className()" });
  });

  test("parses element with boolean attributes", () => {
    const result = parseJSX(`<input disabled />`);

    expect(result.tag).toBe("input");
    expect(result.props.length).toBe(1);
    expect(result.props[0]!.name).toBe("disabled");
    expect(result.props[0]!.value).toEqual({ type: "true" });
    expect(result.selfClosing).toBe(true);
  });

  test("parses element with spread props", () => {
    const result = parseJSX(`<div {...props}>Content</div>`);

    expect(result.props.length).toBe(1);
    expect(result.props[0]!.name).toBe("...");
    expect(result.props[0]!.value).toEqual({ type: "spread", value: "props" });
  });

  test("parses expression children", () => {
    const result = parseJSX(`<div>{count()}</div>`);

    expect(result.children.length).toBe(1);
    expect(result.children[0]!.type).toBe("expression");
    if (result.children[0]!.type === "expression") {
      expect(result.children[0]!.value).toBe("count()");
    }
  });

  test("parses fragment", () => {
    const result = parseJSX(`<><span>A</span><span>B</span></>`);

    expect(result.type).toBe("fragment");
    expect(result.tag).toBe("");
    expect(result.children.length).toBe(2);
  });

  test("identifies component vs element", () => {
    const component = parseJSX(`<MyComponent />`);
    const element = parseJSX(`<div />`);

    expect(component.type).toBe("component");
    expect(element.type).toBe("element");
  });

  test("identifies SVG elements", () => {
    const svg = parseJSX(`<svg><circle cx="50" cy="50" r="40" /></svg>`);

    expect(svg.isSVG).toBe(true);
    expect(svg.children[0]!.type).toBe("element");
    if (svg.children[0]!.type === "element") {
      expect(svg.children[0]!.value.isSVG).toBe(true);
    }
  });

  test("identifies SVG style elements", () => {
    const svg = parseJSX(`<svg><defs><style>.test { fill: red; }</style></defs></svg>`);

    expect(svg.isSVG).toBe(true);
    expect(svg.children[0]!.type).toBe("element");
    if (svg.children[0]!.type === "element") {
      const defs = svg.children[0]!.value;
      expect(defs.isSVG).toBe(true);
      expect(defs.children[0]!.type).toBe("element");
      if (defs.children[0]!.type === "element") {
        expect(defs.children[0]!.value.isSVG).toBe(true);
        expect(defs.children[0]!.value.tag).toBe("style");
      }
    }
  });

  test("parses event handlers", () => {
    const result = parseJSX(`<button onClick={handleClick}>Click</button>`);

    expect(result.props.length).toBe(1);
    expect(result.props[0]!.name).toBe("onClick");
    expect(result.props[0]!.value).toEqual({ type: "expression", value: "handleClick" });
  });

  test("parses namespaced attributes", () => {
    const result = parseJSX(`<div use:directive={value} on:custom={handler}>Content</div>`);

    expect(result.props.length).toBe(2);
    expect(result.props[0]!.name).toBe("use:directive");
    expect(result.props[1]!.name).toBe("on:custom");
  });

  test("parses ref attribute", () => {
    const result = parseJSX(`<div ref={el}>Content</div>`);

    expect(result.props.length).toBe(1);
    expect(result.props[0]!.name).toBe("ref");
    expect(result.props[0]!.value).toEqual({ type: "expression", value: "el" });
  });
});

describe("JSXParseError", () => {
  test("throws on empty JSX", () => {
    expect(() => parseJSX("")).toThrow(JSXParseError);
    expect(() => parseJSX("   ")).toThrow(JSXParseError);
  });

  test("throws on JSX not starting with <", () => {
    expect(() => parseJSX("div")).toThrow(JSXParseError);
    expect(() => parseJSX("Hello")).toThrow(JSXParseError);
  });

  test("throws on unclosed element", () => {
    expect(() => parseJSX("<div>")).toThrow(JSXParseError);
    expect(() => parseJSX("<div>Content")).toThrow(JSXParseError);
  });

  test("throws on mismatched closing tag", () => {
    expect(() => parseJSX("<div></span>")).toThrow(JSXParseError);
    expect(() => parseJSX("<div><span></div></span>")).toThrow(JSXParseError);
  });

  test("throws on unclosed fragment", () => {
    expect(() => parseJSX("<>Content")).toThrow(JSXParseError);
  });

  test("throws on missing tag name", () => {
    expect(() => parseJSX("< >")).toThrow(JSXParseError);
  });

  test("provides formatted error message", () => {
    try {
      parseJSX("<div></span>");
    } catch (err) {
      expect(err).toBeInstanceOf(JSXParseError);
      if (err instanceof JSXParseError) {
        expect(err.message).toContain("Mismatched closing tag");
        const formatted = err.getFormattedMessage();
        expect(formatted).toContain("line");
        expect(formatted).toContain("column");
      }
    }
  });

  test("handles deeply nested JSX errors", () => {
    expect(() => parseJSX("<div><span><a></span></a></div>")).toThrow(JSXParseError);
  });
});

describe("parseJSX edge cases", () => {
  test("parses deeply nested elements", () => {
    const result = parseJSX(
      "<div><section><article><p>Deep</p></article></section></div>"
    );
    expect(result.type).toBe("element");
    expect(result.tag).toBe("div");
    expect(result.children.length).toBe(1);
  });

  test("parses mixed text and expression children", () => {
    const result = parseJSX("<div>Hello {name}, welcome!</div>");
    expect(result.children.length).toBe(3);
    expect(result.children[0]!.type).toBe("text");
    expect(result.children[1]!.type).toBe("expression");
    expect(result.children[2]!.type).toBe("text");
  });

  test("parses nested expressions with JSX", () => {
    const result = parseJSX("<div>{items.map(i => <span>{i}</span>)}</div>");
    expect(result.children.length).toBe(1);
    expect(result.children[0]!.type).toBe("expression");
  });

  test("parses element with multiple spreads", () => {
    const result = parseJSX("<div {...props1} {...props2}>Content</div>");
    expect(result.props.length).toBe(2);
    expect(result.props[0]!.value).toEqual({ type: "spread", value: "props1" });
    expect(result.props[1]!.value).toEqual({ type: "spread", value: "props2" });
  });

  test("parses expression with ternary containing JSX", () => {
    const result = parseJSX("<div>{show ? <span>Yes</span> : <span>No</span>}</div>");
    expect(result.children.length).toBe(1);
    expect(result.children[0]!.type).toBe("expression");
  });
});
