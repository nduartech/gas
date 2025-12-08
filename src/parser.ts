/**
 * JSX Parser for Gas
 *
 * This module provides a native JSX parser that extracts JSX elements from source code
 * and converts them into an intermediate representation for transformation.
 */

import { SVG_ELEMENTS } from "./types.js";

/**
 * Error thrown when JSX parsing fails.
 *
 * Note: The `position` property is relative to the JSX snippet being parsed,
 * not the original source file. When using `parseJSX` via `transformJSX`,
 * the position refers to the character offset within the extracted JSX string.
 * To get file-relative positions, callers should add the JSX expression's
 * start offset from `findJSXExpressions` to this position.
 */
export class JSXParseError extends Error {
  /**
   * @param message - Human-readable error description
   * @param position - Character offset within the JSX snippet (0-based)
   * @param source - The JSX snippet that was being parsed
   */
  constructor(
    message: string,
    public position: number,
    public source?: string
  ) {
    super(message);
    this.name = "JSXParseError";
  }

  /**
   * Get a formatted error message with line and column information.
   *
   * Note: Line and column numbers are relative to the JSX snippet,
   * not the original source file.
   *
   * @returns Formatted message like "Error message at line 1, column 5"
   */
  getFormattedMessage(): string {
    if (!this.source) return this.message;

    const lines = this.source.split("\n");
    let currentPos = 0;
    let lineNumber = 1;
    let columnNumber = 1;

    for (const line of lines) {
      if (currentPos + line.length >= this.position) {
        columnNumber = this.position - currentPos + 1;
        break;
      }
      currentPos += line.length + 1; // +1 for newline
      lineNumber++;
    }

    return `${this.message} at line ${lineNumber}, column ${columnNumber}`;
  }
}

export interface ParsedJSX {
  type: "element" | "fragment" | "component";
  tag: string;
  props: ParsedProp[];
  children: ParsedChild[];
  start: number;
  end: number;
  selfClosing: boolean;
  isSVG: boolean;
}

export interface ParsedProp {
  name: string;
  value: ParsedPropValue;
  start: number;
  end: number;
}

export type ParsedPropValue =
  | { type: "string"; value: string }
  | { type: "expression"; value: string }
  | { type: "element"; value: ParsedJSX }
  | { type: "true" } // boolean shorthand like <div disabled />
  | { type: "spread"; value: string };

export type ParsedChild =
  | { type: "text"; value: string; start: number; end: number }
  | { type: "expression"; value: string; start: number; end: number }
  | { type: "element"; value: ParsedJSX };

interface ParserState {
  source: string;
  pos: number;
  jsxDepth: number;
  inSVG: boolean;
}

/**
 * Find all JSX expressions in the source code
 */
export function findJSXExpressions(source: string): { start: number; end: number; jsx: string }[] {
  const results: { start: number; end: number; jsx: string }[] = [];
  let pos = 0;

  while (pos < source.length) {
    // Skip strings and comments
    const skipResult = skipNonCode(source, pos);
    if (skipResult > pos) {
      pos = skipResult;
      continue;
    }

    // Look for JSX start
    if (source[pos] === "<") {
      // Check if this is JSX (not a comparison operator)
      if (isJSXStart(source, pos)) {
        const jsxResult = extractJSX(source, pos);
        if (jsxResult) {
          results.push(jsxResult);
          pos = jsxResult.end;
          continue;
        }
      }
    }

    pos++;
  }

  return results;
}

/**
 * Check if a '<' character starts a JSX expression
 */
function isJSXStart(source: string, pos: number): boolean {
  if (pos + 1 >= source.length) return false;
  const nextChar = source[pos + 1]!;

  // <Component or <div
  if (/[a-zA-Z_$]/.test(nextChar)) {
    return true;
  }

  // <>...</> fragment
  if (nextChar === ">") {
    return true;
  }

  return false;
}

/**
 * Extract a complete JSX expression starting at pos
 */
