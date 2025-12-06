import gasPlugin from "./index.js";

// Default bundler plugin instance for Bun's HTML/static bundler
const gasBundlerPlugin = gasPlugin({
  generate: "dom"
});

export default gasBundlerPlugin as unknown as any;
