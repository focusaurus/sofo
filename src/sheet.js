import { createRenderer } from "./render.js";
import { normalizeSong } from "./song.js";
import { INSTRUMENTS, transposeSong } from "./transpose.js";
import { attachEditing, setPath } from "./edit.js";

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
    setPath(this._song, path, value);
    this._song.updated = new Date().toISOString();
    this.render();
    this.dispatchEvent(new CustomEvent("songchange", { bubbles: true, detail: { path, value } }));
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

    const download = document.createElement("button");
    download.type = "button";
    download.textContent = "Download JSON";
    download.addEventListener("click", () => this.#download());

    const status = document.createElement("span");
    status.className = "status";

    // Editing is concert-pitch only, so the picker is unavailable in edit mode.
    const sync = () => {
      const on = sheet.editing;
      edit.textContent = on ? "Done editing" : "Edit";
      edit.setAttribute("aria-pressed", String(on));
      select.disabled = on;
      select.value = sheet.getAttribute("transpose") ?? "C";
      status.textContent = on ? "Editing in concert pitch — click any chord, lyric, or note" : "";
    };
    sheet.addEventListener("editingchange", sync);
    sheet.addEventListener("songchange", () => {
      status.textContent = `Saved locally · updated ${new Date().toLocaleTimeString()}`;
      this.#saveDraft();
    });

    this.replaceChildren(label, select, edit, download, status);
    sync();
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
