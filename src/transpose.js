/**
 * Chord and key transposition for transposing instruments.
 *
 * Harmony is always authored in concert pitch. A player reading a Bb chart needs
 * every symbol moved up a major 2nd — and crucially, spelled the way a musician
 * would write it: concert Eb becomes F, never E#.
 *
 * So transposition is diatonic, not chromatic: each interval carries both a
 * semitone distance and a letter-step distance. Moving up a major 2nd means
 * "one letter up, two semitones up", which spells E-flat -> F automatically.
 * Naive semitone math plus a lookup table cannot do this — it has no way to know
 * whether pitch class 5 should be written F or E#.
 */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_SEMITONES = [0, 2, 4, 5, 7, 9, 11];

/**
 * Written pitch relative to concert pitch, as [semitones, letterSteps].
 *
 * A Bb trumpet sounds a major 2nd below what it reads, so its part is written a
 * major 2nd above concert. Same logic for the rest: the instrument's written
 * part is transposed up by the interval it sounds down.
 */
export const INSTRUMENTS = {
  C: { label: "Concert pitch", interval: [0, 0] },
  Bb: { label: "Bb instruments", interval: [2, 1] }, // major 2nd up — trumpet, tenor/soprano sax, clarinet
  A: { label: "A instruments", interval: [3, 2] }, // minor 3rd up — clarinet in A
  Eb: { label: "Eb instruments", interval: [9, 5] }, // major 6th up — alto/baritone sax
  F: { label: "F instruments", interval: [7, 4] }, // perfect 5th up — french horn, english horn
};

/**
 * Guitar capo positions, in the same picker as the instruments: "which shapes do
 * I play" is the guitarist's version of the question a horn player asks with
 * "which key do I read".
 *
 * A capo raises everything the player fingers, so the chart has to be written
 * DOWN by the fret number — the opposite direction from every instrument above.
 * Capo 3 on a song in Bb gives G shapes, and G is what the chart shows.
 *
 * Stops at 7. Frets 1-5 are where nearly all real capo work happens, 7 is common
 * enough to keep (G shapes at the 7th is a standard trick), and past that the
 * frets are too cramped to be worth a menu entry.
 */
export const CAPO_MAX = 7;

/** Fret -> [semitones, letterSteps] down. Indexed by fret, so 0 is unused. */
const CAPO_INTERVALS = [
  null,
  [-1, -1], // minor 2nd
  [-2, -1], // major 2nd
  [-3, -2], // minor 3rd
  [-4, -2], // major 3rd
  [-5, -3], // perfect 4th
  [-6, -4], // tritone
  [-7, -4], // perfect 5th
];

for (let fret = 1; fret <= CAPO_MAX; fret++) {
  INSTRUMENTS[`capo${fret}`] = {
    label: `Capo ${fret}`,
    interval: CAPO_INTERVALS[fret],
    capo: fret,
    // Guitar shape keys are sharp keys — E, A, D, G, B, F# — so an ambiguous
    // pitch class should come out F# rather than Gb, unlike a horn chart.
    preferFlats: false,
  };
}

/** Accidental string to semitone offset: "bb" -> -2, "#" -> +1. */
function accidentalOffset(accidental) {
  let offset = 0;
  for (const ch of accidental) offset += ch === "#" ? 1 : -1;
  return offset;
}

/** Semitone offset back to an accidental string. */
function accidentalString(offset) {
  return offset >= 0 ? "#".repeat(offset) : "b".repeat(-offset);
}