function extractJSX(
  source: string,
  start: number
): { start: number; end: number; jsx: string } | null {
  let pos = start;
  let depth = 0;
  let inTag = false;
  let tagName = "";
  const tagStack: string[] = [];

  while (pos < source.length) {
    // Skip strings within JSX attributes
    if (inTag) {
      const skipStr = skipJSXAttributeString(source, pos);
      if (skipStr > pos) {
        pos = skipStr;
        continue;
      }
    }

    const char = source[pos];

    if (char === "<") {
      const nextChar = source[pos + 1];

      // Check for closing tag
      if (nextChar === "/") {
        // Find the closing tag name
        let closeTagEnd = pos + 2;
        while (closeTagEnd < source.length && source[closeTagEnd] !== ">") {
          closeTagEnd++;
        }
        const closeTagName = source.slice(pos + 2, closeTagEnd).trim();

        if (tagStack.length > 0 && tagStack[tagStack.length - 1] === closeTagName) {
          tagStack.pop();
          depth--;
          pos = closeTagEnd + 1;

          if (depth === 0) {
            return { start, end: pos, jsx: source.slice(start, pos) };
          }
          continue;
        } else if (closeTagName === "" && tagStack[tagStack.length - 1] === "") {
          // Fragment closing </>
          tagStack.pop();
          depth--;
          pos = closeTagEnd + 1;

          if (depth === 0) {
            return { start, end: pos, jsx: source.slice(start, pos) };
          }
          continue;
        }
      }

      // Check for fragment start
      if (nextChar === ">") {
        depth++;
        tagStack.push("");
        pos += 2;
        continue;
      }

      // Opening tag
      if (nextChar && /[a-zA-Z_$]/.test(nextChar)) {
        inTag = true;
        depth++;
        // Extract tag name
        let tagEnd = pos + 1;
        while (tagEnd < source.length && /[a-zA-Z0-9_.$-]/.test(source.charAt(tagEnd))) {
          tagEnd++;
        }
        tagName = source.slice(pos + 1, tagEnd);
        pos = tagEnd;
        continue;
      }
    }

    // Inside an opening tag
    if (inTag) {
      // Skip whitespace
      if (char && /\s/.test(char)) {
        pos++;
        continue;
      }

      // Self-closing tag
      if (char === "/" && source[pos + 1] === ">") {
        // For self-closing tags, we don't push to stack, so no need to pop
        depth--;
        inTag = false;
        pos += 2;

        if (depth === 0) {
          return { start, end: pos, jsx: source.slice(start, pos) };
        }
        continue;
      }

      // End of opening tag
      if (char === ">") {
        tagStack.push(tagName);
        inTag = false;
        pos++;
        continue;
      }

      // JSX expression in attribute
      if (char === "{") {
        const exprEnd = findMatchingBrace(source, pos);
        pos = exprEnd + 1;
        continue;
      }

      // Attribute name or value
      pos++;
      continue;
    }

    // JSX expression child
    if (char === "{") {
      const exprEnd = findMatchingBrace(source, pos);
      pos = exprEnd + 1;
      continue;
    }

    pos++;
  }

  return null;
}

/**
 * Find the matching closing brace for a JSX expression
 */
function findMatchingBrace(source: string, start: number): number {
  let depth = 1;
  let pos = start + 1;

  while (pos < source.length && depth > 0) {
    const char = source[pos];

    // Skip strings
    if (char === '"' || char === "'" || char === "`") {
      pos = skipString(source, pos);
      continue;
    }

    // Skip comments
    if (char === "/" && (source[pos + 1] === "/" || source[pos + 1] === "*")) {
      pos = skipComment(source, pos);
      continue;
    }

    // Handle nested JSX
    if (char === "<" && isJSXStart(source, pos)) {
      const nestedJSX = extractJSX(source, pos);
      if (nestedJSX) {
        pos = nestedJSX.end;
        continue;
      }
    }

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
    }

    if (depth === 0) {
      return pos;
    }

    pos++;
  }

  return pos - 1;
}

