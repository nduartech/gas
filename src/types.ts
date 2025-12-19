/**
 * Plugin configuration options
 */
export interface GasPluginOptions {
  /**
   * Output mode: "dom" for client-side, "ssr" for server-side rendering
   * @default "dom"
   */
  generate?: "dom" | "ssr";

  /**
   * Enable hydration support for SSR
   * @default false
   */
  hydratable?: boolean;

  /**
   * Module name for importing Solid runtime functions
   * @default "solid-js/web"
   */
  moduleName?: string;

  /**
   * Preset for module targeting: "dom" -> solid-js/web, "ssr" -> solid-js/web (server build),
   * "universal" -> solid-js/universal (default, but moduleName can be customized).
   * When set, provides defaults for moduleName but custom moduleName can override.
   */
  runtime?: "dom" | "ssr" | "universal";

  /**
   * Built-in components that receive special compilation
   * @default ["For", "Show", "Switch", "Match", "Suspense", "SuspenseList", "Portal", "Index", "Dynamic", "ErrorBoundary"]
   */
  builtIns?: string[];

  /**
   * Enable automatic event delegation for common events
   * @default true
   */
  delegateEvents?: boolean;

  /**
   * Wrap conditionals in memos for fine-grained reactivity
   * @default true
   */
  wrapConditionals?: boolean;

  /**
   * Optimize template HTML by omitting nested closing tags when safe.
   * Note: In DOM mode, this option is ignored because browsers require valid HTML.
   * In SSR mode, gas uses ssrElement helper which generates closing tags at runtime,
   * so this option doesn't apply at compile time. Available for forward compatibility.
   * @default false
   */
  omitNestedClosingTags?: boolean;

  /**
   * Optimize template HTML by omitting the last closing tag when safe.
   * Note: In DOM mode, this option is ignored because browsers require valid HTML.
   * In SSR mode, gas uses ssrElement helper which generates closing tags at runtime,
   * so this option doesn't apply at compile time. Available for forward compatibility.
   * @default true
   */
  omitLastClosingTag?: boolean;

  /**
   * Optimize template HTML by omitting quotes around attributes when safe
   * @default true
   */
  omitQuotes?: boolean;

  /**
   * Restrict JSX transformation to files with a matching @jsxImportSource pragma
   * @default false
   */
  requireImportSource?: string | false;

  /**
   * Convert context to custom elements
   * Set the current render context on custom elements (tags with "-") and slot elements.
   * This enables the Context API to work seamlessly with Web Components by assigning
   * `element._$owner = getOwner()` to preserve the reactive context.
   * @default false
   */
  contextToCustomElements?: boolean;

  /**
   * Comment marker used to indicate static expressions (for example "@once")
   * @default "@once"
   */
  staticMarker?: string;

  /**
   * Name of the reactive effect function used for wrapping dynamic expressions
   * @default "effect"
   */
  effectWrapper?: string;

  /**
   * Name of the memo function used for conditional expressions
   * @default "memo"
   */
  memoWrapper?: string;

  /**
   * Enable HTML structure validation for JSX output
   * @default true
   */
  validate?: boolean;

  /**
   * Enable development mode with additional debugging info.
   * When enabled, adds comments to generated code showing:
   * - Template HTML content preview for easier debugging
   * - Component names next to createComponent calls
   * @default false
   */
  dev?: boolean;

  /**
   * File filter regex pattern
   * @default /\.[tj]sx$/
   */
  filter?: RegExp;
}


/**
 * Resolved plugin options with defaults applied
 */
export interface ResolvedGasOptions {
  generate: "dom" | "ssr";
  hydratable: boolean;
  moduleName: string;
  runtime?: "dom" | "ssr" | "universal";
  builtIns: Set<string>;
  delegateEvents: boolean;
  wrapConditionals: boolean;
  omitNestedClosingTags: boolean;
  omitLastClosingTag: boolean;
  omitQuotes: boolean;
  requireImportSource: string | false;
  contextToCustomElements: boolean;
  staticMarker: string;
  effectWrapper: string;
  memoWrapper: string;
  validate: boolean;
  dev: boolean;
  filter: RegExp;
}

/**
 * Template information for code generation
 */
export interface TemplateInfo {
  id: string;
  html: string;
  isSVG: boolean;
  hasCustomElement: boolean;
}

/**
 * Code generation context
 */
export interface CodeGenContext {
  templates: TemplateInfo[];
  templateCounter: number;
  imports: Set<string>;
  delegatedEvents: Set<string>;
  options: ResolvedGasOptions;
}

/**
 * SVG element names for proper namespace handling
 */
export const SVG_ELEMENTS = new Set([
  "svg",
  "animate",
  "animateMotion",
  "animateTransform",
  "circle",
  "clipPath",
  "defs",
  "desc",
  "ellipse",
  "feBlend",
  "feColorMatrix",
  "feComponentTransfer",
  "feComposite",
  "feConvolveMatrix",
  "feDiffuseLighting",
  "feDisplacementMap",
  "feDistantLight",
  "feDropShadow",
  "feFlood",
  "feFuncA",
  "feFuncB",
  "feFuncG",
  "feFuncR",
  "feGaussianBlur",
  "feImage",
  "feMerge",
  "feMergeNode",
  "feMorphology",
  "feOffset",
  "fePointLight",
  "feSpecularLighting",
  "feSpotLight",
  "feTile",
  "feTurbulence",
  "filter",
  "foreignObject",
  "g",
  "image",
  "line",
  "linearGradient",
  "marker",
  "mask",
  "metadata",
  "mpath",
  "path",
  "pattern",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "set",
  "stop",
  "style",
  "switch",
  "symbol",
  "text",
  "textPath",
  "title",
  "tspan",
  "use",
  "view"
]);

/**
 * Boolean attributes that should be set as properties
 */
export const BOOLEAN_ATTRS = new Set([
  "allowfullscreen",
  "async",
  "autofocus",
  "autoplay",
  "checked",
  "controls",
  "default",
  "defer",
  "disabled",
  "formnovalidate",
  "hidden",
  "indeterminate",
  "inert",
  "ismap",
  "loop",
  "multiple",
  "muted",
  "nomodule",
  "novalidate",
  "open",
  "playsinline",
  "readonly",
  "required",
  "reversed",
  "seamless",
  "selected"
]);

/**
 * Attributes that should be set as properties instead of attributes
 */
export const PROPERTY_ATTRS = new Set([
  "value",
  "checked",
  "selected",
  "innerHTML",
  "innerText",
  "textContent"
]);

/**
 * Event names that use delegation
 */
export const DELEGATED_EVENTS = new Set([
  "beforeinput",
  "click",
  "dblclick",
  "contextmenu",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
  "touchend",
  "touchmove",
  "touchstart"
]);
