# sofo — Song Form notation

Chord charts for bands who read chord symbols, not notation. A song is one JSON
file; the browser renders it to a US-Letter page and "Save as PDF" is the export.

**This document is the format spec.** It is written for agents converting existing
charts (Google Docs, text files, memory) into sofo files.

## File naming

Song documents use a **double extension**: `<slug>.sf.json`

- `.sf` = **s**ong **f**orm, a hint that this JSON follows this spec
- `.json` last, so editors, linters and tooling still treat it as JSON

Examples: `start-here.sf.json`, `blame-it-on-the-boogie.sf.json`. Slugs are
lowercase, hyphen-separated. Live in `songs/`.

## Quick example

```json
{
  "title": "Start Here",
  "artist": "The Sofo Demo Band",
  "key": "C",
  "time": "4/4",
  "tempo": 96,
  "groove": "Easy backbeat",
  "countOff": "Drums: 4 on the hi-hat",
  "notes": ["Watch the stops before each chorus."],
  "updated": "2026-07-26T15:30:00Z",
  "sections": [
    {
      "name": "intro",
      "notes": ["Guitar alone for 4."],
      "phrases": [{ "chords": ["C", "", "", ""] }]
    },
    {
      "name": "verse",
      "phrases": [
        {
          "chords": ["C", "Am7", ["Dm7", "G7"], "C"],
          "lyrics": ["First line of the verse,", "second line of the verse."]
        }
      ]
    }
  ],
  "endNotes": ["Hold the last C till the leader cuts it."]
}
```

