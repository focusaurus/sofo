#!/usr/bin/env node
/**
 * Render a song JSON file to standalone static HTML, with the stylesheet inlined.
 *
 * WeasyPrint (and any other non-browser PDF engine) cannot run JavaScript, so
 * checking real PDF output needs the DOM materialized ahead of time.
 *
 *   node tools/prerender.js songs/vibe-coding.sf.json Bb > /tmp/chart.html
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRenderer } from "../src/render.js";
import { normalizeSong } from "../src/song.js";
import { transposeSong } from "../src/transpose.js";
import { createDocument, escapeText } from "./dom-shim.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const [songPath, instrument = "C"] = process.argv.slice(2);
if (!songPath) {
  console.error("usage: node tools/prerender.js <song.json> [C|Bb|A|Eb|F|capo1..capo7]");
  process.exit(2);
}

const song = transposeSong(normalizeSong(JSON.parse(readFileSync(songPath, "utf8"))), instrument);
// The output HTML lands outside the repo, so relative font URLs would 404.
const css = readFileSync(resolve(ROOT, "src/sheet.css"), "utf8").replaceAll(
  'url("fonts/',
  `url("file://${resolve(ROOT, "src/fonts")}/`,
);
const body = createRenderer(createDocument())(song).map(String).join("\n");

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
