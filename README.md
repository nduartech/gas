# gas

A native Bun plugin for compiling SolidJS projects **without Babel**.

**Status:** DOM and SSR/universal output are implemented via Solid’s runtime helpers (`ssrElement`/`ssrClassList`/`ssrStyle`/`ssrAttribute` with hydration keys). AST-based parsing (TypeScript or its native preview) is used; as with any compiler, validate against your app.

This plugin transforms JSX in `.jsx` and `.tsx` files into optimized SolidJS DOM expressions using Bun's native capabilities.

## Features

- **Zero Babel dependency** - Pure JavaScript/TypeScript implementation
- **Fast compilation** - Leverages Bun's native transpiler
- **SolidJS DOM support** - Templates, reactivity, events, components
- **SSR mode (experimental)** - Uses Solid server helpers for attributes/class/style and hydration keys
- **Event delegation** - Automatic event delegation for common events
- **Special attributes** - `classList`, `style`, `ref`, `use:*` directives

## Installation

```bash
bun add gas
```

## Usage

### Hardening roadmap (toward production)

- Add end-to-end SSR render-to-string + client hydrate checks across `generate: "dom" | "ssr"` and `runtime: "dom" | "ssr" | "universal"`.
- Expand golden coverage: delegated vs non-delegated events, nested spreads with children, portals/fragments, classList/style object combos, hydration-key expectations.
- Align fully with Solid server runtime helpers (including any needed `ssrSpread` semantics) and verify hydration marker parity.
- Wire CI matrix for `bun test` and `bun build` in all presets and sample test-app builds (now under `test/apps/sample-app`).

### Runtime (Development)

Create a preload file to enable the plugin at runtime:

```typescript
// preload.ts
import { preload } from "gas";

preload({
  generate: "dom"
});
```

Configure in `bunfig.toml`:

```toml
preload = ["./preload.ts"]
```

### Build Time (Production)

Use the plugin with `Bun.build()`:

```typescript
// build.ts
import gasPlugin from "gas";

await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  plugins: [gasPlugin({ generate: "dom" })]
});
```

### HTML & static dev (bun --hot index.html)

When using Bun's HTML dev server or static-site bundler, configure gas as a bundler plugin via `bunfig.toml`:

```toml
[serve.static]
plugins = ["gas/bun-plugin"]

preload = ["./preload.ts"] # optional; enables runtime plugin for non-HTML usage
```

- `gas/bun-plugin` is a ready-to-use bundler plugin instance for DOM output.
- For custom options, prefer wiring `gasPlugin(...)` directly via `Bun.build()` as shown above.

### SSR Mode

Server-side rendering is available via `generate: "ssr"`. Set `hydratable: true` to emit hydration keys.

```typescript
import { gasPlugin } from "gas";

await Bun.build({
  entrypoints: ["./src/server.tsx"],
  outdir: "./dist";
  plugins: [
    gasPlugin({
      generate: "ssr",
      hydratable: true
    })
  ]
});
```

## Configuration

```typescript
interface GasPluginOptions {
  // Output mode: "dom" only today ("ssr" reserved)
  generate?: "dom" | "ssr";

  // Hydration flag for SSR (not yet implemented)
  hydratable?: boolean;

  // Module name for Solid runtime imports
  moduleName?: string;

  // Runtime preset: "dom" (solid-js/web), "ssr" (solid-js/ssr), "universal" (@solidjs/universal)
  runtime?: "dom" | "ssr" | "universal";

  // Built-in components that receive special compilation
  builtIns?: string[];

  // Wrap conditionals in memos for fine-grained reactivity
  wrapConditionals?: boolean;

  // Enable development mode
  dev?: boolean;

  // File filter regex pattern
  filter?: RegExp;
}
```

### Default Options

