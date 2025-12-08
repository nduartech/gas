import { transformJSX } from "../../src/transformer.js";
import type { ResolvedGasOptions } from "../../src/types.js";

const source = `
  const App = () => (
    <main>
      <h1 title={title()}>Hello</h1>
      <For each={items()}>{item => <span>{item}</span>}</For>
    </main>
  );
`;

const options: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/ssr",
  runtime: "ssr",
  builtIns: new Set(["For","Show","Switch","Match","Suspense","SuspenseList","Portal","Index","Dynamic","ErrorBoundary"]),
  delegateEvents: true,
  wrapConditionals: true,
  omitNestedClosingTags: false,
  omitLastClosingTag: true,
  omitQuotes: true,
  requireImportSource: false,
  contextToCustomElements: true,
  staticMarker: "@once",
  effectWrapper: "effect",
  memoWrapper: "memo",
  validate: true,
  dev: false,
  filter: /\.[tj]sx$/
};

export const ssrBasic = transformJSX(source, options);