import { createRequire } from "module";

type ModuleName = "@typescript/native-preview" | "typescript";
export type TypeScriptModule = typeof import("typescript");

type ModuleRecord = { ts: TypeScriptModule; name: ModuleName };

export interface TypeScriptModules {
  primary: ModuleRecord;
  fallback?: ModuleRecord;
  attempts: string[];
}

type Resolver = (id: ModuleName) => TypeScriptModule;

const require = createRequire(import.meta.url);

let cachedModules: TypeScriptModules | undefined;
let customResolver: Resolver | undefined;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatAttempts(attempts: string[]): string {
  return ["Failed to load a TypeScript compiler API.", "Attempts:", ...attempts.map(a => `- ${a}`)].join("\n");
}

function resolveModule(id: ModuleName): TypeScriptModule {
  const resolver = customResolver ?? require;
  return resolver(id);
}

export function getTypeScriptModules(): TypeScriptModules {
  if (cachedModules) return cachedModules;

  const attempts: string[] = [];
  let nativeTs: TypeScriptModule | undefined;
  let typescriptTs: TypeScriptModule | undefined;

  try {
    nativeTs = resolveModule("@typescript/native-preview");
  } catch (error) {
    attempts.push(`@typescript/native-preview: ${formatError(error)}`);
  }

  try {
    typescriptTs = resolveModule("typescript");
  } catch (error) {
    attempts.push(`typescript: ${formatError(error)}`);
  }

  if (!nativeTs && !typescriptTs) {
    throw new Error(formatAttempts(attempts));
  }

  const primary: ModuleRecord = nativeTs
    ? { ts: nativeTs, name: "@typescript/native-preview" }
    : { ts: typescriptTs!, name: "typescript" };

  const fallback: ModuleRecord | undefined = nativeTs && typescriptTs
    ? { ts: typescriptTs, name: "typescript" }
    : undefined;

  cachedModules = fallback ? { primary, fallback, attempts } : { primary, attempts };
  return cachedModules;
}

export function getTypeScriptModule(): TypeScriptModule {
  return getTypeScriptModules().primary.ts;
}

export function formatLoadError(attempts: string[]): string {
  return formatAttempts(attempts);
}

export function formatParseError(
  fileName: string,
  primary: ModuleRecord,
  primaryError: unknown,
  fallback?: ModuleRecord,
  fallbackError?: unknown
): Error {
  const primaryLine = `primary (${primary.name}): ${formatError(primaryError)}`;
  if (!fallback) {
    return new Error(`TypeScript compiler failed to parse ${fileName}. Attempts:\n- ${primaryLine}`);
  }
  if (!fallbackError) {
    return new Error(
      `TypeScript compiler failed to parse ${fileName}. Attempts:\n- ${primaryLine}\n- fallback (${fallback.name}): unknown error`
    );
  }
  const fallbackLine = `fallback (${fallback.name}): ${formatError(fallbackError)}`;
  return new Error(`TypeScript compiler failed to parse ${fileName}. Attempts:\n- ${primaryLine}\n- ${fallbackLine}`);
}

export function __setTypeScriptModuleResolverForTests(resolver?: Resolver): void {
  customResolver = resolver;
  cachedModules = undefined;
}

export function __clearTypeScriptModuleCacheForTests(): void {
  cachedModules = undefined;
}







