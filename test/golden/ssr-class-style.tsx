import { transformJSX } from "../../src/transformer.js";
import type { ResolvedGasOptions } from "../../src/types.js";

const source = `
  const App = () => (
    <section classList={{ active: on, disabled: off }} style={{ color: color(), "font-weight": bold ? "700" : "400" }} {...extra}>
      <div style={rawStyle}>X</div>
    </section>
  );
`;

const options: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/ssr",
  runtime: "ssr",
  builtIns: new Set(["For","Show","Switch","Match","Suspense","SuspenseList","Portal","Index","Dynamic","ErrorBoundary"]),
  wrapConditionals: true,
  contextToCustomElements: true,
  dev: false,
  filter: /\.[tj]sx$/
};

export const ssrClassStyle = transformJSX(source, options);
