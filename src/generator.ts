/**
 * Code Generator for Gas
 *
 * Transforms parsed JSX into optimized SolidJS DOM expressions.
 */

import { parseJSX, findJSXExpressions, type ParsedJSX, type ParsedProp, type ParsedChild } from "./parser.js";
import {
  type ResolvedGasOptions,
  type TemplateInfo,
  DELEGATED_EVENTS,
  BOOLEAN_ATTRS,
  PROPERTY_ATTRS
} from "./types.js";
import { getTypeScriptModule } from "./ts-module.js";

const ts = getTypeScriptModule();
const tsPrinter = ts.createPrinter({ removeComments: true });

interface GeneratorContext {
  templates: TemplateInfo[];
  templateCounter: number;
  imports: Set<string>;
  importAliases: Map<string, string>;
  delegatedEvents: Set<string>;
  options: ResolvedGasOptions;
  varCounter: number;
  usedNames: Set<string>;
  namespaceImports: Set<string>;
  ssrTemplates: { id: string; parts: string[] }[];
  ssrTemplateCache: Map<string, string>;
}

const NAMESPACE_URIS: Record<string, string> = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace",
  xmlns: "http://www.w3.org/2000/xmlns/"
};

function parseNamespacedAttr(name: string): { namespaceUri: string; localName: string } | null {
  const parts = name.split(":");
  if (parts.length !== 2) return null;
  const [prefix, localName] = parts;
  if (!prefix || !localName) return null;
  const namespaceUri = NAMESPACE_URIS[prefix];
  if (!namespaceUri) return null;
  return { namespaceUri, localName };
}

function allocName(ctx: GeneratorContext, preferred: string): string {
  if (!ctx.usedNames.has(preferred)) {
    ctx.usedNames.add(preferred);
    return preferred;
  }
  // Numeric suffix strategy: foo -> foo2 -> foo3 ...
  let i = 2;
  while (ctx.usedNames.has(`${preferred}${i}`)) i++;
  const next = `${preferred}${i}`;
  ctx.usedNames.add(next);
  return next;
}

function allocTemplateId(ctx: GeneratorContext): string {
  // dom-expressions uses _tmpl$, _tmpl$2, _tmpl$3...
  const base = "_tmpl$";
  if (!ctx.usedNames.has(base)) {
    ctx.usedNames.add(base);
    return base;
  }
  let i = 2;
  while (ctx.usedNames.has(`${base}${i}`)) i++;
  const next = `${base}${i}`;
  ctx.usedNames.add(next);
  return next;
}

function allocVar(ctx: GeneratorContext, prefix: string): string {
  // e.g. _el$0, _el$1 ... but skip any reserved names in the original source.
  while (true) {
    const name = `${prefix}${ctx.varCounter++}`;
    if (!ctx.usedNames.has(name)) {
      ctx.usedNames.add(name);
      return name;
    }
  }
}

function useImport(ctx: GeneratorContext, key: string, preferredLocal: string): string {
  ctx.imports.add(key);
  const existing = ctx.importAliases.get(key);
  if (existing) return existing;
  const local = allocName(ctx, preferredLocal);
  ctx.importAliases.set(key, local);
  return local;
}

function h(ctx: GeneratorContext, key: string): string {
  // Default local binding names match existing output for non-collision cases.
  switch (key) {
    case "template": return useImport(ctx, "template", "_$template");
    case "getNextElement": return useImport(ctx, "getNextElement", "_$getNextElement");
    case "getNextMarker": return useImport(ctx, "getNextMarker", "_$getNextMarker");
    case "getNextMatch": return useImport(ctx, "getNextMatch", "_$getNextMatch");
    case "insert": return useImport(ctx, "insert", "_$insert");
    case "spread": return useImport(ctx, "spread", "_$spread");
    case "mergeProps": return useImport(ctx, "mergeProps", "_$mergeProps");
    case "classList": return useImport(ctx, "classList", "_$classList");
    case "style": return useImport(ctx, "style", "_$style");
    case "use": return useImport(ctx, "use", "_$use");
    case "addEventListener": return useImport(ctx, "addEventListener", "_$addEventListener");
    case "delegateEvents": return useImport(ctx, "delegateEvents", "_$delegateEvents");
    case "effect": return useImport(ctx, "effect", "_$effect");
    case "memo": return useImport(ctx, "memo", "_$memo");
    case "escape": return useImport(ctx, "escape", "_$escape");
    case "createComponent": return useImport(ctx, "createComponent", "_$createComponent");
    case "NoHydration": return useImport(ctx, "NoHydration", "_$NoHydration");
    case "getOwner": return useImport(ctx, "getOwner", "_$getOwner");
    case "setAttribute": return useImport(ctx, "setAttribute", "_$setAttribute");
    case "setAttributeNS": return useImport(ctx, "setAttributeNS", "_$setAttributeNS");
    case "setBoolAttribute": return useImport(ctx, "setBoolAttribute", "_$setBoolAttribute");
    case "setProperty": return useImport(ctx, "setProperty", "_$setProperty");
    case "className": return useImport(ctx, "className", "_$className");
    case "ssrElement": return useImport(ctx, "ssrElement", "_$ssrElement");
    case "ssrHydrationKey": return useImport(ctx, "ssrHydrationKey", "_$ssrHydrationKey");
    case "ssr": return useImport(ctx, "ssr", "_$ssr");
    case "ssrSpread": return useImport(ctx, "ssrSpread", "_$ssrSpread");
    case "ssrClassList": return useImport(ctx, "ssrClassList", "_$ssrClassList");
    case "ssrStyle": return useImport(ctx, "ssrStyle", "_$ssrStyle");
    case "ssrStyleProperty": return useImport(ctx, "ssrStyleProperty", "_$ssrStyleProperty");
    case "ssrAttribute": return useImport(ctx, "ssrAttribute", "_$ssrAttribute");
    default:
      return useImport(ctx, key, `_$${key}`);
  }
}

function wrapEffect(ctx: GeneratorContext, bodyExpr: string): string {
  // dom-expressions parity: effectWrapper can be false (wrapperless mode).
  if (ctx.options.effectWrapper === false) return `${bodyExpr};`;
  const effectFn = h(ctx, "effect");
  return `${effectFn}(() => ${bodyExpr});`;
}

function rewriteNestedJSX(expr: string, ctx: GeneratorContext): string {
  const spans = findJSXExpressions(expr);
  if (spans.length === 0) return expr;

  let result = expr;
  const sorted = spans.slice().sort((a, b) => b.start - a.start);
  for (const span of sorted) {
    try {
      const parsed = parseJSX(span.jsx);
      const generated = generateElement(parsed, ctx);
      result = result.slice(0, span.start) + generated.code + result.slice(span.end);
    } catch {
      // If parsing fails for a subexpression, leave it as-is
    }
  }

  return result;
}

interface GeneratedElement {
  code: string;
  isStatic: boolean;
}

/**
 * Generate SolidJS code from parsed JSX
 */
export function generateSolidCode(
  jsx: ParsedJSX,
  options: ResolvedGasOptions
): { code: string; imports: Set<string>; delegatedEvents: Set<string>; templates: string[] } {
  const ctx: GeneratorContext = {
    templates: [],
    templateCounter: 0,
    imports: new Set(),
    importAliases: new Map(),
    delegatedEvents: new Set(),
    options,
    varCounter: 0,
    usedNames: new Set(),
    namespaceImports: new Set(),
    ssrTemplates: [],
    ssrTemplateCache: new Map()
  };

  const result = ctx.options.generate === "ssr" ? generateElementSSR(jsx, ctx, true) : generateElement(jsx, ctx);

  // Build template declarations
  const templateDeclarations =
    ctx.options.generate === "ssr"
      ? ctx.ssrTemplates.map(t => {
          const literal =
            t.parts.length === 1
              ? JSON.stringify(t.parts[0]!)
              : `[${t.parts.map(p => JSON.stringify(p)).join(", ")}]`;
          return `var ${t.id} = ${literal};`;
        })
      : ctx.templates.map(t => {
          const templateFn = h(ctx, "template");
          const templateCall = t.isSVG
            ? `${templateFn}(\`${escapeTemplate(t.html)}\`, ${t.isSVG ? "2" : "0"})`
            : `${templateFn}(\`${escapeTemplate(t.html)}\`)`;
          // In dev mode, add a comment with the template content for easier debugging
          const devComment =
            ctx.options.dev ? ` /* ${t.html.slice(0, 50)}${t.html.length > 50 ? "..." : ""} */` : "";
          return `const ${t.id} = /*#__PURE__*/${templateCall};${devComment}`;
        });

  return {
    code: result.code,
    imports: ctx.imports,
    delegatedEvents: ctx.delegatedEvents,
    templates: templateDeclarations
  };
}

/**
 * Generate SolidJS code from parsed JSX using a shared context
 */
export function generateSolidCodeWithContext(
  jsx: ParsedJSX,
  ctx: GeneratorContext
): { code: string; imports: Set<string>; delegatedEvents: Set<string>; templates: string[] } {
  const initialDomTemplateCount = ctx.templates.length;
  const initialSsrTemplateCount = ctx.ssrTemplates.length;
  const result = ctx.options.generate === "ssr" ? generateElementSSR(jsx, ctx, true) : generateElement(jsx, ctx);

  const templateDeclarations =
    ctx.options.generate === "ssr"
      ? ctx.ssrTemplates.slice(initialSsrTemplateCount).map(t => {
          const literal =
            t.parts.length === 1
              ? JSON.stringify(t.parts[0]!)
              : `[${t.parts.map(p => JSON.stringify(p)).join(", ")}]`;
          return `var ${t.id} = ${literal};`;
        })
      : ctx.templates.slice(initialDomTemplateCount).map(t => {
          const templateFn = h(ctx, "template");
          const templateCall = t.isSVG
            ? `${templateFn}(\`${escapeTemplate(t.html)}\`, ${t.isSVG ? "2" : "0"})`
            : `${templateFn}(\`${escapeTemplate(t.html)}\`)`;
          // In dev mode, add a comment with the template content for easier debugging
          const devComment =
            ctx.options.dev ? ` /* ${t.html.slice(0, 50)}${t.html.length > 50 ? "..." : ""} */` : "";
          return `const ${t.id} = /*#__PURE__*/${templateCall};${devComment}`;
        });

  return {
    code: result.code,
    imports: ctx.imports,
    delegatedEvents: ctx.delegatedEvents,
    templates: templateDeclarations
  };
}

function generateElement(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  if (ctx.options.generate === "ssr") {
    // Nested SSR generation defaults to non-top-level. Top-level is handled by generateSolidCode*.
    return generateElementSSR(jsx, ctx, false);
  }

  // Handle fragments
  if (jsx.type === "fragment") {
    return generateFragment(jsx, ctx);
  }

  // Handle components
  if (jsx.type === "component") {
    return generateComponent(jsx, ctx);
  }

  // Handle DOM elements
  return generateDOMElement(jsx, ctx);
}

