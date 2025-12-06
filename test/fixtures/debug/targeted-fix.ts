// Targeted fix for event handler issue
import { readFileSync, writeFileSync } from 'fs';

const generatorPath = './src/generator.ts';
let content = readFileSync(generatorPath, 'utf8');

// The issue is that eventProps are treated as making element structure dynamic
// But event handlers can be attached to static elements after template creation

// Find the hasAnyDynamic check and remove eventProps from it
const oldCheck = `  const hasAnyDynamic =
    dynamicProps.length > 0 ||
    eventProps.length > 0 ||
    refProp !== null ||
    spreadProps.length > 0 ||
    specialProps.length > 0 ||
    children.some(child => !isStaticChild(child));`;

const newCheck = `  const hasAnyDynamic =
    dynamicProps.length > 0 ||
    refProp !== null ||
    spreadProps.length > 0 ||
    specialProps.length > 0 ||
    children.some(child => !isStaticChild(child));`;

content = content.replace(oldCheck, newCheck);

writeFileSync(generatorPath, content);
console.log('Applied targeted fix for event handlers');
