import { isStaticJSX, categorizeProps } from "./src/generator.js";
import { parseJSX } from "./src/parser.js";

// Parse the inner div with button
const innerDivJSX = parseJSX('<div style="margin-top: 1rem;"><button onClick={() => setCount(count() + 1)} style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;">Count: {count()}</button></div>');
console.log('Inner div is static?', isStaticJSX(innerDivJSX));

// Parse the button
const buttonJSX = parseJSX('<button onClick={() => setCount(count() + 1)} style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;">Count: {count()}</button>');
console.log('Button is static?', isStaticJSX(buttonJSX));

// Check button props
const buttonProps = categorizeProps(buttonJSX.props);
console.log('Button props:', {
  staticProps: buttonProps.staticProps.length,
  dynamicProps: buttonProps.dynamicProps.length,
  eventProps: buttonProps.eventProps.length,
  specialProps: buttonProps.specialProps.length
});

// Check button children
console.log('Button children:', buttonJSX.children.map(c => ({ type: c.type, value: c.type === 'text' ? c.value.trim() : c.type })));
