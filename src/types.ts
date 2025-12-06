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
   * "universal" -> solid-js/universal. When set, overrides moduleName.
   */
  runtime?: "dom" | "ssr" | "universal";

  /**
   * Built-in components that receive special compilation
   * @default ["For", "Show", "Switch", "Match", "Suspense", "SuspenseList", "Portal", "Index", "Dynamic", "ErrorBoundary"]
   */
  builtIns?: string[];

  /**
   * Wrap conditionals in memos for fine-grained reactivity
   * @default true
   */
  wrapConditionals?: boolean;

  /**
   * Convert context to custom elements
   * @default true
   */
  contextToCustomElements?: boolean;

  /**
   * Enable development mode with additional debugging info
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
  wrapConditionals: boolean;
  contextToCustomElements: boolean;
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
