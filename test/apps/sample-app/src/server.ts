const port = Number(process.env.PORT ?? 3000);
const clientRoot = new URL("../dist/client", import.meta.url).pathname;

let render: (url: URL) => Promise<string>;
const ready = (async () => {
  render = await loadRender();
})();

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname.startsWith("/client/")) {
      const file = Bun.file(`${clientRoot}${url.pathname.replace("/client", "")}`);
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    }

    await ready;
    const html = await render(url);
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    });
  }
});

console.log(`SSR demo running at http://localhost:${port}`);

async function loadRender() {
  const builtEntry = new URL("../dist/server/entry-server.js", import.meta.url).href;
  try {
    const mod = await import(builtEntry);
    if (typeof mod.render === "function") {
      return mod.render as (url: URL) => Promise<string>;
    }
  } catch (error) {
    console.warn("Using source renderer (build server bundle first for gas output)", error);
  }
  const source = await import("./entry-server");
  return source.render;
}
