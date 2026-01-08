# Migration guide: `babel-preset-solid` → `gas`

`gas` is a **Bun plugin** that compiles Solid JSX **without Babel**. If you currently use `babel-preset-solid`, this guide explains how to migrate your project and how common options map over.

## What changes

- **Babel config is no longer required** for JSX compilation in Bun.
- Instead, you enable the transformer via **`Bun.plugin(gasPlugin(...))`** (runtime) and/or **`Bun.build({ plugins: [...] })`** (build).
- Options largely mirror `babel-preset-solid`/`dom-expressions` where it makes sense.

## Install

```bash
bun add @nathanld/gas
```

If your project only needed Babel for Solid JSX, you can typically remove:

- `babel-preset-solid`
- `@babel/core` (+ Babel toolchain)
- Babel config files (`babel.config.*`, `.babelrc*`)

## Enable in Bun (runtime)

Create a preload file:

```ts
// preload.ts
import { preload } from "@nathanld/gas";

preload({
  generate: "dom"
});
```

Then reference it from `bunfig.toml`:

```toml
preload = ["./preload.ts"]
```

## Enable in Bun (build)

```ts
// build.ts
import { gasPlugin } from "@nathanld/gas";

await Bun.build({
  entrypoints: ["./src/index.tsx"],
  outdir: "./dist",
  plugins: [
    gasPlugin({
      generate: "dom"
    })
  ]
});
```

## Option mapping

Most `babel-preset-solid` options correspond 1:1:

- **`generate`**: `"dom"` or `"ssr"`
- **`hydratable`**: `true` to enable DOM hydration / SSR hydration keys
- **`moduleName`**: import module for runtime helpers (defaults depend on `runtime`)
- **`builtIns`**: list of built-in components (`For`, `Show`, `Switch`, etc.)
- **`delegateEvents`**: enable/disable delegated event output
- **`wrapConditionals`**: wraps certain conditional/logical expressions for fine-grained updates
- **`omitNestedClosingTags` / `omitLastClosingTag` / `omitQuotes`**: output-shape parity knobs
- **`staticMarker`**: marker comment used to treat expressions as static (default: `@once`)
- **`effectWrapper` / `memoWrapper`**:
  - set to a string to use a custom wrapper name
  - set to `false` for **wrapperless mode**
- **`requireImportSource`**: only transform files with `@jsxImportSource <value>`
- **`contextToCustomElements`**: set `element._$owner = getOwner()` on custom elements/slots
- **`validate`**: enable/disable HTML structure validation

## SSR & universal builds

To compile SSR output:

```ts
gasPlugin({
  generate: "ssr",
  hydratable: true
});
```

If you want **universal** imports (Solid’s universal runtime):

```ts
gasPlugin({
  generate: "ssr",
  runtime: "universal",
  hydratable: true
});
```

For `babel-preset-solid` compatibility, you can also write:

```ts
gasPlugin({
  generate: "universal",
  hydratable: true
});
```

## Debugging tips

- **Inline source maps**: set `sourceMap: "inline"` to emit an inline sourcemap comment (useful for stack traces/devtools).
- **Verbose output**: set `dev: true` to include debug comments in generated code.
- **Better errors**: leave `validate: true` enabled while migrating to catch invalid HTML structures early.

## Known differences / gotchas

- **Non-Bun toolchains**: `gas` is a Bun plugin; it is not a Babel plugin. If you build with Vite/Rollup/Webpack today, you’ll need a Bun-based build pipeline (or wait for a compatibility layer).
- **Output shape vs behavior**: while `gas` targets parity with `dom-expressions`, minor output-shape differences can still exist in edge cases. Prefer validating your application’s behavior and hydration.

