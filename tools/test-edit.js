#!/usr/bin/env node
/**
 * Editing model checks: normalization, path addressing, and the bar text
 * round-trip. Run: node tools/test-edit.js
 *
 * These run headless against the data layer — no DOM needed, because editing
 * writes through paths into the song object rather than reading the rendered DOM.
 */
import { readFileSync } from "node:fs";
import { normalizeSong, phrasesOf, startingNotes } from "../src/song.js";
import { getPath, setPath } from "../src/edit.js";
import { createRenderer } from "../src/render.js";
import { createDocument } from "./dom-shim.js";

let failures = 0;
const brief = (s) => (s.length > 72 ? `${s.slice(0, 72)}…` : s);
const check = (actual, expected, what) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: ${brief(a)}${ok ? "" : ` (want ${brief(e)})`}`);
};

console.log("# Shorthands normalize to addressable paths");
check(normalizeSong({ sections: [{ name: "solo", bars: 4 }] }).sections[0].phrases, [
  { chords: ["", "", "", ""] },
], "{bars: 4} becomes one phrase of 4 empty bars");
check(
  normalizeSong({ sections: [{ name: "verse", chords: ["C", ["F", "G"]] }] }).sections[0].phrases,
  [{ chords: ["C", ["F", "G"]] }],
  "bare chords array becomes one phrase",
);
check(
  normalizeSong({ sections: [{ name: "v", chords: ["C"], lyrics: ["hi"] }] }).sections[0].phrases[0]
    .lyrics,
  ["hi"],
  "section-level lyrics move onto the phrase",
);

console.log("\n# Normalization preserves what it does not own");
const kept = normalizeSong({
  title: "T",
  sections: [{ name: "verse", label: "Refrain", notes: ["quiet"], chords: ["C"] }],
});
check(kept.sections[0].label, "Refrain", "explicit label survives");
check(kept.sections[0].notes, ["quiet"], "section notes survive");
check(kept.title, "T", "top-level fields survive");

console.log("\n# Round-tripping a real song is stable");
const song = normalizeSong(JSON.parse(readFileSync("songs/vibe-coding.json", "utf8")));
check(normalizeSong(song), song, "normalize is idempotent");

console.log("\n# Paths address the values the renderer emits");
check(getPath(song, "sections.0.phrases.0.chords.0"), "Gmaj7", "intro bar 1");
check(getPath(song, "sections.1.phrases.1.chords.2"), ["Bm7", "C6"], "split bar reads as array");
check(getPath(song, "sections.1.phrases.0.lyrics").length, 2, "verse 1 phrase 1 has 2 lines");
check(getPath(song, "sections.7.notes")[0], "Half time. Everybody down to a whisper, drums on rims.", "bridge note");

console.log("\n# Writes land where they are aimed");
const edited = structuredClone(song);
setPath(edited, "sections.0.phrases.0.chords.1", "Am7");
check(edited.sections[0].phrases[0].chords[1], "Am7", "chord write");
check(song.sections[0].phrases[0].chords[1], "", "original untouched by clone");
setPath(edited, "title", "New Title");
check(edited.title, "New Title", "top-level write");

console.log("\n# Phrase index survives row packing, so paths stay correct");
const outro = song.sections.at(-1);
check(phrasesOf(outro).map((p) => p.index), [0, 1], "outro phrase indexes");

console.log("\n# Edit mode exposes empty facts so they can be filled in");
check(startingNotes({}).length, 0, "read-only view hides empty facts");
check(startingNotes({}, { includeEmpty: true }).map((f) => f.path), ["key", "time", "tempo", "groove"], "edit view lists all fact paths");

console.log("\n# Rendering: edit metadata appears only in edit mode");
const readOnly = createRenderer(createDocument())(song).map(String).join("");
const editable = createRenderer(createDocument(), { editing: true })(song).map(String).join("");
check(readOnly.includes("data-path"), false, "print output carries no edit metadata");
check(readOnly.includes("data-placeholder"), false, "print output carries no placeholders");
check(editable.includes('data-path="title"'), true, "title is editable");
check(
  editable.includes('data-path="sections.0.phrases.0.chords.0" data-edit="bar"'),
  true,
  "first bar is editable",
);
check(
  editable.includes('data-path="sections.1.phrases.0.lyrics" data-edit="lines"'),
  true,
  "lyrics are editable as lines",
);
check(editable.includes('data-path="sections.8.notes"'), true, "solo section notes are editable");
check(editable.includes('data-path="endNotes"'), true, "end notes are editable");
check(editable.includes('data-path="countOff"'), true, "count-off is editable");

// Instrumental phrases have no lyrics, but still need somewhere to add them.
const soloLyricTargets = [...editable.matchAll(/data-path="sections\.8\.phrases\.\d+\.lyrics"/g)];
check(soloLyricTargets.length, 4, "every solo phrase offers a lyric target in edit mode");

console.log("\n# Structural toolbars: edit mode only");
check(readOnly.includes("data-action"), false, "print output has no action buttons");
check(readOnly.includes("<button"), false, "print output has no buttons at all");
check(readOnly.includes("song-tools"), false, "print output has no toolbars");
check(
  editable.includes('data-action="section-duplicate" title="Duplicate this section"'),
  true,
  "section duplicate button",
);
check(
  [...editable.matchAll(/data-action="section-duplicate"/g)].length,
  song.sections.length,
  "one section toolbar per section",
);
check(
  [...editable.matchAll(/data-action="phrase-duplicate"/g)].length,
  song.sections.reduce((n, s) => n + s.phrases.length, 0),
  "one phrase toolbar per phrase",
);
check(editable.includes('data-action="bar-add"'), true, "add-bar button");
check(editable.includes('data-action="bar-remove"'), true, "remove-bar button");
// The trailing add-section button targets the last index, so it appends.
const trailing = /class="sheet-tools">.*?data-action="section-add".*?data-section="(\d+)"/s.exec(editable);
check(trailing?.[1], String(song.sections.length - 1), "trailing add-section button appends at the end");

console.log("\n# Buttons carry the indexes the actions need");
const firstPhraseTool = /data-action="phrase-duplicate"[^>]*data-section="(\d+)" data-phrase="(\d+)"/.exec(editable);
check(firstPhraseTool?.slice(1), ["0", "0"], "first phrase tool addresses section 0, phrase 0");

console.log(`\n${failures ? `${failures} FAILED` : "all passed"}`);
process.exit(failures ? 1 : 0);
