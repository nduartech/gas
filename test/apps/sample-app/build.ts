#!/usr/bin/env bun

import type { BuildOutput } from "bun";
import gasPlugin from "../../dist/index.js";

async function buildApp() {
  try {
    console.log("Building test app with gas plugin...");

    const client = await Bun.build({
      entrypoints: ["./src/entry-client.tsx"],
      outdir: "./dist/client",
      target: "browser",
      plugins: [
        gasPlugin({
          generate: "dom",
          dev: false
        })
      ],
      minify: false,
      sourcemap: "external"
    });

    const server = await Bun.build({
      entrypoints: ["./src/entry-server.tsx"],
      outdir: "./dist/server",
      target: "bun",
      plugins: [
        gasPlugin({
          generate: "ssr",
          dev: false,
          hydratable: true
        })
      ],
      minify: false,
      sourcemap: "external"
    });

    reportResult(client, "client");
    reportResult(server, "server");

    if (!client.success || !server.success) {
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Build error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

// Run the build
buildApp();

function reportResult(result: BuildOutput | BuildOutput[], label: string) {
  const outputs = Array.isArray(result) ? result : [result];
  const status = outputs.every(output => output.success) ? "✅" : "❌";
  console.log(`${status} ${label} build ${status === "✅" ? "completed" : "failed"}!`);
  outputs.forEach(output => {
    if (output.success) {
      output.outputs.forEach(file => {
        console.log(`  - ${file.path}`);
      });
    } else {
      output.logs.forEach(log => {
        console.error(`  ${log.level}: ${log.message}`);
      });
    }
  });
}