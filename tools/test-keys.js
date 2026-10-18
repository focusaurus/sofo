#!/usr/bin/env node
/**
 * Keyboard map and cursor-movement checks. Run: node tools/test-keys.js
 *
 * The movement functions are pure over song data, so all of this runs headless.
 * What the DOM adds — drawing the ring, scrolling it into view — is not testable
 * here and has to be looked at in a browser.
 */
import { readFileSync } from "node:fs";
import { normalizeSong } from "../src/song.js";
import { BINDINGS, GROUPS, findBinding } from "../src/keys.js";
import { barAt, barPaths, getPath, nearestBarPath, phrasePaths, stepPhraseBarPath } from "../src/edit.js";
import { ACTIONS, deleteSection } from "../src/structure.js";

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

const song = normalizeSong(JSON.parse(readFileSync("songs/vibe-coding.sf.json", "utf8")));
const bar = (s, p, k) => `sections.${s}.phrases.${p}.chords.${k}`;

console.log("# No key means two things");
const seen = new Map();
for (const b of BINDINGS) {
  const id = `${b.key}${b.shift ? "+shift" : ""}${b.alt ? "+alt" : ""}`;
  if (seen.has(id)) failures++;
  if (seen.has(id)) console.log(`FAIL ${id} is bound twice: ${seen.get(id)} and ${b.label}`);
  seen.set(id, b.label);
}
check(seen.size, BINDINGS.length, `every binding is unique: ${seen.size}`);
check(
  BINDINGS.every((b) => b.show && b.group && b.label && typeof b.run === "function"),
  true,
  "every binding is showable and runnable",
);

console.log("\n# Bindings only answer to bare keys");
check(findBinding({ key: "ArrowRight" })?.label, "Next bar", "a bare arrow matches");
check(findBinding({ key: "Tab", shiftKey: true })?.label, "Previous bar", "Shift+Tab is its own binding");
check(findBinding({ key: "Tab" })?.label, "Next bar", "and plain Tab is the other");
check(findBinding({ key: "ArrowRight", ctrlKey: true }), null, "Ctrl belongs to the browser");
check(findBinding({ key: "ArrowRight", metaKey: true }), null, "so does Cmd");
check(findBinding({ key: "ArrowRight", altKey: true })?.group, "Structure", "Alt is the move-things modifier");
check(findBinding({ key: "q" }), null, "an unbound key is not a command");

console.log("\n# Keys that would trap focus give themselves back");
const needs = (key) => findBinding({ key })?.needsCursor === true;
check([needs("Tab"), needs("Enter"), needs("Escape")], [true, true, true], "Tab, Enter and Esc wait for a cursor");
check(needs("ArrowRight"), false, "an arrow seeds one instead");

console.log("\n# Shift is only ever 'remove', and only for the three nouns");
// A printable key carries its own shift state in event.key, so "B" is the whole
// binding — the map must not also be asking for shiftKey on those.
const shifted = BINDINGS.filter((b) => b.key.length === 1 && b.key !== b.key.toLowerCase());
check(shifted.map((b) => b.key).sort(), ["B", "D", "P", "S"], "the only capital letters bound");
check(
  BINDINGS.filter((b) => b.shift).map((b) => b.key),
  ["Tab"],
  "and the shift flag is only used by named keys",
);
for (const [lower, upper] of [["b", "B"], ["p", "P"], ["s", "S"]]) {
  const add = findBinding({ key: lower });
  const remove = findBinding({ key: upper, shiftKey: true });
  check(
    [/^Add/.test(add.label), /^(Remove|Delete)/.test(remove.label)],
    [true, true],
    `${lower} adds and ${upper} removes`,
  );
}

console.log("\n# A capital letter is reachable, and is not its lowercase twin");
check(findBinding({ key: "B", shiftKey: true })?.label, "Remove the last bar of this phrase", "Shift+b finds B");
check(findBinding({ key: "b" })?.label, "Add a bar to this phrase", "and plain b is still add");
check(findBinding({ key: "?", shiftKey: true })?.label, "This list", "? works though it needs Shift to type");

console.log("\n# Alt is the modifier for moving things, and only that");
check(findBinding({ key: "ArrowLeft", altKey: true })?.label, "Move this phrase left", "Alt+← moves a phrase");
check(findBinding({ key: "ArrowLeft" })?.label, "Previous bar", "bare ← still just moves the cursor");
check(
  BINDINGS.filter((b) => b.alt).every((b) => b.group === "Structure"),
  true,
  "every Alt binding is structural",
);

console.log("\n# Every structural key names an operation that exists");
const named = BINDINGS.filter((b) => b.group === "Structure");
const calls = new Set();
for (const b of named) {
  b.run({ act: (action) => calls.add(action) });
}
check(named.length, calls.size, `each structural key runs one distinct action: ${calls.size}`);
check([...calls].filter((a) => !(a in ACTIONS)), [], "and every one is in the registry");
check([...Object.keys(ACTIONS)].filter((a) => !calls.has(a)), [], "no registry action is unreachable by keyboard");

