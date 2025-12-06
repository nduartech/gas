import { plugin } from "bun";

// Load the gas plugin from the repo dist output
const gasPath = import.meta.resolve("../../../dist/index.js");
const { default: gas } = await import(gasPath);
plugin(gas());
