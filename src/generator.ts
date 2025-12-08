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

interface GeneratorContext {
  templates: TemplateInfo[];
  templateCounter: number;
  imports: Set<string>;
  delegatedEvents: Set<string>;
  options: ResolvedGasOptions;
  varCounter: number;
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
    delegatedEvents: new Set(),
    options,
    varCounter: 0
  };

  const result = generateElement(jsx, ctx);

  // Build template declarations
  const templateDeclarations = ctx.templates
    .map(t => {
      const templateCall = t.isSVG
        ? `_$template(\`${escapeTemplate(t.html)}\`, ${t.isSVG ? "2" : "0"})`
        : `_$template(\`${escapeTemplate(t.html)}\`)`;
      return `const ${t.id} = /*#__PURE__*/${templateCall};`;
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
  const initialTemplateCount = ctx.templates.length;
  const result = generateElement(jsx, ctx);

  // Build template declarations for new templates only
  const newTemplates = ctx.templates.slice(initialTemplateCount);
  const templateDeclarations = newTemplates
    .map(t => {
      const templateCall = t.isSVG
        ? `_$template(\`${escapeTemplate(t.html)}\`, ${t.isSVG ? "2" : "0"})`
        : `_$template(\`${escapeTemplate(t.html)}\`)`;
      return `const ${t.id} = /*#__PURE__*/${templateCall};`;
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
    return generateElementSSR(jsx, ctx);
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

function generateFragmentSSR(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  if (jsx.children.length === 0) return { code: '""', isStatic: true };

  if (jsx.children.length === 1) {
    return generateSSRChild(jsx.children[0]!, ctx);
  }

  const childCodes = jsx.children.map(child => generateSSRChild(child, ctx).code);
  const code = childCodes.join(" + ");
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

  ctx.imports.add("createComponent");
  const code = `_$createComponent(${componentRef}, ${propsCode})`;

  return { code, isStatic: false };
}

function generateComponentSSR(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children } = jsx;

  // Built-ins are invoked directly
  if (ctx.options.builtIns.has(tag)) {
    const propsCode = generatePropsObjectSSR(props, children, ctx);
    return { code: `${tag}(${propsCode})`, isStatic: false };
  }

  const propsCode = generatePropsObjectSSR(props, children, ctx);
  ctx.imports.add("createComponent");
  return { code: `_$createComponent(${tag}, ${propsCode})`, isStatic: false };
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

  // Check if element is fully static
  const hasAnyDynamic =
    dynamicProps.length > 0 ||
    eventProps.length > 0 ||
    refProp !== null ||
    spreadProps.length > 0 ||
    specialProps.length > 0 ||
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

function generateElementSSR(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  if (jsx.type === "fragment") {
    return generateFragmentSSR(jsx, ctx);
  }

  if (jsx.type === "component") {
    return generateComponentSSR(jsx, ctx);
  }

  return generateDOMElementSSR(jsx, ctx);
}

function generateStaticElement(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  // Generate static HTML
  const html = generateStaticHTML(jsx, ctx.options);
  const index = ctx.templateCounter++;
  const templateId = index === 0 ? "_tmpl$" : `_tmpl$${index + 1}`;

  ctx.templates.push({
    id: templateId,
    html,
    isSVG: jsx.isSVG,
    hasCustomElement: jsx.tag.includes("-")
  });

  ctx.imports.add("template");
 
  return {
    code: `${templateId}()`,
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
  const index = ctx.templateCounter++;
  const templateId = index === 0 ? "_tmpl$" : `_tmpl$${index + 1}`;

  ctx.templates.push({
    id: templateId,
    html: templateHTML,
    isSVG,
    hasCustomElement: tag.includes("-")
  });

  ctx.imports.add("template");

  // Generate IIFE for element setup
  const varName = `_el$${ctx.varCounter++}`;
  const statements: string[] = [];

  statements.push(`const ${varName} = ${templateId}();`);

  // Handle spread props first (they can override everything)
  if (spreadProps.length > 0) {
    ctx.imports.add("spread");
    for (const prop of spreadProps) {
      if (prop.value.type === "spread") {
        statements.push(`_$spread(${varName}, ${prop.value.value}, ${isSVG});`);
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
    const refExpr = refProp.value.value;
    // Check if it's a function ref or direct assignment
    if (refExpr.includes("=>") || refExpr.startsWith("(")) {
      statements.push(`(${refExpr})(${varName});`);
    } else {
      statements.push(
        `typeof ${refExpr} === "function" ? ${refExpr}(${varName}) : ${refExpr} = ${varName};`
      );
    }
  }

  // Handle all dynamic expression inserts (including nested ones)
  for (const { refVar, expr } of expressionInserts) {
    const insertCode = generateDynamicChildInsertFromExpr(refVar, expr, ctx);
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

  let html = `<${tag}`;

  // Add static attributes
  for (const prop of staticProps) {
    const { name, value } = prop;
    if (value.type === "string") {
      const escaped = escapeAttr(value.value);
      html += formatAttribute(name, escaped, options.omitQuotes);
    } else if (value.type === "true") {
      html += ` ${name}`;
    }
  }

  html += ">";

  // Add children - include placeholder markers for expressions
  for (const child of children) {
    if (child.type === "text") {
      html += escapeHTML(child.value);
    } else if (child.type === "element") {
      // Static nested elements are fully inlined, dynamic ones use placeholders
      if (isStaticJSX(child.value)) {
        html += generateHTMLWithPlaceholders(child.value, true, options, true);
      } else {
        html += "<!>";
      }
    } else if (child.type === "expression") {
      // Add placeholder comment node for dynamic expression insertion
      html += "<!>";
    }
  }

  // Always add closing tag for non-void elements in DOM mode
  // The omitLastClosingTag optimization only applies to SSR string output
  if (!isVoidElement(tag)) {
    html += `</${tag}>`;
  }

  return html;
}

function generateDOMElementSSR(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children } = jsx;
  ctx.imports.add("ssrElement");
  if (ctx.options.hydratable) ctx.imports.add("ssrHydrationKey");

  const propsExpr = buildSSRProps(tag, props, ctx);
  const childCodes = children.map(child => generateSSRChild(child, ctx).code);
  const childrenExpr = childCodes.length === 0 ? '""' : childCodes.join(" + ");
  const needsId = ctx.options.hydratable ? "true" : "false";

  const code = `_$ssrElement(${JSON.stringify(tag)}, ${propsExpr}, ${childrenExpr}, ${needsId})`;
  return { code, isStatic: false };
}

function generateSSRChild(child: ParsedChild, ctx: GeneratorContext): GeneratedElement {
  if (child.type === "text") {
    const text = child.value;
    return { code: JSON.stringify(text), isStatic: true };
  }
  if (child.type === "expression") {
    ctx.imports.add("escape");
    return { code: `_$escape(${child.value})`, isStatic: false };
  }
  if (child.type === "element") {
    return generateElementSSR(child.value, ctx);
  }
  return { code: '""', isStatic: true };
}

function buildSSRProps(tag: string, props: ParsedProp[], ctx: GeneratorContext): string {
  const spreads: string[] = [];
  const regular: string[] = [];

  for (const prop of props) {
    const { name, value } = prop;
    const lowerName = name.toLowerCase();

    if (value.type === "spread") {
      spreads.push(value.value);
      continue;
    }

    if (name === "classList") {
      ctx.imports.add("ssrClassList");
      if (value.type === "expression") {
        regular.push(`"class": _$ssrClassList(${value.value})`);
      } else if (value.type === "string") {
        regular.push(`"class": ${JSON.stringify(value.value)}`);
      }
      continue;
    }

    if (name === "style") {
      ctx.imports.add("ssrStyle");
      if (value.type === "expression") {
        regular.push(`"style": _$ssrStyle(${value.value})`);
      } else if (value.type === "string") {
        regular.push(`"style": ${JSON.stringify(value.value)}`);
      }
      continue;
    }

    if (name === "innerHTML") {
      if (value.type === "expression") {
        regular.push(`"innerHTML": ${value.value}`);
      } else if (value.type === "string") {
        regular.push(`"innerHTML": ${JSON.stringify(value.value)}`);
      }
      continue;
    }

    const isBooleanAttr = BOOLEAN_ATTRS.has(lowerName);

    if (value.type === "true") {
      if (isBooleanAttr) {
        ctx.imports.add("ssrAttribute");
        regular.push(`"${lowerName}": _$ssrAttribute(${JSON.stringify(lowerName)}, true)`);
      } else {
        regular.push(`"${name}": ""`);
      }
      continue;
    }

    if (value.type === "string") {
      regular.push(`${JSON.stringify(name)}: ${JSON.stringify(value.value)}`);
      continue;
    }

    if (value.type === "element") {
      const generated = generateElement(value.value, ctx);
      regular.push(`${JSON.stringify(name)}: ${generated.code}`);
      continue;
    }

    if (value.type === "expression") {
      const expr = rewriteNestedJSX(value.value, ctx);
      if (isBooleanAttr) {
        ctx.imports.add("ssrAttribute");
        regular.push(`"${lowerName}": _$ssrAttribute(${JSON.stringify(lowerName)}, ${expr})`);
      } else {
        regular.push(`${JSON.stringify(name)}: ${expr}`);
      }
    }
  }

  if (ctx.options.hydratable) {
    ctx.imports.add("ssrHydrationKey");
    regular.push(`"data-hk": _$ssrHydrationKey()`);
  }

  const hasSpread = spreads.length > 0;
  const hasRegular = regular.length > 0;

  if (!hasSpread && !hasRegular) return "{}";

  if (hasSpread) {
    ctx.imports.add("mergeProps");
    if (hasRegular) {
      return `_$mergeProps(${spreads.join(", ")}, { ${regular.join(", ")} })`;
    }
    return spreads.length === 1 ? spreads[0]! : `_$mergeProps(${spreads.join(", ")})`;
  }

  return `{ ${regular.join(", ")} }`;
}

function generateStaticHTML(jsx: ParsedJSX, options: ResolvedGasOptions): string {
  return generateHTMLWithPlaceholders(jsx, false, options, false);
}

function generateHTMLWithPlaceholders(
  jsx: ParsedJSX,
  includePlaceholders: boolean,
  options: ResolvedGasOptions,
  hasParent: boolean
): string {
  const { tag, props, children, selfClosing } = jsx;


  if (jsx.type === "fragment") {
    return children
      .map(child => {
        if (child.type === "text") return escapeHTML(child.value);
        if (child.type === "element") {
          return generateHTMLWithPlaceholders(child.value, includePlaceholders, options, true);
        }
        if (child.type === "expression" && includePlaceholders) return "<!>";
        return "";
      })
      .join("");
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
    return html + "/>";
  }

  html += ">";
 
  for (const child of children) {
    if (child.type === "text") {
      html += escapeHTML(child.value);
    } else if (child.type === "element") {
      html += generateHTMLWithPlaceholders(child.value, includePlaceholders, options, true);
    } else if (child.type === "expression" && includePlaceholders) {
      html += "<!>";
    }
  }
 
  // Always add closing tags for DOM templates - browser HTML parser requires valid structure
  // The omit* options only apply to SSR string output, but this function is only used for DOM templates
  if (!isVoidElement(tag)) {
    html += `</${tag}>`;
  }
 
  return html;
 }


interface ExpressionInsert {
  refVar: string;
  expr: string;
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

  // Generate references for dynamic children
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
 
  // Check if expression is potentially reactive (contains function calls)
  const isPotentiallyReactive = !hasStatic && !isJSXValue && containsFunctionCall(expr);
 
 
  // Boolean attributes
  if (BOOLEAN_ATTRS.has(name.toLowerCase())) {
    if (isPotentiallyReactive) {
      ctx.imports.add("effect");
      return `_$effect(() => ${varName}.${name} = ${expr});`;
    }
    return `${varName}.${name} = ${expr};`;
  }


  // Property attributes
  if (PROPERTY_ATTRS.has(name)) {
    if (isPotentiallyReactive) {
      ctx.imports.add("effect");
      return `_$effect(() => ${varName}.${name} = ${expr});`;
    }
    return `${varName}.${name} = ${expr};`;
  }

  // Class attribute
  if (name === "class" || name === "className") {
    if (isPotentiallyReactive) {
      ctx.imports.add("effect");
      return `_$effect(() => ${varName}.className = ${expr});`;
    }
    return `${varName}.className = ${expr};`;
  }

  // SVG attributes
  if (isSVG) {
    if (isPotentiallyReactive) {
      ctx.imports.add("effect");
      return `_$effect(() => ${varName}.setAttribute("${name}", ${expr}));`;
    }
    return `${varName}.setAttribute("${name}", ${expr});`;
  }

  // Regular attributes
  if (isPotentiallyReactive) {
    ctx.imports.add("effect");
    return `_$effect(() => ${varName}.setAttribute("${name}", ${expr}));`;
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
    ctx.imports.add("classList");
    if (hasStatic) {
      return `_$classList(${varName}, ${expr});`;
    }
    ctx.imports.add("effect");
    return `_$effect(() => _$classList(${varName}, ${expr}));`;
  }
 
  // style (object form)
  if (name === "style") {
    ctx.imports.add("style");
    if (hasStatic) {
      return `_$style(${varName}, ${expr});`;
    }
    ctx.imports.add("effect");
    return `_$effect(() => _$style(${varName}, ${expr}));`;
  }


  // use:directive
  if (name.startsWith("use:")) {
    const directive = name.slice(4);
    ctx.imports.add("use");
    return `_$use(${directive}, ${varName}, () => ${expr});`;
  }

  // prop:* (force property)
  if (name.startsWith("prop:")) {
    const propName = name.slice(5);
    ctx.imports.add("effect");
    return `_$effect(() => ${varName}.${propName} = ${expr});`;
  }

  // attr:* (force attribute)
  if (name.startsWith("attr:")) {
    const attrName = name.slice(5);
    ctx.imports.add("effect");
    return `_$effect(() => ${varName}.setAttribute("${attrName}", ${expr}));`;
  }

  // on:* (non-delegated event)
  if (name.startsWith("on:")) {
    const eventName = name.slice(3);
    ctx.imports.add("addEventListener");
    return `_$addEventListener(${varName}, "${eventName}", ${expr}, false);`;
  }

  // oncapture:* (capture phase event)
  if (name.startsWith("oncapture:")) {
    const eventName = name.slice(10);
    ctx.imports.add("addEventListener");
    return `_$addEventListener(${varName}, "${eventName}", ${expr}, true);`;
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
   const shouldDelegate = (ctx.options.delegateEvents ?? true) && DELEGATED_EVENTS.has(eventName);
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
     ctx.imports.add("addEventListener");
     return `_$addEventListener(${varName}, "${eventName}", ${value.value}, false);`;
   }
 
   return null;
 }


function generateDynamicChildInsertFromExpr(
  refVar: string,
  expr: string,
  ctx: GeneratorContext
 ): string | null {
  // Normalize expression for static marker comments and nested JSX
  let normalizedExpr = rewriteNestedJSX(expr, ctx);
  const hasStatic = hasStaticMarker(normalizedExpr, ctx.options);
  if (hasStatic) {
    normalizedExpr = stripStaticMarker(normalizedExpr, ctx.options);
  }
 
  // Check if expression is potentially reactive
  const isPotentiallyReactive = !hasStatic && containsFunctionCall(normalizedExpr);
  const shouldWrapConditional =
    !hasStatic && ctx.options.wrapConditionals && isConditionalExpression(normalizedExpr);
 
  ctx.imports.add("insert");
 
  if (hasStatic) {
    // Do not wrap static expressions; evaluate once
    return `_$insert(${refVar}.parentNode, ${normalizedExpr}, ${refVar});`;
  }
 
  if (shouldWrapConditional) {
    ctx.imports.add("memo");
    const memoExpr = `_$memo(() => ${normalizedExpr})`;
    return `_$insert(${refVar}.parentNode, ${memoExpr}, ${refVar});`;
  }
 
  if (isPotentiallyReactive) {
    // Wrap in a function for reactivity
    return `_$insert(${refVar}.parentNode, () => ${normalizedExpr}, ${refVar});`;
  }
 
  return `_$insert(${refVar}.parentNode, ${normalizedExpr}, ${refVar});`;
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
      // Check if reactive - wrap in getter
      const expr = rewriteNestedJSX(value.value, ctx);
      if (containsFunctionCall(expr)) {
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
    ctx.imports.add("mergeProps");
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
        : `_$mergeProps(${spreadPropValues.join(", ")})`;
    }

    return `_$mergeProps(${spreadPropValues.join(", ")}, { ${regularProps.join(", ")} })`;
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
    ctx.imports.add("mergeProps");
 
    if (!hasRegular) {
      return spreads.length === 1 ? spreads[0]! : `_$mergeProps(${spreads.join(", ")})`;
    }
 
    return `_$mergeProps(${spreads.join(", ")}, { ${regular.join(", ")} })`;
  }
 
  return `{ ${regular.join(", ")} }`;
}


function generateSSRChildrenProp(children: ParsedChild[], ctx: GeneratorContext): string | null {
  if (children.length === 0) return null;

  if (children.length === 1) {
    const child = children[0]!;
    if (child.type === "text") return JSON.stringify(child.value);
    if (child.type === "expression") {
      ctx.imports.add("escape");
      const expr = rewriteNestedJSX(child.value, ctx);
      return `_$escape(${expr})`;
    }
    if (child.type === "element") {
      return generateElementSSR(child.value, ctx).code;
    }
  }

  const parts: string[] = [];
  for (const child of children) {
    if (child.type === "text") {
      parts.push(JSON.stringify(child.value));
    } else if (child.type === "expression") {
      ctx.imports.add("escape");
      const expr = rewriteNestedJSX(child.value, ctx);
      parts.push(`_$escape(${expr})`);
    } else if (child.type === "element") {
      parts.push(generateElementSSR(child.value, ctx).code);
    }
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return parts.join(" + ");
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

function containsFunctionCall(expr: string): boolean {
  // Simple heuristic: contains () that's not part of arrow function
  // This is a simplified check - a proper implementation would parse the expression
  const trimmed = expr.trim();

  // Arrow function definitions are not reactive
  if (trimmed.startsWith("(") && trimmed.includes("=>")) {
    return false;
  }

  // Check for function calls
  return /\w+\s*\(/.test(trimmed) || /\)\s*$/.test(trimmed);
}

function isConditionalExpression(expr: string): boolean {
  // Heuristic: look for top-level ternary or logical &&||
  // This won't catch all cases without a parser but covers common Solid patterns
  const maybeTernary = expr.includes("?") && expr.includes(":");
  const maybeLogical = expr.includes("&&") || expr.includes("||");
  return maybeTernary || maybeLogical;
 }
 
 function validateDOMStructure(tag: string, children: ParsedChild[]): void {
  // Minimal DOM validation: disallow some obviously invalid structures
  const lowerTag = tag.toLowerCase();

  // <tr> must be inside <thead>, <tbody>, or <tfoot>
  if (lowerTag === "table") {
    for (const child of children) {
      if (child.type === "element") {
        const childTag = child.value.tag.toLowerCase();
        if (childTag === "tr") {
          throw new Error("<tr> is not a valid direct child of <table>; wrap it in <thead>, <tbody>, or <tfoot>.");
        }
      }
    }
  }

  // <li> must be inside <ul> or <ol>
  if (lowerTag !== "ul" && lowerTag !== "ol") {
    for (const child of children) {
      if (child.type === "element") {
        const childTag = child.value.tag.toLowerCase();
        if (childTag === "li") {
          throw new Error("<li> elements must be wrapped in <ul> or <ol>, not placed directly under <" + tag + ">.");
        }
      }
    }
  }
 }
 
 function hasStaticMarker(expr: string, options: ResolvedGasOptions): boolean {

  const marker = options.staticMarker;
  if (!marker) return false;
  const token = `/*${marker}*/`;
  return expr.includes(token);
 }
 
 function stripStaticMarker(expr: string, options: ResolvedGasOptions): string {
   const marker = options.staticMarker;
   if (!marker) return expr;
   const token = `/*${marker}*/`;
   return expr.replace(token, "").trim();
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
