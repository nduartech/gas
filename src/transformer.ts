/**
 * JSX Transformer for Gas
 *
 * Main transformation entry point that coordinates parsing and code generation.
 */

import MagicString from "magic-string";
import { findJSXExpressionsAST, convertJSXFromAST } from "./ast.js";
import { generateSolidCodeWithContext } from "./generator.js";
import type { ResolvedGasOptions } from "./types.js";
import { getTypeScriptModule } from "./ts-module.js";

const ts = getTypeScriptModule();

function collectIdentifiers(source: string): Set<string> {
  const sf = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = new Set<string>();
  const visit = (node: import("typescript").Node) => {
    if (ts.isIdentifier(node)) {
      names.add(node.text);
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return names;
}

function collectNamespaceImports(source: string): Set<string> {
  const sf = ts.createSourceFile("source.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const namespaces = new Set<string>();
  const visit = (node: import("typescript").Node) => {
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) {
        namespaces.add(named.name.text);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return namespaces;
}

function splitShebang(source: string): { shebang: string; body: string } {
  if (!source.startsWith("#!")) {
    return { shebang: "", body: source };
  }
  const newlineIdx = source.indexOf("\n");
  if (newlineIdx === -1) {
    // Degenerate case: file is only a shebang line.
    return { shebang: source + "\n", body: "" };
  }
  return { shebang: source.slice(0, newlineIdx + 1), body: source.slice(newlineIdx + 1) };
}

function splitDirectivePrologue(source: string): { directives: string; rest: string } {
  const sf = ts.createSourceFile("directives.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let end = 0;
  for (const stmt of sf.statements) {
    if (
      ts.isExpressionStatement(stmt) &&
      (ts.isStringLiteral(stmt.expression) || ts.isNoSubstitutionTemplateLiteral(stmt.expression))
    ) {
      end = stmt.end;
      continue;
    }
    break;
  }
  if (end === 0) return { directives: "", rest: source };
  return { directives: source.slice(0, end), rest: source.slice(end) };
}

/**
 * Check if the source contains a @jsxImportSource pragma matching the required value.
 * Handles various comment formats:
 * - /** @jsxImportSource solid-js * /
 * - /* @jsxImportSource solid-js * /
 * - // @jsxImportSource solid-js
 * Also handles whitespace variations.
 */
function hasMatchingImportSourcePragma(source: string, requiredSource: string): boolean {
  // Escape special regex characters in the required source
  const escapedSource = requiredSource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  
  // Match block comments: /* @jsxImportSource value */ or /** @jsxImportSource value */
  const blockCommentPattern = new RegExp(
    `\\/\\*\\*?\\s*@jsxImportSource\\s+${escapedSource}\\s*\\*\\/`,
    "m"
  );
  
  // Match line comments: // @jsxImportSource value
  const lineCommentPattern = new RegExp(
    `\\/\\/\\s*@jsxImportSource\\s+${escapedSource}(?:\\s|$)`,
    "m"
  );
  
  return blockCommentPattern.test(source) || lineCommentPattern.test(source);
}

/**
 * Transform source code containing JSX into SolidJS-compatible JavaScript
 */
export function transformJSX(source: string, options: ResolvedGasOptions): string {
  const { shebang, body } = splitShebang(source);
  const sourceBody = body;
  const reservedNames = collectIdentifiers(sourceBody);
  const namespaceImports = collectNamespaceImports(sourceBody);

  // If a specific JSX import source is required, only transform when the pragma matches
  if (options.requireImportSource) {
    if (!hasMatchingImportSourcePragma(sourceBody, options.requireImportSource)) {
      return source;
    }
  }

  // Find all JSX expressions in the source using TypeScript AST for accuracy
  const jsxExpressions = findJSXExpressionsAST(sourceBody);

  if (jsxExpressions.length === 0) {
    return source;
  }

  // Collect all imports and delegated events across all JSX expressions
  const allImports = new Set<string>();
  const allDelegatedEvents = new Set<string>();

  // Transform each JSX expression with shared context
  const transformations: { start: number; end: number; replacement: string }[] = [];
  const allTemplates: string[] = [];
  
  // Create shared generator context to avoid duplicate template IDs
  const sharedContext = {
    templates: [],
    templateCounter: 0,
    imports: new Set<string>(),
    importAliases: new Map<string, string>(),
    delegatedEvents: new Set<string>(),
    options,
    varCounter: 0,
    usedNames: new Set(reservedNames),
    namespaceImports,
    ssrTemplates: [],
    ssrTemplateCache: new Map<string, string>()
  };

  for (const expr of jsxExpressions) {
    // Re-parse the node via AST to avoid string-based parser
    const sf = createSourceFile(expr.jsx);
    const root = sf.statements.length > 0 ? sf.statements[0]! : sf;
    const jsxNode = findFirstJSX(root);
    if (!jsxNode) continue;
    try {
      const parsed = convertJSXFromAST(jsxNode, sf);
      const generated = generateSolidCodeWithContext(parsed, sharedContext);

      // Collect imports and events
      for (const imp of generated.imports) {
        allImports.add(imp);
      }
      for (const evt of generated.delegatedEvents) {
        allDelegatedEvents.add(evt);
      }

      // Collect templates
      allTemplates.push(...generated.templates);

      transformations.push({
        start: expr.start,
        end: expr.end,
        replacement: generated.code
      });
    } catch (error) {
      // Attach file-relative position information for downstream error formatting.
      const e = error instanceof Error ? error : new Error(String(error));
      const maybeSnippetPos =
        "position" in (e as any) && typeof (e as any).position === "number" ? (e as any).position : 0;
      // expr.start is relative to `sourceBody` (after shebang). Convert to full-source offset.
      (e as any).pos = shebang.length + expr.start + maybeSnippetPos;
      (e as any).jsx = expr.jsx;
      throw e;
    }
  }

  // Apply transformations in reverse order to maintain correct positions
  let result = sourceBody;
  for (let i = transformations.length - 1; i >= 0; i--) {
    const { start, end, replacement } = transformations[i]!;
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  // Generate import statement
  // Ensure delegateEvents import if we emit the call
  if ((options.delegateEvents ?? true) && allDelegatedEvents.size > 0) {
    // Reserve a collision-safe local alias for delegateEvents, consistent with generator allocations.
    const preferred = "_$delegateEvents";
    if (sharedContext.usedNames.has(preferred)) {
      let i = 2;
      while (sharedContext.usedNames.has(`${preferred}${i}`)) i++;
      const local = `${preferred}${i}`;
      sharedContext.usedNames.add(local);
      sharedContext.importAliases.set("delegateEvents", local);
    } else {
      sharedContext.usedNames.add(preferred);
      sharedContext.importAliases.set("delegateEvents", preferred);
    }
    allImports.add("delegateEvents");
  }

  const importStatement = generateImportStatement(allImports, allDelegatedEvents, options, sharedContext.importAliases);

  const { directives, rest } = splitDirectivePrologue(result);

  // Build the final result (preserving shebang + directive prologue order)
  let output = "";

  if (shebang) output += shebang;
  if (directives) output += directives + (directives.endsWith("\n") ? "" : "\n");
  if (importStatement) output += importStatement + "\n";
  if (allTemplates.length > 0) output += allTemplates.join("\n") + "\n";
  output += rest;

  // Add delegate events call at the end if needed
  if ((options.delegateEvents ?? true) && allDelegatedEvents.size > 0) {
    const eventsArray = Array.from(allDelegatedEvents)
      .map(e => `"${e}"`)
      .join(", ");
    if (!output.endsWith("\n")) output += "\n";
    const delegateLocal = sharedContext.importAliases.get("delegateEvents") ?? "_$delegateEvents";
    output += `${delegateLocal}([${eventsArray}]);`;
  }

  return output;
}

export function transformJSXWithMap(
  source: string,
  options: ResolvedGasOptions,
  filename: string = "source.tsx"
): { code: string; map: any | null } {
  const { shebang, body } = splitShebang(source);
  const shebangOffset = shebang.length;
  const sourceBody = body;

  const reservedNames = collectIdentifiers(sourceBody);
  const namespaceImports = collectNamespaceImports(sourceBody);

  if (options.requireImportSource) {
    if (!hasMatchingImportSourcePragma(sourceBody, options.requireImportSource)) {
      return { code: source, map: null };
    }
  }

  const jsxExpressions = findJSXExpressionsAST(sourceBody);
  if (jsxExpressions.length === 0) {
    return { code: source, map: null };
  }

  const allImports = new Set<string>();
  const allDelegatedEvents = new Set<string>();
  const allTemplates: string[] = [];

  const sharedContext = {
    templates: [],
    templateCounter: 0,
    imports: new Set<string>(),
    importAliases: new Map<string, string>(),
    delegatedEvents: new Set<string>(),
    options,
    varCounter: 0,
    usedNames: new Set(reservedNames),
    namespaceImports,
    ssrTemplates: [],
    ssrTemplateCache: new Map<string, string>()
  };

  const ms = new MagicString(source);

  for (const expr of jsxExpressions) {
    const sf = createSourceFile(expr.jsx);
    const root = sf.statements.length > 0 ? sf.statements[0]! : sf;
    const jsxNode = findFirstJSX(root);
    if (!jsxNode) continue;
    try {
      const parsed = convertJSXFromAST(jsxNode, sf);
      const generated = generateSolidCodeWithContext(parsed, sharedContext);

      for (const imp of generated.imports) allImports.add(imp);
      for (const evt of generated.delegatedEvents) allDelegatedEvents.add(evt);
      allTemplates.push(...generated.templates);

      ms.overwrite(expr.start + shebangOffset, expr.end + shebangOffset, generated.code);
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      const maybeSnippetPos =
        "position" in (e as any) && typeof (e as any).position === "number" ? (e as any).position : 0;
      (e as any).pos = shebangOffset + expr.start + maybeSnippetPos;
      (e as any).jsx = expr.jsx;
      throw e;
    }
  }

  if ((options.delegateEvents ?? true) && allDelegatedEvents.size > 0) {
    const preferred = "_$delegateEvents";
    if (sharedContext.usedNames.has(preferred)) {
      let i = 2;
      while (sharedContext.usedNames.has(`${preferred}${i}`)) i++;
      const local = `${preferred}${i}`;
      sharedContext.usedNames.add(local);
      sharedContext.importAliases.set("delegateEvents", local);
    } else {
      sharedContext.usedNames.add(preferred);
      sharedContext.importAliases.set("delegateEvents", preferred);
    }
    allImports.add("delegateEvents");
  }

  const importStatement = generateImportStatement(allImports, allDelegatedEvents, options, sharedContext.importAliases);

  // Insert imports/templates after directive prologue (within the body, after any shebang).
  const transformedBody = ms.toString().slice(shebangOffset);
  const { directives } = splitDirectivePrologue(transformedBody);
  const insertPos = shebangOffset + directives.length;

  let insertText = "";
  if (directives && !directives.endsWith("\n")) insertText += "\n";
  if (importStatement) insertText += importStatement + "\n";
  if (allTemplates.length > 0) insertText += allTemplates.join("\n") + "\n";
  if (insertText) ms.appendLeft(insertPos, insertText);

  if ((options.delegateEvents ?? true) && allDelegatedEvents.size > 0) {
    const eventsArray = Array.from(allDelegatedEvents)
      .map(e => `"${e}"`)
      .join(", ");
    const delegateLocal = sharedContext.importAliases.get("delegateEvents") ?? "_$delegateEvents";
    const call = `${delegateLocal}([${eventsArray}]);`;
    const current = ms.toString();
    ms.append(current.endsWith("\n") ? "" : "\n");
    ms.append(call);
  }

  const map = ms.generateMap({
    hires: true,
    includeContent: true,
    file: filename,
    source: filename
  });

  return { code: ms.toString(), map };
}

// Minimal helper to create a SourceFile for a JSX snippet
function createSourceFile(text: string): import("typescript").SourceFile {
  return ts.createSourceFile("snippet.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function findFirstJSX(node: import("typescript").Node): import("typescript").Node | undefined {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return node;
  }
  let found: import("typescript").Node | undefined;
  node.forEachChild((child: import("typescript").Node) => {
    if (found) return;
    const res = findFirstJSX(child);
    if (res) found = res;
  });
  return found;
}

/**
 * Generate the import statement for Solid runtime functions
 */
function generateImportStatement(
  imports: Set<string>,
  delegatedEvents: Set<string>,
  options: ResolvedGasOptions,
  importAliases: Map<string, string>
): string {
  const importMap: Record<string, string> = {
    template: importAliases.get("template") ?? "_$template",
    getNextElement: importAliases.get("getNextElement") ?? "_$getNextElement",
    getNextMarker: importAliases.get("getNextMarker") ?? "_$getNextMarker",
    getNextMatch: importAliases.get("getNextMatch") ?? "_$getNextMatch",
    insert: importAliases.get("insert") ?? "_$insert",
    spread: importAliases.get("spread") ?? "_$spread",
    mergeProps: importAliases.get("mergeProps") ?? "_$mergeProps",
    classList: importAliases.get("classList") ?? "_$classList",
    style: importAliases.get("style") ?? "_$style",
    use: importAliases.get("use") ?? "_$use",
    setAttribute: importAliases.get("setAttribute") ?? "_$setAttribute",
    setAttributeNS: importAliases.get("setAttributeNS") ?? "_$setAttributeNS",
    setBoolAttribute: importAliases.get("setBoolAttribute") ?? "_$setBoolAttribute",
    setProperty: importAliases.get("setProperty") ?? "_$setProperty",
    className: importAliases.get("className") ?? "_$className",
    addEventListener: importAliases.get("addEventListener") ?? "_$addEventListener",
    delegateEvents: importAliases.get("delegateEvents") ?? "_$delegateEvents",
    effect: importAliases.get("effect") ?? "_$effect",
    memo: importAliases.get("memo") ?? "_$memo",
    escape: importAliases.get("escape") ?? "_$escape",
    createComponent: importAliases.get("createComponent") ?? "_$createComponent",
    NoHydration: importAliases.get("NoHydration") ?? "_$NoHydration",
    getOwner: importAliases.get("getOwner") ?? "_$getOwner",
    ssr: importAliases.get("ssr") ?? "_$ssr",
    ssrHydrationKey: importAliases.get("ssrHydrationKey") ?? "_$ssrHydrationKey",
    ssrElement: importAliases.get("ssrElement") ?? "_$ssrElement",
    ssrClassList: importAliases.get("ssrClassList") ?? "_$ssrClassList",
    ssrStyle: importAliases.get("ssrStyle") ?? "_$ssrStyle",
    ssrStyleProperty: importAliases.get("ssrStyleProperty") ?? "_$ssrStyleProperty",
    ssrAttribute: importAliases.get("ssrAttribute") ?? "_$ssrAttribute",
    ssrSpread: importAliases.get("ssrSpread") ?? "_$ssrSpread"
  };

  const orderedKeys: (keyof typeof importMap)[] = [
    "template",
    "getNextElement",
    "getNextMarker",
    "getNextMatch",
    "insert",
    "spread",
    "mergeProps",
    "classList",
    "style",
    "use",
    "setAttribute",
    "setAttributeNS",
    "setBoolAttribute",
    "setProperty",
    "className",
    "addEventListener",
    "delegateEvents",
    "effect",
    "memo",
    "escape",
    "createComponent",
    "NoHydration",
    "getOwner",
    "ssr",
    "ssrHydrationKey",
    "ssrElement",
    "ssrClassList",
    "ssrStyle",
    "ssrStyleProperty",
    "ssrAttribute",
    "ssrSpread"
  ];

  const importedNames: string[] = [];

  for (const key of orderedKeys) {
    if (key === "delegateEvents") {
      // handled after loop so we can include it when delegatedEvents are present
      continue;
    }

    if (key === "effect") {
      if (imports.has("effect")) {
        if (options.effectWrapper !== false) {
          importedNames.push(`${options.effectWrapper} as ${importMap.effect}`);
        }
      }
      continue;
    }

    if (key === "memo") {
      if (imports.has("memo")) {
        if (options.memoWrapper !== false) {
          importedNames.push(`${options.memoWrapper} as ${importMap.memo}`);
        }
      }
      continue;
    }

    if (imports.has(key)) {
      importedNames.push(`${key} as ${importMap[key]}`);
    }
  }

  // Add delegateEvents if there are any delegated events
  if (delegatedEvents.size > 0) {
    if (!imports.has("delegateEvents")) {
      importedNames.push(`delegateEvents as ${importMap.delegateEvents}`);
    } else if (!importedNames.some(name => name.includes("_$delegateEvents"))) {
      importedNames.push(`delegateEvents as ${importMap.delegateEvents}`);
    }
  }



  if (importedNames.length === 0) {
    return "";
  }

  return `import { ${importedNames.join(", ")} } from "${options.moduleName}";`;
}

/**
 * Check if source code contains JSX
 */
export function hasJSX(source: string): boolean {
  // Quick heuristic check before doing full parsing
  return /<[a-zA-Z_$]/.test(source) || /<>/.test(source);
}
