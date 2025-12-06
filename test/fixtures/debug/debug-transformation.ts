import { transformJSX } from "../../../src/index.js";
import type { ResolvedGasOptions } from "../../../src/types.js";

// Test JSX from nathanduarte.dev app
const testJSX = `function App() {
  const [count, setCount] = createSignal(0);

  return (
    <div style="padding: 2rem; font-family: system-ui, sans-serif;">
      <h1>Welcome to nathanduarte.dev</h1>
      <p>This is a SolidJS app running on Bun!</p>
      <div style="margin-top: 1rem;">
        <button
          onClick={() => setCount(count() + 1)}
          style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;"
        >
          Count: {count()}
        </button>
      </div>
    </div>
  );
}`;

// Test with DOM generation options
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

console.log("=== INPUT JSX ===");
console.log(testJSX);
console.log("\n=== TRANSFORMED OUTPUT ===");
try {
  const result = transformJSX(testJSX, options);
  console.log(result);
} catch (error) {
  console.error("Transformation failed:", error);
  console.error("Stack:", error instanceof Error ? error.stack : "No stack available");
}
