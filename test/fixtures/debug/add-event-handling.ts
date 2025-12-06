// Add event handler support to static elements
import { readFileSync, writeFileSync } from 'fs';

const generatorPath = './src/generator.ts';
let content = readFileSync(generatorPath, 'utf8');

// Find generateStaticElement and modify it to handle event handlers
const oldStaticElement = `function generateStaticElement(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  // Generate static HTML
  const html = generateStaticHTML(jsx);
  const templateId = \`_tmpl$\${ctx.templateCounter++}\`;

  ctx.templates.push({
    id: templateId,
    html,
    isSVG: jsx.isSVG,
    hasCustomElement: jsx.tag.includes("-")
  });

  ctx.imports.add("template");

  return {
    code: \`\${templateId}()\`,
    isStatic: true
  };
}`;

const newStaticElement = `function generateStaticElement(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { props } = jsx;
  
  // Categorize props to check for event handlers
  const { eventProps, refProp } = categorizeProps(props);
  
  // If there are event handlers or refs, we need to use dynamic generation
  // to attach them, but the structure is still static
  if (eventProps.length > 0 || refProp !== null) {
    return generateStaticElementWithEvents(jsx, ctx);
  }
  
  // Generate static HTML
  const html = generateStaticHTML(jsx);
  const templateId = \`_tmpl$\${ctx.templateCounter++}\`;

  ctx.templates.push({
    id: templateId,
    html,
    isSVG: jsx.isSVG,
    hasCustomElement: jsx.tag.includes("-")
  });

  ctx.imports.add("template");

  return {
    code: \`\${templateId}()\`,
    isStatic: true
  };
}`;

content = content.replace(oldStaticElement, newStaticElement);

// Add the helper function
const helperFunction = `
function generateStaticElementWithEvents(jsx: ParsedJSX, ctx: GeneratorContext): GeneratedElement {
  const { tag, props, children, isSVG } = jsx;
  
  // Categorize props
  const { staticProps, eventProps, refProp } = categorizeProps(props);
  
  // Generate template HTML with static parts only
  const templateHTML = generateTemplateHTML(tag, staticProps, children);
  const templateId = \`_tmpl$\${ctx.templateCounter++}\`;

  ctx.templates.push({
    id: templateId,
    html: templateHTML,
    isSVG,
    hasCustomElement: tag.includes("-")
  });

  ctx.imports.add("template");

  // Generate IIFE for event handler setup
  const varName = \`_el$\${ctx.varCounter++}\`;
  const statements: string[] = [];

  statements.push(\`const \${varName} = \${templateId}();\`);

  // Handle event handlers
  for (const prop of eventProps) {
    const eventCode = generateEventHandler(varName, prop, ctx);
    if (eventCode) {
      statements.push(eventCode);
    }
  }

  // Handle ref
  if (refProp && refProp.value.type === "expression") {
    const refExpr = refProp.value.value;
    if (refExpr.includes("=>") || refExpr.startsWith("(")) {
      statements.push(\`(\${refExpr})(\${varName});\`);
    } else {
      statements.push(
        \`typeof \${refExpr} === "function" ? \${refExpr}(\${varName}) : \${refExpr} = \${varName};\`
      );
    }
  }

  statements.push(\`return \${varName};\`);

  const code = \`(() => {\\n  \${statements.join("\\n  ")}\\n})()\`;

  return { code, isStatic: false };
}
`;

// Insert the helper function before generateDOMElementSSR
const insertPoint = content.indexOf('function generateDOMElementSSR(');
if (insertPoint !== -1) {
  content = content.slice(0, insertPoint) + helperFunction + '\n\n' + content.slice(insertPoint);
}

writeFileSync(generatorPath, content);
console.log('Added event handler support to static elements');