function generateFragment(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  if (jsx.children.length === 0) {
    return { code: "null", isStatic: true };
  }

  if (jsx.children.length === 1) {
    return generateFragmentChild(jsx.children[0]!, ctx);
  }

  const childResults = jsx.children.map(child => generateFragmentChild(child, ctx));
  const code = `[${childResults.map(r => r.code).join(", ")}]`;

  return { code, isStatic: childResults.every(r => r.isStatic) };
}

function generateFragmentSSR(jsx: ParsedJSX, ctx: GeneratorContext, topLevel: boolean): GeneratedElement {
  if (jsx.children.length === 0) return { code: '""', isStatic: true };

  if (jsx.children.length === 1) {
    return generateSSRChild(jsx.children[0]!, ctx, topLevel);
  }

  const childCodes = jsx.children.map(child => generateSSRChild(child, ctx, topLevel).code);
  const code = `[${childCodes.join(", ")}]`;
  return { code, isStatic: false };
}

function generateFragmentChild(child: ParsedChild, ctx: GeneratorContext): GeneratedElement {
  if (child.type === "text") {
    return { code: JSON.stringify(child.value.trim()), isStatic: true };
  }
  if (child.type === "expression") {
    return { code: child.value, isStatic: false };
  }
  if (child.type === "element") {
    return generateElement(child.value, ctx);
  }
  return { code: "null", isStatic: true };
}

function generateComponent(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children } = jsx;

  // Check if it's a built-in component
  if (ctx.options.builtIns.has(tag)) {
    return generateBuiltInComponent(jsx, ctx);
  }

  // Generate props object
  const propsCode = generatePropsObject(props, children, ctx);

  // Handle member expressions (e.g., Foo.Bar)
  const componentRef = tag;

  const createComponentFn = h(ctx, "createComponent");
  // In dev mode, add a comment with the component name for easier debugging
  const devComment = ctx.options.dev ? ` /* <${tag}> */` : "";
  const code = `${createComponentFn}(${componentRef}, ${propsCode})${devComment}`;

  return { code, isStatic: false };
}

function generateComponentSSR(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children } = jsx;

  // Built-ins are invoked directly
  if (ctx.options.builtIns.has(tag)) {
    const propsCode = generatePropsObjectSSR(props, children, ctx);
    const devComment = ctx.options.dev ? ` /* <${tag}> */` : "";
    return { code: `${tag}(${propsCode})${devComment}`, isStatic: false };
  }

  const propsCode = generatePropsObjectSSR(props, children, ctx);
  const createComponentFn = h(ctx, "createComponent");
  // In dev mode, add a comment with the component name for easier debugging
  const devComment = ctx.options.dev ? ` /* <${tag}> */` : "";
  return { code: `${createComponentFn}(${tag}, ${propsCode})${devComment}`, isStatic: false };
}

function generateBuiltInComponent(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children } = jsx;

  // Built-in components are passed directly without createComponent
  const propsCode = generatePropsObject(props, children, ctx);

  // Import the built-in from solid-js
  const code = `${tag}(${propsCode})`;

  return { code, isStatic: false };
}

function generateDOMElement(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children, isSVG } = jsx;

  if (ctx.options.validate) {
    validateDOMStructure(tag, children);
  }

  // Analyze props for static vs dynamic
  const { staticProps, dynamicProps, eventProps, refProp, spreadProps, specialProps } =
    categorizeProps(props);

  // Check if element is a custom element or slot that needs context
  const isCustomElement = tag.includes("-") || tag === "slot";
  const needsContext = ctx.options.contextToCustomElements && isCustomElement;

  // Check if element is fully static
  const hasAnyDynamic =
    dynamicProps.length > 0 ||
    eventProps.length > 0 ||
    refProp !== null ||
    spreadProps.length > 0 ||
    specialProps.length > 0 ||
    needsContext || // Custom elements need dynamic handling for context
    children.some(child => !isStaticChild(child));

  if (!hasAnyDynamic) {
    // Fully static element - generate template
    return generateStaticElement(jsx, ctx);
  }

  // Dynamic element - generate with effects
  return generateDynamicElement(jsx, ctx, {
    staticProps,
    dynamicProps,
    eventProps,
    refProp,
    spreadProps,
    specialProps
  });
}

function generateElementSSR(jsx: ParsedJSX, ctx: GeneratorContext, topLevel: boolean): GeneratedElement {
  if (jsx.type === "fragment") {
    return generateFragmentSSR(jsx, ctx, topLevel);
  }

  if (jsx.type === "component") {
    return generateComponentSSR(jsx, ctx);
  }

  return generateDOMElementSSR(jsx, ctx, topLevel);
}

function generateStaticElement(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  // Generate static HTML
  const html = generateStaticHTML(jsx, ctx.options);
  const templateId = allocTemplateId(ctx);

  ctx.templates.push({
    id: templateId,
    html,
    isSVG: jsx.isSVG,
    hasCustomElement: jsx.tag.includes("-")
  });

  h(ctx, "template");
 
  return {
    code: ctx.options.hydratable ? `${h(ctx, "getNextElement")}(${templateId})` : `${templateId}()`,
    isStatic: true
  };
}

// Props that replace all children when set dynamically
const CHILD_REPLACING_PROPS = new Set(["innerHTML", "textContent", "innerText"]);

function generateDynamicElement(
  jsx: ParsedJSX,
  ctx: GeneratorContext,
  categorized: CategorizedProps
): GeneratedElement {
  const { tag, children, isSVG } = jsx;
  const { staticProps, dynamicProps, eventProps, refProp, spreadProps, specialProps } =
    categorized;

  // Check if any dynamic prop will replace children (innerHTML, textContent, innerText)
  // When these are set dynamically, any child placeholders would be destroyed
  const hasChildReplacingProp = dynamicProps.some(p => CHILD_REPLACING_PROPS.has(p.name));

  // Generate template HTML with static parts
  // If a child-replacing prop is present, don't include children in template (no placeholders)
  const templateChildren = hasChildReplacingProp ? [] : children;
  const templateHTML = generateTemplateHTML(tag, staticProps, templateChildren, ctx.options);
  const templateId = allocTemplateId(ctx);

  ctx.templates.push({
    id: templateId,
    html: templateHTML,
    isSVG,
    hasCustomElement: tag.includes("-")
  });

  h(ctx, "template");

  // Generate IIFE for element setup
  const varName = allocVar(ctx, "_el$");
  const statements: string[] = [];

  statements.push(
    `const ${varName} = ${ctx.options.hydratable ? `${h(ctx, "getNextElement")}(${templateId})` : `${templateId}()`};`
  );

  // Set context on custom elements and slots for Web Component interop
  const isCustomElement = tag.includes("-") || tag === "slot";
  if (ctx.options.contextToCustomElements && isCustomElement) {
    statements.push(`${varName}._$owner = ${h(ctx, "getOwner")}();`);
  }

  // Handle spread props first (they can override everything)
  if (spreadProps.length > 0) {
    const spreadFn = h(ctx, "spread");
    for (const prop of spreadProps) {
      if (prop.value.type === "spread") {
        statements.push(`${spreadFn}(${varName}, ${prop.value.value}, ${isSVG});`);
      }
    }
  }

  // Generate child element references and collect all dynamic expressions
  // Skip if a child-replacing prop is present (innerHTML, textContent, innerText)
  // since those will replace any children we try to insert
  const expressionInserts = hasChildReplacingProp
    ? []
    : generateChildReferencesAndExpressions(
        children,
        varName,
        statements,
        ctx
      );

  // Handle dynamic props
  for (const prop of dynamicProps) {
    const attrCode = generateDynamicAttribute(varName, prop, isSVG, ctx);
    if (attrCode) {
      statements.push(attrCode);
    }
  }

  // Handle special props (classList, style, use:*, etc.)
  for (const prop of specialProps) {
    const specialCode = generateSpecialProp(varName, prop, ctx);
    if (specialCode) {
      statements.push(specialCode);
    }
  }

  // Handle event handlers
  for (const prop of eventProps) {
    const eventCode = generateEventHandler(varName, prop, ctx);
    if (eventCode) {
      statements.push(eventCode);
    }
  }

  // Handle ref
  if (refProp && refProp.value.type === "expression") {
    for (const stmt of generateRefStatements(refProp.value.value, varName, ctx)) {
      statements.push(stmt);
    }
  }

  // Handle all dynamic expression inserts (including nested ones)
  for (const insert of expressionInserts) {
    const insertCode = generateDynamicChildInsertFromExpr(varName, insert, ctx);
    if (insertCode) {
      statements.push(insertCode);
    }
  }

  statements.push(`return ${varName};`);

  const code = `(() => {\n  ${statements.join("\n  ")}\n})()`;

  return { code, isStatic: false };
}



interface CategorizedProps {
  staticProps: ParsedProp[];
  dynamicProps: ParsedProp[];
  eventProps: ParsedProp[];
  refProp: ParsedProp | null;
  spreadProps: ParsedProp[];
  specialProps: ParsedProp[]; // classList, style, use:*, etc.
}

export function categorizeProps(props: ParsedProp[]): CategorizedProps {
  const result: CategorizedProps = {
    staticProps: [],
    dynamicProps: [],
    eventProps: [],
    refProp: null,
    spreadProps: [],
    specialProps: []
  };

  for (const prop of props) {
    const { name, value } = prop;

    // Spread props
    if (value.type === "spread") {
      result.spreadProps.push(prop);
      continue;
    }

    // Ref
    if (name === "ref") {
      result.refProp = prop;
      continue;
    }

    // Special props
    if (
      name === "classList" ||
      name === "style" ||
      name.startsWith("use:") ||
      name.startsWith("prop:") ||
      name.startsWith("attr:") ||
      name.startsWith("on:") ||
      name.startsWith("oncapture:")
    ) {
      result.specialProps.push(prop);
      continue;
    }

    // Event handlers (onClick, onInput, etc.)
    if (name.startsWith("on") && !name.startsWith("oncapture:")) {
      result.eventProps.push(prop);
      continue;
    }

    // Static vs dynamic props
    if (value.type === "string" || value.type === "true") {
      result.staticProps.push(prop);
    } else {
      result.dynamicProps.push(prop);
    }
  }

  return result;
}

function generateTemplateHTML(
  tag: string,
  staticProps: ParsedProp[],
  children: ParsedChild[],
  options: ResolvedGasOptions
 ): string {
  const jsx: ParsedJSX = {
    type: "element",
    tag,
    props: staticProps,
    children,
    start: 0,
    end: 0,
    selfClosing: false,
    isSVG: false
  };
  return generateHTMLWithPlaceholders(jsx, true, options, { lastNode: true });
}

type SsrTemplateBuild = { parts: string[]; values: string[] };

function ssrAppend(build: SsrTemplateBuild, text: string): void {
  build.parts[build.parts.length - 1] += text;
}