/**
 * Parse a JSX element string into a structured representation
 * @throws {JSXParseError} If the JSX is malformed
 *
 * Note: Error positions are relative to the JSX string, not the original file.
 * The startOffset parameter is used for AST node positions, not error reporting.
 */
export function parseJSX(jsx: string, startOffset: number = 0): ParsedJSX {
  if (!jsx || jsx.trim().length === 0) {
    throw new JSXParseError("Empty JSX expression", 0, jsx);
  }

  if (jsx[0] !== "<") {
    throw new JSXParseError("JSX must start with '<'", 0, jsx);
  }

  const state: ParserState = {
    source: jsx,
    pos: 0,
    jsxDepth: 0,
    inSVG: false
  };

  try {
    return parseElement(state, startOffset);
  } catch (err) {
    if (err instanceof JSXParseError) {
      throw err;
    }
    throw new JSXParseError(
      err instanceof Error ? err.message : "Unknown parsing error",
      state.pos,
      jsx
    );
  }
}

function parseElement(state: ParserState, offset: number): ParsedJSX {
  const startPos = state.pos; // Position in snippet for error reporting
  const start = state.pos + offset; // Position in original file for AST

  // Skip '<'
  state.pos++;

  // Check for fragment
  if (state.source[state.pos] === ">") {
    state.pos++;
    const children = parseChildren(state, offset, "");
    // Validate fragment closing
    if (state.pos + 2 >= state.source.length ||
        state.source.slice(state.pos, state.pos + 3) !== "</>") {
      throw new JSXParseError("Unclosed JSX fragment", startPos, state.source);
    }
    // Skip </> closing
    state.pos += 3;
    return {
      type: "fragment",
      tag: "",
      props: [],
      children,
      start,
      end: state.pos + offset,
      selfClosing: false,
      isSVG: false
    };
  }

  // Parse tag name
  const tagStart = state.pos;
  while (state.pos < state.source.length && /[a-zA-Z0-9_.$-]/.test(state.source.charAt(state.pos))) {
    state.pos++;
  }
  const tag = state.source.slice(tagStart, state.pos);

  // Validate tag name
  if (!tag) {
    throw new JSXParseError("Expected tag name after '<'", startPos, state.source);
  }

  // Determine if component (PascalCase) or element
  const isComponent = /^[A-Z]/.test(tag) || tag.includes(".");
  const type = isComponent ? "component" : "element";

  // Check if SVG
  const isSVG = state.inSVG || SVG_ELEMENTS.has(tag);
  const prevInSVG = state.inSVG;
  if (tag === "svg") {
    state.inSVG = true;
  }

  // Parse props
  const props = parseProps(state, offset);

  // Check for self-closing
  skipWhitespace(state);
  let selfClosing = false;
  let children: ParsedChild[] = [];

  if (state.source[state.pos] === "/" && state.source[state.pos + 1] === ">") {
    selfClosing = true;
    state.pos += 2;
  } else if (state.source[state.pos] === ">") {
    state.pos++;
    children = parseChildren(state, offset, tag);

    // Validate and skip closing tag </tag>
    if (state.pos + 1 >= state.source.length ||
        state.source[state.pos] !== "<" ||
        state.source[state.pos + 1] !== "/") {
      throw new JSXParseError(`Unclosed JSX element <${tag}>`, startPos, state.source);
    }
    state.pos += 2; // </
    const closeTagStart = state.pos;
    while (state.pos < state.source.length && state.source[state.pos] !== ">") {
      state.pos++;
    }
    const closeTag = state.source.slice(closeTagStart, state.pos).trim();
    if (closeTag !== tag) {
      throw new JSXParseError(
        `Mismatched closing tag: expected </${tag}> but found </${closeTag}>`,
        state.pos,
        state.source
      );
    }
    if (state.pos >= state.source.length) {
      throw new JSXParseError(`Unclosed JSX element <${tag}>`, startPos, state.source);
    }
    state.pos++; // >
  } else {
    throw new JSXParseError(
      `Expected '>' or '/>' after tag <${tag}>`,
      state.pos,
      state.source
    );
  }

  state.inSVG = prevInSVG;

  return {
    type,
    tag,
    props,
    children,
    start,
    end: state.pos + offset,
    selfClosing,
    isSVG
  };
}

