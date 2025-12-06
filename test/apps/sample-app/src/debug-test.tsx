import { createSignal } from "solid-js";

function SimpleTest() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <h1>Simple Test</h1>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>
        Click me
      </button>
    </div>
  );
}

export { SimpleTest };