import { createSignal } from "solid-js";

function TestInput() {
  const [name, setName] = createSignal("Gas Plugin");

  return (
    <div>
      <h1>Input Test</h1>
      <p>Name: {name()}</p>
      <input 
        type="text" 
        value={name()} 
        placeholder="Enter name"
      />
    </div>
  );
}

export { TestInput };