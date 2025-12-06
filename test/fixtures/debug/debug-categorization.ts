import { categorizeProps } from "./src/generator.js";
import { parseJSX } from "./src/parser.js";

// Parse the button element
const jsx = parseJSX('<button onClick={() => console.log("clicked")}>Click me</button>');
console.log('Parsed JSX:', JSON.stringify(jsx, null, 2));

const categorized = categorizeProps(jsx.props);
console.log('Categorized props:', categorized);

console.log('dynamicProps length:', categorized.dynamicProps.length);
console.log('eventProps length:', categorized.eventProps.length);
console.log('refProp:', categorized.refProp);
console.log('spreadProps length:', categorized.spreadProps.length);
console.log('specialProps length:', categorized.specialProps.length);
