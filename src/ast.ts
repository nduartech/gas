import { createRequire } from "module";
import type { JsxAttributes, JsxChild, Node, SourceFile } from "typescript";
import type { ParsedChild, ParsedJSX, ParsedProp } from "./parser.js";

const require = createRequire(import.meta.url);
let ts: typeof import("typescript") = loadTypeScript();

function loadTypeScript(): typeof import("typescript") {
  try {
    return require("@typescript/native-preview");
  } catch {
    return require("typescript");
  }
}

function createSourceFileSafe(source: string, fileName: string): import("typescript").SourceFile {
  try {
    return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  } catch (error) {
    // If native-preview fails, fall back to the regular TypeScript parser
    try {
      const fallbackTs: typeof import("typescript") = require("typescript");
      ts = fallbackTs;
      return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    } catch {
      throw error;
    }
  }
}

export interface JSXExpressionSpan {
  start: number;
  end: number;
  jsx: string;
}

/**
 * Find JSX expressions using TypeScript AST to avoid heuristic misses.
 */
export function findJSXExpressionsAST(source: string, fileName = "source.tsx"): JSXExpressionSpan[] {
  const sf = createSourceFileSafe(source, fileName);
  const spans: JSXExpressionSpan[] = [];

  const visit = (node: Node, insideJSX: boolean) => {
    const isJsxNode =
      ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node);

    if (isJsxNode) {
      if (!insideJSX) {
        const start = node.getStart(sf, false);
        const end = node.getEnd();
        spans.push({ start, end, jsx: source.slice(start, end) });
      }
      // Do not traverse into JSX children; they are covered by the parent span
      return;
    }

    node.forEachChild(child => visit(child, insideJSX || isJsxNode));
  };

  visit(sf, false);
  return spans;
}


/**
 * Convert a JSX AST node to the internal ParsedJSX shape.
 */
export function convertJSXFromAST(node: Node, sf: SourceFile): ParsedJSX {
  if (ts.isJsxFragment(node)) {
    const children = node.children.map(child => convertJSXChild(child, sf)).filter(Boolean) as ParsedChild[];
    return {
      type: "fragment",
      tag: "",
      props: [],
      children,
      start: node.getStart(sf),
      end: node.getEnd(),
      selfClosing: false,
      isSVG: false
    };
  }

  if (ts.isJsxSelfClosingElement(node)) {
    const { tagName, attributes } = node;
    const tag = tagName.getText(sf);
    const props = convertProps(attributes, sf);
    const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
    const type = isComponent ? "component" : "element";
    const isSVG = !isComponent && isSvgTag(tag);
    return {
      type,
      tag,
      props,
      children: [],
      start: node.getStart(sf),
      end: node.getEnd(),
      selfClosing: true,
      isSVG
    };
  }

  if (ts.isJsxElement(node)) {
    const { openingElement, closingElement, children: jsxChildren } = node;
    const tag = openingElement.tagName.getText(sf);
    const props = convertProps(openingElement.attributes, sf);
    const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
    const type = isComponent ? "component" : "element";
    const isSVG = !isComponent && isSvgTag(tag);
    const children = jsxChildren.map(child => convertJSXChild(child, sf)).filter(Boolean) as ParsedChild[];
    return {
      type,
      tag,
      props,
      children,
      start: openingElement.getStart(sf),
      end: closingElement.getEnd(),
      selfClosing: false,
      isSVG
    };
  }

  const kindName = ts.SyntaxKind[node.kind] ?? "Unknown";
  throw new Error(`Unsupported JSX node: ${kindName}`);
}

function unwrapJSXExpression(expr: import("typescript").Expression): import("typescript").Expression | null {
  let current: import("typescript").Expression | undefined = expr;
  while (current && ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  if (!current) return null;
  if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current) || ts.isJsxFragment(current)) {
    return current;
  }
  return null;
}