## Top level

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Large, centered at the top. |
| `artist` | string | Under the title. |
| `key` | string | Concert pitch. `"C"`, `"Eb"`, `"Am"`, `"F#m"`. |
| `time` | string | `"4/4"`, `"6/8"`, `"3/4"`. |
| `tempo` | number | BPM. Keep it a number, not a string. |
| `tempoUnit` | string | Optional. See [Tempo](#tempo). |
| `groove` | string | The feel: `"Fast punk"`, `"Blues shuffle"`, `"Hip-hop"`, `"Reggae"`, `"Four-on-the-floor disco"`. Keep it short — it renders on one line. `"feel"` is accepted as an alias. |
| `countOff` | string | Who counts and how: `"Drums: 4 on the hi-hat"`. Gets its own line. |
| `notes` | string[] | Starting notes, one paragraph per entry, printed under the header. |
| `sections` | Section[] | The song. See below. |
| `endNotes` | string[] | Printed after the last section. Endings, repeats, cues. |
| `updated` | string | ISO 8601. The date shows in the page footer. The app rewrites this on every edit. |

Every field except `sections` is optional; empty ones are simply not rendered.

## Sections

```json
{ "name": "chorus", "label": "Refrain", "notes": ["..."], "phrases": [ ... ] }
```

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Section type, lowercase. Drives the label, numbering, and color. |
| `label` | string | Optional override for the displayed name. |
| `notes` | string[] | Cues and dynamics, italic under the bars. |
| `phrases` | Phrase[] | See below. |

**Numbering is automatic.** Reuse the same `name` and sections number
themselves: `verse`, `verse`, `chorus`, `verse` renders as `Verse 1`, `Verse 2`,
`Chorus`, `Verse 3`. A name used only once gets no number. **Never write
`"verse 1"` yourself.**

**Recognized names** get a distinct background tint: `intro`, `verse`,
`prechorus`, `chorus`, `bridge`, `interlude`, `solo`, `breakdown`, `vamp`,
`outro`. Anything else renders with a neutral tint and still works — use a real
name if the song has one (`"tag"`, `"double chorus"`).

Tints are matched in luminance so a grayscale print stays uniform: color never
carries meaning on its own, the label does.

## Phrases

A phrase is one musical line — conventionally 4 bars, sometimes 2 or 8. Phrases
in a section sit side by side on one row, each as wide as its bar count, and wrap
to a new row past 8 bars. **Prefer 4-bar phrases**; they are what makes an 8-bar
section read as two lines of four.

```json
{ "chords": ["C", "Am7", "Dm7", "G7"], "lyrics": ["...", "..."] }
```

| Field | Type | Notes |
| --- | --- | --- |
| `chords` | (string \| string[])[] | One entry **per bar**. |
| `lyrics` | string[] | Lines of text under this phrase's bars. |

## Bars and chords

`chords` has one entry per bar, and the entry type carries meaning:

| Entry | Meaning | Renders as |
| --- | --- | --- |
| `"C"` | one chord for the bar | `C` |
| `""` | keep playing the previous chord | simile mark (a slash with two dots) |
| `["Dm7", "G7"]` | two chords sharing the bar | split bar, divided |

So `["C", "", "", ""]` is four bars of C, and `["C", "Am7", ["Dm7", "G7"], "C"]`
is four bars where the third splits in two. Harmonic rhythm is deliberately not
finer than this — the format does not model beats.

**Chord symbols** are `root + quality + optional /bass`:

- root: `A`–`G` with optional `#` or `b`
- quality: free text, rendered smaller and raised — `maj7`, `m7`, `7sus4`, `6`, `m7b5`, `13`
- bass: `/E`, rendered full size — `Ab/Eb`

Anything unparseable passes through verbatim, so `"N.C."` is fine.

**Always write concert pitch.** The app transposes for Bb/Eb/F/A instruments — and
for guitar capo positions 1-7, which move the chart the other way — as a view; the
file itself never changes.

## Lyrics

`lyrics` are plain lines attached to a phrase. They only need to indicate *which
words go with which four bars* — vocalists know the tune. Do not attempt
syllable or rhythm alignment.

Two lines per 4-bar phrase is the common case. Long lines wrap and the box grows.

## Notes

Three places, all `string[]`, all rendered in a quieter style:

- top-level `notes` — how the song starts, general reminders
- section `notes` — cues for that section (`"Half time, drums on rims"`)
- top-level `endNotes` — how the song ends

## Tempo

`tempo` is a number. `tempoUnit` names the note value it counts, drawn as a
metronome marking (`♩= 96`, drawn as SVG, not a font glyph):

`half` · `dotted-half` · `quarter` · `dotted-quarter` · `eighth`

**Usually omit it.** When absent it is inferred from `time`: 6/8, 9/8 and 12/8
count in dotted quarters, everything else in quarters. Set it explicitly only
when the song contradicts that — e.g. a cut-time chart counted in half notes.

## Shorthands

These are accepted on input and expanded when the file is loaded:

| Shorthand | Expands to |
| --- | --- |
| `{"bars": 8}` on a section | one 8-bar phrase with no chords |
| `"chords"` on a section | a single phrase holding them |
| `"lyrics"` on a section | moves onto that single phrase |

The canonical form is always `sections[].phrases[].chords[]`. Files the app saves
are canonical. **Write canonical form when converting**; the shorthands exist for
hand-sketching.

## Converting an existing chart

1. **Count bars first.** Get the form right — 8-bar verse, 8-bar chorus — before
   any chords. Bars per phrase is the backbone; everything hangs off it.
2. **Split into 4-bar phrases.** Two per 8-bar section.
3. **Use `""` for held chords** rather than repeating the symbol. A Google Doc
   that reads `| C | C | C | C |` should become `["C", "", "", ""]`.
4. **Reuse section names** and let numbering happen. Docs saying "Verse 2"
   become a second `{"name": "verse"}`.
5. **Repeated sections are duplicated, not referenced.** Three identical
   choruses are three entries. That is deliberate — verse 3 usually differs
   slightly, and a chart shows the song in playing order.
6. **Lyrics: assign to the phrase they start on.** Split at the 4-bar boundary,
   trim leading/trailing whitespace, one array entry per line. Drop verse/chorus
   headings from the lyric text — the section label says it.
7. **Prose that is an instruction, not a lyric, goes in `notes`.** "Watch the
   stop", "guitar solo 16 bars", "everybody out" are notes.
8. **Set `updated`** to the conversion date, ISO 8601.
9. **Aim for one page.** A 4-minute pop song at 8-bar sections usually fits.
   Long charts paginate at section boundaries.

Do not invent harmony you cannot source. If the doc omits chords for a section,
emit the right number of empty bars (`["", "", "", ""]`) and add a note.

## Checking your work

```sh
python3 -c "import json;json.load(open('songs/x.sf.json'))"   # valid JSON
node tools/test-edit.js                                       # format + render
python3 -m http.server 8123                                   # then open /
```

`tools/pdf.sh songs/x.sf.json [C|Bb|Eb|F|A]` renders a PDF plus page PNGs via
WeasyPrint. It takes a while and WeasyPrint is only an approximation of Chrome —
use it to check pagination and content, not final typography. Chrome's
"Save as PDF" is the real target.

## Repo map

| Path | What |
| --- | --- |
| `index.html` | The app. Loads a song, renders it, offers editing. |
| `src/song.js` | Data helpers: normalization, labels, tempo units. |
| `src/render.js` | Song data → DOM. Pure projection, no event handlers. |
| `src/sheet.css` | All styling. Print-first, sized in inches and points. |
| `src/sheet.js` | `<song-sheet>` and `<song-controls>` custom elements. |
| `src/edit.js` | Click-to-edit leaves, keyboard bar entry. |
| `src/structure.js` | Pure add/duplicate/move/delete operations. |
| `src/transpose.js` | Diatonic transposition for Bb/Eb/F/A instruments and guitar capos. |
| `songs/*.sf.json` | Song documents. |
| `tools/` | Prerender, PDF check, tests. |

## Conventions worth preserving

- **Glyphs are drawn, not typed.** The simile mark, the duplicate icon and the
  tempo note value are inline SVG because `♩` (U+2669) and the Musical Symbols
  block are missing from Noto Sans, Source Sans, DejaVu and Liberation — a
  character would print as an empty box. A test enforces this.
- **The DOM is a projection of the data.** Editing writes through a `data-path`
  into the JSON and re-renders; nothing reads state back out of the DOM.
- **Editors lie over their leaf, never replace it.** The control is an absolutely
  positioned child of the element it edits, so the leaf keeps its box and its
  place in the flow and opening an editor moves nothing on the page. Font and
  alignment come by inheritance; the focus ring is an `outline`, which costs no
  space. Anything that hides or unhooks the leaf brings the layout jump back.
- **Print output carries no editing chrome.** Buttons and `data-*` editing
  attributes are emitted only in edit mode. A test enforces this too.
- **Print-first units.** Inches and points, not pixels; hairlines are `0.75pt`
  so they survive rasterization at 300dpi.
