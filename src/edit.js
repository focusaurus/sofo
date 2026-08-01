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
 */

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
    const host = sheet.querySelector(`[data-path="${path}"]`);
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

  const onKeyDown = (event) => {
    // Structural edits are destructive enough to need an escape hatch, and the
    // shortcut has to work while focus is on the document rather than a field.
    const inField = event.target.closest?.(".song-editor");
    if (!inField && (event.metaKey || event.ctrlKey) && event.key === "z") {
      event.preventDefault();
      sheet.undo();
    }
  };

  sheet.addEventListener("click", onClick);
  document.addEventListener("keydown", onKeyDown);
  return () => {
    close(false);
    sheet.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKeyDown);
  };
}
