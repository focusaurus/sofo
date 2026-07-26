#!/usr/bin/env node
/**
 * Transposition checks. Run: node tools/test-transpose.js
 *
 * These are the cases where naive semitone math goes wrong, so they are worth
 * asserting rather than eyeballing in a PDF.
 */
import { INSTRUMENTS, transposeChord, transposeKey, transposeNote } from "../src/transpose.js";

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

console.log(`\n${failures ? `${failures} FAILED` : "all passed"}`);
process.exit(failures ? 1 : 0);
