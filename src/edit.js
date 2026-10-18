/**
 * Leaf-content editing for a rendered chart.
 *
 * Rather than making the whole document contenteditable — which fights the flex
 * layout and invents its own markup — each editable leaf carries a `data-path`
 * naming its location in the song JSON and a `data-edit` kind saying how to edit
 * it. Clicking one lays a real form control *over* the leaf, and committing
 * writes back through the path. The song data stays the source of truth; the DOM
 * is only ever a projection of it.
 *
 * The control is a child of the leaf, absolutely positioned to cover it, rather
 * than a replacement for it. That is what keeps the page still: the leaf stays in
 * flow at exactly its old size, so opening an editor cannot resize the other bars
 * in the row or shove the lyrics down, and the control inherits the leaf's font,
 * size and alignment so the text does not move either. All that changes is that
 * the leaf stops painting its own ink while the control sits on top of it.
 *
 * Keyboard work happens in two layers, and which one you are in is exactly
 * whether an editor is open. With one open, keys are text. With none open, the
 * cursor — a ring around one bar — is what the keys act on, and they can be bare
 * letters because nothing is listening for typing. See src/keys.js for the map.
 */

import { findBinding } from "./keys.js";
import { sectionLabels } from "./song.js";

/** Read a dotted path: getPath(song, "sections.2.phrases.1.chords.3") */
export function getPath(root, path) {
  return path.split(".").reduce((node, key) => (node == null ? node : node[key]), root);
}

/** Write a dotted path, creating nothing: the renderer only emits real paths. */
export function setPath(root, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((node, key) => node[key], root);
  parent[last] = value;
}

/**
 * Every bar's path, in reading order across the whole chart. Used to walk from
 * one measure to the next during keyboard entry.
 */
export function barPaths(song) {
  const paths = [];
  (song.sections ?? []).forEach((section, s) => {
    (section.phrases ?? []).forEach((phrase, p) => {
      (phrase.chords ?? []).forEach((_, k) => {
        paths.push(`sections.${s}.phrases.${p}.chords.${k}`);
      });
    });
  });
  return paths;
}

/** The bar `delta` places along from `path`, or null at the ends of the chart. */
export function stepBarPath(song, path, delta = 1) {
  const paths = barPaths(song);
  const index = paths.indexOf(path);
  if (index < 0) return null;
  return paths[index + delta] ?? null;
}

/** Pull the indexes back out of a bar path, or null if it is not one. */
export function barAt(path) {
  const m = /^sections\.(\d+)\.phrases\.(\d+)\.chords\.(\d+)$/.exec(path ?? "");
  if (!m) return null;
  const [, section, phrase, bar] = m.map(Number);
  return { section, phrase, bar };
}

/** Every phrase's path, in reading order across the whole chart. */
export function phrasePaths(song) {
  const paths = [];
  (song.sections ?? []).forEach((section, s) => {
    (section.phrases ?? []).forEach((_, p) => paths.push(`sections.${s}.phrases.${p}`));
  });
  return paths;
}

/**
 * The bar one phrase away, holding the position within the phrase: down from bar
 * 3 of a four-bar line lands on bar 3 of the next line, which is what "down" looks
 * like on a chart where a phrase is a row. A shorter phrase clamps to its last
 * bar, and a phrase with no bars is stepped over — it is not drawn, so a cursor
 * could not be seen there.
 */
export function stepPhraseBarPath(song, path, delta = 1) {
  const at = barAt(path);
  if (!at) return null;
  const paths = phrasePaths(song);
  const from = paths.indexOf(`sections.${at.section}.phrases.${at.phrase}`);
  if (from < 0) return null;
  for (let i = from + delta; i >= 0 && i < paths.length; i += Math.sign(delta)) {
    const bars = getPath(song, `${paths[i]}.chords`) ?? [];
    if (bars.length) return `${paths[i]}.chords.${Math.min(at.bar, bars.length - 1)}`;
  }
  return null;
}

