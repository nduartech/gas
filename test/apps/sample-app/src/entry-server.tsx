import { createComponent } from "solid-js";
import { generateHydrationScript, renderToString } from "solid-js/web";
import { RouterShell, createAppRouter } from "./router";

export async function render(url: URL | string = "/") {
  const href = typeof url === "string" ? url : url.href;
  const pathname = typeof url === "string" ? url : url.pathname + url.search;

  const router = createAppRouter({ source: "server", href }, pathname);
  const App = () => createComponent(RouterShell, { router });

  const body = renderToString(App);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Gas SSR Router Demo</title>
  </head>
  <body>
    <div id="app">${body}</div>
    ${generateHydrationScript()}
    <script type="module" src="/client/entry-client.js"></script>
  </body>
</html>`;
}