function ssrPushValue(build: SsrTemplateBuild, valueExpr: string): void {
  build.values.push(valueExpr);
  build.parts.push("");
}

function ssrMerge(build: SsrTemplateBuild, child: SsrTemplateBuild): void {
  ssrAppend(build, child.parts[0] ?? "");
  for (let i = 0; i < child.values.length; i++) {
    ssrPushValue(build, child.values[i]!);
    ssrAppend(build, child.parts[i + 1] ?? "");
  }
}

const SSR_ALIASES: Record<string, string> = {
  className: "class",
  htmlFor: "for"
};

function stripSsrNamespace(name: string): string {
  const parts = name.split(":");
  if (parts.length !== 2) return name;
  const [prefix, local] = parts;
  if (!prefix || !local) return name;
  // dom-expressions strips reserved namespaces (xlink/xml/xmlns) for now in SSR.
  return NAMESPACE_URIS[prefix] ? local : name;
}

function toSsrAttributeName(name: string, isSVG: boolean): string {
  const aliased = SSR_ALIASES[name] ?? name;
  return isSVG ? aliased : aliased.toLowerCase();
}

function ssrEscapeAttr(expr: string, ctx: GeneratorContext): string {
  const escapeFn = h(ctx, "escape");
  return `${escapeFn}(${expr}, true)`;
}

function buildSsrStyleObjectLiteral(exprText: string, ctx: GeneratorContext): string | null {
  const parsed = parseExpressionForAnalysis(exprText);
  if (!parsed) return null;
  const { sf, expr } = parsed;
  if (!ts.isObjectLiteralExpression(expr)) return null;

  const ssrStylePropertyFn = h(ctx, "ssrStyleProperty");
  const parts: string[] = [];
  let pendingStatic = "";
  let hasAny = false;

  const flushStatic = () => {
    if (!pendingStatic) return;
    parts.push(JSON.stringify(escapeAttr(pendingStatic)));
    pendingStatic = "";
    hasAny = true;
  };

  for (const prop of expr.properties) {
    if (!ts.isPropertyAssignment(prop)) return null;
    if (prop.name && (ts.isComputedPropertyName(prop.name) || ts.isPrivateIdentifier(prop.name))) return null;

    let key: string | null = null;
    if (ts.isIdentifier(prop.name)) key = prop.name.text;
    else if (ts.isStringLiteralLike(prop.name)) key = prop.name.text;
    else if (ts.isNumericLiteral(prop.name)) key = prop.name.text;
    else return null;

    const init = prop.initializer;
    const prefix = hasAny || pendingStatic ? ";" : "";

    if (ts.isStringLiteralLike(init)) {
      pendingStatic += `${prefix}${key}:${init.text}`;
      continue;
    }
    if (ts.isNumericLiteral(init)) {
      pendingStatic += `${prefix}${key}:${init.text}`;
      continue;
    }

    flushStatic();
    const valueExpr = printExpression(init, sf);
    parts.push(`${ssrStylePropertyFn}(${JSON.stringify(`${prefix}${key}:`)}, ${ssrEscapeAttr(valueExpr, ctx)})`);
    hasAny = true;
  }

  flushStatic();
  if (parts.length === 0) return JSON.stringify("");
  return parts.join(" + ");
}

function getOrCreateSsrTemplateId(ctx: GeneratorContext, parts: string[]): string {
  const key = parts.join("\u0000");
  const existing = ctx.ssrTemplateCache.get(key);
  if (existing) return existing;
  const id = allocTemplateId(ctx);
  ctx.ssrTemplates.push({ id, parts });
  ctx.ssrTemplateCache.set(key, id);
  return id;
}

function meaningfulChildCount(children: ParsedChild[]): number {
  let count = 0;
  for (const child of children) {
    if (child.type === "text") {
      if (child.value.trim().length) count++;
      continue;
    }
    // expressions and elements count
    count++;
  }
  return count;
}

function filterSsrChildren(children: ParsedChild[]): ParsedChild[] {
  return children.filter(child => {
    if (child.type !== "text") return true;
    const raw = child.value.replace(/\r/g, "");
    // dom-expressions filterChildren removes JSXText nodes that are just a newline + indentation.
    // Keep spaces-only nodes because they are meaningful for SSR output.
    return !/^[\r\n]\s*$/.test(raw);
  });
}

function ssrHasMultipleChildren(children: ParsedChild[]): boolean {
  // dom-expressions checkLength: count "meaningful" children with special handling
  // for whitespace-only text nodes:
  // - ignore whitespace-only text that includes newlines
  // - count spaces-only nodes
  let i = 0;
  for (const child of children) {
    if (child.type === "text") {
      const raw = child.value.replace(/\r/g, "");
      const whitespaceOnly = /^\s*$/.test(raw);
      const spacesOnly = /^ *$/.test(raw);
      if (!whitespaceOnly || spacesOnly) i++;
    } else {
      i++;
    }
    if (i > 1) return true;
  }
  return false;
}

function buildSsrTemplateForJsx(
  jsx: ParsedJSX,
  ctx: GeneratorContext,
  info: { topLevel: boolean; inSVG: boolean }
): SsrTemplateBuild | null {
  // Components cannot be inlined into a static template; insert them as dynamic nodes.
  if (jsx.type === "component") {
    const escapeFn = h(ctx, "escape");
    const componentExpr = generateComponentSSR(jsx, ctx).code;
    return { parts: ["", ""], values: [`${escapeFn}(${componentExpr})`] };
  }

  if (jsx.type === "fragment") {
    const build: SsrTemplateBuild = { parts: [""], values: [] };
    const filtered = filterSsrChildren(jsx.children);
    const markers = ctx.options.hydratable && ssrHasMultipleChildren(filtered);
    for (const child of filtered) {
      const childBuild = buildSsrTemplateForChild(
        child,
        ctx,
        { ...info, topLevel: false },
        { markers, doNotEscape: false }
      );
      if (childBuild) ssrMerge(build, childBuild);
    }
    return build;
  }

  // Element
  const { tag, props, children } = jsx;
  const isSVG = info.inSVG || jsx.isSVG;
  const tagLower = tag.toLowerCase();

  // Spread props are handled via ssrElement fallback (dom-expressions uses ssrElement for spreads).
  if (props.some(p => p.value.type === "spread")) return null;

  const hasClassList = props.some(p => stripSsrNamespace(p.name) === "classList" && p.value.type === "expression");
  // If classList is combined with a dynamic class/className expression, fall back to ssrElement runtime
  // to avoid emitting duplicate class attributes.
  if (
    hasClassList &&
    props.some(p => {
      const n = stripSsrNamespace(p.name);
      return (n === "class" || n === "className") && p.value.type === "expression";
    })
  ) {
    return null;
  }

  const build: SsrTemplateBuild = { parts: [`<${tag}`], values: [] };

  // doNotEscape parity:
  // - <script>/<style> do not escape inserted expressions/text
  // - innerHTML child property do not escape
  const isRawTextTag = tagLower === "script" || tagLower === "style";
  let doNotEscapeChildren = isRawTextTag;

  // Child-replacing prop parity (innerHTML/textContent/innerText/children)
  // Note: we avoid emitting these as attributes; instead we treat them as children.
  let childProp: ParsedProp | null = null;
  let childPropName: string | null = null;
  for (const prop of props) {
    const strippedName = stripSsrNamespace(prop.name);
    if (
      strippedName === "innerHTML" ||
      strippedName === "textContent" ||
      strippedName === "innerText" ||
      strippedName === "children"
    ) {
      childProp = prop;
      childPropName = strippedName;
      if (strippedName === "innerHTML") doNotEscapeChildren = true;
      break;
    }
  }

  if (info.topLevel && ctx.options.hydratable && tagLower !== "head") {
    const hk = h(ctx, "ssrHydrationKey");
    ssrPushValue(build, `${hk}()`);
  }

  // Attributes
  let mergedStaticClass = "";
  let classListExpr: string | null = null;
  for (const prop of props) {
    const { name, value } = prop;
    const strippedName = stripSsrNamespace(name);

    // Skip server-irrelevant props
    if (
      strippedName === "ref" ||
      strippedName.startsWith("on") ||
      strippedName.startsWith("use:") ||
      strippedName.startsWith("prop:")
    )
      continue;

    // ChildProperties: handled after the opening tag.
    if (
      strippedName === "innerHTML" ||
      strippedName === "textContent" ||
      strippedName === "innerText" ||
      strippedName === "children"
    ) {
      continue;
    }

    const attrName = toSsrAttributeName(strippedName, isSVG);
    const lower = attrName.toLowerCase();

    if (value.type === "true") {
      ssrAppend(build, ` ${lower}`);
      continue;
    }

    if (value.type === "string") {
      // dom-expressions SSR always emits quoted static string attribute values.
      // Special-cases empty strings as bare attributes (no ="").
      const raw = value.value;
      const nameForSsr = toSsrAttributeName(strippedName, isSVG);
      if (nameForSsr === "class" && hasClassList) {
        let text = raw;
        text = text.replace(/\r/g, "");
        if (/\n/g.test(text)) {
          text = text
            .split("\n")
            .map((t, i) => (i ? t.replace(/^\s*/g, "") : t))
            .filter(s => !/^\s*$/.test(s))
            .join(" ");
        }
        text = text.replace(/\s+/g, " ");
        if (text) mergedStaticClass += (mergedStaticClass ? " " : "") + text;
        continue;
      }
      ssrAppend(build, ` ${nameForSsr}`);
      if (raw !== "") {
        let text = raw;
        // Normalize static class/style values similarly to dom-expressions.
        if (nameForSsr === "class" || nameForSsr === "style") {
          text = text.replace(/\r/g, "");
          if (/\n/g.test(text)) {
            text = text
              .split("\n")
              .map((t, i) => (i ? t.replace(/^\s*/g, "") : t))
              .filter(s => !/^\s*$/.test(s))
              .join(" ");
          }
          text = text.replace(/\s+/g, " ");
          if (nameForSsr === "style") {
            text = text.replace(/; /g, ";").replace(/: /g, ":");
          }
        }
        ssrAppend(build, `="${escapeAttr(text)}"`);
      }
      continue;
    }

    if (value.type === "expression") {
      const ssrAttributeFn = h(ctx, "ssrAttribute");
      const expr = rewriteNestedJSX(value.value, ctx);

      // Special SSR props/namespace prefixes (dom-expressions parity)
      if (strippedName === "classList") {
        classListExpr = expr;
        continue;
      }
      if (strippedName === "style") {
        const built = buildSsrStyleObjectLiteral(expr, ctx);
        if (built) {
          ssrPushValue(build, `${ssrAttributeFn}("style", ${built}, false)`);
        } else {
          const ssrStyleFn = h(ctx, "ssrStyle");
          ssrPushValue(build, `${ssrAttributeFn}("style", ${ssrStyleFn}(${expr}), false)`);
        }
        continue;
      }

      let effectiveName = lower;
      let forcedBoolean = false;
      if (effectiveName.startsWith("attr:")) {
        effectiveName = stripSsrNamespace(effectiveName.slice(5));
      } else if (effectiveName.startsWith("bool:")) {
        effectiveName = stripSsrNamespace(effectiveName.slice(5));
        forcedBoolean = true;
      }

      const isBoolean = forcedBoolean || BOOLEAN_ATTRS.has(effectiveName);
      const valueExpr = isBoolean ? expr : ssrEscapeAttr(expr, ctx);
      ssrPushValue(
        build,
        `${ssrAttributeFn}(${JSON.stringify(effectiveName)}, ${valueExpr}, ${isBoolean ? "true" : "false"})`
      );
      continue;
    }

    if (value.type === "element") {
      // JSX values become nodes; serialize via escape() to allow SSR nodes/strings safely.
      const escapeFn = h(ctx, "escape");
      const nodeExpr = generateElement(value.value, ctx).code;
      ssrPushValue(build, `${escapeFn}(${nodeExpr})`);
      continue;
    }
  }

  // Merge class + classList into a single class attribute (dom-expressions parity).
  if (classListExpr) {
    const ssrAttributeFn = h(ctx, "ssrAttribute");
    const ssrClassListFn = h(ctx, "ssrClassList");
    const base = mergedStaticClass ? `${escapeAttr(mergedStaticClass)} ` : "";
    const mergedExpr = base ? `${JSON.stringify(base)} + ${ssrClassListFn}(${classListExpr})` : `${ssrClassListFn}(${classListExpr})`;
    ssrPushValue(build, `${ssrAttributeFn}("class", ${mergedExpr}, false)`);
  }

  // Void/self-closing handling: dom-expressions emits `>` (not `/>`) for void tags in SSR templates.
  ssrAppend(build, ">");
  const voidTag = isVoidElement(tag.toLowerCase());
  if (!voidTag) {
    const filteredChildren = filterSsrChildren(children);
    const markers = ctx.options.hydratable && ssrHasMultipleChildren(filteredChildren);

    if (childProp && childPropName) {
      const value = childProp.value;
      if (value.type === "string") {
        // innerHTML uses raw string; other child props behave like text nodes (escaped).
        ssrAppend(build, doNotEscapeChildren ? value.value : escapeHTML(value.value));
      } else if (value.type === "true") {
        // children={true} isn't meaningful; ignore.
      } else if (value.type === "expression") {
        const expr = rewriteNestedJSX(value.value, ctx);
        // hydratable SSR parity: textContent expression coerces to at least one whitespace.
        const normalized =
          ctx.options.hydratable && childPropName === "textContent" ? `(${expr} || " ")` : expr;
        const valueExpr = doNotEscapeChildren ? normalized : `${h(ctx, "escape")}(${normalized})`;
        if (markers && !doNotEscapeChildren) {
          ssrAppend(build, "<!--$-->");
          ssrPushValue(build, valueExpr);
          ssrAppend(build, "<!--/-->");
        } else {
          ssrPushValue(build, valueExpr);
        }
      } else if (value.type === "element") {
        const nodeExpr = generateElement(value.value, ctx).code;
        const valueExpr = doNotEscapeChildren ? nodeExpr : `${h(ctx, "escape")}(${nodeExpr})`;
        if (markers && !doNotEscapeChildren) {
          ssrAppend(build, "<!--$-->");
          ssrPushValue(build, valueExpr);
          ssrAppend(build, "<!--/-->");
        } else {
          ssrPushValue(build, valueExpr);
        }
      } else if (value.type === "spread") {
        return null;
      }
    } else {
      for (const child of filteredChildren) {
        const childBuild = buildSsrTemplateForChild(
          child,
          ctx,
          { topLevel: false, inSVG: isSVG },
          { markers, doNotEscape: doNotEscapeChildren }
        );
        if (childBuild) ssrMerge(build, childBuild);
      }
    }
    ssrAppend(build, `</${tag}>`);
  }

  return build;
}

