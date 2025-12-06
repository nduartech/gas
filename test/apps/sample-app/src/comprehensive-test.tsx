import { createSignal, For, Show } from "solid-js";

// 1. Basic JSX elements with static content
function BasicElements() {
  return (
    <div>
      <h1>Static Content Test</h1>
      <p>This is a paragraph with static text.</p>
      <span>Span element</span>
      <div>Nested div</div>
    </div>
  );
}

// 2. Dynamic content with signals
function DynamicContent() {
  const [count, setCount] = createSignal(0);
  const [name, setName] = createSignal("Gas Plugin");
  const [enabled, setEnabled] = createSignal(true);

  return (
    <div>
      <h2>Dynamic Content</h2>
      <p>Count: {count()}</p>
      <p>Name: {name()}</p>
      <p>Status: {enabled() ? "Enabled" : "Disabled"}</p>
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

// 3. Event handlers
function EventHandlers() {
  const [log, setLog] = createSignal<string[]>([]);

  const addLog = (message: string) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
  };

  return (
    <div>
      <h2>Event Handlers</h2>
      <button onClick={() => addLog("Button clicked")}>
        Click Event
      </button>
      <input 
        type="text" 
        placeholder="Type here..."
        onInput={(e) => addLog(`Input: ${e.currentTarget.value}`)}
        onFocus={() => addLog("Input focused")}
        onBlur={() => addLog("Input blurred")}
      />
      <div 
        onMouseEnter={() => addLog("Mouse entered")}
        onMouseLeave={() => addLog("Mouse left")}
        style="border: 1px solid #ccc; padding: 10px; margin: 5px;"
      >
        Hover Area
      </div>
      <ul>
        <For each={log()}>
          {(entry) => <li>{entry}</li>}
        </For>
      </ul>
    </div>
  );
}

// 4. Conditional rendering with ternary operators
function ConditionalRendering() {
  const [show, setShow] = createSignal(true);
  const [userType, setUserType] = createSignal<"guest" | "user" | "admin">("guest");

  return (
    <div>
      <h2>Conditional Rendering</h2>
      <button onClick={() => setShow(!show())}>
        Toggle Content: {show() ? "Hide" : "Show"}
      </button>
      
      {show() ? (
        <div>
          <p>Content is visible!</p>
          {userType() === "admin" ? (
            <p>Admin Panel</p>
          ) : userType() === "user" ? (
            <p>User Dashboard</p>
          ) : (
            <p>Guest View</p>
          )}
        </div>
      ) : (
        <p>Content is hidden</p>
      )}

      <select onChange={(e) => setUserType(e.currentTarget.value as any)}>
        <option value="guest">Guest</option>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
    </div>
  );
}

// 5. List rendering with For component
function ListRendering() {
  const [items, setItems] = createSignal([
    { id: 1, name: "Item 1", completed: false },
    { id: 2, name: "Item 2", completed: true },
    { id: 3, name: "Item 3", completed: false }
  ]);

  const addItem = () => {
    const newId = Math.max(...items().map(item => item.id)) + 1;
    setItems(prev => [...prev, { id: newId, name: `Item ${newId}`, completed: false }]);
  };

  const toggleItem = (id: number) => {
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, completed: !item.completed } : item
    ));
  };

  return (
    <div>
      <h2>List Rendering</h2>
      <button onClick={addItem}>Add Item</button>
      <ul>
        <For each={items()}>
          {(item) => (
            <li 
              style={{ 
                "text-decoration": item.completed ? "line-through" : "none",
                "color": item.completed ? "#888" : "#000"
              }}
              onClick={() => toggleItem(item.id)}
            >
              {item.name} {item.completed && "✓"}
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}

// 6. Component composition
interface CardProps {
  title: string;
  children: any;
  footer?: string;
}

function Card(props: CardProps) {
  return (
    <div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin: 8px;">
      <h3>{props.title}</h3>
      <div>{props.children}</div>
      {props.footer && <footer>{props.footer}</footer>}
    </div>
  );
}

function ComponentComposition() {
  const [message, setMessage] = createSignal("Hello from child!");

  return (
    <div>
      <h2>Component Composition</h2>
      <Card title="Parent Card" footer="Card footer">
        <p>This is child content</p>
        <input 
          value={message()} 
          onInput={(e) => setMessage(e.currentTarget.value)}
        />
        <p>{message()}</p>
      </Card>
    </div>
  );
}

// 7. Props spreading
interface ButtonProps {
  variant?: "primary" | "secondary";
  size?: "small" | "medium" | "large";
  children: any;
  [key: string]: any;
}

function StyledButton(props: ButtonProps) {
  const baseStyles = {
    padding: props.size === "small" ? "4px 8px" : 
             props.size === "large" ? "12px 24px" : "8px 16px",
    "background-color": props.variant === "primary" ? "#007bff" : "#6c757d",
    color: "white",
    border: "none",
    "border-radius": "4px",
    cursor: "pointer"
  };

  const { variant, size, children, ...rest } = props;

  return (
    <button style={baseStyles} {...rest}>
      {children}
    </button>
  );
}

function PropsSpreading() {
  return (
    <div>
      <h2>Props Spreading</h2>
      <StyledButton variant="primary" size="medium" onClick={() => console.log("Clicked!")}>
        Primary Button
      </StyledButton>
      <StyledButton variant="secondary" size="small" disabled>
        Disabled Button
      </StyledButton>
    </div>
  );
}

// 8. Special attributes (ref, classList, style)
function SpecialAttributes() {
  let inputRef: HTMLInputElement | undefined;
  const [classes, setClasses] = createSignal({
    active: true,
    disabled: false,
    highlighted: false
  });
  const [styles, setStyles] = createSignal({
    color: "#333",
    "font-size": "16px",
    "font-weight": "normal"
  });

  const focusInput = () => {
    inputRef?.focus();
  };

  const toggleClass = (className: "active" | "disabled" | "highlighted") => {
    setClasses(prev => ({ ...prev, [className]: !prev[className] }));
  };

  const toggleBold = () => {
    setStyles(prev => ({ 
      ...prev, 
      "font-weight": prev["font-weight"] === "normal" ? "bold" : "normal" 
    }));
  };

  return (
    <div>
      <h2>Special Attributes</h2>
      <input 
        ref={inputRef}
        placeholder="Focus me with the button"
        style="margin: 5px;"
      />
      <button onClick={focusInput}>Focus Input</button>
      
      <div 
        classList={{
          "active": classes().active,
          "disabled": classes().disabled,
          "highlighted": classes().highlighted,
          "base-class": true
        }}
        style={{
          ...styles(),
          "border": "1px solid #ccc",
          "padding": "10px",
          "margin": "5px"
        }}
      >
        This div has dynamic classes and styles
      </div>
      
      <button onClick={() => toggleClass("active")}>Toggle Active</button>
      <button onClick={() => toggleClass("disabled")}>Toggle Disabled</button>
      <button onClick={() => toggleClass("highlighted")}>Toggle Highlighted</button>
      <button onClick={toggleBold}>Toggle Bold</button>
    </div>
  );
}

// 9. SVG elements
function SVGElements() {
  const [color, setColor] = createSignal("#007bff");
  const [size, setSize] = createSignal(100);

  return (
    <div>
      <h2>SVG Elements</h2>
      <svg width={size()} height={size()} viewBox="0 0 100 100">
        <circle 
          cx="50" 
          cy="50" 
          r="40" 
          fill={color()}
          stroke="#333" 
          stroke-width="2"
          onClick={() => setColor(color() === "#007bff" ? "#dc3545" : "#007bff")}
          style="cursor: pointer;"
        />
        <rect x="10" y="10" width="30" height="30" fill="#ffc107" />
        <polygon points="50,10 90,90 10,90" fill="#28a745" />
      </svg>
      
      <div>
        <label>Size: </label>
        <input 
          type="range" 
          min="50" 
          max="200" 
          value={size()}
          onInput={(e) => setSize(Number(e.currentTarget.value))}
        />
        <span>{size()}px</span>
      </div>
    </div>
  );
}

// 10. Fragments
function Fragments() {
  const [showDetails, setShowDetails] = createSignal(false);

  return (
    <>
      <h2>Fragments</h2>
      <p>This content uses fragments to avoid wrapper divs.</p>
      {showDetails() && (
        <>
          <p>Detail 1: No wrapper div around these elements</p>
          <p>Detail 2: They are direct siblings</p>
          <span>Detail 3: Different element types</span>
        </>
      )}
      <button onClick={() => setShowDetails(!showDetails())}>
        {showDetails() ? "Hide" : "Show"} Details
      </button>
    </>
  );
}

// Main comprehensive test component
function ComprehensiveTest() {
  const [activeSection, setActiveSection] = createSignal("basic");

  const sections = [
    { id: "basic", name: "Basic Elements", component: BasicElements },
    { id: "dynamic", name: "Dynamic Content", component: DynamicContent },
    { id: "events", name: "Event Handlers", component: EventHandlers },
    { id: "conditional", name: "Conditional Rendering", component: ConditionalRendering },
    { id: "lists", name: "List Rendering", component: ListRendering },
    { id: "composition", name: "Component Composition", component: ComponentComposition },
    { id: "props", name: "Props Spreading", component: PropsSpreading },
    { id: "attributes", name: "Special Attributes", component: SpecialAttributes },
    { id: "svg", name: "SVG Elements", component: SVGElements },
    { id: "fragments", name: "Fragments", component: Fragments }
  ];

  const ActiveComponent = sections.find(s => s.id === activeSection())?.component || BasicElements;

  return (
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1>Gas Plugin Comprehensive Test</h1>
      <p>This component tests all major SolidJS JSX patterns with the gas plugin.</p>
      
      <nav style="margin-bottom: 20px;">
        <For each={sections}>
          {(section) => (
            <button
              onClick={() => setActiveSection(section.id)}
              style={{
                "margin-right": "5px",
                "margin-bottom": "5px",
                "background-color": activeSection() === section.id ? "#007bff" : "#f8f9fa",
                color: activeSection() === section.id ? "white" : "black",
                border: "1px solid #dee2e6",
                padding: "5px 10px",
                cursor: "pointer"
              }}
            >
              {section.name}
            </button>
          )}
        </For>
      </nav>

      <div style="border: 1px solid #dee2e6; border-radius: 4px; padding: 20px;">
        <ActiveComponent />
      </div>
    </div>
  );
}

export {
  ComprehensiveTest,
  BasicElements,
  DynamicContent,
  EventHandlers,
  ConditionalRendering,
  ListRendering,
  ComponentComposition,
  PropsSpreading,
  SpecialAttributes,
  SVGElements,
  Fragments
};