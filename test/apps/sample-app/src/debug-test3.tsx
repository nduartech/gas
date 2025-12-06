import { createSignal, For } from "solid-js";

// Single function test
function TestSingle() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("Gas Plugin");

  return (
    <div>
      <h1>Single Function Test</h1>
      <p>Count: {count()}</p>
      <p>Name: {name()}</p>
      <button onClick={() => setCount(count() + 1)}>
        Increment: {count()}
      </button>
      <input 
        type="text" 
        value={name()} 
        onInput={(e) => setName(e.currentTarget.value)}
        placeholder="Enter name"
      />
    </div>
  );
}

export { TestSingle };