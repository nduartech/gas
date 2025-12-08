import { readFileSync } from "fs";
import path from "path";

const cases = [
  path.join(import.meta.dir, "..", "test", "fixtures", "cross", "simple", "output.dom.js"),
  path.join(import.meta.dir, "..", "test", "fixtures", "cross", "simple", "output.ssr.js"),
  path.join(import.meta.dir, "..", "test", "fixtures", "fixture-based", "dom", "basic", "output.js"),
  path.join(import.meta.dir, "..", "test", "fixtures", "fixture-based", "ssr", "basic", "output.js"),
  path.join(import.meta.dir, "..", "test", "fixtures", "fixture-based", "universal", "basic", "output.js")
];

function formatKB(bytes: number) {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

for (const file of cases) {
  const buf = readFileSync(file);
  console.log(`${path.basename(file)}: ${buf.byteLength} bytes (${formatKB(buf.byteLength)})`);
}
