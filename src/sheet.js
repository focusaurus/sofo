import {
  sectionLabels,
  sectionType,
  startingNotes,
  formatUpdated,
  phrasesOf,
  barCount,
} from "./song.js";

const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of [].concat(children)) if (c) el.append(c);
  return el;
};

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
    const labels = sectionLabels(song.sections ?? []);
    this.replaceChildren(
      this.#head(song),
      ...(song.sections ?? []).map((s, i) => this.#section(s, labels[i])),
      this.#endNotes(song),
      h("song-footer", { text: formatUpdated(song.updated) }),
    );
  }

  #head(song) {
    const facts = startingNotes(song).map(([label, value]) =>
      h("song-fact", {}, [h("dt", { text: label }), h("dd", { text: value })]),
    );
    return h("song-head", {}, [
      h("h1", { text: song.title ?? "Untitled" }),
      song.artist ? h("p", { class: "artist", text: song.artist }) : null,
      facts.length ? h("dl", { class: "facts" }, facts) : null,
      ...(song.notes ?? []).map((n) => h("p", { class: "note", text: n })),
    ]);
  }

  #section(section, label) {
    const bars = barCount(section);
    return h("song-section", { "data-type": sectionType(section.name) }, [
      h("song-head-row", {}, [
        h("song-label", { text: label }),
        bars ? h("song-bar-count", { text: `${bars} bars` }) : null,
      ]),
      this.#phrases(section),
      ...(section.notes ?? []).map((n) => h("song-note", { text: n })),
    ]);
  }

  /** One horizontal row of phrase boxes, each sized in proportion to its bars. */
  #phrases(section) {
    const phrases = phrasesOf(section).filter((p) => p.bars.length);
    if (!phrases.length) return null;
    const bars = phrases.reduce((n, p) => n + p.bars.length, 0);
    return h(
      "song-phrases",
      { "data-density": bars > 12 ? "tight" : bars > 8 ? "snug" : "roomy" },
      phrases.map((phrase) => {
        const el = h("song-phrase", {}, phrase.bars.map((chords) => this.#bar(chords)));
        el.style.flexGrow = String(phrase.bars.length);
        return el;
      }),
    );
  }

  /** A single measure. Multiple chords split the bar's width evenly. */
  #bar(chords) {
    return h(
      "song-bar",
      { "data-chords": chords.length },
      chords.map((c) => h("song-chord", {}, this.#chord(c))),
    );
  }

  /**
   * Chord symbol with the quality/extension set smaller and raised, jazz-style.
   * A slash bass note stays full size: C/E reads as root C, bass E.
   */
  #chord(symbol) {
    const m = /^([A-G][b#]?)([^/]*)(\/.*)?$/.exec(symbol.trim());
    if (!m) return document.createTextNode(symbol);
    const [, root, quality, bass] = m;
    const frag = document.createDocumentFragment();
    frag.append(h("song-root", { text: root }));
    if (quality) frag.append(h("song-quality", { text: quality }));
    if (bass) frag.append(h("song-bass", { text: bass }));
    return frag;
  }

  #endNotes(song) {
    if (!song.endNotes?.length) return null;
    return h("song-end-notes", {}, song.endNotes.map((n) => h("p", { text: n })));
  }
}

customElements.define("song-sheet", SongSheet);
