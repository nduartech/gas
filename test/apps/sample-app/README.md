# gas test app

Small playground to verify gas transforms in both DOM and SSR modes with @tanstack/solid-router.

## Commands
- `bun install` – install deps
- `bun run build.ts` – build client (`dist/client`) and server (`dist/server`) bundles using gas
- `bun run src/server.ts` – start a Bun-powered SSR server that renders the built SSR bundle (falls back to source if you skip the build)
- `bun run --hot src/index.tsx` – original dev entry for simple DOM-only checks

## Notes
- Router history uses memory history on the server and browser history on the client
- Hydratable output is enabled in both builds to verify SSR+DOM interop