function parseProps(state: ParserState, offset: number): ParsedProp[] {
  const props: ParsedProp[] = [];

  while (state.pos < state.source.length) {
    skipWhitespace(state);

    const char = state.source[state.pos];

    // End of opening tag
    if (char === ">" || (char === "/" && state.source[state.pos + 1] === ">")) {
      break;
    }

    // Spread prop {...expr}
    if (char === "{") {
      const propStart = state.pos + offset;
      state.pos++; // skip {

      // Check for spread
      if (state.source.slice(state.pos, state.pos + 3) === "...") {
        state.pos += 3;
        const exprStart = state.pos;
        let depth = 1;
        while (state.pos < state.source.length && depth > 0) {
          const c = state.source[state.pos];
          if (c === "{") depth++;
          else if (c === "}") depth--;
          if (depth > 0) state.pos++;
        }
        const expr = state.source.slice(exprStart, state.pos);
        state.pos++; // skip }

        props.push({
          name: "...",
          value: { type: "spread", value: expr },
          start: propStart,
          end: state.pos + offset
        });
        continue;
      }

      // Not a spread, rewind
      state.pos--;
    }

    // Regular prop
    const propStart = state.pos + offset;
    const nameStart = state.pos;

    // Parse prop name (including namespaced like on:click or use:directive)
    while (state.pos < state.source.length && /[a-zA-Z0-9_$:-]/.test(state.source.charAt(state.pos))) {
      state.pos++;
    }

    if (state.pos === nameStart) {
      // No valid prop name found
      break;
    }

    const name = state.source.slice(nameStart, state.pos);
    skipWhitespace(state);


    // Check for value
    if (state.source[state.pos] === "=") {
      state.pos++; // skip =
      skipWhitespace(state);

      const valueChar = state.source[state.pos];

      if (valueChar === '"' || valueChar === "'") {
        // String value
        state.pos++;
        const valueStart = state.pos;
        while (state.pos < state.source.length && state.source[state.pos] !== valueChar) {
          if (state.source[state.pos] === "\\") state.pos++;
          state.pos++;
        }
        const value = state.source.slice(valueStart, state.pos);
        state.pos++; // skip closing quote

        props.push({
          name,
          value: { type: "string", value },
          start: propStart,
          end: state.pos + offset
        });
      } else if (valueChar === "{") {
        // Expression value
        const exprStart = state.pos + 1; // skip opening {
        state.pos = exprStart;
        let depth = 1;

        while (state.pos < state.source.length && depth > 0) {
          const c = state.source[state.pos];
          if (c === '"' || c === "'" || c === "`") {
            state.pos = skipStringInSource(state.source, state.pos) - 1;
          } else if (c === "{") {
            depth++;
          } else if (c === "}") {
            depth--;
          }
          if (depth > 0) state.pos++;
        }

        const expr = state.source.slice(exprStart, state.pos);
        state.pos++; // skip }

        props.push({
          name,
          value: { type: "expression", value: expr },
          start: propStart,
          end: state.pos + offset
        });
      }
    } else {
      // Boolean shorthand (no value)
      props.push({
        name,
        value: { type: "true" },
        start: propStart,
        end: state.pos + offset
      });
    }
  }

  return props;
}

