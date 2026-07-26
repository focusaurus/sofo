#!/usr/bin/env node
/**
 * Structural editing checks. Run: node tools/test-structure.js
 *
 * The operations are pure, so these run headless with no DOM. What matters most
 * is that nothing aliases: a duplicated section must not share arrays with its
 * original, or editing the copy would silently change the source.
 */
import { readFileSync } from "node:fs";
import { normalizeSong, sectionLabels, barCount } from "../src/song.js";
import {
  ACTIONS,
  addBar,
  addPhrase,
  addSection,
  blankSection,
  deletePhrase,
  deleteSection,
  duplicatePhrase,
  duplicateSection,
  moveSection,
  movePhrase,
  removeBar,
} from "../src/structure.js";

let failures = 0;
const brief = (s) => (s.length > 72 ? `${s.slice(0, 72)}…` : s);
const check = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: ${brief(a)}${ok ? "" : ` (want ${brief(e)})`}`);
};

const song = normalizeSong(JSON.parse(readFileSync("songs/vibe-coding.json", "utf8")));
const names = (s) => s.sections.map((x) => x.name);

console.log("# Duplicating a section");
const dup = duplicateSection(song, 3); // chorus 1
check(names(dup).slice(2, 6), ["prechorus", "chorus", "chorus", "verse"], "copy lands right after");
check(dup.sections.length, song.sections.length + 1, "one more section");
check(
  sectionLabels(dup.sections).filter((l) => l.startsWith("Chorus")),
  ["Chorus 1", "Chorus 2", "Chorus 3", "Chorus 4"],
  "labels renumber automatically",
);

console.log("\n# Duplicates are deep copies, not aliases");
const varied = structuredClone(dup);
varied.sections[4].phrases[0].chords[0] = "Fmaj7";
check(varied.sections[3].phrases[0].chords[0], "C", "editing the copy leaves the original alone");
const dup2 = duplicateSection(song, 3);
dup2.sections[4].phrases[0].lyrics[0] = "changed";
check(
  dup2.sections[3].phrases[0].lyrics[0],
  "Vibe code the chart, let the color do the talking,",
  "lyric arrays are not shared",
);
check(song.sections.length, 11, "the source song is never mutated");

console.log("\n# Moving sections");
check(names(moveSection(song, 0, 1)).slice(0, 2), ["verse", "intro"], "move down swaps");
check(names(moveSection(song, 1, -1)).slice(0, 2), ["verse", "intro"], "move up swaps");
check(names(moveSection(song, 0, -1)), names(song), "cannot move the first section up");
check(names(moveSection(song, 10, 1)), names(song), "cannot move the last section down");

console.log("\n# Adding and deleting sections");
check(names(addSection(song, 0))[1], "verse", "new section lands after the target");
check(addSection(song, 0).sections[1].phrases[0].chords, ["", "", "", ""], "new section is 4 empty bars");
check(names(addSection(song, -1))[0], "verse", "index -1 prepends");
check(deleteSection(song, 0).sections.length, 10, "delete removes one");
check(names(deleteSection(song, 0))[0], "verse", "delete removes the right one");
check(blankSection("bridge").name, "bridge", "blank section takes a name");

console.log("\n# Phrases");
check(duplicatePhrase(song, 3, 0).sections[3].phrases.length, 3, "duplicate adds a phrase");
check(
  duplicatePhrase(song, 3, 0).sections[3].phrases[1].chords,
  ["C", "D", "G", ""],
  "the copy matches the original",
);
check(deletePhrase(song, 3, 0).sections[3].phrases.length, 1, "delete removes a phrase");
check(addPhrase(song, 3, 0).sections[3].phrases[1].chords, ["", "", "", ""], "new phrase is empty");
check(addPhrase(song, 10, 1).sections[10].phrases[2].chords, ["", ""], "new phrase matches its neighbour's length");
check(
  movePhrase(song, 10, 0, 1).sections[10].phrases.map((p) => p.chords.length),
  [2, 4],
  "phrases reorder",
);
check(movePhrase(song, 10, 0, -1).sections[10].phrases[0].chords.length, 4, "cannot move first phrase left");

console.log("\n# Bars");
check(addBar(song, 2, 0).sections[2].phrases[0].chords.length, 5, "add bar appends");
check(addBar(song, 2, 0).sections[2].phrases[0].chords[4], "", "added bar is empty");
check(removeBar(song, 2, 0).sections[2].phrases[0].chords, ["Em7", "C6", "Am7"], "remove bar drops the last");
check(barCount(removeBar(song, 2, 0).sections[2]), 3, "bar count follows");
const oneBar = { sections: [{ name: "vamp", phrases: [{ chords: ["C"] }] }] };
check(removeBar(oneBar, 0, 0).sections[0].phrases[0].chords, ["C"], "never removes the last bar");

console.log("\n# Out-of-range targets are no-ops, not crashes");
check(duplicateSection(song, 99).sections.length, 11, "bad section index");
check(duplicatePhrase(song, 99, 0).sections.length, 11, "bad section for phrase op");
check(addBar(song, 0, 99).sections.length, 11, "bad phrase index");
check(deletePhrase(song, 0, 99).sections[0].phrases.length, 2, "bad phrase delete");

console.log("\n# Every UI action is wired to a real operation");
const expected = [
  "section-duplicate", "section-delete", "section-up", "section-down", "section-add",
  "phrase-duplicate", "phrase-delete", "phrase-add", "phrase-left", "phrase-right",
  "bar-add", "bar-remove",
];
check(Object.keys(ACTIONS), expected, "action registry");
check(
  Object.values(ACTIONS).every((fn) => typeof fn === "function"),
  true,
  "all actions callable",
);
check(
  ACTIONS["section-duplicate"](song, { section: 0 }).sections.length,
  12,
  "dispatching through the registry works",
);

console.log(`\n${failures ? `${failures} FAILED` : "all passed"}`);
process.exit(failures ? 1 : 0);
