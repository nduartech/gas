import { createComponent } from "solid-js";
import { render } from "solid-js/web";
import { RouterShell, createAppRouter } from "./router";

const router = createAppRouter({ source: "client" });

const App = () => createComponent(RouterShell, { router });

const mount = document.getElementById("app")!;
mount.textContent = "";
render(App, mount);
