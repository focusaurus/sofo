import {
  sectionLabels,
  sectionType,
  startingNotes,
  formatUpdated,
  phraseRows,
  barCount,
} from "./song.js";

/** Bars beyond this wrap to another row, keeping 8- and 4-bar phrasing legible. */
export const MAX_BARS_PER_ROW = 8;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Builds a chart's DOM from song data. The document is injected rather than
 * taken from the global scope so the same code runs in the browser and under
 * the tiny shim in tools/prerender.js (WeasyPrint cannot execute JavaScript,
 * so PDF checks need a statically rendered file).
 */
export function createRenderer(doc) {
  const h = (tag, attrs = {}, children = []) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children)) if (c) el.append(c);
    return el;
  };

  /**
   * The simile (repeat-previous-measure) mark: a slash flanked by two dots.
   * Drawn as SVG rather than a Unicode musical glyph, which most system fonts
   * lack and would silently render as tofu in a printed PDF.
   */
  const simile = () => {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "repeat previous bar");
    const slash = doc.createElementNS(SVG_NS, "line");
    for (const [k, v] of Object.entries({ x1: 5, y1: 19, x2: 19, y2: 5 })) {
      slash.setAttribute(k, String(v));
    }
    slash.setAttribute("stroke", "currentColor");
    slash.setAttribute("stroke-width", "2.4");
    slash.setAttribute("stroke-linecap", "round");
    svg.append(slash);
    for (const [cx, cy] of [
      [8, 7.5],
      [16, 16.5],
    ]) {
      const dot = doc.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "1.9");
      dot.setAttribute("fill", "currentColor");
      svg.append(dot);
    }
    const host = h("song-repeat", {});
    host.append(svg);
    return host;
  };

  /**
   * Chord symbol with the quality/extension set smaller and raised, jazz-style.
   * A slash bass note stays full size: C/E reads as root C, bass E.
   */
  const chord = (symbol) => {
    const m = /^([A-G][b#]?)([^/]*)(\/.*)?$/.exec(symbol.trim());
    if (!m) return doc.createTextNode(symbol);
    const [, root, quality, bass] = m;
    const frag = doc.createDocumentFragment();
    frag.append(h("song-root", { text: root }));
    if (quality) frag.append(h("song-quality", { text: quality }));
    if (bass) frag.append(h("song-bass", { text: bass }));
    return frag;
  };

  /** A single measure. Multiple chords split the bar's width evenly. */
  const bar = (chords) =>
    h(
      "song-bar",
      { "data-chords": chords.length },
      chords.length ? chords.map((c) => h("song-chord", {}, chord(c))) : simile(),
    );

  /**
   * A phrase: its row of bars, and beneath them its lyrics. Nesting the lyric
   * box inside the phrase box is what makes lyric width track the bars above
   * it — no second flex row to keep in sync.
   */
  const phrase = (p, withLyrics) => {
    const el = h("song-phrase", { style: `flex-grow: ${p.bars.length}` }, [
      h("song-bars", {}, p.bars.map(bar)),
      withLyrics
        ? h("song-lyric", {}, (p.lyrics ?? []).map((line) => h("song-line", { text: line })))
        : null,
    ]);
    return el;
  };

  /** Rows of phrase boxes, each phrase sized in proportion to its bar count. */
  const phrases = (section) => {
    const rows = phraseRows(section, MAX_BARS_PER_ROW);
    if (!rows.length) return null;
    return h(
      "song-rows",
      {},
      rows.map((row) => {
        const bars = row.reduce((n, p) => n + p.bars.length, 0);
        // If any phrase in the row sings, every phrase in the row gets a lyric
        // box, so a wordless phrase leaves an aligned gap, not a ragged edge.
        const anyLyrics = row.some((p) => p.lyrics?.length);
        return h(
          "song-phrases",
          { "data-density": bars > 6 ? "snug" : "roomy" },
          row.map((p) => phrase(p, anyLyrics)),
        );
      }),
    );
  };

  const section = (s, label) => {
    const bars = barCount(s);
    return h("song-section", { "data-type": sectionType(s.name) }, [
      h("song-head-row", {}, [
        h("song-label", { text: label }),
        bars ? h("song-bar-count", { text: `${bars} bars` }) : null,
      ]),
      phrases(s),
      ...(s.notes ?? []).map((n) => h("song-note", { text: n })),
    ]);
  };

  const head = (song) => {
    const facts = startingNotes(song).map(([label, value, kind]) =>
      h("song-fact", { "data-kind": kind }, [
        h("dt", { text: label }),
        h("dd", { text: value }),
      ]),
    );
    return h("song-head", {}, [
      h("h1", { text: song.title ?? "Untitled" }),
      song.artist ? h("p", { class: "artist", text: song.artist }) : null,
      facts.length ? h("dl", { class: "facts" }, facts) : null,
      song.countOff
        ? h("song-count-off", {}, [
            h("dt", { text: "Count off" }),
            h("dd", { text: song.countOff }),
          ])
        : null,
      ...(song.notes ?? []).map((n) => h("p", { class: "note", text: n })),
    ]);
  };

  const endNotes = (song) =>
    song.endNotes?.length
      ? h("song-end-notes", {}, song.endNotes.map((n) => h("p", { text: n })))
      : null;

  /** All the children of a <song-sheet>, in document order. */
  return function renderSong(song) {
    const labels = sectionLabels(song.sections ?? []);
    return [
      head(song),
      ...(song.sections ?? []).map((s, i) => section(s, labels[i])),
      endNotes(song),
      h("song-footer", { text: formatUpdated(song.updated) }),
    ].filter(Boolean);
  };
}