function buildSsrTemplateForChild(
  child: ParsedChild,
  ctx: GeneratorContext,
  info: { topLevel: boolean; inSVG: boolean },
  opts: { markers: boolean; doNotEscape: boolean }
): SsrTemplateBuild | null {
  if (child.type === "text") {
    if (child.value.length === 0) return { parts: [""], values: [] };
    return { parts: [opts.doNotEscape ? child.value : escapeHTML(child.value)], values: [] };
  }

  if (child.type === "expression") {
    const expr = rewriteNestedJSX(child.value, ctx);
    const valueExpr = opts.doNotEscape ? expr : `${h(ctx, "escape")}(${expr})`;
    if (opts.markers && !opts.doNotEscape) {
      return { parts: ["<!--$-->", "<!--/-->"], values: [valueExpr] };
    }
    return { parts: ["", ""], values: [valueExpr] };
  }

  if (child.type === "element") {
    const jsx = child.value;
    if (jsx.type === "component") {
      const componentExpr = generateComponentSSR(jsx, ctx).code;
      const valueExpr = opts.doNotEscape ? componentExpr : `${h(ctx, "escape")}(${componentExpr})`;
      if (opts.markers && !opts.doNotEscape) return { parts: ["<!--$-->", "<!--/-->"], values: [valueExpr] };
      return { parts: ["", ""], values: [valueExpr] };
    }
    const built = buildSsrTemplateForJsx(jsx, ctx, info);
    if (built) return built;
    // Spread child element fallback: insert the ssrElement node as a value.
    const nodeExpr = generateElementSSR(jsx, ctx, false).code;
    const valueExpr = opts.doNotEscape ? nodeExpr : `${h(ctx, "escape")}(${nodeExpr})`;
    if (opts.markers && !opts.doNotEscape) return { parts: ["<!--$-->", "<!--/-->"], values: [valueExpr] };
    return { parts: ["", ""], values: [valueExpr] };
  }

  return null;
}

function generateDOMElementSSR(jsx: ParsedJSX, ctx: GeneratorContext, topLevel: boolean): GeneratedElement {
  const { tag, props, children } = jsx;

  // dom-expressions parity: in hydratable SSR, top-level <head> is wrapped in NoHydration
  // so it doesn't participate in hydration.
  if (topLevel && ctx.options.hydratable && tag.toLowerCase() === "head") {
    const createComponentFn = h(ctx, "createComponent");
    const noHydration = h(ctx, "NoHydration");
    const child = generateDOMElementSSR(jsx, ctx, false).code;
    return {
      code: `${createComponentFn}(${noHydration}, { get children() { return ${child}; } })`,
      isStatic: false
    };
  }

  // Prefer SSR templates + ssr() calls when there are no spreads, to match dom-expressions output.
  const templated = buildSsrTemplateForJsx(jsx, ctx, { topLevel, inSVG: false });
  if (templated) {
    const templateId = getOrCreateSsrTemplateId(ctx, templated.parts);
    // dom-expressions parity: if the only dynamic value is ssrHydrationKey(), avoid an ssr() call.
    const hkCall = `${h(ctx, "ssrHydrationKey")}()`;
    if (templated.values.length === 1 && templated.values[0] === hkCall) {
      return { code: `${templateId}[0] + ${hkCall} + ${templateId}[1]`, isStatic: false };
    }

    const ssrFn = h(ctx, "ssr");
    const args = templated.values.length ? `, ${templated.values.join(", ")}` : "";
    return { code: `${ssrFn}(${templateId}${args})`, isStatic: false };
  }

  const ssrElementFn = h(ctx, "ssrElement");
  const propsExpr = buildSSRProps(tag, props, ctx);
  const childNodes: string[] = [];
  for (const child of children) {
    if (child.type === "text") {
      childNodes.push(JSON.stringify(child.value));
      continue;
    }
    if (child.type === "expression") {
      // For hydratable SSR output, surround dynamic insertions with markers so the client
      // can locate them via getNextMarker (dom-expressions behavior).
      if (ctx.options.hydratable) {
        childNodes.push("\"<!--$-->\"");
      }
      const escapeFn = h(ctx, "escape");
      childNodes.push(`${escapeFn}(${rewriteNestedJSX(child.value, ctx)})`);
      if (ctx.options.hydratable) {
        childNodes.push("\"<!--/-->\"");
      }
      continue;
    }
    if (child.type === "element") {
      childNodes.push(generateElementSSR(child.value, ctx, false).code);
      continue;
    }
  }

  let childrenExpr: string;
  if (childNodes.length === 0) {
    childrenExpr = "undefined";
  } else if (childNodes.length === 1) {
    childrenExpr = childNodes[0]!;
  } else {
    childrenExpr = `[${childNodes.join(", ")}]`;
  }

  const childrenArg =
    childNodes.length === 0 ? "undefined" : ctx.options.hydratable ? `() => ${childrenExpr}` : childrenExpr;
  const needsId = ctx.options.hydratable && topLevel ? "true" : "false";

  const code = `${ssrElementFn}(${JSON.stringify(tag)}, ${propsExpr}, ${childrenArg}, ${needsId})`;
  return { code, isStatic: false };
}

function generateSSRChild(child: ParsedChild, ctx: GeneratorContext, topLevel: boolean): GeneratedElement {
  if (child.type === "text") {
    const text = child.value;
    return { code: JSON.stringify(text), isStatic: true };
  }
  if (child.type === "expression") {
    const escapeFn = h(ctx, "escape");
    return { code: `${escapeFn}(${child.value})`, isStatic: false };
  }
  if (child.type === "element") {
    return generateElementSSR(child.value, ctx, topLevel);
  }
  return { code: '""', isStatic: true };
}

function buildSSRProps(tag: string, props: ParsedProp[], ctx: GeneratorContext): string {
  const spreads: string[] = [];
  const regular: string[] = [];

  // Solid's SSR runtime (`solid-js/web` server build) expects an object of props.
  // It handles class/className/classList merging, style (string|object), boolean attrs,
  // and children-replacing props like innerHTML internally.
  for (const prop of props) {
    const { name, value } = prop;
    const lowerName = name.toLowerCase();
    const keyName = BOOLEAN_ATTRS.has(lowerName) ? lowerName : name;

    if (value.type === "spread") {
      spreads.push(value.value);
      continue;
    }

    if (value.type === "true") {
      regular.push(`${JSON.stringify(keyName)}: true`);
      continue;
    }

    if (value.type === "string") {
      regular.push(`${JSON.stringify(keyName)}: ${JSON.stringify(value.value)}`);
      continue;
    }

    if (value.type === "element") {
      const generated = generateElement(value.value, ctx);
      regular.push(`${JSON.stringify(keyName)}: ${generated.code}`);
      continue;
    }

    if (value.type === "expression") {
      const expr = rewriteNestedJSX(value.value, ctx);
      regular.push(`${JSON.stringify(keyName)}: ${expr}`);
    }
  }

  const hasSpread = spreads.length > 0;
  const hasRegular = regular.length > 0;

  if (!hasSpread && !hasRegular) return "{}";

  if (hasSpread) {
    const mergePropsFn = h(ctx, "mergeProps");
    if (!hasRegular) {
      return spreads.length === 1 ? spreads[0]! : `${mergePropsFn}(${spreads.join(", ")})`;
    }
    return `${mergePropsFn}(${spreads.join(", ")}, { ${regular.join(", ")} })`;
  }

  return `{ ${regular.join(", ")} }`;
}