function convertJSXChild(child: JsxChild, sf: SourceFile): ParsedChild | null {
  if (ts.isJsxText(child)) {
    const text = child.getFullText(sf);
    if (text.trim() === "") return null;
    return { type: "text", value: text, start: child.getStart(sf), end: child.getEnd() };
  }
  if (ts.isJsxExpression(child)) {
    if (!child.expression) return null;

    const jsxExpr = unwrapJSXExpression(child.expression);
    if (jsxExpr) {
      return { type: "element", value: convertJSXFromAST(jsxExpr, sf) };
    }

    // Prefer the raw text inside braces so we preserve inline comments like static markers
    const raw = child.getText(sf);
    let exprText: string;
    if (raw.startsWith("{") && raw.endsWith("}")) {
      exprText = raw.slice(1, -1).trim();
    } else {
      exprText = child.expression.getText(sf);
    }
    return { type: "expression", value: exprText, start: child.getStart(sf), end: child.getEnd() };
  }
  if (ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child) || ts.isJsxElement(child)) {
    return { type: "element", value: convertJSXFromAST(child, sf) };
  }
  return null;
}

function convertProps(attrs: JsxAttributes, sf: SourceFile): ParsedProp[] {
  const props: ParsedProp[] = [];

  for (const attr of attrs.properties) {
    if (ts.isJsxSpreadAttribute(attr)) {
      const expr = attr.expression.getText(sf);
      props.push({
        name: "...",
        value: { type: "spread", value: expr },
        start: attr.getStart(sf),
        end: attr.getEnd()
      });
      continue;
    }

    if (ts.isJsxAttribute(attr)) {
      const name = attr.name.getText(sf);
      if (!attr.initializer) {
        props.push({ name, value: { type: "true" }, start: attr.getStart(sf), end: attr.getEnd() });
        continue;
      }

      if (ts.isStringLiteral(attr.initializer)) {
        props.push({
          name,
          value: { type: "string", value: attr.initializer.text },
          start: attr.getStart(sf),
          end: attr.getEnd()
        });
        continue;
      }

      if (ts.isJsxExpression(attr.initializer) && attr.initializer.expression) {
        const jsxExpr = unwrapJSXExpression(attr.initializer.expression);
        if (jsxExpr) {
          props.push({
            name,
            value: { type: "element", value: convertJSXFromAST(jsxExpr, sf) },
            start: attr.getStart(sf),
            end: attr.getEnd()
          });
          continue;
        }

        // Preserve comments inside the attribute expression braces
        const raw = attr.initializer.getText(sf);
        let exprText: string;
        if (raw.startsWith("{") && raw.endsWith("}")) {
          exprText = raw.slice(1, -1).trim();
        } else {
          exprText = attr.initializer.expression.getText(sf);
        }
        props.push({
          name,
          value: { type: "expression", value: exprText },
          start: attr.getStart(sf),
          end: attr.getEnd()
        });
        continue;
      }
    }
  }

  return props;
}

function isSvgTag(tag: string): boolean {
  const svgTags = new Set([
    "svg",
    "animate",
    "animateMotion",
    "animateTransform",
    "circle",
    "clipPath",
    "defs",
    "desc",
    "ellipse",
    "feBlend",
    "feColorMatrix",
    "feComponentTransfer",
    "feComposite",
    "feConvolveMatrix",
    "feDiffuseLighting",
    "feDisplacementMap",
    "feDistantLight",
    "feDropShadow",
    "feFlood",
    "feFuncA",
    "feFuncB",
    "feFuncG",
    "feFuncR",
    "feGaussianBlur",
    "feImage",
    "feMerge",
    "feMergeNode",
    "feMorphology",
    "feOffset",
    "fePointLight",
    "feSpecularLighting",
    "feSpotLight",
    "feTile",
    "feTurbulence",
    "filter",
    "foreignObject",
    "g",
    "image",
    "line",
    "linearGradient",
    "marker",
    "mask",
    "metadata",
    "mpath",
    "path",
    "pattern",
    "polygon",
    "polyline",
    "radialGradient",
    "rect",
    "set",
    "stop",
    "style",
    "switch",
    "symbol",
    "text",
    "textPath",
    "title",
    "tspan",
    "use",
    "view"
  ]);
  return svgTags.has(tag);
}
