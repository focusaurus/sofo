/**
 * Structural edits: duplicating, adding, moving and deleting sections, phrases
 * and bars.
 *
 * Every function is pure — it takes a song and returns a new one — so the UI
 * never half-applies a change, and undo is a matter of keeping the previous
 * object. Callers address targets by index, matching the `data-path` scheme used
 * for leaf editing.
 *
 * Repetition with variation is the point of the format: the normal way to write
 * a second chorus that ends differently is to duplicate the first and change one
 * bar, so duplication is a first-class operation rather than copy-paste.
 */

const clone = (value) => structuredClone(value);

/** A fresh section: one 4-bar phrase, no chords yet. */
export function blankSection(name = "verse") {
  return { name, phrases: [{ chords: ["", "", "", ""] }] };
}

/** A fresh phrase matching the bar count of the one it follows. */
function blankPhrase(bars = 4) {
  return { chords: Array.from({ length: bars }, () => "") };
}

const withSections = (song, sections) => ({ ...clone(song), sections });

const sectionsOf = (song) => clone(song.sections ?? []);

/** Insert a copy of a section directly after it, so variations sit together. */
export function duplicateSection(song, index) {
  const sections = sectionsOf(song);
  if (!sections[index]) return song;
  sections.splice(index + 1, 0, clone(sections[index]));
  return withSections(song, sections);
}

export function deleteSection(song, index) {
  const sections = sectionsOf(song);
  if (!sections[index]) return song;
  sections.splice(index, 1);
  return withSections(song, sections);
}

/** Move a section by `delta` places, clamped to the ends. */
export function moveSection(song, index, delta) {
  const sections = sectionsOf(song);
  const to = index + delta;
  if (!sections[index] || to < 0 || to >= sections.length) return song;
  const [moved] = sections.splice(index, 1);
  sections.splice(to, 0, moved);
  return withSections(song, sections);
}

/** Add a new empty section after `index`; pass -1 to prepend. */
export function addSection(song, index, name) {
  const sections = sectionsOf(song);
  sections.splice(index + 1, 0, blankSection(name));
  return withSections(song, sections);
}

export function duplicatePhrase(song, sectionIndex, phraseIndex) {
  const sections = sectionsOf(song);
  const phrases = sections[sectionIndex]?.phrases;
  if (!phrases?.[phraseIndex]) return song;
  phrases.splice(phraseIndex + 1, 0, clone(phrases[phraseIndex]));
  return withSections(song, sections);
}

export function deletePhrase(song, sectionIndex, phraseIndex) {
  const sections = sectionsOf(song);
  const phrases = sections[sectionIndex]?.phrases;
  if (!phrases?.[phraseIndex]) return song;
  phrases.splice(phraseIndex, 1);
  return withSections(song, sections);
}

export function movePhrase(song, sectionIndex, phraseIndex, delta) {
  const sections = sectionsOf(song);
  const phrases = sections[sectionIndex]?.phrases;
  const to = phraseIndex + delta;
  if (!phrases?.[phraseIndex] || to < 0 || to >= phrases.length) return song;
  const [moved] = phrases.splice(phraseIndex, 1);
  phrases.splice(to, 0, moved);
  return withSections(song, sections);
}

/** Add a phrase after `phraseIndex`, the same length as its neighbour. */
export function addPhrase(song, sectionIndex, phraseIndex) {
  const sections = sectionsOf(song);
  const phrases = sections[sectionIndex]?.phrases;
  if (!phrases) return song;
  const bars = phrases[phraseIndex]?.chords?.length ?? 4;
  phrases.splice(phraseIndex + 1, 0, blankPhrase(bars));
  return withSections(song, sections);
}

/** Append an empty bar to a phrase. */
export function addBar(song, sectionIndex, phraseIndex) {
  const sections = sectionsOf(song);
  const phrase = sections[sectionIndex]?.phrases?.[phraseIndex];
  if (!phrase) return song;
  phrase.chords = [...(phrase.chords ?? []), ""];
  return withSections(song, sections);
}

/**
 * Drop the last bar of a phrase, never below one — a zero-bar phrase would
 * vanish from the page with no way to click it back.
 */
export function removeBar(song, sectionIndex, phraseIndex) {
  const sections = sectionsOf(song);
  const phrase = sections[sectionIndex]?.phrases?.[phraseIndex];
  if (!phrase?.chords || phrase.chords.length <= 1) return song;
  phrase.chords = phrase.chords.slice(0, -1);
  return withSections(song, sections);
}

/**
 * Actions the UI can name in a data-action attribute. Each takes the song and
 * the integer dataset from the clicked button.
 */
export const ACTIONS = {
  "section-duplicate": (song, { section }) => duplicateSection(song, section),
  "section-delete": (song, { section }) => deleteSection(song, section),
  "section-up": (song, { section }) => moveSection(song, section, -1),
  "section-down": (song, { section }) => moveSection(song, section, 1),
  "section-add": (song, { section }) => addSection(song, section),
  "phrase-duplicate": (song, { section, phrase }) => duplicatePhrase(song, section, phrase),
  "phrase-delete": (song, { section, phrase }) => deletePhrase(song, section, phrase),
  "phrase-add": (song, { section, phrase }) => addPhrase(song, section, phrase),
  "phrase-left": (song, { section, phrase }) => movePhrase(song, section, phrase, -1),
  "phrase-right": (song, { section, phrase }) => movePhrase(song, section, phrase, 1),
  "bar-add": (song, { section, phrase }) => addBar(song, section, phrase),
  "bar-remove": (song, { section, phrase }) => removeBar(song, section, phrase),
};