function generateStaticHTML(jsx: ParsedJSX, options: ResolvedGasOptions): string {
  return generateHTMLWithPlaceholders(jsx, false, options, { lastNode: true });
}

function generateHTMLWithPlaceholders(
  jsx: ParsedJSX,
  includePlaceholders: boolean,
  options: ResolvedGasOptions,
  info: { lastNode: boolean; toBeClosed?: Set<string> }
): string {
  const { tag, props, children, selfClosing } = jsx;

  if (jsx.type === "fragment") {
    const parts: string[] = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      if (child.type === "text") {
        parts.push(escapeHTML(child.value));
      } else if (child.type === "element") {
        if (includePlaceholders && !isStaticJSX(child.value)) {
          parts.push(options.hydratable ? "<!$><!/>" : "<!>");
        } else {
          parts.push(
            generateHTMLWithPlaceholders(child.value, includePlaceholders, options, {
              lastNode: i === children.length - 1,
              toBeClosed: info.toBeClosed
            })
          );
        }
      } else if (child.type === "expression" && includePlaceholders) {
        parts.push(options.hydratable ? "<!$><!/>" : "<!>");
      }
    }
    return parts.join("");
  }

  const tagName = tag.toLowerCase();
  const isVoid = isVoidElement(tagName);
  const inheritedToBeClosed = info.toBeClosed;

  // Determine whether we must include the closing tag for this element.
  // Matches dom-expressions' omitLastClosingTag/omitNestedClosingTags behavior.
  const shouldClose =
    !isVoid &&
    (!info.lastNode ||
      !options.omitLastClosingTag ||
      (inheritedToBeClosed &&
        (!options.omitNestedClosingTags || inheritedToBeClosed.has(tagName))));

  let nextToBeClosed: Set<string> | undefined = inheritedToBeClosed;
  if (shouldClose) {
    nextToBeClosed = new Set(inheritedToBeClosed ?? ALWAYS_CLOSE_TAGS);
    nextToBeClosed.add(tagName);
    if (INLINE_ELEMENTS.has(tagName)) {
      for (const el of BLOCK_ELEMENTS) nextToBeClosed.add(el);
    }
  }

  let html = `<${tag}`;

  for (const prop of props) {
    const { name, value } = prop;
    if (value.type === "string") {
      const escaped = escapeAttr(value.value);
      html += formatAttribute(name, escaped, options.omitQuotes);
    } else if (value.type === "true") {
      html += ` ${name}`;
    }
  }

  if (selfClosing) {
    // Prefer HTML-style void tags (no "/>") for parity with dom-expressions.
    html += ">";
    if (!isVoid && shouldClose) {
      html += `</${tag}>`;
    }
    return html;
  }

  html += ">";
 
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.type === "text") {
      html += escapeHTML(child.value);
    } else if (child.type === "element") {
      if (includePlaceholders && !isStaticJSX(child.value)) {
        html += options.hydratable ? "<!$><!/>" : "<!>";
      } else {
        html += generateHTMLWithPlaceholders(child.value, includePlaceholders, options, {
          lastNode: i === children.length - 1,
          toBeClosed: nextToBeClosed
        });
      }
    } else if (child.type === "expression" && includePlaceholders) {
      html += options.hydratable ? "<!$><!/>" : "<!>";
    }
  }
 
  if (!isVoid && shouldClose) {
    html += `</${tag}>`;
  }
 
  return html;
 }


interface ExpressionInsert {
  refVar: string;
  expr: string;
  markerVar?: string;
  currentVar?: string;
}

/**
 * Generate child references and collect all expression inserts (including nested ones)
 */
function generateChildReferencesAndExpressions(
  children: ParsedChild[],
  rootVar: string,
  statements: string[],
  ctx: GeneratorContext
): ExpressionInsert[] {
  const expressionInserts: ExpressionInsert[] = [];

  // Check if we need any references
  let needsRef = false;
  for (const child of children) {
    if (child.type === "expression" || (child.type === "element" && !isStaticJSX(child.value))) {
      needsRef = true;
      break;
    }
  }

  if (!needsRef) return expressionInserts;

  // Generate references for dynamic children.
  // In hydratable DOM mode we use <!$><!/> marker pairs and getNextMarker to capture the
  // current hydrated nodes, matching dom-expressions output.
  if (ctx.options.hydratable) {
    const getNextMarkerFn = h(ctx, "getNextMarker");

    const firstRef = allocVar(ctx, "_el$");
    statements.push(`const ${firstRef} = ${rootVar}.firstChild;`);
    let currentRef = firstRef;

    for (let i = 0; i < children.length; i++) {
      const child = children[i]!;
      const isDynamicSlot =
        child.type === "expression" || (child.type === "element" && !isStaticJSX(child.value));

      if (isDynamicSlot) {
        // currentRef points at the start marker (<!$>)
        const markerVar = allocVar(ctx, "_el$");
        const currentVar = allocVar(ctx, "_co$");
        statements.push(`const [${markerVar}, ${currentVar}] = ${getNextMarkerFn}(${currentRef}.nextSibling);`);

        const expr =
          child.type === "expression"
            ? child.value
            : generateElement(child.value, ctx).code;

        expressionInserts.push({
          refVar: currentRef,
          expr,
          markerVar,
          currentVar
        });

        // Advance to the next node after the end marker (<!/>)
        if (i < children.length - 1) {
          const nextRef = allocVar(ctx, "_el$");
          statements.push(`const ${nextRef} = ${markerVar}.nextSibling;`);
          currentRef = nextRef;
        }

        continue;
      }

      // Static node (text or element): advance to next sibling
      if (i < children.length - 1) {
        const nextRef = allocVar(ctx, "_el$");
        statements.push(`const ${nextRef} = ${currentRef}.nextSibling;`);
        currentRef = nextRef;
      }
    }

    return expressionInserts;
  }

  // Non-hydratable DOM mode: uses <!> placeholders and direct sibling traversal.
  let currentRef = rootVar;
  let isFirst = true;

  for (const child of children) {
    if (child.type === "expression") {
      let refVar: string;
      if (isFirst) {
        refVar = `${rootVar}.firstChild`;
        currentRef = refVar;
        isFirst = false;
      } else {
        refVar = `_el$${ctx.varCounter++}`;
        statements.push(`const ${refVar} = ${currentRef}.nextSibling;`);
        currentRef = refVar;
      }
      expressionInserts.push({ refVar, expr: child.value });
    } else if (child.type === "element") {
      const isDynamicChild = !isStaticJSX(child.value);
      let refVar: string;
      if (isFirst) {
        refVar = `${rootVar}.firstChild`;
        currentRef = refVar;
        isFirst = false;
      } else {
        refVar = `_el$${ctx.varCounter++}`;
        statements.push(`const ${refVar} = ${currentRef}.nextSibling;`);
        currentRef = refVar;
      }

      if (isDynamicChild) {
        const generated = generateElement(child.value, ctx);
        expressionInserts.push({ refVar, expr: generated.code });
      }
    } else if (child.type === "text") {
      // Text nodes just advance the current reference without creating a variable
      if (isFirst) {
        currentRef = `${rootVar}.firstChild`;
        isFirst = false;
      } else {
        const textRef = `_el$${ctx.varCounter++}`;
        statements.push(`const ${textRef} = ${currentRef}.nextSibling;`);
        currentRef = textRef;
      }
    }
  }

  return expressionInserts;
}

function generateDynamicAttribute(
  varName: string,
  prop: ParsedProp,
  isSVG: boolean,
  ctx: GeneratorContext
): string | null {
  const { name, value } = prop;

  if (value.type !== "expression" && value.type !== "element") return null;
 
  const isJSXValue = value.type === "element";
  let expr = isJSXValue ? generateElement(value.value, ctx).code : rewriteNestedJSX(value.value, ctx);
  const hasStatic = !isJSXValue && hasStaticMarker(expr, ctx.options);
  if (hasStatic) {
    expr = stripStaticMarker(expr, ctx.options);
  }
 
  // Check if expression is potentially reactive (dynamic per dom-expressions isDynamic)
  const isPotentiallyReactive =
    !hasStatic && !isJSXValue && isDynamicExpression(expr, ctx, { checkMember: true, checkCallExpressions: true });
  const isHydratable = ctx.options.hydratable;
  const ns = parseNamespacedAttr(name);

  // Namespaced attributes (xlink/xml/xmlns) must be set via setAttributeNS for SVG/DOM parity.
  if (ns) {
    const setAttributeNS = h(ctx, "setAttributeNS");
    if (isPotentiallyReactive) {
      return wrapEffect(ctx, `${setAttributeNS}(${varName}, "${ns.namespaceUri}", "${ns.localName}", ${expr})`);
    }
    return `${setAttributeNS}(${varName}, "${ns.namespaceUri}", "${ns.localName}", ${expr});`;
  }
 
 
  // Boolean attributes
  if (BOOLEAN_ATTRS.has(name.toLowerCase())) {
    const lower = name.toLowerCase();
    if (isHydratable) {
      const setBool = h(ctx, "setBoolAttribute");
      if (isPotentiallyReactive) {
        return wrapEffect(ctx, `${setBool}(${varName}, "${lower}", ${expr})`);
      }
      return `${setBool}(${varName}, "${lower}", ${expr});`;
    }
    if (isPotentiallyReactive) {
      return wrapEffect(ctx, `${varName}.${name} = ${expr}`);
    }
    return `${varName}.${name} = ${expr};`;
  }


  // Property attributes
  if (PROPERTY_ATTRS.has(name)) {
    if (isHydratable) {
      const setProp = h(ctx, "setProperty");
      if (isPotentiallyReactive) {
        return wrapEffect(ctx, `${setProp}(${varName}, "${name}", ${expr})`);
      }
      return `${setProp}(${varName}, "${name}", ${expr});`;
    }
    if (isPotentiallyReactive) {
      return wrapEffect(ctx, `${varName}.${name} = ${expr}`);
    }
    return `${varName}.${name} = ${expr};`;
  }

  // Class attribute
  if (name === "class" || name === "className") {
    // SVG elements have read-only className property, must use setAttribute
    if (isSVG) {
      if (isHydratable) {
        const setAttr = h(ctx, "setAttribute");
        if (isPotentiallyReactive) {
          return wrapEffect(ctx, `${setAttr}(${varName}, "class", ${expr})`);
        }
        return `${setAttr}(${varName}, "class", ${expr});`;
      }
      if (isPotentiallyReactive) {
        return wrapEffect(ctx, `${varName}.setAttribute("class", ${expr})`);
      }
      return `${varName}.setAttribute("class", ${expr});`;
    }
    // Regular HTML elements can use className property
    if (isHydratable) {
      const classNameFn = h(ctx, "className");
      if (isPotentiallyReactive) {
        return wrapEffect(ctx, `${classNameFn}(${varName}, ${expr})`);
      }
      return `${classNameFn}(${varName}, ${expr});`;
    }
    if (isPotentiallyReactive) {
      return wrapEffect(ctx, `${varName}.className = ${expr}`);
    }
    return `${varName}.className = ${expr};`;
  }

  // SVG attributes
  if (isSVG) {
    if (isHydratable) {
      const setAttr = h(ctx, "setAttribute");
      if (isPotentiallyReactive) {
        return wrapEffect(ctx, `${setAttr}(${varName}, "${name}", ${expr})`);
      }
      return `${setAttr}(${varName}, "${name}", ${expr});`;
    }
    if (isPotentiallyReactive) {
      return wrapEffect(ctx, `${varName}.setAttribute("${name}", ${expr})`);
    }
    return `${varName}.setAttribute("${name}", ${expr});`;
  }

  // Regular attributes
  if (isHydratable) {
    const setAttr = h(ctx, "setAttribute");
    if (isPotentiallyReactive) {
      return wrapEffect(ctx, `${setAttr}(${varName}, "${name}", ${expr})`);
    }
    return `${setAttr}(${varName}, "${name}", ${expr});`;
  }
  if (isPotentiallyReactive) {
    return wrapEffect(ctx, `${varName}.setAttribute("${name}", ${expr})`);
  }
  return `${varName}.setAttribute("${name}", ${expr});`;
}

