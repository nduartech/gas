// Smart fix for template generation
import { readFileSync, writeFileSync } from 'fs';

const generatorPath = './src/generator.ts';
let content = readFileSync(generatorPath, 'utf8');

// The issue is in generateTemplateHTML - it creates placeholders for ALL nested elements
// We need to be smarter about this

// Find generateTemplateHTML function and fix the child processing
const oldChildProcessing = `  // Add children - include placeholder markers for expressions
  for (const child of children) {
    if (child.type === "text") {
      html += escapeHTML(child.value);
    } else if (child.type === "element") {
      // Use placeholders for nested elements too
      html += generateHTMLWithPlaceholders(child.value, true);
    } else if (child.type === "expression") {
      // Add placeholder comment node for dynamic expression insertion
      html += "<!>";
    }
  }`;

const newChildProcessing = `  // Add children - include placeholder markers for expressions and truly dynamic elements only
  for (const child of children) {
    if (child.type === "text") {
      html += escapeHTML(child.value);
    } else if (child.type === "element") {
      // Check if this element truly needs a separate template
      const needsSeparateTemplate = elementNeedsSeparateTemplate(child.value);
      if (needsSeparateTemplate) {
        html += generateHTMLWithPlaceholders(child.value, true);
      } else {
        // Include element directly in template with placeholders for its dynamic children
        html += generateHTMLWithPlaceholders(child.value, false);
      }
    } else if (child.type === "expression") {
      // Add placeholder comment node for dynamic expression insertion
      html += "<!>";
    }
  }`;

content = content.replace(oldChildProcessing, newChildProcessing);

// Add helper function to determine if element needs separate template
const helperFunction = `
function elementNeedsSeparateTemplate(jsx: ParsedJSX): boolean {
  // Elements with dynamic props (except event handlers) need separate templates
  for (const prop of jsx.props) {
    const isEventProp = prop.name.startsWith("on") && prop.name.length > 2 && prop.name[2] === prop.name[2].toUpperCase();
    
    if (prop.value.type === "spread") {
      return true;
    }
    
    if (prop.value.type === "expression" && !isEventProp) {
      return true;
    }
  }
  
  // Elements with dynamic children need separate templates
  for (const child of jsx.children) {
    if (child.type === "expression") {
      return true;
    }
    if (child.type === "element" && elementNeedsSeparateTemplate(child.value)) {
      return true;
    }
  }
  
  return false;
}
`;

// Insert helper function before generateTemplateHTML
const insertPoint = content.indexOf('function generateTemplateHTML(');
if (insertPoint !== -1) {
  content = content.slice(0, insertPoint) + helperFunction + '\n\n' + content.slice(insertPoint);
}

writeFileSync(generatorPath, content);
console.log('Applied smart fix for template generation');
