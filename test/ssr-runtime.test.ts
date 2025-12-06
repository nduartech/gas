import { describe, test, expect } from "bun:test";
import { transformJSX } from "../src/transformer.js";
import type { ResolvedGasOptions } from "../src/types.js";
import { renderToString } from "solid-js/web";
import { writeFileSync, rmSync } from "fs";
import { join } from "path";

const baseOptions: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: false,
  moduleName: "solid-js/web",
  runtime: "ssr",
  builtIns: new Set([
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
  ]),
  wrapConditionals: true,
  contextToCustomElements: true,
  dev: false,
  filter: /\.[tj]sx$/
};

describe("SSR runtime integration", () => {
  test("renderToString works for simple component", async () => {
    const source = `
      import { createSignal } from "solid-js";

      export function App() {
        const [count] = createSignal(1);
        return <div class="c">Count: {count()}</div>;
      }
    `;

    const transformed = transformJSX(source, baseOptions);

    const file = join(process.cwd(), ".gas-ssr-test-App.mjs");
    writeFileSync(file, transformed, "utf8");

    try {
      const mod = await import(file);
      const html = await renderToString(() => mod.App());

      expect(html).toContain("Count: 1");
      expect(html).toContain("class=\"c");
    } finally {
      rmSync(file, { force: true });
    }
  });
});
