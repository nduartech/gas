/**
 * Gas - A native Bun plugin for compiling SolidJS projects without Babel.
 *
 * @example
 * ```typescript
 * // bunfig.toml
 * preload = ["./gas-preload.ts"]
 *
 * // gas-preload.ts
 * import { gasPlugin } from "gas";
 * Bun.plugin(gasPlugin());
 * ```
 *
 * @example
 * ```typescript
 * // build.ts
 * import { gasPlugin } from "gas";
 *
 * await Bun.build({
 *   entrypoints: ["./src/index.tsx"],
 *   outdir: "./dist",
 *   plugins: [gasPlugin({ generate: "dom" })]
 * });
 * ```
 */

import type { GasPluginOptions, ResolvedGasOptions } from "./types.js";
import { transformJSX, hasJSX } from "./transformer.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

type TypeScriptModule = typeof import("typescript");
let tsModule: TypeScriptModule | undefined;

function getTypeScriptModule(): TypeScriptModule {
  if (tsModule) return tsModule;
  try {
    tsModule = require("@typescript/native-preview");
  } catch {
    tsModule = require("typescript");
  }
  return tsModule!;
}

function transpileWithFallback(
  source: string,
  loader: "tsx" | "jsx" | "ts" | "js"
): string {
  try {
    const transpiler = new Bun.Transpiler({
      loader,
      target: "browser"
    });
    return transpiler.transformSync(source);
  } catch {
    const ts = getTypeScriptModule();
    const compilerOptions: import("typescript").CompilerOptions = {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext
    };
    const result = ts.transpileModule(source, { compilerOptions });
    return result.outputText;
  }
}

// Bun types - these will be available when running in Bun
declare const Bun: {
  file(path: string): { text(): Promise<string> };
  Transpiler: new (options: { loader: "tsx" | "jsx" | "ts" | "js"; target: string }) => {
    transformSync(source: string): string;
  };
  plugin(plugin: BunPlugin): void;
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
  const generate = options.generate ?? "dom";

  const runtime = options.runtime ?? (generate === "ssr" ? "ssr" : undefined);

  const moduleName = runtime === "ssr"
    ? "solid-js/web"
    : runtime === "universal"
    ? "solid-js/universal"
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
    wrapConditionals: options.wrapConditionals ?? true,
    contextToCustomElements: options.contextToCustomElements ?? true,
    dev: options.dev ?? false,
    filter: options.filter ?? /\.[tj]sx$/
  } satisfies ResolvedGasOptions;
}

function validateOptions(options: {
  generate: "dom" | "ssr";
  hydratable: boolean;
  runtime?: "dom" | "ssr" | "universal";
  moduleName: string;
}): void {
  if (options.generate === "dom" && options.hydratable) {
    throw new Error("hydratable is only supported when generate=\"ssr\"");
  }

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

  if (options.runtime === "universal" && options.moduleName !== "solid-js/universal") {
    throw new Error("runtime=\"universal\" forces moduleName to solid-js/universal");
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
 * import { gasPlugin } from "gas";
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
            const transformedSource = transformJSX(source, resolvedOptions);
            const transpiledSource = transpileWithFallback(transformedSource, loader);
 
            return {
              contents: transpiledSource,
              loader: "js"
            };
          } catch (error) {
          // If transformation fails, provide helpful error message with location context
          const message = error instanceof Error ? error.message : String(error);

          // Try to extract line/column info from source if error contains position
          let locationInfo = "";
          if (error instanceof Error && "pos" in error && typeof error.pos === "number") {
            const pos = error.pos as number;
            const lines = source.slice(0, pos).split("\n");
            const line = lines.length;
            const column = lines[lines.length - 1]!.length + 1;
            locationInfo = ` at line ${line}, column ${column}`;
          }

          throw new Error(`Gas transformation failed for ${args.path}${locationInfo}: ${message}`);
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

/**
 * Create a preload file for runtime usage
 *
 * @example
 * ```typescript
 * // preload.ts
 * import { preload } from "gas";
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
export { transformJSX, hasJSX } from "./transformer.js";
export type { ResolvedGasOptions } from "./types.js";

// Default export for convenient usage
export default gasPlugin;
