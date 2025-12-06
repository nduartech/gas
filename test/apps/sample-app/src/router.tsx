import { createComponent } from "solid-js";
import { Link, Outlet, RootRoute, RouterProvider, createRoute, createRouter } from "@tanstack/solid-router";
import { createBrowserHistory, createMemoryHistory } from "@tanstack/history";
import type { Router } from "@tanstack/solid-router";
import { createSignal } from "solid-js";

const rootRoute = new RootRoute({
  component: RootLayout
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home
});

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: About
});

const counterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/counter",
  component: Counter
});

const routeTree = rootRoute.addChildren([homeRoute, aboutRoute, counterRoute]);

const router = createAppRouter();

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

export type AppRouter = Router<any>;

export function RouterShell(props: { readonly router: AppRouter }) {
  return createComponent(RouterProvider, { router: props.router });
}

export function createAppRouter(context?: Record<string, unknown>, url?: string) {
  const isServer = typeof window === "undefined";
  const history = isServer
    ? createMemoryHistory({ initialEntries: [url ?? "/"] })
    : createBrowserHistory();

  return createRouter({
    routeTree,
    history,
    context,
    defaultPreload: "intent"
  });
}

function RootLayout() {
  return (
    <main>
      <header>
        <h1>Gas SSR Router Demo</h1>
        <p>Render & hydrate via gas SSR output</p>
        <nav>
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/counter">Counter</Link>
        </nav>
      </header>
      <section>
        <Outlet />
      </section>
    </main>
  );
}

function Home() {
  return (
    <article>
      <h2>Welcome</h2>
      <p>This page renders on the server and hydrates on the client.</p>
    </article>
  );
}

function About() {
  return (
    <article>
      <h2>About</h2>
      <p>Using @tanstack/solid-router with gas-generated SSR markup.</p>
    </article>
  );
}

function Counter() {
  const [count, setCount] = createSignal(0);
  return (
    <article>
      <h2>Counter</h2>
      <p>Value: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
    </article>
  );
}
