import {
  sectionLabels,
  sectionType,
  startingNotes,
  formatUpdated,
  phraseRows,
  barCount,
} from "./song.js";
import { INSTRUMENTS } from "./transpose.js";

/** Bars beyond this wrap to another row, keeping 8- and 4-bar phrasing legible. */
export const MAX_BARS_PER_ROW = 8;

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Builds a chart's DOM from song data. The document is injected rather than
 * taken from the global scope so the same code runs in the browser and under
 * the tiny shim in tools/prerender.js (WeasyPrint cannot execute JavaScript,
 * so PDF checks need a statically rendered file).
 */
export function createRenderer(doc, { editing = false } = {}) {
  /**
   * Marks an element as an editable leaf. `path` addresses the value in the song
   * JSON and `kind` says how to edit it. Emitted only in edit mode so printed
   * output carries no editing metadata.
   */
  const editable = (path, kind, placeholder) =>
    editing
      ? { "data-path": path, "data-edit": kind, ...(placeholder ? { "data-placeholder": placeholder } : {}) }
      : {};

  const h = (tag, attrs = {}, children = []) => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    // flat(Infinity): callers pass nested arrays, e.g. a list of note elements
    // alongside single children.
    for (const c of [children].flat(Infinity)) if (c) el.append(c);
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
  const bar = (chords, path) =>
    h(
      "song-bar",
      { "data-chords": chords.length, ...editable(path, "bar") },
      chords.length ? chords.map((c) => h("song-chord", {}, chord(c))) : simile(),
    );

  /**
   * A phrase: its row of bars, and beneath them its lyrics. Nesting the lyric
   * box inside the phrase box is what makes lyric width track the bars above
   * it — no second flex row to keep in sync.
   */
  const phrase = (p, withLyrics, sectionIndex) => {
    const base = `sections.${sectionIndex}.phrases.${p.index}`;
    return h("song-phrase", { style: `flex-grow: ${p.bars.length}` }, [
      h(
        "song-bars",
        {},
        p.bars.map((chords, i) => bar(chords, `${base}.chords.${i}`)),
      ),
      withLyrics
        ? h(
            "song-lyric",
            editable(`${base}.lyrics`, "lines"),
            (p.lyrics ?? []).map((line) => h("song-line", { text: line })),
          )
        : null,
    ]);
  };

  /** Rows of phrase boxes, each phrase sized in proportion to its bar count. */
  const phrases = (section, sectionIndex) => {
    const rows = phraseRows(section, MAX_BARS_PER_ROW);
    if (!rows.length) return null;
    return h(
      "song-rows",
      {},
      rows.map((row) => {
        const bars = row.reduce((n, p) => n + p.bars.length, 0);
        // If any phrase in the row sings, every phrase in the row gets a lyric
        // box, so a wordless phrase leaves an aligned gap, not a ragged edge.
        // In edit mode every phrase gets one, so there is always a target.
        const anyLyrics = editing || row.some((p) => p.lyrics?.length);
        return h(
          "song-phrases",
          { "data-density": bars > 6 ? "snug" : "roomy" },
          row.map((p) => phrase(p, anyLyrics, sectionIndex)),
        );
      }),
    );
  };

  const section = (s, label, i) => {
    const bars = barCount(s);
    const notes = s.notes ?? [];
    return h("song-section", { "data-type": sectionType(s.name) }, [
      h("song-head-row", {}, [
        h("song-label", { ...editable(`sections.${i}.name`, "text"), text: label }),
        bars ? h("song-bar-count", { text: `${bars} bars` }) : null,
      ]),
      phrases(s, i),
      // One editable block for all of a section's notes, one per line.
      editing
        ? h(
            "song-note",
            editable(`sections.${i}.notes`, "lines", "Section notes"),
            notes.map((n) => h("song-line", { text: n })),
          )
        : notes.map((n) => h("song-note", { text: n })),
    ]);
  };

  const head = (song) => {
    const facts = startingNotes(song, { includeEmpty: editing }).map(
      ({ label, value, path, kind }) =>
        h("song-fact", { "data-kind": kind }, [
          h("dt", { text: label }),
          h("dd", { ...editable(path, "text", label), text: value }),
        ]),
    );
    const notes = song.notes ?? [];
    return h("song-head", {}, [
      h("h1", { ...editable("title", "text"), text: song.title ?? "Untitled" }),
      song.artist || editing
        ? h("p", {
            class: "artist",
            ...editable("artist", "text", "Artist"),
            text: song.artist ?? "",
          })
        : null,
      facts.length ? h("dl", { class: "facts" }, facts) : null,
      // Printed on the chart so a transposed part is never mistaken for a
      // concert one once it is a PDF on someone's tablet.
      song.transposedFor
        ? h("song-transposed", {
            text: `${INSTRUMENTS[song.transposedFor]?.label ?? song.transposedFor} — written in ${song.key}, concert ${song.concertKey}`,
          })
        : null,
      song.countOff || editing
        ? h("song-count-off", {}, [
            h("dt", { text: "Count off" }),
            h("dd", {
              ...editable("countOff", "text", "Who counts off, and how"),
              text: song.countOff ?? "",
            }),
          ])
        : null,
      editing
        ? h(
            "p",
            { class: "note", ...editable("notes", "lines", "Starting notes") },
            notes.map((n) => h("song-line", { text: n })),
          )
        : notes.map((n) => h("p", { class: "note", text: n })),
    ]);
  };

  const endNotes = (song) => {
    const lines = song.endNotes ?? [];
    if (!lines.length && !editing) return null;
    return h(
      "song-end-notes",
      editable("endNotes", "lines", "Ending notes"),
      lines.map((n) => h("p", { text: n })),
    );
  };

  /** All the children of a <song-sheet>, in document order. */
  return function renderSong(song) {
    const labels = sectionLabels(song.sections ?? []);
    return [
      head(song),
      ...(song.sections ?? []).map((s, i) => section(s, labels[i], i)),
      endNotes(song),
      h("song-footer", { text: formatUpdated(song.updated) }),
    ].filter(Boolean);
  };
}