function generateSpecialProp(
  varName: string,
  prop: ParsedProp,
  ctx: GeneratorContext
): string | null {
  const { name, value } = prop;

  if (value.type !== "expression") return null;
 
  let expr = value.value;
  const hasStatic = hasStaticMarker(expr, ctx.options);
  if (hasStatic) {
    expr = stripStaticMarker(expr, ctx.options);
  }
 
  // classList
  if (name === "classList") {
    const classListFn = h(ctx, "classList");
    if (hasStatic) {
      return `${classListFn}(${varName}, ${expr});`;
    }
    return wrapEffect(ctx, `${classListFn}(${varName}, ${expr})`);
  }
 
  // style (object form)
  if (name === "style") {
    const styleFn = h(ctx, "style");
    if (hasStatic) {
      return `${styleFn}(${varName}, ${expr});`;
    }
    return wrapEffect(ctx, `${styleFn}(${varName}, ${expr})`);
  }


  // use:directive
  if (name.startsWith("use:")) {
    const directive = name.slice(4);
    const useFn = h(ctx, "use");
    return `${useFn}(${directive}, ${varName}, () => ${expr});`;
  }

  // prop:* (force property)
  if (name.startsWith("prop:")) {
    const propName = name.slice(5);
    if (ctx.options.hydratable) {
      const setProp = h(ctx, "setProperty");
      return wrapEffect(ctx, `${setProp}(${varName}, "${propName}", ${expr})`);
    }
    return wrapEffect(ctx, `${varName}.${propName} = ${expr}`);
  }

  // attr:* (force attribute)
  if (name.startsWith("attr:")) {
    const attrName = name.slice(5);
    const ns = parseNamespacedAttr(attrName);
    if (ns) {
      const setAttributeNS = h(ctx, "setAttributeNS");
      return wrapEffect(ctx, `${setAttributeNS}(${varName}, "${ns.namespaceUri}", "${ns.localName}", ${expr})`);
    }
    if (ctx.options.hydratable) {
      const setAttr = h(ctx, "setAttribute");
      return wrapEffect(ctx, `${setAttr}(${varName}, "${attrName}", ${expr})`);
    }
    return wrapEffect(ctx, `${varName}.setAttribute("${attrName}", ${expr})`);
  }

  // on:* (non-delegated event)
  if (name.startsWith("on:")) {
    const eventName = name.slice(3);
    const addEventListener = h(ctx, "addEventListener");
    return `${addEventListener}(${varName}, "${eventName}", ${expr}, false);`;
  }

  // oncapture:* (capture phase event)
  if (name.startsWith("oncapture:")) {
    const eventName = name.slice(10);
    const addEventListener = h(ctx, "addEventListener");
    return `${addEventListener}(${varName}, "${eventName}", ${expr}, true);`;
  }

  return null;
}

function generateEventHandler(
  varName: string,
  prop: ParsedProp,
  ctx: GeneratorContext
): string | null {
  const { name, value } = prop;
 
   // Extract event name from onEventName
   const eventName = name.slice(2).toLowerCase();
 
   // If delegation is enabled (default) and this event is delegatable, use delegated handlers
   const shouldDelegate =
     (ctx.options.delegateEvents ?? true) &&
     (DELEGATED_EVENTS.has(eventName) || ctx.options.delegatedEvents.has(eventName));
   if (shouldDelegate) {
     ctx.delegatedEvents.add(eventName);
 
     if (value.type === "expression") {
       // Delegated event - use $$eventName property
       return `${varName}.$$${eventName} = ${value.value};`;
     } else if (value.type === "string") {
       return `${varName}.$$${eventName} = ${value.value};`;
     }
   }
 
   // Fallback: non-delegated event via addEventListener
   if (value.type === "expression") {
     const addEventListener = h(ctx, "addEventListener");
     return `${addEventListener}(${varName}, "${eventName}", ${value.value}, false);`;
   }
 
   return null;
 }


function generateDynamicChildInsertFromExpr(
  parentVar: string,
  insert: ExpressionInsert,
  ctx: GeneratorContext
 ): string | null {
  const { refVar, expr, markerVar, currentVar } = insert;
  // Normalize expression for static marker comments and nested JSX
  let normalizedExpr = rewriteNestedJSX(expr, ctx);
  const hasStatic = hasStaticMarker(normalizedExpr, ctx.options);
  if (hasStatic) {
    normalizedExpr = stripStaticMarker(normalizedExpr, ctx.options);
  }

  // Guard against comment-only or empty normalized expressions.
  // Sometimes nested JSX or debug comments can produce a string that's only a block comment
  // (e.g. "/* <span>{option.label}</span> */"). Emitting that directly as an argument
  // results in invalid JS like `fn(parent, /* ... */, ref)`. Replace such cases with `null`.
  const _trimmedExpr = normalizedExpr.trim();
  if (!_trimmedExpr || /^\/\*[\s\S]*\*\/$/.test(_trimmedExpr)) {
    normalizedExpr = "null";
  }
  
  const isHydratableInsert = ctx.options.hydratable && markerVar && currentVar;
  const targetParent = isHydratableInsert ? parentVar : `${refVar}.parentNode`;
  const markerArg = isHydratableInsert ? `, ${markerVar}, ${currentVar}` : `, ${refVar}`;
 
  const insertFn = h(ctx, "insert");
 
  if (hasStatic) {
    // Do not wrap static expressions; evaluate once
    return `${insertFn}(${targetParent}, ${normalizedExpr}${markerArg});`;
  }
 
  // Handle conditional/logical expressions with dom-expressions parity when enabled.
  if (ctx.options.wrapConditionals && isConditionalOrLogicalExpression(normalizedExpr, ctx)) {
    const transformed = transformConditionForInsert(normalizedExpr, ctx);
    if (transformed) {
      return `${insertFn}(${targetParent}, ${transformed}${markerArg});`;
    }
    // Fallback: keep previous behavior if we couldn't parse/transform safely.
    const memoOrFn =
      ctx.options.memoWrapper === false ? `() => ${normalizedExpr}` : `${h(ctx, "memo")}(() => ${normalizedExpr})`;
    return `${insertFn}(${targetParent}, ${memoOrFn}${markerArg});`;
  }
 
  const isPotentiallyReactive = isDynamicExpression(normalizedExpr, ctx, { checkMember: true, checkCallExpressions: true });
  if (isPotentiallyReactive) {
    const accessorCallee = getZeroArgCallCalleeForInsert(normalizedExpr, ctx);
    if (accessorCallee) {
      return `${insertFn}(${targetParent}, ${accessorCallee}${markerArg});`;
    }
    // Wrap in a function for reactivity
    return `${insertFn}(${targetParent}, () => ${normalizedExpr}${markerArg});`;
  }
 
  return `${insertFn}(${targetParent}, ${normalizedExpr}${markerArg});`;
 }



function generatePropsObject(
  props: ParsedProp[],
  children: ParsedChild[],
  ctx: GeneratorContext
): string {
  const propEntries: string[] = [];
  let hasSpread = false;

  for (const prop of props) {
    const { name, value } = prop;

    if (value.type === "spread") {
      hasSpread = true;
      propEntries.push(value.value);
      continue;
    }

    if (value.type === "string") {
      propEntries.push(`${JSON.stringify(name)}: ${JSON.stringify(value.value)}`);
    } else if (value.type === "expression") {
      const expr = rewriteNestedJSX(value.value, ctx);
      // Check if reactive - wrap in getter (dom-expressions isDynamic parity)
      if (isDynamicExpression(expr, ctx, { checkMember: true, checkCallExpressions: true })) {
        propEntries.push(`get ${JSON.stringify(name)}() { return ${expr}; }`);
      } else {
        propEntries.push(`${JSON.stringify(name)}: ${expr}`);
      }
    } else if (value.type === "element") {
      const generated = generateElement(value.value, ctx);
      propEntries.push(`${JSON.stringify(name)}: ${generated.code}`);
    } else if (value.type === "true") {
      propEntries.push(`${JSON.stringify(name)}: true`);
    }
  }

  // Handle children
  if (children.length > 0) {
    const childrenCode = generateChildrenProp(children, ctx);
    if (childrenCode) {
      propEntries.push(`get children() { return ${childrenCode}; }`);
    }
  }

  if (propEntries.length === 0) {
    return "{}";
  }

  if (hasSpread) {
    const mergePropsFn = h(ctx, "mergeProps");
    // Need to merge spreads with regular props
    const regularProps = propEntries.filter(
      p => !props.some(pr => pr.value.type === "spread" && pr.value.value === p)
    );
    const spreadPropValues = propEntries.filter(p =>
      props.some(pr => pr.value.type === "spread" && pr.value.value === p)
    );

    if (regularProps.length === 0) {
      return spreadPropValues.length === 1
        ? spreadPropValues[0]!
        : `${mergePropsFn}(${spreadPropValues.join(", ")})`;
    }

    return `${mergePropsFn}(${spreadPropValues.join(", ")}, { ${regularProps.join(", ")} })`;
  }

  return `{ ${propEntries.join(", ")} }`;
}

