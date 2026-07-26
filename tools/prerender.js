#!/usr/bin/env node
/**
 * Render a song JSON file to standalone static HTML, with the stylesheet inlined.
 *
 * WeasyPrint (and any other non-browser PDF engine) cannot run JavaScript, so
 * checking real PDF output needs the DOM materialized ahead of time. Rather than
 * pull in a full DOM library, this implements just the handful of methods
 * src/render.js actually uses, plus an HTML serializer.
 *
 *   node tools/prerender.js songs/vibe-coding.json > /tmp/chart.html
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRenderer } from "../src/render.js";
import { transposeSong } from "../src/transpose.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link"]);
const escapeText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

const doc = {
  createElement: (tag) => new Node(tag),
  createElementNS: (_ns, tag) => new Node(tag),
  createDocumentFragment: () => new Fragment(),
  createTextNode: (text) => String(text),
};

const [songPath, instrument = "C"] = process.argv.slice(2);
if (!songPath) {
  console.error("usage: node tools/prerender.js <song.json> [C|Bb|A|Eb|F]");
  process.exit(2);
}

const song = transposeSong(JSON.parse(readFileSync(songPath, "utf8")), instrument);
// The output HTML lands outside the repo, so relative font URLs would 404.
const css = readFileSync(resolve(ROOT, "src/sheet.css"), "utf8").replaceAll(
  'url("fonts/',
  `url("file://${resolve(ROOT, "src/fonts")}/`,
);
const body = createRenderer(doc)(song)
  .map(String)
  .join("\n");

process.stdout.write(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeText(song.title ?? "Untitled")} — sofo</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <song-sheet>
${body}
    </song-sheet>
  </body>
</html>
`);
