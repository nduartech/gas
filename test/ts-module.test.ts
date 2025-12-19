import { afterEach, describe, expect, test } from "bun:test";
import {
  __clearTypeScriptModuleCacheForTests,
  __setTypeScriptModuleResolverForTests,
  getTypeScriptModules
} from "../src/ts-module.js";

type TypeScriptModule = typeof import("typescript");

const stubNative: TypeScriptModule = {} as TypeScriptModule;
const stubTypescript: TypeScriptModule = {} as TypeScriptModule;

afterEach(() => {
  __setTypeScriptModuleResolverForTests();
  __clearTypeScriptModuleCacheForTests();
});

describe("getTypeScriptModules", () => {
  test("prefers native-preview when available and keeps typescript as fallback", () => {
    __setTypeScriptModuleResolverForTests(id => {
      if (id === "@typescript/native-preview") return stubNative;
      if (id === "typescript") return stubTypescript;
      throw new Error("unexpected module");
    });

    const modules = getTypeScriptModules();
    expect(modules.primary.ts).toBe(stubNative);
    expect(modules.primary.name).toBe("@typescript/native-preview");
    expect(modules.fallback?.ts).toBe(stubTypescript);
    expect(modules.fallback?.name).toBe("typescript");
  });

  test("falls back to typescript when native-preview is unavailable", () => {
    __setTypeScriptModuleResolverForTests(id => {
      if (id === "@typescript/native-preview") {
        throw new Error("native missing");
      }
      return stubTypescript;
    });

    const modules = getTypeScriptModules();
    expect(modules.primary.ts).toBe(stubTypescript);
    expect(modules.primary.name).toBe("typescript");
    expect(modules.fallback).toBeUndefined();
  });

  test("raises a combined error when no TypeScript module can be loaded", () => {
    __setTypeScriptModuleResolverForTests(() => {
      throw new Error("not found");
    });

    expect(() => getTypeScriptModules()).toThrow("Failed to load a TypeScript compiler API.");
  });
});







