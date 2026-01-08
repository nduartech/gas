import { transformJSX } from "../../src/transformer.js";
import type { ResolvedGasOptions } from "../../src/types.js";

const source = `
  const App = () => (
    <main>
      <div onClick={click} onMouseEnter={over} on:scroll={scroll}>
        <input onInput={input} onChange={change} />
        <custom-el onClick={customClick} />
      </div>
    </main>
  );
`;

const options: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/web",
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

export const ssrDelegation = transformJSX(source, options);
