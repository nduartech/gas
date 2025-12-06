// Export isStaticJSX for debugging
import { readFileSync, writeFileSync } from 'fs';

const generatorPath = './src/generator.ts';
let content = readFileSync(generatorPath, 'utf8');

// Add export for isStaticJSX
content = content.replace('function isStaticJSX(jsx: ParsedJSX): boolean {', 'export function isStaticJSX(jsx: ParsedJSX): boolean {');

writeFileSync(generatorPath, content);
console.log('Exported isStaticJSX function');