function parseChildren(state: ParserState, offset: number, _parentTag: string): ParsedChild[] {
  const children: ParsedChild[] = [];
  let textStart = state.pos;

  while (state.pos < state.source.length) {
    const char = state.source[state.pos];

    // Check for closing tag
    if (char === "<" && state.source[state.pos + 1] === "/") {
      // Flush text
      if (state.pos > textStart) {
        const text = state.source.slice(textStart, state.pos);
        if (text.trim()) {
          children.push({
            type: "text",
            value: text,
            start: textStart + offset,
            end: state.pos + offset
          });
        }
      }
      break;
    }

    // Child element
    if (char === "<") {
      // Flush text
      if (state.pos > textStart) {
        const text = state.source.slice(textStart, state.pos);
        if (text.trim()) {
          children.push({
            type: "text",
            value: text,
            start: textStart + offset,
            end: state.pos + offset
          });
        }
      }

      const childElement = parseElement(state, offset);
      children.push({ type: "element", value: childElement });
      textStart = state.pos;
      continue;
    }

    // Expression child
    if (char === "{") {
      // Flush text
      if (state.pos > textStart) {
        const text = state.source.slice(textStart, state.pos);
        if (text.trim()) {
          children.push({
            type: "text",
            value: text,
            start: textStart + offset,
            end: state.pos + offset
          });
        }
      }

      const exprStart = state.pos + offset;
      state.pos++; // skip {
      const exprContentStart = state.pos;
      let depth = 1;

      while (state.pos < state.source.length && depth > 0) {
        const c = state.source[state.pos];
        if (c === '"' || c === "'" || c === "`") {
          state.pos = skipStringInSource(state.source, state.pos) - 1;
        } else if (c === "<" && isJSXStart(state.source, state.pos)) {
          // Nested JSX in expression - need to skip it properly
          const nestedJSX = extractJSX(state.source, state.pos);
          if (nestedJSX) {
            state.pos = nestedJSX.end - 1;
          }
        } else if (c === "{") {
          depth++;
        } else if (c === "}") {
          depth--;
        }
        if (depth > 0) state.pos++;
      }

      const expr = state.source.slice(exprContentStart, state.pos);
      state.pos++; // skip }

      children.push({
        type: "expression",
        value: expr,
        start: exprStart,
        end: state.pos + offset
      });

      textStart = state.pos;
      continue;
    }

    state.pos++;
  }

  return children;
}

// Helper functions
function skipWhitespace(state: ParserState): void {
  while (state.pos < state.source.length && /\s/.test(state.source.charAt(state.pos))) {
    state.pos++;
  }
}

function skipNonCode(source: string, pos: number): number {
  const char = source[pos];

  // String
  if (char === '"' || char === "'" || char === "`") {
    return skipString(source, pos);
  }

  // Comment
  if (char === "/" && (source[pos + 1] === "/" || source[pos + 1] === "*")) {
    return skipComment(source, pos);
  }

  return pos;
}

function skipString(source: string, pos: number): number {
  const quote = source[pos];
  pos++;

  if (quote === "`") {
    // Template literal
    while (pos < source.length) {
      if (source[pos] === "\\") {
        pos += 2;
        continue;
      }
      if (source[pos] === "$" && source[pos + 1] === "{") {
        // Template expression
        pos += 2;
        let depth = 1;
        while (pos < source.length && depth > 0) {
          if (source[pos] === "{") depth++;
          else if (source[pos] === "}") depth--;
          else if (source[pos] === '"' || source[pos] === "'" || source[pos] === "`") {
            pos = skipString(source, pos);
            continue;
          }
          pos++;
        }
        continue;
      }
      if (source[pos] === "`") {
        return pos + 1;
      }
      pos++;
    }
  } else {
    while (pos < source.length) {
      if (source[pos] === "\\") {
        pos += 2;
        continue;
      }
      if (source[pos] === quote) {
        return pos + 1;
      }
      pos++;
    }
  }

  return pos;
}

function skipStringInSource(source: string, pos: number): number {
  return skipString(source, pos);
}

function skipComment(source: string, pos: number): number {
  if (source[pos + 1] === "/") {
    // Single line comment
    pos += 2;
    while (pos < source.length && source[pos] !== "\n") {
      pos++;
    }
    return pos + 1;
  } else {
    // Multi-line comment
    pos += 2;
    while (pos < source.length - 1) {
      if (source[pos] === "*" && source[pos + 1] === "/") {
        return pos + 2;
      }
      pos++;
    }
    return pos;
  }
}

function skipJSXAttributeString(source: string, pos: number): number {
  const char = source[pos];
  if (char === '"' || char === "'") {
    return skipString(source, pos);
  }
  return pos;
}
