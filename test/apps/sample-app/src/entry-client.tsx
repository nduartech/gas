import { createComponent } from "solid-js";
import { hydrate } from "solid-js/web";
import { RouterShell, createAppRouter } from "./router";

const router = createAppRouter({ source: "client" });

const App = () => createComponent(RouterShell, { router });

const mount = document.getElementById("app")!;
hydrate(App, mount);
