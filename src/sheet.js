import { createRenderer } from "./render.js";
import { normalizeSong } from "./song.js";
import { INSTRUMENTS, transposeSong } from "./transpose.js";
import { attachEditing, setPath } from "./edit.js";
import { ACTIONS, blankSong } from "./structure.js";

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
    for (const [key, { label }] of Object.entries(INSTRUMENTS)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = key === "C" ? label : `${label} (${key})`;
      select.append(option);
    }
    select.value = sheet.getAttribute("transpose") ?? "C";
    select.addEventListener("change", () => {
      sheet.transpose = select.value;
    });

    const label = document.createElement("label");
    label.setAttribute("for", select.id);
    label.textContent = "Transpose for";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
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
      edit.textContent = on ? "Done editing" : "Edit";
      edit.setAttribute("aria-pressed", String(on));
      select.disabled = on;
      select.value = sheet.getAttribute("transpose") ?? "C";
      undo.hidden = !on;
      undo.disabled = !sheet.canUndo;
      status.textContent = on
        ? "Editing in concert pitch · Enter fills the next empty bar · Tab steps bar to bar"
        : "";
    };
    sheet.addEventListener("editingchange", sync);
    sheet.addEventListener("songchange", () => {
      undo.disabled = !sheet.canUndo;
      status.textContent = `Saved locally · updated ${new Date().toLocaleTimeString()}`;
      this.#saveDraft();
    });

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

    this.replaceChildren(fresh, open, picker, label, select, edit, undo, download, restore, status);
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
    a.download = `${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

customElements.define("song-controls", SongControls);
