#!/usr/bin/env node
/**
 * Schema checks. Run: node tools/test-schema.js
 *
 * Two jobs. First, every song in the repo has to validate against the schema it
 * declares — a schema nobody validates against drifts from the files within a
 * week. Second, the schema and the code have to agree on the version URL, so the
 * documents the app writes cannot end up pointing at a schema that is not there.
 */
import { readFileSync, readdirSync } from "node:fs";
import { SCHEMA_URL, normalizeSong } from "../src/song.js";
import { blankSong } from "../src/structure.js";
import { validate } from "./schema.js";

let failures = 0;
const brief = (v) => {
  const s = String(v);
  return s.length > 72 ? `${s.slice(0, 72)}…` : s;
};
const check = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: ${brief(a)}${ok ? "" : ` (want ${brief(e)})`}`);
};

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const schemaFile = "schema/sf-1.schema.json";
const schema = read(schemaFile);

console.log("# The schema document identifies its own version");
check(schema.sofoSchemaVersion, 1, "version");
check(schema.sofoSchemaDate, "20260801", "date");
check(schema.$id, SCHEMA_URL, "the code writes the $id the schema claims");
check(schema.properties.$schema.const, SCHEMA_URL, "documents must declare that same URL");
check(schema.$id.endsWith(`/${schemaFile}`), true, "$id resolves to where the file is served from");

console.log("\n# Every song in the repo validates");
const songs = readdirSync("songs").filter((f) => f.endsWith(".sf.json"));
check(songs.length > 0, true, `songs found: ${songs.length}`);
for (const file of songs) {
  const song = read(`songs/${file}`);
  check(song.$schema, SCHEMA_URL, `${file} declares the schema`);
  check(validate(schema, song), [], `${file} validates`);
  // Canonical form is what the app saves, so it has to validate too — the
  // shorthands are an input convenience, not a second format.
  check(validate(schema, normalizeSong(song)), [], `${file} still validates once normalized`);
}

console.log("\n# A new chart is a valid document from the first keystroke");
const fresh = blankSong();
check(fresh.$schema, SCHEMA_URL, "blank song declares the schema");
check(validate(schema, fresh), [], "blank song validates");
check(Object.keys(fresh)[0], "$schema", "and leads with it, so a saved file says what it is");

console.log("\n# Loading stamps the current schema on an older document");
const untagged = { title: "Old", sections: [{ name: "verse", bars: 4 }] };
check(normalizeSong(untagged).$schema, SCHEMA_URL, "a file with no $schema gains one");
check(validate(schema, normalizeSong(untagged)), [], "and the result validates");
check(normalizeSong({ ...untagged, $schema: "http://example.com/old" }).$schema, SCHEMA_URL, "a stale declaration is replaced");

console.log("\n# The shorthands documented in the schema are accepted");
for (const [what, section] of [
  ["bar count", { name: "solo", bars: 8 }],
  ["section-level chords", { name: "vamp", chords: ["C", ["F", "G"]] }],
  ["section-level lyrics", { name: "verse", chords: ["C"], lyrics: ["hi"] }],
  ["phrase bar count", { name: "intro", phrases: [{ bars: 4 }] }],
]) {
  check(validate(schema, { sections: [section] }), [], `${what} validates`);
}

console.log("\n# The validator actually rejects things");
const bad = [
  ["a missing section name", { sections: [{ phrases: [] }] }],
  ["no sections at all", { title: "x" }],
  ["an empty sections array", { sections: [] }],
  ["a misspelled field", { sections: [{ name: "verse" }], tempoo: 120 }],
  ["a string tempo", { sections: [{ name: "verse" }], tempo: "120" }],
  ["a tempo of zero", { sections: [{ name: "verse" }], tempo: 0 }],
  ["an unknown tempo unit", { sections: [{ name: "verse" }], tempoUnit: "sixteenth" }],
  ["a malformed time signature", { sections: [{ name: "verse" }], time: "four four" }],
  ["notes as one string", { sections: [{ name: "verse" }], notes: "watch the stop" }],
  ["a chord that is not a string", { sections: [{ name: "verse", chords: [7] }] }],
  ["an empty split bar", { sections: [{ name: "verse", chords: [[]] }] }],
  ["a wrong $schema", { $schema: "http://example.com/nope", sections: [{ name: "verse" }] }],
];
for (const [what, doc] of bad) {
  check(validate(schema, doc).length > 0, true, `rejects ${what}`);
}

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
