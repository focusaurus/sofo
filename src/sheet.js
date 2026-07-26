import { createRenderer } from "./render.js";

/**
 * <song-sheet data-src="song.json"> renders a whole chart into its light DOM.
 * Also accepts a song object directly via the `song` property.
 */
class SongSheet extends HTMLElement {
  connectedCallback() {
    const src = this.dataset.src;
    if (src && !this._song) this.load(src);
    else if (this._song) this.render();
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

  render() {
    const song = this._song;
    if (!song) return;
    document.title = song.title ? `${song.title} — sofo` : "sofo";
    this.replaceChildren(...createRenderer(document)(song));
  }
}

customElements.define("song-sheet", SongSheet);
