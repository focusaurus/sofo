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
  const raw = section.phrases ?? [{ chords: section.chords, bars: section.bars }];
  return raw.map((phrase) => {
    const chords = phrase.chords ?? [];
    const count = Math.max(chords.length, Number(phrase.bars) || 0);
    const bars = [];
    for (let i = 0; i < count; i++) {
      const bar = chords[i] ?? "";
      bars.push([].concat(bar).filter((c) => c !== "" && c != null));
    }
    return { ...phrase, bars };
  });
}

/** Total bar count for a section, used for the bar-count badge. */
export function barCount(section) {
  return phrasesOf(section).reduce((n, p) => n + p.bars.length, 0);
}

/** The "starting notes" block, in reading order, skipping anything absent. */
export function startingNotes(song) {
  const facts = [];
  if (song.key) facts.push(["Key", song.key]);
  if (song.time) facts.push(["Time", song.time]);
  if (song.tempo) facts.push(["Tempo", `${song.tempo}`]);
  if (song.countOff) facts.push(["Count off", song.countOff]);
  return facts;
}

/** ISO timestamp -> "2026-07-26" in the viewer's locale-neutral form. */
export function formatUpdated(updated) {
  if (!updated) return "";
  const d = new Date(updated);
  if (Number.isNaN(d.getTime())) return String(updated);
  return d.toISOString().slice(0, 10);
}
