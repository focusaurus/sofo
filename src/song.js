/**
 * Song data helpers. Pure functions over the JSON document — no DOM here.
 */

/**
 * The format this build reads and writes. Every document carries it in its own
 * `$schema` member, so a file found on its own says which version it is — and an
 * editor with schema support offers completion and validation from it.
 *
 * Versioning is by URL: a change that would make an older reader wrong ships as
 * `sf-2.schema.json` alongside this one, and `normalizeSong` becomes the place
 * that reads the incoming `$schema` and upgrades. Additive changes — a new
 * optional field — stay in version 1 and bump `sofoSchemaDate` in the schema.
 */
export const SCHEMA_URL = "https://sofo.peterlyons.org/schema/sf-1.schema.json";

/** Section names we know how to color and title-case. */
export const SECTION_TYPES = [
  "intro",
  "verse",
  "prechorus",
  "chorus",
  "bridge",
  "interlude",
  "solo",
  "breakdown",
  "vamp",
  "outro",
];

/** "prechorus" -> "Pre-Chorus", "verse" -> "Verse", "double chorus" -> "Double Chorus" */
function titleCase(name) {
  if (name.toLowerCase() === "prechorus") return "Pre-Chorus";
  return name.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

/** Canonical type slug used for the color scheme, or "other". */
export function sectionType(name) {
  const slug = name.toLowerCase().replace(/[^a-z]/g, "");
  return SECTION_TYPES.includes(slug) ? slug : "other";
}

/**
 * Section labels, numbered only when a name is used more than once:
 * intro, verse, chorus, verse, chorus -> Intro, Verse 1, Chorus 1, Verse 2, Chorus 2
 */
export function sectionLabels(sections) {
  const totals = new Map();
  for (const s of sections) {
    const key = s.name.toLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const seen = new Map();
  return sections.map((s) => {
    const key = s.name.toLowerCase();
    const label = s.label ?? titleCase(s.name);
    if (totals.get(key) === 1) return label;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    return `${label} ${n}`;
  });
}

/**
 * Normalize a section's harmony into phrases of bars of chords, so the renderer
 * has exactly one shape to draw. Accepted spellings, loosest to strictest:
 *
 *   { bars: 8 }                          -> one 8-bar phrase, no chords
 *   { chords: ["C", "F"] }               -> one 2-bar phrase
 *   { phrases: [{ chords: [...] }] }     -> as written
 *   { phrases: [{ bars: 4 }] }           -> a 4-bar phrase with no chords
 *
 * A bar is an array of chord strings; "" means "keep playing the last chord",
 * which is why empty bars render blank rather than repeating the symbol.
 */
export function phrasesOf(section) {
  // Only the shorthands the section actually used are copied onto the implied
  // phrase: writing `lyrics: section.lyrics` unconditionally would leave an
  // explicit `lyrics: undefined` behind on an instrumental section, which is a
  // key the canonical shape does not have.
  const implied = {};
  for (const key of ["chords", "bars", "lyrics"]) {
    if (section[key] !== undefined) implied[key] = section[key];
  }
  const raw = section.phrases ?? [implied];
  return raw.map((phrase, index) => {
    const chords = phrase.chords ?? [];
    const count = Math.max(chords.length, Number(phrase.bars) || 0);
    const bars = [];
    for (let i = 0; i < count; i++) {
      const bar = chords[i] ?? "";
      bars.push([].concat(bar).filter((c) => c !== "" && c != null));
    }
    // `index` is the phrase's position in the section's own phrases array, kept
    // so editing can address it by path even after empty phrases are filtered
    // out or the row packer regroups them.
    return { ...phrase, bars, index };
  });
}

/**
 * Expand every shorthand into the canonical shape: each section has a phrases
 * array, each phrase a chords array. Editing addresses data by path
 * ("sections.2.phrases.1.chords.3"), so the shape has to be predictable —
 * a section written as `{bars: 8}` has no path to put a chord at.
 *
 * Bars are stored as "" (continue previous chord), a single symbol, or an array
 * of symbols sharing the measure.
 *
 * This is also where the document's `$schema` is stamped: normalizing is the one
 * gate every song passes through on the way in, so anything the app saves comes
 * back out declaring the version it was written as. A future version bump reads
 * the incoming value here and migrates before normalizing.
 */
export function normalizeSong(song) {
  const { $schema, ...rest } = song;
  return {
    $schema: SCHEMA_URL,
    ...rest,
    sections: (song.sections ?? []).map((section) => {
      const { chords, bars, lyrics, ...rest } = section;
      return {
        ...rest,
        phrases: phrasesOf(section).map((phrase) => {
          const { bars: barList, index, ...keep } = phrase;
          return {
            ...keep,
            chords: barList.map((barChords) => {
              if (!barChords.length) return "";
              return barChords.length === 1 ? barChords[0] : barChords;
            }),
          };
        }),
      };
    }),
  };
}

/**
 * Pack a section's phrases into rows of at most `maxBars` bars, so a 16-bar
 * section reads as two 8-bar lines instead of sixteen slivers. Phrases are
 * never split across rows; a phrase longer than maxBars gets a row to itself.
 */
export function phraseRows(section, maxBars = 8) {
  const rows = [];
  let row = [];
  let bars = 0;
  for (const phrase of phrasesOf(section)) {
    if (!phrase.bars.length) continue;
    if (row.length && bars + phrase.bars.length > maxBars) {
      rows.push(row);
      row = [];
      bars = 0;
    }
    row.push(phrase);
    bars += phrase.bars.length;
  }
  if (row.length) rows.push(row);
  return rows;
}

/** Total bar count for a section, used for the bar-count badge. */
export function barCount(section) {
  return phrasesOf(section).reduce((n, p) => n + p.bars.length, 0);
}

/**
 * Note values a tempo can be counted in. `beam` is how many flags the drawn
 * glyph gets, `hollow` whether the notehead is open, `dot` whether it is dotted.
 */
export const TEMPO_UNITS = {
  half: { label: "Half note", hollow: true, flags: 0, dot: false },
  "dotted-half": { label: "Dotted half note", hollow: true, flags: 0, dot: true },
  quarter: { label: "Quarter note", hollow: false, flags: 0, dot: false },
  "dotted-quarter": { label: "Dotted quarter note", hollow: false, flags: 0, dot: true },
  eighth: { label: "Eighth note", hollow: false, flags: 1, dot: false },
};

/** Compound meters are felt in dotted-quarter pulses, not quarters. */
export function isCompoundTime(time) {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(time ?? ""));
  if (!m) return false;
  const [, beats, division] = m.map(Number);
  return division === 8 && beats % 3 === 0 && beats > 3;
}

/**
 * Which note value the tempo counts. Explicit `tempoUnit` wins; otherwise 6/8,
 * 9/8 and 12/8 default to a dotted quarter and everything else to a quarter,
 * which is what a musician would assume from the time signature alone.
 */
export function tempoUnitOf(song) {
  if (song.tempoUnit && song.tempoUnit in TEMPO_UNITS) return song.tempoUnit;
  return isCompoundTime(song.time) ? "dotted-quarter" : "quarter";
}

/**
 * Which key the feel is stored under. `feel` is an accepted alias for `groove`,
 * so an edit has to write back to whichever one the file already used rather than
 * silently leaving a stale second copy behind.
 */
export function groovePath(song) {
  return song.feel != null && song.groove == null ? "feel" : "groove";
}

/**
 * The "starting notes" facts, in reading order, skipping anything absent.
 * Groove leads: it is the first thing a band needs and the last thing a chord
 * chart usually says. Count-off is deliberately excluded — it runs long enough
 * to wrap badly in a row of short chips, so the renderer gives it its own line.
 */
export function startingNotes(song, { includeEmpty = false } = {}) {
  const facts = [
    { label: "Key", value: song.key, path: "key" },
    { label: "Time", value: song.time, path: "time" },
    // Declared numeric so an edit stores 120, not "120", even when the field
    // started out empty and there is no previous number to infer the type from.
    // `unit` makes the renderer draw a note-value glyph before the number.
    {
      label: "Tempo",
      value: song.tempo == null ? "" : `${song.tempo}`,
      path: "tempo",
      edit: "number",
      kind: "tempo",
      unit: tempoUnitOf(song),
    },
    {
      label: "Feel",
      value: song.groove ?? song.feel,
      path: groovePath(song),
      kind: "groove",
    },
  ];
  // In edit mode empty facts still render, so there is something to click on to
  // fill them in.
  return includeEmpty ? facts : facts.filter((f) => f.value);
}

/** ISO timestamp -> "2026-07-26" in the viewer's locale-neutral form. */
export function formatUpdated(updated) {
  if (!updated) return "";
  const d = new Date(updated);
  if (Number.isNaN(d.getTime())) return String(updated);
  return d.toISOString().slice(0, 10);
}
