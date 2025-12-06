import { describe, test, expect } from "bun:test";
import { JSDOM } from "jsdom";
import { existsSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

function createStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(String(key), String(value));
    },
    removeItem: (key: string) => {
      store.delete(String(key));
    },
    clear: () => {
      store.clear();
    }
  } as Storage;
}

describe("Hydration smoke test", () => {
  test("SSR output + client bundle hydrate without mismatches", async () => {
    const serverPath = join(import.meta.dir, "../apps/sample-app/dist/server/entry-server.js");
    const clientPath = join(import.meta.dir, "../apps/sample-app/dist/client/entry-client.js");

    if (!existsSync(serverPath) || !existsSync(clientPath)) {
      // Skip if bundles are not built; CI builds them in dedicated jobs.
      return;
    }

    const serverUrl = pathToFileURL(serverPath).href;
    const clientUrl = pathToFileURL(clientPath).href;

    // Create a mock DOM environment
    const dom = new JSDOM(`<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body><div id="app"></div></body>
</html>`, {
      url: "http://localhost",
      pretendToBeVisual: false,
      resources: "usable"
    });

    // Capture console errors during hydration
    const capturedErrors: any[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: any[]) => {
      capturedErrors.push(args);
      // Do not forward to the real console to keep test output clean
    };

    // Set up globals for Solid hydration
    global.window = dom.window as any;
    global.document = dom.window.document;
    global.requestAnimationFrame = dom.window.requestAnimationFrame;
    global.sessionStorage = (dom.window as any).sessionStorage ?? createStorageStub();
    global.localStorage = (dom.window as any).localStorage ?? createStorageStub();
    global.scrollTo = global.scrollTo ?? (() => {});

    // Render server HTML (the test-app server bundle exports a render function)
    const serverMod = await import(serverUrl);
    const renderFn =
      typeof serverMod.render === "function"
        ? serverMod.render
        : typeof serverMod.default === "function"
          ? serverMod.default
          : null;

    expect(renderFn).toBeTruthy();
    const ssrHTML = renderFn ? await renderFn(new URL("http://localhost/")) : "";

    // Write SSR HTML into the DOM
    dom.window.document.getElementById("app")!.innerHTML = ssrHTML;

    // Evaluate client code to trigger hydration
    await import(clientUrl);

    // Wait a tick for hydration to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    // Basic sanity checks
    const appEl = dom.window.document.getElementById("app")!;
    expect(appEl.textContent).toContain("Gas SSR Router Demo");
    expect(appEl.querySelector("nav")).toBeTruthy();
    expect(appEl.querySelector("section")).toBeTruthy();

    // No fatal hydration errors should be logged
    const fatalErrors = capturedErrors.filter(args => {
      const msg = args.map(String).join(" ");
      return msg.includes("ReferenceError") || msg.toLowerCase().includes("hydration");
    });
    expect(fatalErrors.length).toBe(0);

    // Restore console.error
    console.error = originalConsoleError;
  });
});