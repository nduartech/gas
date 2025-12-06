import { parseJSX } from "./src/parser.js";

// Parse button with style
const buttonJSX = parseJSX('<button style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;">Count: {count()}</button>');
console.log('Button props:');
buttonJSX.props.forEach((prop, i) => {
  console.log(`${i}: name="${prop.name}", type="${prop.value.type}", value="${prop.value.value}"`);
});
