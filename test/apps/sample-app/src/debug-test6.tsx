import { createSignal } from "solid-js";

function TestValue() {
  const [name, setName] = createSignal("test");

  return (
    <div>
      <input value={name()} />
    </div>
  );
}

export { TestValue };