console.log("\n# Jump keys resolve to real paths");
// A section with two phrases, so the phrase-scoped jump has somewhere real to go.
const at = { section: 1, phrase: 1, song };
const jumps = BINDINGS.filter((b) => b.group === "Jump");
const paths = jumps.map((b) => {
  let resolved;
  b.run({ jump: (fn) => (resolved = fn(at)) });
  return resolved;
});
check(paths.length, jumps.length, `every jump key resolves: ${paths.length}`);
check(new Set(paths).size, paths.length, "no two jump keys go to the same field");
// A jump target does not have to hold a value yet — an instrumental phrase has no
// `lyrics` key at all — but the thing that would contain it has to be real, or the
// path addresses nowhere and the editor would have nothing to write back into.
// Edit mode renders an empty box for each of these, which is the click target.
const container = (path) => path.split(".").slice(0, -1).join(".");
check(
  paths.filter((p) => (container(p) ? getPath(song, container(p)) : song) === undefined),
  [],
  "and every path names a place that exists",
);
check(
  jumps.filter((b) => !b.needsCursor).map((b) => b.key).sort(),
  ["#", "a", "c", "e", "g", "i", "k", "m", "t"],
  "song-level jumps work without a cursor",
);
check(
  jumps.filter((b) => b.needsCursor).map((b) => b.key).sort(),
  ["h", "l", "n"],
  "and the section-scoped ones wait for one",
);

console.log("\n# The feel is written back to whichever key the file used");
let groove;
findBinding({ key: "g" }).run({ jump: (fn) => (groove = fn({ song: { groove: "shuffle" } })) });
check(groove, "groove", "a groove stays a groove");
findBinding({ key: "g" }).run({ jump: (fn) => (groove = fn({ song: { feel: "shuffle" } })) });
check(groove, "feel", "and a file written with feel keeps feel");

console.log("\n# The cheat sheet can render the whole table");
check(GROUPS, ["Move", "Edit", "Structure", "Jump"], "groups, in declaration order");
check(
  BINDINGS.filter((b) => !GROUPS.includes(b.group)),
  [],
  "no binding is left out of a group",
);

console.log("\n# A bar path is readable back out");
check(barAt(bar(2, 1, 3)), { section: 2, phrase: 1, bar: 3 }, "indexes come back");
check(barAt("title"), null, "a field is not a bar");
check(barAt(null), null, "and neither is nothing");

console.log("\n# Phrases are addressable in reading order");
const phrases = phrasePaths(song);
check(phrases[0], "sections.0.phrases.0", "starts at the first phrase");
check(phrases.length, song.sections.reduce((n, s) => n + s.phrases.length, 0), "every phrase is listed");

console.log("\n# Down and up hold the position in the phrase");
check(stepPhraseBarPath(song, bar(1, 0, 2), 1), bar(1, 1, 2), "down keeps bar 3 of the line");
check(stepPhraseBarPath(song, bar(1, 1, 2), -1), bar(1, 0, 2), "up comes back to it");
check(stepPhraseBarPath(song, bar(0, 0, 0), -1), null, "nothing above the first phrase");
check(stepPhraseBarPath(song, bar(10, 1, 0), 1), null, "nothing below the last one");
check(stepPhraseBarPath(song, "title", 1), null, "a field cannot step");

console.log("\n# Down crosses into the next section, and clamps to a shorter phrase");
const short = normalizeSong({
  sections: [
    { name: "verse", phrases: [{ chords: ["C", "F", "G", "Am"] }] },
    { name: "chorus", phrases: [{ chords: ["C", "F"] }] },
  ],
});
check(stepPhraseBarPath(short, bar(0, 0, 1), 1), bar(1, 0, 1), "bar 2 to bar 2 across sections");
check(stepPhraseBarPath(short, bar(0, 0, 3), 1), bar(1, 0, 1), "bar 4 clamps to the last bar there");
check(stepPhraseBarPath(short, bar(1, 0, 1), -1), bar(0, 0, 1), "and back up to bar 2");

console.log("\n# A phrase with no bars is stepped over, not landed on");
const gap = normalizeSong({
  sections: [
    { name: "verse", phrases: [{ chords: ["C", "F"] }, { chords: [] }, { chords: ["G", "Am"] }] },
  ],
});
check(stepPhraseBarPath(gap, bar(0, 0, 1), 1), bar(0, 2, 1), "skips the empty phrase");
check(stepPhraseBarPath(gap, bar(0, 2, 0), -1), bar(0, 0, 0), "and skips it going back");

console.log("\n# The cursor survives the chart changing under it");
// Paths are positional, so deleting a section pulls the ones after it into its
// slot and a cursor in the middle of the chart legitimately keeps its place. Only
// a delete at the end, or a phrase that got shorter, leaves an actual hole.
check(nearestBarPath(song, bar(1, 0, 2)), bar(1, 0, 2), "a bar that still exists stays put");
const last = song.sections.length - 1;
const cut = deleteSection(song, last);
const held = nearestBarPath(cut, bar(last, 0, 0));
check(barPaths(cut).includes(held), true, "a deleted bar lands on one that exists");
check(held, barPaths(cut).at(-1), "the last bar still in front of where it was");
const shrunk = normalizeSong({ sections: [{ name: "verse", phrases: [{ chords: ["C", "F"] }] }] });
check(nearestBarPath(shrunk, bar(0, 0, 3)), bar(0, 0, 1), "a shortened phrase pulls the cursor back to its last bar");
check(nearestBarPath(song, "title"), bar(0, 0, 0), "a non-bar path falls back to the first bar");
check(nearestBarPath(normalizeSong({ sections: [] }), bar(0, 0, 0)), null, "a chart with no bars has nowhere to be");

console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);