```typescript
{
  generate: "dom",
  hydratable: false, // only valid with generate: "ssr"
  moduleName: "solid-js/web",
  runtime: undefined,
  builtIns: [
    "For", "Show", "Switch", "Match", "Suspense",
    "SuspenseList", "Portal", "Index", "Dynamic", "ErrorBoundary"
  ],
  wrapConditionals: true,
  dev: false,
  filter: /\.[tj]sx$/
}
```

## Transformation Examples

### Simple Element

```tsx
// Input
const App = () => <div class="container">Hello World</div>;

// Output
import { template as _$template } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/ _$template(`<div class="container">Hello World</div>`);
const App = () => _tmpl$();
```

### Dynamic Content

```tsx
// Input
const App = () => {
  const [count, setCount] = createSignal(0);
  return <div>Count: {count()}</div>;
};

// Output
import { template as _$template, insert as _$insert } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/ _$template(`<div>Count: </div>`);
const App = () => {
  const [count, setCount] = createSignal(0);
  return (() => {
    const _el$ = _tmpl$();
    _$insert(_el$.firstChild.parentNode, () => count(), _el$.firstChild.nextSibling);
    return _el$;
  })();
};
```

### Event Handling

```tsx
// Input
const App = () => <button onClick={() => console.log("clicked")}>Click me</button>;

// Output
import { template as _$template, delegateEvents as _$delegateEvents } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/ _$template(`<button>Click me</button>`);
const App = () => {
  const _el$ = _tmpl$();
  _el$.$$click = () => console.log("clicked");
  return _el$;
};
_$delegateEvents(["click"]);
```

### Components

```tsx
// Input
const App = () => (
  <MyComponent name="World">
    <span>Hello</span>
  </MyComponent>
);

// Output
import { createComponent as _$createComponent, template as _$template } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/ _$template(`<span>Hello</span>`);
const App = () =>
  _$createComponent(MyComponent, {
    name: "World",
    get children() {
      return _tmpl$();
    }
  });
```

### Built-in Components

```tsx
// Input
const App = () => <For each={items()}>{item => <div>{item.name}</div>}</For>;

// Output
import { template as _$template, insert as _$insert } from "solid-js/web";
const _tmpl$ = /*#__PURE__*/ _$template(`<div></div>`);
const App = () =>
  For({
    get each() {
      return items();
    },
    get children() {
      return item => {
        const _el$ = _tmpl$();
        _$insert(_el$, () => item.name);
        return _el$;
      };
    }
  });
```

## Supported Features

### Attributes

- Static attributes: `<div class="foo">`
- Dynamic attributes: `<div class={className()}>`
- Boolean attributes: `<input disabled>`
- Spread props: `<div {...props}>`

### Special Attributes

- `ref`: Element references
- `classList`: Dynamic class object
- `style`: Dynamic style object
- `use:*`: Directives
- `prop:*`: Force property
- `attr:*`: Force attribute
- `on:*`: Non-delegated events
- `oncapture:*`: Capture phase events

### Events

- Delegated events: `onClick`, `onInput`, etc.
- Non-delegated: `on:scroll`, `on:load`
- Capture phase: `oncapture:click`

### Elements

- HTML elements
- SVG elements (with proper namespace)
- Custom elements
- Fragments: `<>...</>`

### Components

- Function components
- Built-in components (For, Show, Switch, etc.)
- Member expression components (Foo.Bar)

## API Reference

### `gasPlugin(options?)`

Creates a Bun plugin instance.

```typescript
import { gasPlugin } from "gas";

const plugin = gasPlugin({
  generate: "dom",
  hydratable: false
});
```

### `preload(options?)`

Convenience function for preload scripts.

```typescript
import { preload } from "gas";

preload({ generate: "dom" });
```

### `transformJSX(source, options)`

Low-level API to transform JSX source code.

```typescript
import { transformJSX } from "gas";

const result = transformJSX(sourceCode, resolvedOptions);
```

### `hasJSX(source)`

Check if source code contains JSX.

```typescript
import { hasJSX } from "gas";

if (hasJSX(sourceCode)) {
  // Transform the code
}
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun run build
```

## License

MIT
