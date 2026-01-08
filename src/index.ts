/**
 * Gas - A native Bun plugin for compiling SolidJS projects without Babel.
 *
 * @example
 * ```typescript
 * // bunfig.toml
 * preload = ["./gas-preload.ts"]
 *
 * // gas-preload.ts
 * import { gasPlugin } from "@nathanld/gas";
 * Bun.plugin(gasPlugin());
 * ```
 *
 * @example
 * ```typescript
 * // build.ts
 * import { gasPlugin } from "@nathanld/gas";
 *
 * await Bun.build({
 *   entrypoints: ["./src/index.tsx"],
 *   outdir: "./dist",
 *   plugins: [gasPlugin({ generate: "dom" })]
 * });
 * ```
 */

import type { GasPluginOptions, ResolvedGasOptions } from "./types.js";
import { transformJSX, transformJSXWithMap, hasJSX } from "./transformer.js";

// Bun types - these will be available when running in Bun
declare const Bun: {
  file(path: string): { text(): Promise<string> };
  plugin(plugin: BunPlugin): void;
};

// Buffer is available in Bun, but this package doesn't depend on Node types.
declare const Buffer: {
  from(input: string, encoding: "utf8"): { toString(encoding: "base64"): string };
};

export interface BunPlugin {
  name: string;
  setup(build: BunBuild): void;
}

interface BunBuild {
  onLoad(
    options: { filter: RegExp },
    callback: (args: { path: string }) => Promise<{ contents: string; loader: string }>
  ): void;
}

export type { GasPluginOptions };

/**
 * Default built-in components that receive special compilation
 */
const DEFAULT_BUILTINS = [
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
];

/**
 * Resolve plugin options with defaults
 */
function resolveOptions(options: GasPluginOptions = {}): ResolvedGasOptions {
  const requestedGenerate = options.generate ?? "dom";
  const generate = requestedGenerate === "universal" ? "ssr" : requestedGenerate;

  const runtime = options.runtime ?? (requestedGenerate === "universal" ? "universal" : generate === "ssr" ? "ssr" : undefined);

  const requireImportSource = options.requireImportSource ?? false;
  if (requireImportSource !== false && typeof requireImportSource !== "string") {
    throw new Error(
      "requireImportSource must be a string (e.g. \"solid-js\") or false. " +
      "If you want to restrict transforms to files with a pragma, pass requireImportSource: \"solid-js\"."
    );
  }

  const moduleName = runtime === "ssr"
    ? "solid-js/web"
    : runtime === "universal"
    ? (options.moduleName ?? "solid-js/universal")  // Allow custom moduleName
    : options.moduleName ?? "solid-js/web";

  validateOptions({
    generate,
    hydratable: options.hydratable ?? false,
    runtime,
    moduleName
  });

  return {
    generate,
    hydratable: options.hydratable ?? false,
    moduleName,
    runtime,
    builtIns: new Set(options.builtIns ?? DEFAULT_BUILTINS),
    delegateEvents: options.delegateEvents ?? true,
    delegatedEvents: new Set(options.delegatedEvents ?? []),
    wrapConditionals: options.wrapConditionals ?? true,
    omitNestedClosingTags: options.omitNestedClosingTags ?? false,
    omitLastClosingTag: options.omitLastClosingTag ?? true,
    omitQuotes: options.omitQuotes ?? true,
    requireImportSource,
    contextToCustomElements: options.contextToCustomElements ?? false,
    staticMarker: options.staticMarker ?? "@once",
    effectWrapper: options.effectWrapper ?? "effect",
    memoWrapper: options.memoWrapper ?? "memo",
    validate: options.validate ?? true,
    dev: options.dev ?? false,
    sourceMap: options.sourceMap === true ? "inline" : (options.sourceMap ?? false),
    filter: options.filter ?? /\.[tj]sx$/
  } satisfies ResolvedGasOptions;
}

/**
 * Resolve plugin options with defaults (public helper).
 * Useful for tooling that wants to match `babel-preset-solid` option shapes (e.g. `generate: "universal"`).
 */
export function resolveGasOptions(options: GasPluginOptions = {}): ResolvedGasOptions {
  return resolveOptions(options);
}

function validateOptions(options: {
  generate: "dom" | "ssr";
  hydratable: boolean;
  runtime?: "dom" | "ssr" | "universal";
  moduleName: string;
}): void {
  if (options.runtime === "ssr" && options.generate === "dom") {
    throw new Error("runtime=\"ssr\" requires generate=\"ssr\"");
  }

  if (options.runtime === "dom" && options.generate === "ssr") {
    throw new Error("runtime=\"dom\" is incompatible with generate=\"ssr\"");
  }

  if (options.runtime === "universal" && options.generate === "dom") {
    throw new Error("runtime=\"universal\" requires generate=\"ssr\"");
  }

  if (options.runtime === "ssr" && options.moduleName !== "solid-js/web") {
    throw new Error("runtime=\"ssr\" forces moduleName to solid-js/web");
  }
}

/**
 * Create a Bun plugin for SolidJS JSX transformation
 *
 * This plugin transforms JSX in .jsx and .tsx files into optimized
 * SolidJS DOM expressions without requiring Babel.
 *
 * @param options - Plugin configuration options
 * @returns A BunPlugin instance
 *
 * @example
 * ```typescript
 * import { gasPlugin } from "@nathanld/gas";
 *
 * // For runtime usage (preload)
 * Bun.plugin(gasPlugin());
 *
 * // For build-time usage
 * await Bun.build({
 *   entrypoints: ["./src/index.tsx"],
 *   plugins: [gasPlugin({ generate: "dom" })]
 * });
 *
 * // With SSR support
 * await Bun.build({
 *   entrypoints: ["./src/server.tsx"],
 *   plugins: [gasPlugin({ generate: "ssr", hydratable: true })]
 * });
 * ```
 */