/** Split a note name into letter and accidental, or null if it isn't one. */
function parseNote(name) {
  const m = /^([A-G])([#b]*)$/.exec(name);
  if (!m) return null;
  return { letter: m[1], accidental: m[2] };
}

/** Absolute pitch class 0-11 for a parsed note. */
function pitchClass({ letter, accidental }) {
  const base = LETTER_SEMITONES[LETTERS.indexOf(letter)];
  return (((base + accidentalOffset(accidental)) % 12) + 12) % 12;
}

/**
 * Transpose one note name diatonically. Returns a spelling with at most a double
 * accidental; anything worse is respelled to the simplest enharmonic, since no
 * player wants to read Fbb where E would do.
 */
export function transposeNote(name, [semitones, letterSteps], { preferFlats } = {}) {
  const note = parseNote(name);
  if (!note) return name;

  const fromLetter = LETTERS.indexOf(note.letter);
  const toLetter = (((fromLetter + letterSteps) % 7) + 7) % 7;
  const target = (pitchClass(note) + semitones) % 12;

  // How far the target pitch sits from the natural form of the destination
  // letter, normalized into -6..6 so we get the nearer direction.
  let offset = (((target - LETTER_SEMITONES[toLetter]) % 12) + 12) % 12;
  if (offset > 6) offset -= 12;

  const spelled = LETTERS[toLetter] + accidentalString(offset);
  // E#, B#, Fb and Cb are theoretically correct but nobody wants them as a
  // chord root, and double accidentals are worse. Fall back to the plain
  // enharmonic in those cases.
  if (Math.abs(offset) <= 2 && !AVOID.has(spelled)) return spelled;
  return simplest(target, preferFlats);
}

/** Single-accidental spellings that are legal but unwelcome on a chart. */
const AVOID = new Set(["E#", "B#", "Fb", "Cb"]);

/** The most readable spelling of a pitch class: natural, else one accidental. */
function simplest(pitch, preferFlats = true) {
  for (let i = 0; i < 7; i++) {
    if (LETTER_SEMITONES[i] === pitch) return LETTERS[i];
  }
  const flat = LETTERS[(LETTER_SEMITONES.indexOf((pitch + 1) % 12) + 7) % 7];
  const sharp = LETTERS[(LETTER_SEMITONES.indexOf((pitch + 11) % 12) + 7) % 7];
  const asFlat = LETTERS.includes(flat) ? `${flat}b` : null;
  const asSharp = LETTERS.includes(sharp) ? `${sharp}#` : null;
  if (preferFlats) return asFlat ?? asSharp;
  return asSharp ?? asFlat;
}

/**
 * Transpose a chord symbol, preserving quality and any slash bass.
 * "Ebmaj7" -> "Fmaj7", "Ab/Eb" -> "Bb/F". Unparseable symbols (N.C., stabs,
 * anything a player scribbled) pass through untouched.
 */
export function transposeChord(symbol, interval, opts) {
  const m = /^([A-G][#b]*)([^/]*)(?:\/([A-G][#b]*)(.*))?$/.exec(symbol.trim());
  if (!m) return symbol;
  const [, root, quality, bass, bassRest] = m;
  let out = transposeNote(root, interval, opts) + quality;
  if (bass) out += `/${transposeNote(bass, interval, opts)}${bassRest ?? ""}`;
  return out;
}

/** Transpose a key name, keeping any mode suffix: "Ebm" -> "Fm". */
export function transposeKey(key, interval, opts) {
  const m = /^([A-G][#b]*)(.*)$/.exec(String(key).trim());
  if (!m) return key;
  return transposeNote(m[1], interval, opts) + m[2];
}

/**
 * The key a player actually reads for this instrument or capo, or null when the
 * song has no key to start from. Used to label the picker with the answer the
 * player cares about ("Capo 3 — play in G") rather than the fret number alone.
 */
export function writtenKey(key, instrument) {
  const spec = INSTRUMENTS[instrument];
  if (!key || !spec) return null;
  return transposeKey(key, spec.interval, { preferFlats: spec.preferFlats ?? true });
}

/**
 * A copy of the song with all harmony and the key transposed for the given
 * instrument. Concert pitch returns the song untouched.
 *
 * Flat spellings are preferred by default, matching how horn charts in popular
 * music are conventionally written.
 */
export function transposeSong(song, instrument = "C") {
  const spec = INSTRUMENTS[instrument];
  if (!spec || instrument === "C") return song;
  const opts = { preferFlats: spec.preferFlats ?? true };
  const { interval } = spec;

  const chords = (bar) =>
    Array.isArray(bar)
      ? bar.map((c) => transposeChord(c, interval, opts))
      : transposeChord(bar, interval, opts);

  return {
    ...song,
    key: song.key ? transposeKey(song.key, interval, opts) : song.key,
    concertKey: song.key,
    transposedFor: instrument,
    sections: (song.sections ?? []).map((section) => ({
      ...section,
      ...(section.chords ? { chords: section.chords.map(chords) } : {}),
      ...(section.phrases
        ? {
            phrases: section.phrases.map((phrase) => ({
              ...phrase,
              ...(phrase.chords ? { chords: phrase.chords.map(chords) } : {}),
            })),
          }
        : {}),
    })),
  };
}
