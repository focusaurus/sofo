/**
 * The keyboard map, as data.
 *
 * One table, read both by the dispatcher in edit.js and by the cheat sheet, so a
 * key cannot be documented as one thing and wired to another.
 *
 * These are bare keys, no modifier, which only works because edit mode has two
 * layers: with an editor open the letters are text, with none open they are
 * commands. Everything in here is the command layer. The text layer's keys —
 * Escape to discard, Tab and Enter to move on — belong to the control itself and
 * are handled where it is built.
 *
 * Two rules hold the set together, and both are worth keeping:
 *
 *   A letter names a thing, never an action. `b` is "bar", not "add"; what
 *   happens to the bar is the same thing that happens to a phrase under `p` and
 *   a section under `s`. Learn one and you have all three.
 *
 *   Shift means remove. Only the three structural nouns use it, so a shifted key
 *   never means anything else anywhere in the app.
 *
 * A–G are deliberately not chord shortcuts, even though they are note names. The
 * chord idiom is Enter-then-type, and because committing a bar auto-advances into
 * the next empty one, a whole section is `Enter G ⏎ C ⏎ Am7 ⏎` without ever
 * leaving the text layer. Binding bare letters to roots would save one keystroke
 * per run of bars and cost six mnemonics.
 */
import { groovePath } from "./song.js";

/**
 * Bindings in cheat-sheet order.
 *
 * `run` receives the command object edit.js builds; keeping the verbs out of this
 * file is what lets the table stay readable as it grows. `needsCursor` marks the
 * ones with nothing to act on until a bar is focused — they pass the keystroke
 * through untouched rather than swallowing it.
 */