export function gasPlugin(options: GasPluginOptions = {}): BunPlugin {
  const resolvedOptions = resolveOptions(options);

  return {
    name: "gas",
      setup(build) {
        build.onLoad({ filter: resolvedOptions.filter }, async args => {
          const source = await Bun.file(args.path).text();
          const loader = getLoader(args.path);
 
          // Quick check to skip files without JSX
          if (!hasJSX(source)) {
            return {
              contents: source,
              loader
            };
          }
 
          try {
            const transformedSource = resolvedOptions.sourceMap
              ? (() => {
                  const { code, map } = transformJSXWithMap(source, resolvedOptions, args.path);
                  if (resolvedOptions.sourceMap !== "inline" || !map) return code;
                  const json = typeof map.toString === "function" ? map.toString() : JSON.stringify(map);
                  const base64 = Buffer.from(json, "utf8").toString("base64");
                  return `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64}`;
                })()
              : transformJSX(source, resolvedOptions);
 
            return {
              contents: transformedSource,
              loader
            };
          } catch (error) {
          // Provide helpful error message with location context
          const message = error instanceof Error ? error.message : String(error);
          const suggestions = getRecoverySuggestions(message);
          const suggestionsBlock = suggestions.length
            ? `\n\nSuggestions:\n${suggestions.map(s => `- ${s}`).join("\n")}`
            : "";

          // Check for position property (JSXParseError has this)
          let pos: number | undefined;
          if (error instanceof Error && "pos" in error && typeof (error as any).pos === "number") {
            pos = (error as any).pos as number;
          } else if (error instanceof Error && "position" in error && typeof (error as any).position === "number") {
            pos = (error as any).position as number;
          }

          // Format error with code frame if we have position info
          if (pos !== undefined) {
            const before = source.slice(0, pos);
            const line = before.split("\n").length;
            const lastNewline = before.lastIndexOf("\n");
            const column = before.length - lastNewline;
            const locationInfo = ` at line ${line}, column ${column}`;
 
            // Build code frame
            const codeFrameLines: string[] = [];
            const context = 5;
            const sourceLines = source.split("\n");
            const startLine = Math.max(1, line - context);
            const endLine = Math.min(sourceLines.length, line + context);
            const lineNumWidth = String(endLine).length;
            
            for (let i = startLine; i <= endLine; i++) {
              const lineContent = sourceLines[i - 1] ?? "";
              const prefix = i === line ? "> " : "  ";
              const lineNum = String(i).padStart(lineNumWidth, " ");
              codeFrameLines.push(`${prefix}${lineNum} | ${lineContent}`);
              if (i === line) {
                const caretIndent = prefix.length + lineNumWidth + 3 + (column - 1);
                codeFrameLines.push(`${" ".repeat(caretIndent)}^`);
              }
            }

            const codeFrame = codeFrameLines.join("\n");
            const jsx = error instanceof Error && "jsx" in (error as any) ? String((error as any).jsx) : "";
            const jsxInfo = jsx ? `\n\nJSX:\n${jsx}` : "";
            throw new Error(
              `Gas transformation failed for ${args.path}${locationInfo}:\n\n${message}${suggestionsBlock}\n\n${codeFrame}${jsxInfo}`
            );
          }
 
          throw new Error(`Gas transformation failed for ${args.path}: ${message}${suggestionsBlock}`);
        }
      });
    }
  };
}


/**
 * Determine the appropriate loader based on file extension
 */
function getLoader(path: string): "tsx" | "jsx" | "ts" | "js" {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".ts")) return "ts";
  return "js";
}

function getRecoverySuggestions(message: string): string[] {
  const suggestions: string[] = [];

  if (message.includes("Mismatched closing tag")) {
    suggestions.push("Check that your closing tag matches the opening tag exactly (including casing).");
  }
  if (message.includes("Unclosed JSX element")) {
    suggestions.push("Ensure the element has a matching closing tag, or use self-closing syntax (e.g. <div />).");
  }
  if (message.includes("Unclosed JSX fragment")) {
    suggestions.push("Ensure fragments are closed (<> ... </>).");
  }
  if (message.includes("<tr> is not a valid direct child of <table>")) {
    suggestions.push("Wrap <tr> in <thead>, <tbody>, or <tfoot>.");
  }
  if (message.includes("<li> is only valid inside <ul> or <ol>")) {
    suggestions.push("Wrap <li> elements in a <ul> or <ol>.");
  }
  if (message.includes("<dt> and <dd> are only valid inside <dl>")) {
    suggestions.push("Wrap <dt>/<dd> elements in a <dl>.");
  }
  if (message.includes("Nested <a> elements are not allowed")) {
    suggestions.push("Avoid nesting <a> tags; wrap the inner content in a <span> or other element instead.");
  }
  if (message.includes("Nested <form> elements are not allowed")) {
    suggestions.push("Avoid nesting <form> tags; split into separate forms or restructure the markup.");
  }

  return suggestions;
}

/**
 * Create a preload file for runtime usage
 *
 * @example
 * ```typescript
 * // preload.ts
 * import { preload } from "@nathanld/gas";
 * preload();
 *
 * // bunfig.toml
 * preload = ["./preload.ts"]
 * ```
 */
export function preload(options: GasPluginOptions = {}): void {
  Bun.plugin(gasPlugin(options));
}

// Re-export types and utilities
export { transformJSX, transformJSXWithMap, hasJSX } from "./transformer.js";
export type { ResolvedGasOptions } from "./types.js";

// Default export for convenient usage
export default gasPlugin;
