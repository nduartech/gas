/**
 * JSX Transformer for Gas
 *
 * Main transformation entry point that coordinates parsing and code generation.
 */

import { findJSXExpressionsAST, convertJSXFromAST } from "./ast.js";
import { generateSolidCodeWithContext } from "./generator.js";
import type { ResolvedGasOptions } from "./types.js";
import { getTypeScriptModule } from "./ts-module.js";

const ts = getTypeScriptModule();

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
  // If a specific JSX import source is required, only transform when the pragma matches
  if (options.requireImportSource) {
    if (!hasMatchingImportSourcePragma(source, options.requireImportSource)) {
      return source;
    }
  }

  // Find all JSX expressions in the source using TypeScript AST for accuracy
  const jsxExpressions = findJSXExpressionsAST(source);

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
    delegatedEvents: new Set<string>(),
    options,
    varCounter: 0
  };

  for (const expr of jsxExpressions) {
    // Re-parse the node via AST to avoid string-based parser
    const sf = createSourceFile(expr.jsx);
    const root = sf.statements.length > 0 ? sf.statements[0]! : sf;
    const jsxNode = findFirstJSX(root);
    if (!jsxNode) continue;
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
  }

  // Apply transformations in reverse order to maintain correct positions
  let result = source;
  for (let i = transformations.length - 1; i >= 0; i--) {
    const { start, end, replacement } = transformations[i]!;
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  // Generate import statement
  const importStatement = generateImportStatement(allImports, allDelegatedEvents, options);

  // Build the final result
  const parts: string[] = [];
  
  // Add imports at the top of the file
  if (importStatement) {
    parts.push(importStatement);
  }

  // Add template declarations after imports
  if (allTemplates.length > 0) {
    parts.push(allTemplates.join("\n"));
  }

  // Add the transformed source
  parts.push(result);

  // Add delegate events call at the end if needed
  if ((options.delegateEvents ?? true) && allDelegatedEvents.size > 0) {
    const eventsArray = Array.from(allDelegatedEvents)
      .map(e => `"${e}"`)
      .join(", ");
    parts.push(`_$delegateEvents([${eventsArray}]);`);
  }


  return parts.join("\n");
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
  options: ResolvedGasOptions
): string {
  const importMap: Record<string, string> = {
    template: "_$template",
    insert: "_$insert",
    spread: "_$spread",
    mergeProps: "_$mergeProps",
    classList: "_$classList",
    style: "_$style",
    use: "_$use",
    addEventListener: "_$addEventListener",
    delegateEvents: "_$delegateEvents",
    effect: "_$effect",
    memo: "_$memo",
    escape: "_$escape",
    createComponent: "_$createComponent",
    getOwner: "_$getOwner",
    ssrHydrationKey: "_$ssrHydrationKey",
    ssrElement: "_$ssrElement",
    ssrClassList: "_$ssrClassList",
    ssrStyle: "_$ssrStyle",
    ssrAttribute: "_$ssrAttribute",
    ssrSpread: "_$ssrSpread"
  };

  const orderedKeys: (keyof typeof importMap)[] = [
    "template",
    "insert",
    "spread",
    "mergeProps",
    "classList",
    "style",
    "use",
    "addEventListener",
    "delegateEvents",
    "effect",
    "memo",
    "escape",
    "createComponent",
    "getOwner",
    "ssrHydrationKey",
    "ssrElement",
    "ssrClassList",
    "ssrStyle",
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
        importedNames.push(`${options.effectWrapper} as ${importMap.effect}`);
      }
      continue;
    }

    if (key === "memo") {
      if (imports.has("memo")) {
        importedNames.push(`${options.memoWrapper} as ${importMap.memo}`);
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
      importedNames.push("delegateEvents as _$delegateEvents");
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