function generatePropsObjectSSR(
  props: ParsedProp[],
  children: ParsedChild[],
  ctx: GeneratorContext
): string {
  const spreads: string[] = [];
  const regular: string[] = [];
 
  for (const prop of props) {
    const { name, value } = prop;
 
    if (value.type === "spread") {
      spreads.push(value.value);
      continue;
    }
 
    if (value.type === "string") {
      regular.push(`${JSON.stringify(name)}: ${JSON.stringify(value.value)}`);
    } else if (value.type === "expression") {
      const expr = rewriteNestedJSX(value.value, ctx);
      regular.push(`${JSON.stringify(name)}: ${expr}`);
    } else if (value.type === "element") {
      const generated = generateElement(value.value, ctx);
      regular.push(`${JSON.stringify(name)}: ${generated.code}`);
    } else if (value.type === "true") {
      regular.push(`${JSON.stringify(name)}: true`);
    }
  }
 
  if (children.length > 0) {
    const childrenCode = generateSSRChildrenProp(children, ctx);
    if (childrenCode) {
      regular.push(`get children() { return ${childrenCode}; }`);
    }
  }
 
  const hasSpread = spreads.length > 0;
  const hasRegular = regular.length > 0;
 
  if (!hasSpread && !hasRegular) {
    return "{}";
  }
 
  if (hasSpread) {
    const mergePropsFn = h(ctx, "mergeProps");
 
    if (!hasRegular) {
      return spreads.length === 1 ? spreads[0]! : `${mergePropsFn}(${spreads.join(", ")})`;
    }
 
    return `${mergePropsFn}(${spreads.join(", ")}, { ${regular.join(", ")} })`;
  }
 
  return `{ ${regular.join(", ")} }`;
}


function generateSSRChildrenProp(children: ParsedChild[], ctx: GeneratorContext): string | null {
  if (children.length === 0) return null;

  if (children.length === 1) {
    const child = children[0]!;
    if (child.type === "text") return JSON.stringify(child.value);
    if (child.type === "expression") {
      const escapeFn = h(ctx, "escape");
      const expr = rewriteNestedJSX(child.value, ctx);
      return `${escapeFn}(${expr})`;
    }
    if (child.type === "element") {
      return generateElementSSR(child.value, ctx, false).code;
    }
  }

  const parts: string[] = [];
  for (const child of children) {
    if (child.type === "text") {
      parts.push(JSON.stringify(child.value));
    } else if (child.type === "expression") {
      const escapeFn = h(ctx, "escape");
      const expr = rewriteNestedJSX(child.value, ctx);
      parts.push(`${escapeFn}(${expr})`);
    } else if (child.type === "element") {
      parts.push(generateElementSSR(child.value, ctx, false).code);
    }
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `[${parts.join(", ")}]`;
}

function generateChildrenProp(children: ParsedChild[], ctx: GeneratorContext): string | null {
  if (children.length === 0) return null;

  if (children.length === 1) {
    const child = children[0]!;
    if (child.type === "text") {
      return JSON.stringify(child.value.trim());
    } else if (child.type === "expression") {
      return rewriteNestedJSX(child.value, ctx);
    } else if (child.type === "element") {
      const result = generateElement(child.value, ctx);
      return result.code;
    }
  }

  const childCodes: string[] = [];
  for (const child of children) {
    if (child.type === "text") {
      const trimmed = child.value.trim();
      if (trimmed) {
        childCodes.push(JSON.stringify(trimmed));
      }
    } else if (child.type === "expression") {
      childCodes.push(rewriteNestedJSX(child.value, ctx));
    } else if (child.type === "element") {
      const result = generateElement(child.value, ctx);
      childCodes.push(result.code);
    }
  }

  if (childCodes.length === 0) return null;
  if (childCodes.length === 1) return childCodes[0]!;

  return `[${childCodes.join(", ")}]`;
}

// Helper functions

function isStaticChild(child: ParsedChild): boolean {
  if (child.type === "text") return true;
  if (child.type === "expression") return false;
  if (child.type === "element") return isStaticJSX(child.value);
  return false;
}

function isStaticJSX(jsx: ParsedJSX): boolean {
  if (jsx.type === "component") return false;

  for (const prop of jsx.props) {
    if (prop.value.type === "expression" || prop.value.type === "spread") {
      return false;
    }
  }

  for (const child of jsx.children) {
    if (!isStaticChild(child)) {
      return false;
    }
  }

  return true;
}

type DynamicCheckOptions = {
  checkMember: boolean;
  checkCallExpressions?: boolean;
  checkTags?: boolean;
};

function parseExpressionForAnalysis(
  exprText: string
): { sf: import("typescript").SourceFile; expr: import("typescript").Expression } | null {
  try {
    const wrapped = `(${exprText});`;
    const sf = ts.createSourceFile("expr.tsx", wrapped, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const stmt = sf.statements[0];
    if (!stmt || !ts.isExpressionStatement(stmt)) return null;
    let expr = stmt.expression;
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
    return { sf, expr };
  } catch {
    return null;
  }
}

function printExpression(node: import("typescript").Node, sf: import("typescript").SourceFile): string {
  return tsPrinter.printNode(ts.EmitHint.Expression, node, sf);
}

function isFunctionExpressionNode(node: import("typescript").Expression): boolean {
  return ts.isArrowFunction(node) || ts.isFunctionExpression(node);
}

function isMemberExpressionNode(node: import("typescript").Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node) ||
    ts.isPropertyAccessChain(node) ||
    ts.isElementAccessChain(node)
  );
}

function isCallExpressionNode(node: import("typescript").Expression): boolean {
  return ts.isCallExpression(node) || ts.isCallChain(node);
}

function isAssignableRefTarget(node: import("typescript").Expression): boolean {
  return (
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  );
}

function generateRefStatements(refExprText: string, elVar: string, ctx: GeneratorContext): string[] {
  const parsed = parseExpressionForAnalysis(refExprText);
  if (!parsed) {
    // Fallback: only call if it's a function (avoid invalid assignments).
    return [`typeof ${refExprText} === "function" && ${refExprText}(${elVar});`];
  }

  const expr = parsed.expr;

  // ref={(el) => ...} / ref={function(el){...}}
  if (isFunctionExpressionNode(expr)) {
    const printed = printExpression(expr, parsed.sf);
    return [`(${printed})(${elVar});`];
  }

  // ref={someFactory()} (dom-expressions parity: evaluate once and call if function)
  if (isCallExpressionNode(expr)) {
    const refVar = allocVar(ctx, "_ref$");
    const printed = printExpression(expr, parsed.sf);
    return [`const ${refVar} = ${printed};`, `typeof ${refVar} === "function" && ${refVar}(${elVar});`];
  }

  const printed = printExpression(expr, parsed.sf);
  if (isAssignableRefTarget(expr)) {
    // Avoid double-evaluation only for identifier assignments; member expressions may still
    // re-evaluate, matching the simple patterns in dom-expressions' output.
    return [
      `typeof ${printed} === "function" ? ${printed}(${elVar}) : ${printed} = ${elVar};`
    ];
  }

  // Non-assignable: only call if it's a function.
  return [`typeof ${printed} === "function" && ${printed}(${elVar});`];
}

