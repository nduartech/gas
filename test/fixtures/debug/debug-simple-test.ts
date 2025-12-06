import { transformJSX } from "../../../src/index.js";
import type { ResolvedGasOptions } from "../../../src/types.js";

// Test simpler JSX to isolate the issue
const simpleTestJSX = `function App() {
  const [count, setCount] = createSignal(0);

  return (
    <div>
      <button onClick={() => setCount(count() + 1)}>
        Count: {count()}
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

console.log("=== SIMPLE TEST INPUT ===");
console.log(simpleTestJSX);
console.log("\n=== SIMPLE TEST OUTPUT ===");
try {
  const result = transformJSX(simpleTestJSX, options);
  console.log(result);
} catch (error) {
  console.error("Transformation failed:", error);
}
