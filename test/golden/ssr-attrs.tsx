import { transformJSX } from "../../src/transformer.js";
import type { ResolvedGasOptions } from "../../src/types.js";

const source = `
  const App = () => (
    <div class="base" classList={{ active: flag, hidden: !flag }} style={{ color: color, "font-weight": weight }} data-id={id} aria-hidden>
      <span title={title}>label</span>
    </div>
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

export const ssrAttrs = transformJSX(source, options);
