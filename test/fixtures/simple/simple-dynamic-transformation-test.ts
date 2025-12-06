import { transformJSX } from "./src/index.js";

const source = await Bun.file("./simple-dynamic-test.tsx").text();

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

console.log("=== SIMPLE DYNAMIC TEST ===");
try {
  const transformed = transformJSX(source, options);
  console.log(transformed);
} catch (error) {
  console.error("Transformation failed:", error);
}
