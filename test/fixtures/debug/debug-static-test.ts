import { transformJSX } from "../../../src/index.js";
import type { ResolvedGasOptions } from "../../../src/types.js";

// Test static button to see expected behavior
const staticTestJSX = `function App() {
  return (
    <div>
      <button onClick={() => console.log("clicked")}>
        Static Count: 0
      </button>
    </div>
  );
}`;

const options: ResolvedGasOptions = {
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

console.log("=== STATIC TEST INPUT ===");
console.log(staticTestJSX);
console.log("\n=== STATIC TEST OUTPUT ===");
try {
  const result = transformJSX(staticTestJSX, options);
  console.log(result);
} catch (error) {
  console.error("Transformation failed:", error);
}
