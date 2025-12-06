import { createSignal } from "solid-js";

function TestInputNoValue() {
  return (
    <div>
      <h1>Input Test</h1>
      <input 
        type="text" 
        placeholder="Enter name"
      />
    </div>
  );
}

export { TestInputNoValue };