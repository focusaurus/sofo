import { createRenderer } from "./render.js";
import { normalizeSong } from "./song.js";
import { INSTRUMENTS, transposeSong, writtenKey } from "./transpose.js";
import { attachEditing, setPath } from "./edit.js";
import { ACTIONS, blankSong } from "./structure.js";
import { BINDINGS, GROUPS } from "./keys.js";

/**
 * <song-sheet data-src="song.json" transpose="Bb" editing> renders a chart into
 * its light DOM.
 *
 * The song data is always concert pitch; `transpose` only changes the view, so
 * switching instruments never mutates the underlying document. Editing is
 * therefore only offered in concert pitch — see `editing` below.
 */
class SongSheet extends HTMLElement {
  static observedAttributes = ["transpose", "editing"];

  #detachEditing = null;

  connectedCallback() {
    const src = this.dataset.src;
    if (src && !this._song) this.load(src);
    else if (this._song) this.render();
  }

  disconnectedCallback() {
    this.#detachEditing?.();
    this.#detachEditing = null;
  }

  attributeChangedCallback(name, before, after) {
    if (before === after) return;
    if (name === "transpose") this.render();
    if (name === "editing") this.#syncEditing();
  }

  async load(src) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Cannot load ${src}: ${res.status}`);
    this.song = await res.json();
  }

  /** Always stored canonicalized, so edit paths are valid for every section. */
  set song(song) {
    this._song = normalizeSong(song);
    this.render();
    // Distinct from songchange: nothing was edited, a document just arrived.
    this.dispatchEvent(new CustomEvent("songload", { bubbles: true }));
  }

  get song() {
    return this._song;
  }

  get transpose() {
    const value = this.getAttribute("transpose") ?? "C";
    return value in INSTRUMENTS ? value : "C";
  }

  set transpose(value) {
    this.setAttribute("transpose", value);
  }

  get editing() {
    return this.hasAttribute("editing");
  }

  set editing(on) {
    this.toggleAttribute("editing", Boolean(on));
  }

  #syncEditing() {
    this.#detachEditing?.();
    this.#detachEditing = null;
    if (this.editing) {
      // Chords are authored in concert pitch, so editing a transposed view would
      // be ambiguous about which pitch was typed. Snap back to concert instead.
      if (this.transpose !== "C") this.setAttribute("transpose", "C");
      this.#detachEditing = attachEditing(this);
    }
    this.render();
    this.dispatchEvent(new CustomEvent("editingchange", { bubbles: true }));
  }

  /**
   * Commit one edit: write the value, stamp the revision date, re-render, and
   * announce the change so chrome outside the sheet can react.
   */
  updateAt(path, value) {
    this.#pushUndo();
    setPath(this._song, path, value);
    this.#commit({ path, value });
  }

  /**
   * Replace the whole document. Undoable like any other edit, so starting a new
   * song by mistake is recoverable rather than final.
   */
  replaceSong(song) {
    this.#pushUndo();
    this._song = normalizeSong(song);
    this.#commit({ replaced: true });
  }

  /** Run a named structural action from the ACTIONS registry. */
  applyAction(name, args) {
    const op = ACTIONS[name];
    if (!op) return;
    const next = op(this._song, args);
    if (next === this._song) return; // out-of-range target; nothing happened
    this.#pushUndo();
    this._song = next;
    this.#commit({ action: name, ...args });
  }

  #undoStack = [];

  #pushUndo() {
    this.#undoStack.push(structuredClone(this._song));
    // Deep clones of a whole song are cheap at chart scale, but not unbounded.
    if (this.#undoStack.length > 50) this.#undoStack.shift();
  }

  /** Step back one edit. Returns false when there is nothing to undo. */
  undo() {
    const previous = this.#undoStack.pop();
    if (!previous) return false;
    this._song = previous;
    this.render();
    this.dispatchEvent(new CustomEvent("songchange", { bubbles: true, detail: { undo: true } }));
    return true;
  }

  get canUndo() {
    return this.#undoStack.length > 0;
  }

  #commit(detail) {
    this._song.updated = new Date().toISOString();
    this.render();
    this.dispatchEvent(new CustomEvent("songchange", { bubbles: true, detail }));
  }

  render() {
    const song = this._song;
    if (!song) return;
    document.title = song.title ? `${song.title} — sofo` : "sofo";
    const view = this.editing ? song : transposeSong(song, this.transpose);
    this.replaceChildren(...createRenderer(document, { editing: this.editing })(view));
  }
}

customElements.define("song-sheet", SongSheet);

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * A pencil, drawn rather than typed: the emoji and the Unicode pencil glyphs
 * render wildly differently across platforms, and half of them come out as a
 * color emoji that cannot pick up the button's ink.
 */
function pencilIcon() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of [
    "M4 20l1.1-4.1L16.6 4.4a2.2 2.2 0 013.1 3.1L8.1 18.9 4 20z", // body and tip
    "M14.6 6.4l3.1 3.1", // ferrule, where the metal band sits
  ]) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/**
 * <song-controls for="sheet-id"> — screen-only chrome: instrument picker, edit
 * toggle, and JSON download. Never printed, so it cannot reach the PDF.
 */
class SongControls extends HTMLElement {
  connectedCallback() {
    const sheet = document.getElementById(this.getAttribute("for"));
    if (!sheet) return;
    this.sheet = sheet;

    const select = document.createElement("select");
    select.id = "transpose-select";

    // Capo entries are grouped apart from the horns: a capo does not change the
    // sounding pitch the way a transposing instrument does, it only changes the
    // shapes, so the two are alternatives rather than things to combine.
    const horns = document.createElement("optgroup");
    horns.label = "Instrument";
    const capos = document.createElement("optgroup");
    capos.label = "Guitar capo";
    for (const [key, spec] of Object.entries(INSTRUMENTS)) {
      const option = document.createElement("option");
      option.value = key;
      // Capo labels name the resulting key, which depends on the song, so
      // labelCapos() fills them in once there is one.
      option.textContent = spec.capo || key === "C" ? spec.label : `${spec.label} (${key})`;
      (spec.capo ? capos : horns).append(option);
    }
    select.append(horns, capos);

    // A guitarist picks a capo by the shapes it gives them, so each entry names
    // the key it lands in. Recomputed whenever the song's key can have changed.
    const labelCapos = () => {
      const key = sheet.song?.key;
      for (const option of capos.children) {
        const { capo } = INSTRUMENTS[option.value];
        const shapes = writtenKey(key, option.value);
        option.textContent = shapes ? `Capo ${capo} — play in ${shapes}` : `Capo ${capo}`;
      }
    };

    select.value = sheet.getAttribute("transpose") ?? "C";
    select.addEventListener("change", () => {
      sheet.transpose = select.value;
    });

    const label = document.createElement("label");
    label.setAttribute("for", select.id);
    label.textContent = "Transpose for";

    // The edit toggle is a pencil floating on the sheet's top-right corner
    // rather than a button in this bar, so it sits where the document is.
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "edit-toggle";
    edit.append(pencilIcon());
    edit.addEventListener("click", () => {
      sheet.editing = !sheet.editing;
    });

    const fresh = document.createElement("button");
    fresh.type = "button";
    fresh.textContent = "New song";
    fresh.title = "Start a new blank chart";
    fresh.addEventListener("click", () => {
      // Replacing the whole chart is worth a confirm even though it is undoable,
      // because the draft in localStorage gets overwritten by the next edit.
      const ok = confirm(
        "Start a new blank song? The chart on screen will be replaced.\n\n" +
          "Download JSON first if you want to keep it. (Undo also restores it.)",
      );
      if (!ok) return;
      sheet.replaceSong(blankSong());
      sheet.editing = true;
    });

    // A hidden file input is the only way to get a native file picker; the
    // visible button proxies to it.
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "application/json,.json";
    picker.hidden = true;
    picker.addEventListener("change", () => {
      const [file] = picker.files ?? [];
      if (file) this.#openFile(file);
      picker.value = ""; // so choosing the same file twice still fires
    });

    const open = document.createElement("button");
    open.type = "button";
    open.textContent = "Open…";
    open.title = "Open a song JSON file (or drop one on the page)";
    open.addEventListener("click", () => picker.click());

    const undo = document.createElement("button");
    undo.type = "button";
    undo.textContent = "Undo";
    undo.title = "Undo the last edit (Ctrl/Cmd+Z)";
    undo.addEventListener("click", () => sheet.undo());

    const download = document.createElement("button");
    download.type = "button";
    download.textContent = "Download JSON";
    download.addEventListener("click", () => this.#download());

    // Restoring is offered rather than automatic: silently replacing the file on
    // disk with a stale draft would be a nasty surprise.
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "Restore draft";
    restore.title = "Reload the unsaved edits held in this browser";
    restore.hidden = true;
    restore.addEventListener("click", () => {
      const draft = this.#readDraft();
      if (!draft) return;
      sheet.replaceSong(draft);
      restore.hidden = true;
      this.#status("Restored unsaved draft");
    });

    const status = document.createElement("span");
    status.className = "status";

    // Editing is concert-pitch only, so the picker is unavailable in edit mode.
    const sync = () => {
      const on = sheet.editing;
      // Icon-only, so the accessible name and the tooltip carry the label.
      const name = on ? "Done editing" : "Edit this song";
      edit.setAttribute("aria-label", name);
      edit.title = name;
      edit.setAttribute("aria-pressed", String(on));
      select.disabled = on;
      select.value = sheet.getAttribute("transpose") ?? "C";
      undo.hidden = !on;
      undo.disabled = !sheet.canUndo;
      labelCapos();
      status.textContent = on
        ? "Editing in concert pitch · arrows move, Enter edits a bar, ? lists the keys"
        : "";
    };
    sheet.addEventListener("editingchange", sync);
    sheet.addEventListener("songload", labelCapos);
    sheet.addEventListener("songchange", () => {
      undo.disabled = !sheet.canUndo;
      labelCapos(); // editing the key changes which shapes each fret gives
      status.textContent = `Saved locally · updated ${new Date().toLocaleTimeString()}`;
      this.#saveDraft();
    });
    // A keyboard command says what it did, and gets the last word: the edit it
    // made has already fired songchange and set the line to "Saved locally".
    sheet.addEventListener("songstatus", (event) => {
      status.textContent = event.detail.text;
    });
    sheet.addEventListener("songhelp", () => this.#help());

    // Dropping a .json anywhere on the page opens it. dragover must be
    // cancelled or the browser navigates to the file instead.
    document.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    });
    document.addEventListener("drop", (event) => {
      const [file] = event.dataTransfer?.files ?? [];
      if (!file) return;
      event.preventDefault();
      this.#openFile(file);
    });

    this.replaceChildren(fresh, open, picker, label, select, undo, download, restore, status);
    // Lives on the sheet's wrapper, not in this bar. Falls back to the bar if
    // the page is marked up without one, so the toggle can never go missing.
    (sheet.closest("song-page") ?? this).append(edit);
    sync();

    // Offer the draft once the sheet has its data, so "restore" means something.
    const offerDraft = () => {
      const draft = this.#readDraft();
      restore.hidden = !draft || JSON.stringify(draft) === JSON.stringify(sheet.song);
    };
    if (sheet.song) offerDraft();
    else sheet.addEventListener("songload", offerDraft, { once: true });
  }

  /**
   * Load a song from a user-supplied file. Anything unreadable is reported and
   * ignored rather than replacing the chart with a broken document.
   */
  async #openFile(file) {
    let song;
    try {
      song = JSON.parse(await file.text());
    } catch (error) {
      alert(`${file.name} is not valid JSON.\n\n${error.message}`);
      return;
    }
    if (!song || typeof song !== "object" || Array.isArray(song)) {
      alert(`${file.name} does not look like a song document.`);
      return;
    }
    if (!Array.isArray(song.sections)) {
      // Not fatal — normalizeSong copes — but worth saying, since the likely
      // cause is picking the wrong file.
      const ok = confirm(`${file.name} has no "sections" list. Open it anyway?`);
      if (!ok) return;
    }
    // Drafts are keyed by document, so an opened file gets its own slot rather
    // than overwriting the draft of whatever was on screen.
    this.sheet.dataset.src = file.name;
    this.sheet.replaceSong(song);
    this.#status(`Opened ${file.name}`);
  }

  #status(text) {
    const status = this.querySelector(".status");
    if (status) status.textContent = text;
  }

  /** Drafts live in localStorage so a refresh does not lose unsaved edits. */
  get #draftKey() {
    return `sofo:draft:${this.sheet.dataset.src ?? "inline"}`;
  }

  #saveDraft() {
    try {
      localStorage.setItem(this.#draftKey, JSON.stringify(this.sheet.song));
    } catch {
      // Storage full or blocked; the download button is still the real save.
    }
  }

  #readDraft() {
    try {
      const raw = localStorage.getItem(this.#draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null; // corrupt or unavailable storage is the same as no draft
    }
  }

  /**
   * The cheat sheet, built from the same table the dispatcher reads, so a key
   * cannot be listed here and wired to something else. A <dialog> gets Escape,
   * the backdrop and focus trapping from the platform.
   */
  #help() {
    let dialog = this.querySelector(".key-help");
    if (dialog) return dialog.showModal();

    dialog = document.createElement("dialog");
    dialog.className = "key-help";

    const title = document.createElement("h2");
    title.textContent = "Keyboard";
    const intro = document.createElement("p");
    intro.className = "key-help-intro";
    intro.textContent =
      "Chords are Enter, then type: committing a bar moves on to the next empty one, so a section goes in without touching the mouse. These keys work while no field is open.";
    dialog.append(title, intro);

    for (const group of GROUPS) {
      const heading = document.createElement("h3");
      heading.textContent = group;
      const list = document.createElement("dl");
      for (const binding of BINDINGS.filter((b) => b.group === group)) {
        const key = document.createElement("dt");
        key.textContent = binding.show;
        const what = document.createElement("dd");
        what.textContent = binding.label;
        list.append(key, what);
      }
      dialog.append(heading, list);
    }

    const done = document.createElement("button");
    done.type = "button";
    done.textContent = "Close";
    done.addEventListener("click", () => dialog.close());
    dialog.append(done);

    this.append(dialog);
    dialog.showModal();
  }

  #download() {
    const song = this.sheet.song;
    const json = `${JSON.stringify(song, null, 2)}\n`;
    const slug = (song.title ?? "song")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    // .sf.json marks it as a sofo Song Form document — see AGENTS.md.
    a.download = `${slug}.sf.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

customElements.define("song-controls", SongControls);