function isLogicalBinaryExpression(node: import("typescript").Expression): node is import("typescript").BinaryExpression {
  return (
    ts.isBinaryExpression(node) &&
    (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
      node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
  );
}

function isDynamicExpression(exprText: string, ctx: GeneratorContext, opts: DynamicCheckOptions): boolean {
  const parsed = parseExpressionForAnalysis(exprText);
  if (!parsed) {
    // Fallback: keep the old conservative behavior for calls.
    return /\w+\s*\(/.test(exprText) || /\)\s*$/.test(exprText) || (opts.checkMember && /[.\[]/.test(exprText));
  }

  const { sf, expr } = parsed;
  const checkCallExpressions = opts.checkCallExpressions ?? true;
  const checkTags = opts.checkTags ?? false;
  const checkMember = opts.checkMember;

  const isDynamicNode = (node: import("typescript").Expression): boolean => {
    if (isFunctionExpressionNode(node)) return false;

    if (checkCallExpressions && (isCallExpressionNode(node) || ts.isTaggedTemplateExpression(node))) return true;

    if (checkMember && isMemberExpressionNode(node)) {
      // Do not assume property access on namespaced imports as dynamic (dom-expressions parity).
      const objectExpr = (node as import("typescript").PropertyAccessExpression | import("typescript").ElementAccessExpression)
        .expression;
      if (ts.isIdentifier(objectExpr) && ctx.namespaceImports.has(objectExpr.text)) {
        if (ts.isElementAccessExpression(node) || ts.isElementAccessChain(node)) {
          const arg = (node as import("typescript").ElementAccessExpression | import("typescript").ElementAccessChain)
            .argumentExpression;
          if (arg && !isDynamicNode(arg)) return false;
        } else {
          return false;
        }
      }
      return true;
    }

    if (checkMember && ts.isSpreadElement(node)) return true;

    if (checkMember && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword) return true;

    if (checkTags && (ts.isJsxElement(node) || (ts.isJsxFragment(node) && node.children.length))) return true;

    // Traverse children, skipping function bodies (but allowing computed keys).
    let dynamic = false;
    const visit = (n: import("typescript").Node) => {
      if (dynamic) return;

      if (
        ts.isFunctionExpression(n) ||
        ts.isArrowFunction(n) ||
        ts.isFunctionDeclaration(n) ||
        ts.isMethodDeclaration(n) ||
        ts.isGetAccessorDeclaration(n) ||
        ts.isSetAccessorDeclaration(n)
      ) {
        if (
          (ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)) &&
          n.name &&
          ts.isComputedPropertyName(n.name)
        ) {
          dynamic = isDynamicNode(n.name.expression);
        }
        return;
      }

      if (ts.isExpression(n)) {
        dynamic = isDynamicNode(n);
        if (dynamic) return;
      }

      n.forEachChild(visit);
    };

    node.forEachChild(visit);
    return dynamic;
  };

  // Top-level checks mirror dom-expressions, then fall back to traversal.
  if (isFunctionExpressionNode(expr)) return false;
  if (checkCallExpressions && (isCallExpressionNode(expr) || ts.isTaggedTemplateExpression(expr))) return true;
  if (checkMember && isMemberExpressionNode(expr)) {
    // Apply namespace import exclusion at the top level too.
    const objectExpr = (expr as import("typescript").PropertyAccessExpression | import("typescript").ElementAccessExpression)
      .expression;
    if (ts.isIdentifier(objectExpr) && ctx.namespaceImports.has(objectExpr.text)) {
      if (ts.isElementAccessExpression(expr) || ts.isElementAccessChain(expr)) {
        const arg = (expr as import("typescript").ElementAccessExpression | import("typescript").ElementAccessChain)
          .argumentExpression;
        if (arg && !isDynamicNode(arg)) return false;
      } else {
        return false;
      }
    }
    return true;
  }
  if (checkMember && (ts.isSpreadElement(expr) || (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.InKeyword)))
    return true;
  if (checkTags && (ts.isJsxElement(expr) || (ts.isJsxFragment(expr) && expr.children.length))) return true;

  return isDynamicNode(expr);
}

function isConditionalOrLogicalExpression(exprText: string, ctx: GeneratorContext): boolean {
  const parsed = parseExpressionForAnalysis(exprText);
  if (!parsed) return exprText.includes("?") || exprText.includes("&&") || exprText.includes("||");
  const e = parsed.expr;
  return ts.isConditionalExpression(e) || isLogicalBinaryExpression(e);
}

function getZeroArgCallCalleeForInsert(exprText: string, ctx: GeneratorContext): string | null {
  const parsed = parseExpressionForAnalysis(exprText);
  if (!parsed) return null;
  const { sf, expr } = parsed;
  if (!ts.isCallExpression(expr)) return null;
  if (expr.arguments.length !== 0) return null;
  const callee = expr.expression;
  if (ts.isCallExpression(callee) || isMemberExpressionNode(callee)) return null;
  return printExpression(callee, sf);
}

function wrapWithDoubleNegation(test: import("typescript").Expression): import("typescript").Expression {
  if (ts.isBinaryExpression(test)) return test;
  return ts.factory.createPrefixUnaryExpression(
    ts.SyntaxKind.ExclamationToken,
    ts.factory.createPrefixUnaryExpression(ts.SyntaxKind.ExclamationToken, test)
  );
}

function transformConditionForInsert(exprText: string, ctx: GeneratorContext): string | null {
  const parsed = parseExpressionForAnalysis(exprText);
  if (!parsed) return null;
  const { sf, expr } = parsed;

  // Conditional (a ? b : c)
  if (ts.isConditionalExpression(expr)) {
    // Only transform when branches are dynamic, matching dom-expressions.
    const consequentDynamic = isDynamicExpression(printExpression(expr.whenTrue, sf), ctx, { checkMember: true, checkCallExpressions: true });
    const alternateDynamic = isDynamicExpression(printExpression(expr.whenFalse, sf), ctx, { checkMember: true, checkCallExpressions: true });
    if (!consequentDynamic && !alternateDynamic) {
      return `() => ${exprText}`;
    }

    const dTest = isDynamicExpression(printExpression(expr.condition, sf), ctx, { checkMember: true });
    if (!dTest) {
      return `() => ${exprText}`;
    }

    const cond = wrapWithDoubleNegation(expr.condition);
    const condText = printExpression(cond, sf);
    const id = allocName(ctx, "_c$");
    const wrappedTest =
      ctx.options.memoWrapper === false ? `() => ${condText}` : `${h(ctx, "memo")}(() => ${condText})`;

    const testCall = ts.factory.createCallExpression(ts.factory.createIdentifier(id), undefined, []);
    const nextExpr = ts.factory.updateConditionalExpression(expr, testCall, expr.questionToken, expr.whenTrue, expr.colonToken, expr.whenFalse);
    const nextText = printExpression(nextExpr, sf);

    return `(() => { var ${id} = ${wrappedTest}; return () => ${nextText}; })()`;
  }

  // Logical expression (&&, ||, ??)
  if (isLogicalBinaryExpression(expr)) {
    // Match dom-expressions: find left-most && in a top-level or chain.
    let target: import("typescript").BinaryExpression = expr;
    while (target.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken && isLogicalBinaryExpression(target.left)) {
      target = target.left;
    }

    if (target.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) {
      return `() => ${exprText}`;
    }

    const rightDynamic = isDynamicExpression(printExpression(target.right, sf), ctx, { checkMember: true, checkCallExpressions: true });
    const dTest = rightDynamic && isDynamicExpression(printExpression(target.left, sf), ctx, { checkMember: true });
    if (!dTest) {
      return `() => ${exprText}`;
    }

    const cond = wrapWithDoubleNegation(target.left);
    const condText = printExpression(cond, sf);
    const id = allocName(ctx, "_c$");
    const wrappedTest =
      ctx.options.memoWrapper === false ? `() => ${condText}` : `${h(ctx, "memo")}(() => ${condText})`;

    const leftCall = ts.factory.createCallExpression(ts.factory.createIdentifier(id), undefined, []);
    const updatedTarget = ts.factory.updateBinaryExpression(target, leftCall, target.operatorToken, target.right);

    const replaceInLogical = (node: import("typescript").Expression): import("typescript").Expression => {
      if (node === target) return updatedTarget;
      if (ts.isBinaryExpression(node)) {
        const nextLeft = replaceInLogical(node.left);
        const nextRight = replaceInLogical(node.right);
        if (nextLeft !== node.left || nextRight !== node.right) {
          return ts.factory.updateBinaryExpression(node, nextLeft, node.operatorToken, nextRight);
        }
      }
      return node;
    };

    const nextExpr = replaceInLogical(expr);
    const nextText = printExpression(nextExpr, sf);

    return `(() => { var ${id} = ${wrappedTest}; return () => ${nextText}; })()`;
  }

  return null;
}
 
// DOM template closing-tag minimization (dom-expressions parity)
const ALWAYS_CLOSE_TAGS = new Set([
  "title",
  "style",
  "a",
  "strong",
  "small",
  "b",
  "u",
  "i",
  "em",
  "s",
  "code",
  "object",
  "table",
  "button",
  "textarea",
  "select",
  "iframe",
  "script",
  "noscript",
  "template",
  "fieldset"
]);

const INLINE_ELEMENTS = new Set([
  "a",
  "abbr",
  "acronym",
  "b",
  "bdi",
  "bdo",
  "big",
  "br",
  "button",
  "canvas",
  "cite",
  "code",
  "data",
  "datalist",
  "del",
  "dfn",
  "em",
  "embed",
  "i",
  "iframe",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "map",
  "mark",
  "meter",
  "noscript",
  "object",
  "output",
  "picture",
  "progress",
  "q",
  "ruby",
  "s",
  "samp",
  "script",
  "select",
  "slot",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "svg",
  "template",
  "textarea",
  "time",
  "u",
  "tt",
  "var",
  "video"
]);

 // Block elements that cannot be inside <p>
 const BLOCK_ELEMENTS = new Set([
   "address", "article", "aside", "blockquote", "dd", "details", "dialog",
   "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
   "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li",
   "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul"
 ]);

 // Interactive elements that cannot be nested inside other interactive elements
 const INTERACTIVE_ELEMENTS = new Set([
   "a", "button", "details", "embed", "iframe", "label", "select", "textarea"
 ]);

 function validateDOMStructure(tag: string, children: ParsedChild[]): void {
  const lowerTag = tag.toLowerCase();

  for (const child of children) {
    if (child.type !== "element") continue;
    const childTag = child.value.tag.toLowerCase();

    // <tr> must be inside <thead>, <tbody>, or <tfoot>, not directly in <table>
    if (lowerTag === "table" && childTag === "tr") {
      throw new Error("<tr> is not a valid direct child of <table>; wrap it in <thead>, <tbody>, or <tfoot>.");
    }

    // <li> must be inside <ul>, <ol>, or <menu>
    if (childTag === "li" && lowerTag !== "ul" && lowerTag !== "ol" && lowerTag !== "menu") {
      throw new Error("<li> elements must be wrapped in <ul>, <ol>, or <menu>, not placed directly under <" + tag + ">.");
    }

    // <dt> and <dd> must be inside <dl>
    if ((childTag === "dt" || childTag === "dd") && lowerTag !== "dl") {
      throw new Error(`<${childTag}> elements must be wrapped in <dl>, not placed directly under <${tag}>.`);
    }

    // <th> and <td> must be inside <tr>
    if ((childTag === "th" || childTag === "td") && lowerTag !== "tr") {
      throw new Error(`<${childTag}> elements must be inside <tr>, not <${tag}>.`);
    }

    // <caption>, <colgroup>, <thead>, <tbody>, <tfoot> must be inside <table>
    if ((childTag === "caption" || childTag === "colgroup" || childTag === "thead" || 
         childTag === "tbody" || childTag === "tfoot") && lowerTag !== "table") {
      throw new Error(`<${childTag}> elements must be inside <table>, not <${tag}>.`);
    }

    // <p> cannot contain block elements
    if (lowerTag === "p" && BLOCK_ELEMENTS.has(childTag)) {
      throw new Error(`<${childTag}> cannot be a child of <p>; browsers will auto-close the <p>.`);
    }

    // <a> cannot contain other <a> elements
    if (lowerTag === "a" && childTag === "a") {
      throw new Error("<a> elements cannot be nested inside other <a> elements.");
    }

    // <button> cannot contain interactive elements
    if (lowerTag === "button" && INTERACTIVE_ELEMENTS.has(childTag)) {
      throw new Error(`<${childTag}> cannot be a child of <button>; interactive elements cannot be nested.`);
    }

    // <label> cannot contain other <label> elements
    if (lowerTag === "label" && childTag === "label") {
      throw new Error("<label> elements cannot be nested inside other <label> elements.");
    }

    // <form> cannot contain other <form> elements
    if (lowerTag === "form" && childTag === "form") {
      throw new Error("<form> elements cannot be nested inside other <form> elements.");
    }
  }
 }
 
 /**
  * Check if expression contains a static marker comment.
  * Handles various formats:
  * - /*@once* /
  * - /* @once * /
  * - /*  @once  * /
  */
  function hasStaticMarker(expr: string, options: ResolvedGasOptions): boolean {
   const marker = options.staticMarker;
   if (!marker) return false;
   
   // Escape special regex characters in the marker
   const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   
   // Match block comment with the marker, allowing whitespace variations
   // Accept both /* ... */ and /** ... */ (JSDoc-style) formats
   const pattern = new RegExp(`\\/\\*\\*?\\s*${escapedMarker}\\s*\\*\\/`);
   return pattern.test(expr);
  }
 
 /**
  * Strip static marker comment from expression.
  * Handles various formats with whitespace variations.
  */
 function stripStaticMarker(expr: string, options: ResolvedGasOptions): string {
   const marker = options.staticMarker;
   if (!marker) return expr;
   
   // Escape special regex characters in the marker
   const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   
   // Match block comment with the marker, allowing whitespace variations
   // Accept both /* ... */ and /** ... */ (JSDoc-style) formats
   const pattern = new RegExp(`\\/\\*\\*?\\s*${escapedMarker}\\s*\\*\\/`);
   return expr.replace(pattern, "").trim();
 }
 
 function escapeTemplate(html: string): string {


  return html.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");
}

function escapeHTML(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatAttribute(name: string, value: string, omitQuotes: boolean): string {
  if (!omitQuotes) {
    return ` ${name}="${value}"`;
  }

  let needsQuoting = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (
      char === "'" ||
      char === "\"" ||
      char === " " ||
      char === "\t" ||
      char === "\n" ||
      char === "\r" ||
      char === "`" ||
      char === "=" ||
      char === "<" ||
      char === ">"
    ) {
      needsQuoting = true;
      break;
    }
  }

  if (needsQuoting) {
    return ` ${name}="${value}"`;
  }

  return ` ${name}=${value}`;
}

function isVoidElement(tag: string): boolean {
  const voidElements = new Set([
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "param",
    "source",
    "track",
    "wbr"
  ]);

  return voidElements.has(tag);
}
