/**
 * The smallest DOM that src/render.js needs, plus HTML serialization.
 *
 * Exists because WeasyPrint (and node itself) cannot run a browser DOM, so PDF
 * rendering and headless render tests both need somewhere for the renderer to
 * build into. Implements only the handful of methods the renderer actually calls.
 */

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);

export const escapeText = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s) => escapeText(s).replace(/"/g, "&quot;");

class Node {
  constructor(tag) {
    this.tag = tag;
    this.attrs = new Map();
    this.children = [];
  }

  setAttribute(name, value) {
    this.attrs.set(name, String(value));
  }

  getAttribute(name) {
    return this.attrs.get(name) ?? null;
  }

  set textContent(value) {
    this.children = [String(value)];
  }

  append(...nodes) {
    for (const n of nodes) {
      // A fragment splices its children in, matching real DOM behavior.
      if (n instanceof Fragment) this.children.push(...n.children);
      else this.children.push(n);
    }
  }

  toString() {
    const attrs = [...this.attrs]
      .map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escapeAttr(v)}"`))
      .join("");
    if (VOID_TAGS.has(this.tag)) return `<${this.tag}${attrs}>`;
    const inner = this.children.map((c) => (typeof c === "string" ? escapeText(c) : c)).join("");
    return `<${this.tag}${attrs}>${inner}</${this.tag}>`;
  }
}

class Fragment extends Node {
  constructor() {
    super("#fragment");
  }
}

/** A document-like object suitable for passing to createRenderer(). */
export function createDocument() {
  return {
    createElement: (tag) => new Node(tag),
    createElementNS: (_ns, tag) => new Node(tag),
    createDocumentFragment: () => new Fragment(),
    createTextNode: (text) => String(text),
  };
}
