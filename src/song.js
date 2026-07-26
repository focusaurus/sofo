/**
 * Song data helpers. Pure functions over the JSON document — no DOM here.
 */

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
  const raw = section.phrases ?? [
    { chords: section.chords, bars: section.bars, lyrics: section.lyrics },
  ];
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
 */
export function normalizeSong(song) {
  return {
    ...song,
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
 * The "starting notes" facts, in reading order, skipping anything absent.
 * Groove leads: it is the first thing a band needs and the last thing a chord
 * chart usually says. Count-off is deliberately excluded — it runs long enough
 * to wrap badly in a row of short chips, so the renderer gives it its own line.
 */
export function startingNotes(song, { includeEmpty = false } = {}) {
  const facts = [
    { label: "Key", value: song.key, path: "key" },
    { label: "Time", value: song.time, path: "time" },
    { label: "Tempo", value: song.tempo == null ? "" : `${song.tempo}`, path: "tempo" },
    {
      label: "Feel",
      value: song.groove ?? song.feel,
      path: song.feel != null && song.groove == null ? "feel" : "groove",
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
