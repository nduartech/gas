import { createSignal } from "solid-js";

function App() {
  const [count, setCount] = createSignal(0);

  return (
    <div style="padding: 2rem; font-family: system-ui, sans-serif;">
      <h1>Welcome to nathanduarte.dev</h1>
      <p>This is a SolidJS app running on Bun!</p>
      <div style="margin-top: 1rem;">
        <button
          onClick={() => setCount(count() + 1)}
          style="padding: 0.5rem 1rem; font-size: 1rem; cursor: pointer;"
        >
          Count: {count()}
        </button>
      </div>
    </div>
  );
}

export default App;
