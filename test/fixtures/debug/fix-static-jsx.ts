// Fix isStaticJSX to not treat event handlers as making element non-static
import { readFileSync, writeFileSync } from 'fs';

const generatorPath = './src/generator.ts';
let content = readFileSync(generatorPath, 'utf8');

// Find isStaticJSX function and fix the prop checking logic
const oldPropCheck = `  for (const prop of jsx.props) {
    if (prop.value.type === "expression" || prop.value.type === "spread") {
      return false;
    }
  }`;

const newPropCheck = `  for (const prop of jsx.props) {
    // Event handlers don't make element structure non-static
    const isEventProp = prop.name.startsWith("on") && prop.name.length > 2 && prop.name[2] === prop.name[2].toUpperCase();
    
    if (prop.value.type === "spread") {
      return false;
    }
    
    if (prop.value.type === "expression" && !isEventProp) {
      return false;
    }
  }`;

content = content.replace(oldPropCheck, newPropCheck);

writeFileSync(generatorPath, content);
console.log('Fixed isStaticJSX to handle event handlers correctly');
