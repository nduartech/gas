import { createSignal, For } from "solid-js";

function TestBasics() {
  return (
    <div>
      <h1>Static Content Test</h1>
      <p>This is a paragraph with static text.</p>
      <span>Span element</span>
      <div>Nested div</div>
    </div>
  );
}

function TestDynamic() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("Gas Plugin");

  return (
    <div>
      <h2>Dynamic Content</h2>
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

export { TestBasics, TestDynamic };