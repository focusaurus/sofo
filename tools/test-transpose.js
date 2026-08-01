#!/usr/bin/env node
/**
 * Transposition checks. Run: node tools/test-transpose.js
 *
 * These are the cases where naive semitone math goes wrong, so they are worth
 * asserting rather than eyeballing in a PDF.
 */
import {
  INSTRUMENTS,
  transposeChord,
  transposeKey,
  transposeNote,
  transposeSong,
  writtenKey,
} from "../src/transpose.js";

let failures = 0;
const check = (actual, expected, what) => {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${what}: ${actual}${ok ? "" : ` (want ${expected})`}`);
};

const bb = INSTRUMENTS.Bb.interval;
const eb = INSTRUMENTS.Eb.interval;
const f = INSTRUMENTS.F.interval;
const a = INSTRUMENTS.A.interval;

console.log("# Bb instruments: up a major 2nd");
check(transposeNote("Eb", bb), "F", "Eb -> F (not E#)");
check(transposeNote("Bb", bb), "C", "Bb -> C");
check(transposeNote("C", bb), "D", "C -> D");
check(transposeNote("B", bb), "C#", "B -> C#");
check(transposeNote("F", bb), "G", "F -> G");
check(transposeNote("Ab", bb), "Bb", "Ab -> Bb");

console.log("\n# Eb instruments: up a major 6th");
check(transposeNote("Eb", eb), "C", "Eb -> C");
check(transposeNote("C", eb), "A", "C -> A");
check(transposeNote("F", eb), "D", "F -> D");
check(transposeNote("Bb", eb), "G", "Bb -> G");

console.log("\n# F instruments: up a perfect 5th");
check(transposeNote("Eb", f), "Bb", "Eb -> Bb");
check(transposeNote("C", f), "G", "C -> G");
check(transposeNote("B", f), "F#", "B -> F#");

console.log("\n# A instruments: up a minor 3rd");
check(transposeNote("C", a), "Eb", "C -> Eb");
check(transposeNote("Eb", a), "Gb", "Eb -> Gb");

console.log("\n# Chord qualities and slash bass survive");
check(transposeChord("Ebmaj7", bb), "Fmaj7", "Ebmaj7");
check(transposeChord("Bb7sus4", bb), "C7sus4", "Bb7sus4");
check(transposeChord("Ab/Eb", bb), "Bb/F", "Ab/Eb slash bass");
check(transposeChord("Gm7", bb), "Am7", "Gm7");
check(transposeChord("C#m7b5", bb), "D#m7b5", "C#m7b5");
check(transposeChord("N.C.", bb), "N.C.", "N.C. passes through");
check(transposeChord("", bb), "", "empty bar stays empty");

console.log("\n# Keys keep their mode");
check(transposeKey("Eb", bb), "F", "Eb major");
check(transposeKey("Am", bb), "Bm", "A minor");
check(transposeKey("F#m", eb), "D#m", "F# minor for Eb");

console.log("\n# Double accidentals get respelled, not printed");
check(transposeNote("G#", eb), "F", "G# up a M6 spells F, not E#");
check(transposeNote("D#", bb), "F", "D# up a M2 spells F, not E#");

console.log("\n# Guitar capo: the chart is written DOWN by the fret number");
const capo = (fret) => INSTRUMENTS[`capo${fret}`].interval;
check(transposeKey("Bb", capo(3)), "G", "Bb with capo 3 gives G shapes");
check(transposeKey("F", capo(1)), "E", "F with capo 1 gives E shapes");
check(transposeKey("Eb", capo(6)), "A", "Eb with capo 6 gives A shapes");
check(transposeKey("A", capo(2)), "G", "A with capo 2 gives G shapes");
check(transposeKey("Bbm", capo(1)), "Am", "minor keys keep their mode");
check(transposeChord("Bbmaj7", capo(3)), "Gmaj7", "quality survives the capo");
check(transposeChord("Eb/G", capo(3)), "C/E", "slash bass moves with the root");

console.log("\n# Shape keys are spelled diatonically, like every other transposition");
// Gb rather than F# because Bb down a major 3rd IS Gb — the sharp preference
// only decides ambiguous respellings, it does not override the letter math.
check(writtenKey("Bb", "capo4"), "Gb", "Bb capo 4 spells Gb");
check(writtenKey("Ab", "capo1"), "G", "Ab capo 1 is G");
check(writtenKey(null, "capo3"), null, "a song with no key has no shape key");

console.log("\n# Capo transposes the whole song, and says so on the chart");
const capoed = transposeSong({ key: "Bb", sections: [{ chords: ["Bb", ["Eb", "F7"]] }] }, "capo3");
check(capoed.key, "G", "song key becomes the shape key");
check(capoed.concertKey, "Bb", "the sounding key is kept for the printed banner");
check(capoed.sections[0].chords[0], "G", "single-chord bar");
check(capoed.sections[0].chords[1].join(" "), "C D7", "multi-chord bar");

console.log(`\n${failures ? `${failures} FAILED` : "all passed"}`);
process.exit(failures ? 1 : 0);
