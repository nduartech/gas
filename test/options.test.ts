import { describe, expect, test } from "bun:test";
import { resolveGasOptions } from "../src/index.js";

describe("resolveGasOptions", () => {
  test("maps generate: \"universal\" to ssr + universal runtime (babel preset compatibility)", () => {
    const resolved = resolveGasOptions({
      generate: "universal",
      moduleName: "solid-custom-dom"
    });

    expect(resolved.generate).toBe("ssr");
    expect(resolved.runtime).toBe("universal");
    expect(resolved.moduleName).toBe("solid-custom-dom");
  });
});

