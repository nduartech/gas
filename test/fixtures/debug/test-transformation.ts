import { transformJSX, gasPlugin } from "../../src/index.js";

// Read the test file
const source = await Bun.file("./debug-test.tsx").text();

// Create plugin to get resolved options
const plugin = gasPlugin({ generate: "dom" });
const options = {
  generate: "dom",
  hydratable: false,
  moduleName: "solid-js/web",
  runtime: undefined,
  builtIns: new Set(["For", "Show", "Switch", "Match", "Suspense", "SuspenseList", "Portal", "Index", "Dynamic", "ErrorBoundary"]),
  wrapConditionals: true,
  contextToCustomElements: true,
  dev: false,
  filter: /\.[tj]sx$/
};

console.log("=== ORIGINAL SOURCE ===");
console.log(source);
console.log("\n=== TRANSFORMED SOURCE ===");

try {
  const transformed = transformJSX(source, options);
  console.log(transformed);
} catch (error) {
  console.error("Transformation failed:", error);
  console.error("Stack:", error.stack);
}
