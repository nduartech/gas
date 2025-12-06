import { transformJSX } from "../../../src/index.js";
import type { ResolvedGasOptions } from "../../../src/types.js";

// Test button only to see if issue is with nesting
const buttonOnlyJSX = `function App() {
  const [count, setCount] = createSignal(0);

  return (
    <button onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
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

console.log("=== BUTTON ONLY INPUT ===");
console.log(buttonOnlyJSX);
console.log("\n=== BUTTON ONLY OUTPUT ===");
try {
  const result = transformJSX(buttonOnlyJSX, options);
  console.log(result);
} catch (error) {
  console.error("Transformation failed:", error);
}