/**
 * The bar to hold the cursor on after the chart changed under it. An existing
 * path stays put; a deleted one falls back to the last bar still in front of
 * where it was, which keeps a run of deletes moving backwards through the chart
 * rather than jumping to the top.
 */
export function nearestBarPath(song, path) {
  const paths = barPaths(song);
  if (!paths.length) return null;
  if (paths.includes(path)) return path;
  const gone = barAt(path);
  if (!gone) return paths[0];
  const earlier = (a, b) =>
    a.section !== b.section
      ? a.section < b.section
      : a.phrase !== b.phrase
        ? a.phrase < b.phrase
        : a.bar < b.bar;
  const behind = paths.filter((p) => earlier(barAt(p), gone));
  return behind.at(-1) ?? paths[0];
}

/** True when a bar holds no chord — a continuation, shown as the simile mark. */
export function isBlankBar(song, path) {
  const value = getPath(song, path);
  if (value == null || value === "") return true;
  return Array.isArray(value) && value.filter(Boolean).length === 0;
}

/** "quarter:Quarter note,eighth:Eighth note" -> [[value, label], ...] */
function parseChoices(spec) {
  if (!spec) return null;
  const pairs = spec
    .split(",")
    .map((pair) => pair.split(":"))
    .filter(([value, label]) => value && label);
  return pairs.length ? pairs : null;
}

/** Turn a stored value into the text shown in the editor. */
function toText(kind, value) {
  if (kind === "lines") return (value ?? []).join("\n");
  if (kind === "number") return value == null ? "" : String(value);
  if (kind === "bar") return [].concat(value ?? []).filter(Boolean).join(" ");
  return value == null ? "" : String(value);
}

/**
 * Parse editor text back into the stored shape.
 *
 * A bar is space-separated: "" is a continuation, "Gm7" a single chord, and
 * "Gm7 Ab6" two chords sharing the measure — which is exactly how the JSON
 * distinguishes a string from an array.
 */
