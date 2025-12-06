import { createSignal } from "solid-js";

// Test basic reactive functionality
const [count, setCount] = createSignal(0);
const [name, setName] = createSignal("Gas Test");

// Test JSX transformation
function TestComponent() {
  return (
    <div>
      <h1>Hello {name()}!</h1>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>
        Click me
      </button>
    </div>
  );
}

// Test conditional rendering
function ConditionalTest() {
  const [show, setShow] = createSignal(true);
  
  return (
    <div>
      {show() ? <p>Visible</p> : <p>Hidden</p>}
      <button onClick={() => setShow(!show())}>
        Toggle
      </button>
    </div>
  );
}

console.log("Gas plugin test loaded successfully");
console.log("Initial count:", count());
console.log("Initial name:", name());

export { TestComponent, ConditionalTest, count, setCount, name, setName };