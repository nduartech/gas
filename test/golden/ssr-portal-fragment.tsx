import { transformJSX } from "../../src/transformer.js";
import type { ResolvedGasOptions } from "../../src/types.js";

const source = `
  const App = () => (
    <>
      <Portal mount={target}>outside</Portal>
      <div>
        <Show when={flag} fallback={<span>off</span>}>
          <span>on</span>
        </Show>
      </div>
    </>
  );
`;

const options: ResolvedGasOptions = {
  generate: "ssr",
  hydratable: true,
  moduleName: "solid-js/web",
  runtime: "ssr",
  builtIns: new Set(["For","Show","Switch","Match","Suspense","SuspenseList","Portal","Index","Dynamic","ErrorBoundary"]),
  wrapConditionals: true,
  contextToCustomElements: true,
  dev: false,
  filter: /\.[tj]sx$/
};

export const ssrPortalFragment = transformJSX(source, options);