function fromText(kind, text, previous) {
  if (kind === "lines") {
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (kind === "bar") {
    const chords = text.trim().split(/\s+/).filter(Boolean);
    if (!chords.length) return "";
    return chords.length === 1 ? chords[0] : chords;
  }
  const trimmed = text.trim();
  // Declared numeric fields, and any field that already held a number, stay
  // numeric — otherwise tempo would silently become a string once edited.
  const wantsNumber = kind === "number" || typeof previous === "number";
  if (wantsNumber) {
    if (trimmed === "") return "";
    return Number.isFinite(Number(trimmed)) ? Number(trimmed) : trimmed;
  }
  return trimmed;
}

/**
 * Lay `control` over `host` so that opening it moves nothing.
 *
 * The control is absolutely positioned against the host's padding box, which is
 * one padding inside where the host's own text starts — so it borrows the host's
 * padding to put its text back on the same spot. Everything else it needs (font,
 * size, weight, alignment) it inherits by virtue of being a child.
 */
function cover(host, control, multiline) {
  const style = getComputedStyle(host);
  const box = host.getBoundingClientRect();
  const pad = (side) => parseFloat(style[`padding${side}`]) || 0;

  // An inline leaf — a value inside a dd, say — is not a containing block for an
  // absolute child and ignores min-width/min-height. inline-block fixes both and
  // leaves the leaf's own metrics alone.
  if (style.display === "inline") host.style.display = "inline-block";
  // A leaf showing only its placeholder has no content of its own to hold the
  // box open once the :empty rule stops matching, so pin the size it had.
  if (box.width) host.style.minWidth = `${box.width}px`;
  if (box.height) host.style.minHeight = `${box.height}px`;
  host.classList.add("is-editing");
  control.style.padding = `${pad("Top")}px ${pad("Right")}px ${pad("Bottom")}px ${pad("Left")}px`;
  host.append(control);

  if (!multiline) return;
  // A textarea will not size to its text, so grow it by hand and let the leaf
  // grow underneath it. Lyrics genuinely need the room, and a box that stretches
  // as lines are added reads as the page making space rather than jumping.
  const outer = style.boxSizing === "border-box"
    ? (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0)
    : -(pad("Top") + pad("Bottom"));
  const fit = () => {
    control.style.height = "auto";
    control.style.height = `${control.scrollHeight}px`;
    host.style.minHeight = `${control.scrollHeight + outer}px`;
  };
  control.addEventListener("input", fit);
  fit();
}

/**
 * Wire up click-to-edit on a <song-sheet>. Returns a teardown function.
 * The sheet must expose `song` and an `updateAt(path, value)` method.
 */
export function attachEditing(sheet) {
  let open = null;
  /**
   * The cursor: the path of the bar the keyboard is aimed at, or null for none.
   *
   * A bar is the only thing it can be. Phrase and section commands read their
   * target by walking up from here, which is why there is no notion of a cursor
   * level to keep in sync or to show. Field edits — the title, a lyric — are
   * excursions that leave it where it was, so the bar stays home.
   *
   * It is a path rather than an element because every edit re-renders the whole
   * chart; an element reference would be stale one keystroke later.
   */
  let cursor = null;

  const leafAt = (path) => (path ? sheet.querySelector(`[data-path="${path}"]`) : null);

  /** Draw the cursor. Called after every re-render, since the DOM is rebuilt. */
  const paintCursor = () => {
    for (const marked of sheet.querySelectorAll(".is-cursor")) marked.classList.remove("is-cursor");
    const host = leafAt(cursor);
    host?.classList.add("is-cursor");
    return host;
  };

  const setCursor = (path, { scroll = true } = {}) => {
    cursor = path ?? null;
    const host = paintCursor();
    if (host && scroll) host.scrollIntoView({ block: "nearest", inline: "nearest" });
    return Boolean(host);
  };

  /** After a structural change, keep the cursor on a bar that still exists. */
  const followSong = () => {
    if (cursor) cursor = nearestBarPath(sheet.song, cursor);
    paintCursor();
  };

  /** Take the control back off its leaf and hand the leaf its own box back. */
  const restore = ({ control, host }) => {
    control.remove();
    host.classList.remove("is-editing");
    for (const prop of ["display", "min-width", "min-height"]) {
      host.style.removeProperty(prop);
    }
  };

  const close = (commit) => {
    if (!open) return;
    const current = open;
    open = null; // cleared first so the blur handler cannot re-enter
    const { control, path, kind, before } = current;
    const after = commit ? fromText(kind, control.value, before) : before;
    restore(current);
    // An edit that changed nothing needs no re-render: the leaf underneath the
    // control was never touched, so it is already showing the right thing. Not
    // re-rendering is also what stops a click-in-click-out from flashing the
    // whole chart.
    if (commit && JSON.stringify(after) !== JSON.stringify(before)) {
      sheet.updateAt(path, after);
    }
  };

  /** Re-find a leaf by path after a re-render and start editing it. */
  const openPath = (path) => {
    const host = leafAt(path);
    if (host) openEditor(host);
    return Boolean(host);
  };

  /**
   * Move to another bar during keyboard entry.
   *
   * `onlyIfBlank` is what makes Enter safe to hold down: it walks forward only
   * while the next measure is empty, so entering harmony never overwrites or
   * skips past chords that are already there. Tab ignores that and always moves,
   * for when you do want to revisit a filled bar.
   */
  const advance = (from, { delta = 1, onlyIfBlank = false } = {}) => {
    const next = stepBarPath(sheet.song, from, delta);
    if (!next) return;
    if (onlyIfBlank && !isBlankBar(sheet.song, next)) return;
    openPath(next);
  };

  const openEditor = (host) => {
    const { path, edit: kind } = host.dataset;
    if (!path || open) return;
    // Editing a bar is where the cursor lives; editing a field is an excursion,
    // so the cursor stays on the bar the excursion started from.
    if (kind === "bar") setCursor(path, { scroll: false });
    const before = getPath(sheet.song, path);
    const multiline = kind === "lines";
    const choices = kind === "choice" ? parseChoices(host.dataset.choices) : null;
    const control = document.createElement(
      choices ? "select" : multiline ? "textarea" : "input",
    );
    control.className = "song-editor";
    control.dataset.kind = kind;
    if (choices) {
      for (const [value, label] of choices) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        control.append(option);
      }
      // A blank stored value means "inferred from the time signature", so fall
      // back to whatever the renderer is currently showing.
      control.value = before || host.dataset.current || choices[0][0];
      // A dropdown has no text to type, so picking a value is the whole edit.
      control.addEventListener("change", () => close(true));
    } else {
      control.value = toText(kind, before);
      // The :empty placeholder rule stops matching the moment the control moves
      // in, so the control has to carry the hint itself.
      if (host.dataset.placeholder) control.placeholder = host.dataset.placeholder;
    }

    control.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key === "Tab" && kind === "bar") {
        // Step to the neighbouring measure whether or not it already has a chord.
        event.preventDefault();
        close(true);
        advance(path, { delta: event.shiftKey ? -1 : 1 });
        return;
      }
      if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        close(true);
        // Keyboard chord entry: keep going while the next bar is still empty, so
        // a whole section can be typed without reaching for the mouse.
        if (kind === "bar") advance(path, { onlyIfBlank: true });
      }
    });
    control.addEventListener("blur", () => close(true));

    cover(host, control, multiline);
    open = { control, host, path, kind, before };
    control.focus();
    control.select?.();
    // Long charts scroll: keep the active measure on screen while typing.
    host.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  const onClick = (event) => {
    // A structural button wins over the editable box it sits inside.
    const button = event.target.closest?.("[data-action]");
    if (button && sheet.contains(button)) {
      event.preventDefault();
      close(true);
      const { action, section, phrase } = button.dataset;
      sheet.applyAction(action, {
        section: Number(section),
        phrase: phrase == null ? undefined : Number(phrase),
      });
      return;
    }

    const host = event.target.closest?.("[data-path]");
    if (!host || !sheet.contains(host)) return;
    if (open?.host === host) return;
    // Committing the open editor can re-render the chart out from under this
    // element, so go back to the path for the leaf that was actually clicked.
    const { path } = host.dataset;
    close(true);
    openPath(path);
  };

  /**
   * The verbs the key map is written against. Movement with no cursor yet seeds
   * one at whichever end you are heading away from, so the first arrow press
   * always lands somewhere rather than doing nothing.
   */
  const commands = {
    moveBar: (delta) => {
      if (!cursor) return delta > 0 ? commands.firstBar() : commands.lastBar();
      setCursor(stepBarPath(sheet.song, cursor, delta) ?? cursor);
    },
    movePhrase: (delta) => {
      if (!cursor) return delta > 0 ? commands.firstBar() : commands.lastBar();
      setCursor(stepPhraseBarPath(sheet.song, cursor, delta) ?? cursor);
    },
    firstBar: () => setCursor(barPaths(sheet.song)[0]),
    lastBar: () => setCursor(barPaths(sheet.song).at(-1)),
    edit: () => openPath(cursor),
    dropCursor: () => setCursor(null),

    /** Hand the bar back to the chord before it, as the simile mark. */
    clearBar: () => {
      if (isBlankBar(sheet.song, cursor)) return;
      sheet.updateAt(cursor, "");
      announce("Bar cleared — u to undo");
    },

    undo: () => {
      if (!sheet.undo()) announce("Nothing left to undo");
    },

    /**
     * Run one of the structural operations the toolbar buttons use, aimed at the
     * cursor's own phrase and section. `describe` is read before the change, so
     * the message can name a section that no longer exists.
     */
    act: (action) => {
      const at = barAt(cursor);
      if (!at) return;
      const said = describe(action, at);
      // Every structural op returns the song untouched when the target is out of
      // range — the last bar of a phrase, a section already at the top — and the
      // sheet then swaps in nothing. Same object, so nothing happened, so say so
      // rather than reporting a move that did not occur.
      const before = sheet.song;
      sheet.applyAction(action, { section: at.section, phrase: at.phrase });
      announce(sheet.song === before ? "Nothing to change there" : said);
    },

    /**
     * Open a field's editor without moving the cursor. `resolve` gets the cursor's
     * section and phrase plus the song, which is all any target needs.
     */
    jump: (resolve) => {
      const at = { ...(barAt(cursor) ?? {}), song: sheet.song };
      if (!openPath(resolve(at))) announce("Nothing there to edit");
    },

    help: () => sheet.dispatchEvent(new CustomEvent("songhelp", { bubbles: true })),
  };

  /** Say what a structural key did, since some of it happens off screen. */
  const describe = (action, at) => {
    const section = getPath(sheet.song, `sections.${at.section}`);
    const name = sectionLabels(sheet.song.sections ?? [])[at.section] ?? section?.name ?? "section";
    const bars = getPath(sheet.song, `sections.${at.section}.phrases.${at.phrase}.chords`) ?? [];
    return {
      "bar-add": `Added a bar — ${bars.length + 1} in this phrase`,
      "bar-remove": `Removed a bar — ${Math.max(1, bars.length - 1)} left in this phrase`,
      "phrase-add": "Added a phrase",
      "phrase-delete": "Deleted a phrase — u to undo",
      "phrase-duplicate": "Duplicated the phrase",
      "phrase-left": "Moved the phrase left",
      "phrase-right": "Moved the phrase right",
      "section-add": "Added a section",
      "section-delete": `Deleted ${name} — u to undo`,
      "section-duplicate": `Duplicated ${name}`,
      "section-up": `Moved ${name} up`,
      "section-down": `Moved ${name} down`,
    }[action] ?? "";
  };

  const announce = (text) => {
    if (!text) return;
    sheet.dispatchEvent(new CustomEvent("songstatus", { bubbles: true, detail: { text } }));
  };

  /**
   * True when the keystroke belongs to something else: the open editor, a control
   * in the chrome around the sheet, or the cheat sheet itself — a modal dialog
   * owns every key while it is up, including the `?` that opened it. Bare keys
   * are only commands when nothing on screen is waiting to be typed into.
   */
  const isTypingTarget = (target) =>
    Boolean(
      target?.closest?.(
        ".song-editor, input, select, textarea, button, dialog, [contenteditable]",
      ),
    );

  const onKeyDown = (event) => {
    if (isTypingTarget(event.target) || document.querySelector("dialog[open]")) return;
    // Structural edits are destructive enough to need an escape hatch, and the
    // shortcut has to work while focus is on the document rather than a field.
    if ((event.metaKey || event.ctrlKey) && event.key === "z") {
      event.preventDefault();
      sheet.undo();
      return;
    }
    const binding = findBinding(event);
    if (!binding) return;
    // A binding that needs a cursor and has none is not a command at all, so the
    // key keeps its normal meaning rather than being swallowed.
    if (binding.needsCursor && !cursor) return;
    event.preventDefault();
    binding.run(commands);
  };

  sheet.addEventListener("click", onClick);
  // Every commit re-renders, which throws away the element the cursor was drawn
  // on; songchange is the one signal every path through the sheet emits.
  sheet.addEventListener("songchange", followSong);
  document.addEventListener("keydown", onKeyDown);
  // Edit mode is usually entered by clicking a button, which leaves the focus on
  // that button and every bare key belonging to it. Hand the keys to the chart.
  if (document.activeElement?.closest?.("song-controls, .edit-toggle")) {
    document.activeElement.blur();
  }
  return () => {
    close(false);
    setCursor(null);
    sheet.removeEventListener("click", onClick);
    sheet.removeEventListener("songchange", followSong);
    document.removeEventListener("keydown", onKeyDown);
  };
}
