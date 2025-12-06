import { generateStaticElement, categorizeProps } from "./src/generator.js";
import { parseJSX } from "./src/parser.js";

// Create a mock context
const ctx = {
  templates: [],
  templateCounter: 0,
  imports: new Set(),
  delegatedEvents: new Set(),
  options: { generate: "dom" },
  varCounter: 0
};

// Parse button element
const jsx = parseJSX('<button onClick={() => console.log("clicked")}>Click me</button>');
console.log('Button JSX:', JSON.stringify(jsx, null, 2));

const categorized = categorizeProps(jsx.props);
console.log('Event props:', categorized.eventProps);
console.log('Ref prop:', categorized.refProp);

const result = generateStaticElement(jsx, ctx);
console.log('Generated:', result);
console.log('Templates:', ctx.templates);
