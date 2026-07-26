import { createRenderer } from "./render.js";
import { INSTRUMENTS, transposeSong } from "./transpose.js";

/**
 * <song-sheet data-src="song.json" transpose="Bb"> renders a chart into its
 * light DOM. Also accepts a song object directly via the `song` property.
 *
 * The song data is always concert pitch; `transpose` only changes the view, so
 * switching instruments never mutates the underlying document.
 */
class SongSheet extends HTMLElement {
  static observedAttributes = ["transpose"];

  connectedCallback() {
    const src = this.dataset.src;
    if (src && !this._song) this.load(src);
    else if (this._song) this.render();
  }

  attributeChangedCallback(name, before, after) {
    if (name === "transpose" && before !== after) this.render();
  }

  async load(src) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Cannot load ${src}: ${res.status}`);
    this.song = await res.json();
  }

  set song(song) {
    this._song = song;
    this.render();
  }

  get song() {
    return this._song;
  }

  /** Which instrument the chart is currently written for. */
  get transpose() {
    const value = this.getAttribute("transpose") ?? "C";
    return value in INSTRUMENTS ? value : "C";
  }

  set transpose(value) {
    this.setAttribute("transpose", value);
  }

  render() {
    const song = this._song;
    if (!song) return;
    document.title = song.title ? `${song.title} — sofo` : "sofo";
    const view = transposeSong(song, this.transpose);
    this.replaceChildren(...createRenderer(document)(view));
  }
}

customElements.define("song-sheet", SongSheet);

/**
 * <song-controls for="sheet-id"> — screen-only chrome for picking the
 * instrument. Never printed, so it cannot end up in the PDF.
 */
class SongControls extends HTMLElement {
  connectedCallback() {
    const sheet = document.getElementById(this.getAttribute("for"));
    if (!sheet) return;

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

    this.replaceChildren(label, select);
  }
}

customElements.define("song-controls", SongControls);
