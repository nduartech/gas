import { transformJSX } from "../../src/transformer.js";
import type { ResolvedGasOptions } from "../../src/types.js";

const source = `
  const View = (props) => (
    <section id="root" {...props.attrs} class={props.cls}>
      <div {...props.inner} title={title}>Hello {value}</div>
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

export const ssrSpread = transformJSX(source, options);
