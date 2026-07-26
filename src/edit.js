/**
 * Leaf-content editing for a rendered chart.
 *
 * Rather than making the whole document contenteditable — which fights the flex
 * layout and invents its own markup — each editable leaf carries a `data-path`
 * naming its location in the song JSON and a `data-edit` kind saying how to edit
 * it. Clicking one swaps in a real form control sized to the element it replaces,
 * and committing writes back through the path. The song data stays the source of
 * truth; the DOM is only ever a projection of it.
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

/** Turn a stored value into the text shown in the editor. */
function toText(kind, value) {
  if (kind === "lines") return (value ?? []).join("\n");
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
  // Keep numeric fields numeric so tempo stays a number in the JSON.
  if (typeof previous === "number" && trimmed !== "" && Number.isFinite(Number(trimmed))) {
    return Number(trimmed);
  }
  return trimmed;
}

/**
 * Wire up click-to-edit on a <song-sheet>. Returns a teardown function.
 * The sheet must expose `song` and an `updateAt(path, value)` method.
 */
export function attachEditing(sheet) {
  let open = null;

  const close = (commit) => {
    if (!open) return;
    const { control, host, path, kind, before } = open;
    open = null; // cleared first so the blur handler cannot re-enter
    const after = commit ? fromText(kind, control.value, before) : before;
    control.remove();
    host.hidden = false;
    if (commit && JSON.stringify(after) !== JSON.stringify(before)) {
      sheet.updateAt(path, after);
    } else {
      host.textContent = toText(kind, before) || "";
      sheet.render();
    }
  };

  const openEditor = (host) => {
    const { path, edit: kind } = host.dataset;
    if (!path || open) return;
    const before = getPath(sheet.song, path);
    const multiline = kind === "lines";
    const control = document.createElement(multiline ? "textarea" : "input");
    control.className = "song-editor";
    control.value = toText(kind, before);
    control.dataset.kind = kind;
    if (multiline) control.rows = Math.max(2, control.value.split("\n").length);

    // Match the box being replaced so the layout does not jump.
    const box = host.getBoundingClientRect();
    if (box.width) control.style.minWidth = `${Math.round(box.width)}px`;

    control.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      } else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        close(true);
      }
    });
    control.addEventListener("blur", () => close(true));

    host.hidden = true;
    host.after(control);
    open = { control, host, path, kind, before };
    control.focus();
    control.select?.();
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
    close(true);
    openEditor(host);
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