export const BINDINGS = [
  // ---- Move ----
  { key: "ArrowLeft", show: "←", group: "Move", label: "Previous bar", run: (c) => c.moveBar(-1) },
  { key: "ArrowRight", show: "→", group: "Move", label: "Next bar", run: (c) => c.moveBar(1) },
  { key: "ArrowUp", show: "↑", group: "Move", label: "Previous phrase", run: (c) => c.movePhrase(-1) },
  { key: "ArrowDown", show: "↓", group: "Move", label: "Next phrase", run: (c) => c.movePhrase(1) },
  // Tab only belongs to the chart once there is a cursor: with none, it has to go
  // back to being the page's focus key, or edit mode is a keyboard trap.
  { key: "Tab", needsCursor: true, show: "Tab", group: "Move", label: "Next bar", run: (c) => c.moveBar(1) },
  { key: "Tab", shift: true, needsCursor: true, show: "⇧Tab", group: "Move", label: "Previous bar", run: (c) => c.moveBar(-1) },
  { key: "Home", show: "Home", group: "Move", label: "First bar of the chart", run: (c) => c.firstBar() },
  { key: "End", show: "End", group: "Move", label: "Last bar of the chart", run: (c) => c.lastBar() },

  // ---- Edit ----
  { key: "Enter", needsCursor: true, show: "Enter", group: "Edit", label: "Edit this bar — then type the chord", run: (c) => c.edit() },
  { key: "x", needsCursor: true, show: "x", group: "Edit", label: "Clear this bar — hold the chord before it", run: (c) => c.clearBar() },
  { key: "u", show: "u", group: "Edit", label: "Undo (Ctrl+Z works too)", run: (c) => c.undo() },
  { key: "?", show: "?", group: "Edit", label: "This list", run: (c) => c.help() },
  { key: "Escape", needsCursor: true, show: "Esc", group: "Edit", label: "Drop the cursor, and give Tab back to the page", run: (c) => c.dropCursor() },

  // ---- Structure ----
  // Uppercase deletes. No confirmation: undo is 50 deep and the status line says
  // what went, which is feedback rather than friction.
  { key: "b", needsCursor: true, show: "b", group: "Structure", label: "Add a bar to this phrase", run: (c) => c.act("bar-add") },
  { key: "B", needsCursor: true, show: "B", group: "Structure", label: "Remove the last bar of this phrase", run: (c) => c.act("bar-remove") },
  { key: "p", needsCursor: true, show: "p", group: "Structure", label: "Add a phrase after this one", run: (c) => c.act("phrase-add") },
  { key: "P", needsCursor: true, show: "P", group: "Structure", label: "Delete this phrase", run: (c) => c.act("phrase-delete") },
  { key: "s", needsCursor: true, show: "s", group: "Structure", label: "Add a section after this one", run: (c) => c.act("section-add") },
  { key: "S", needsCursor: true, show: "S", group: "Structure", label: "Delete this section", run: (c) => c.act("section-delete") },
  { key: "d", needsCursor: true, show: "d", group: "Structure", label: "Duplicate this phrase", run: (c) => c.act("phrase-duplicate") },
  { key: "D", needsCursor: true, show: "D", group: "Structure", label: "Duplicate this section", run: (c) => c.act("section-duplicate") },
  { key: "ArrowLeft", alt: true, needsCursor: true, show: "Alt+←", group: "Structure", label: "Move this phrase left", run: (c) => c.act("phrase-left") },
  { key: "ArrowRight", alt: true, needsCursor: true, show: "Alt+→", group: "Structure", label: "Move this phrase right", run: (c) => c.act("phrase-right") },
  { key: "ArrowUp", alt: true, needsCursor: true, show: "Alt+↑", group: "Structure", label: "Move this section up", run: (c) => c.act("section-up") },
  { key: "ArrowDown", alt: true, needsCursor: true, show: "Alt+↓", group: "Structure", label: "Move this section down", run: (c) => c.act("section-down") },

  // ---- Jump ----
  // Excursions: they open a field's editor and leave the cursor on the bar it
  // came from, so the bar stays home and b/p/s still mean something afterwards.
  { key: "t", show: "t", group: "Jump", label: "Title", run: (c) => c.jump(() => "title") },
  { key: "a", show: "a", group: "Jump", label: "Artist", run: (c) => c.jump(() => "artist") },
  { key: "k", show: "k", group: "Jump", label: "Key", run: (c) => c.jump(() => "key") },
  { key: "m", show: "m", group: "Jump", label: "Meter — the time signature", run: (c) => c.jump(() => "time") },
  { key: "#", show: "#", group: "Jump", label: "Tempo", run: (c) => c.jump(() => "tempo") },
  { key: "g", show: "g", group: "Jump", label: "Groove — the feel", run: (c) => c.jump((at) => groovePath(at.song)) },
  { key: "c", show: "c", group: "Jump", label: "Count-off", run: (c) => c.jump(() => "countOff") },
  { key: "i", show: "i", group: "Jump", label: "Intro notes — how the song starts", run: (c) => c.jump(() => "notes") },
  { key: "e", show: "e", group: "Jump", label: "End notes — how it finishes", run: (c) => c.jump(() => "endNotes") },
  { key: "h", needsCursor: true, show: "h", group: "Jump", label: "This section's heading", run: (c) => c.jump((at) => `sections.${at.section}.name`) },
  { key: "n", needsCursor: true, show: "n", group: "Jump", label: "This section's notes", run: (c) => c.jump((at) => `sections.${at.section}.notes`) },
  { key: "l", needsCursor: true, show: "l", group: "Jump", label: "This phrase's lyrics", run: (c) => c.jump((at) => `sections.${at.section}.phrases.${at.phrase}.lyrics`) },
];

/** Cheat-sheet groups, in the order they are declared above. */
export const GROUPS = [...new Set(BINDINGS.map((b) => b.group))];

/**
 * The binding a keydown asks for, or null.
 *
 * Ctrl and Cmd are always somebody else's — the browser's, or the undo shortcut's
 * — so nothing here ever matches them. Shift is only compared for named keys like
 * Tab: for a printable character the shift state is already baked into
 * `event.key`, which is why the table can say "B" and mean Shift+b.
 */
export function findBinding(event) {
  if (event.ctrlKey || event.metaKey) return null;
  return (
    BINDINGS.find(
      (b) =>
        b.key === event.key &&
        Boolean(b.alt) === Boolean(event.altKey) &&
        (b.key.length === 1 || Boolean(b.shift) === Boolean(event.shiftKey)),
    ) ?? null
  );
}
