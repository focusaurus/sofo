# sofo: Song Form Documents

Song form documents give you a beautiful and readable document to see your song's **form, lyrics, chords, and notes**. It was designed specifically for musicians to read from a tablet or paper during rehearsals and performances.

## Try it now! It's free!

[sofo online](https://sofo.peterlyons.org)

## How is it better than sheet music or lyrics in a google doc?

All the existing options have serious drawbacks that motivated me to create this format and WYSIWYG tool.

- sheet music
  - many excellent musicians cannot read sheet music
  - commercial sheet music software is expensive
  - entering songs into full-feature sheet music software is very time-consuming and tedious
  - Rhythm section players often don't need nor want full-on sheet music with melodies notated exactly
- word processing document with lyrics (google docs, MS word, text file, etc)
  - Not designed for this purpose
  - everyone hacks together some bespoke format and conventions
  - very hard to express measures and corresponding lyrics, etc
  - Pete was tired of every band coming up with some flavor of this that was super confusing and not built around the concept of measures, phrases, sections
- learn everything by ear and play from memory
  - takes ages and ages to teach a band a song this way
  - unless your band is performing the entire catalog regularly, everyone forgets parts of every song always
  - often leads to unintended variance where every performance is slightly different but not on purpose, just because the band can't agree and remember on the form

## How does it work?

This is a web-based application that creates and edits song data files using a standar JSON data format. You can use the WYSIWYG web editor to notate your song and then save a `.sf.json` file.

The application is designed for songs to be printed to PDF then loaded into a music reader app (ForScore or similare), or printed onto paper.

Look through the default song that is loaded in the app, the lyrics and notes guide you on what the format can support and how to use it.

## Whiz-bang features

- Transposing! Enter your song in concert pitch and click to get variants for transposing instruments!
- Automatic section numbering: verse 1, verse 2, chorus 1, etc
- Notes supported at the top, in each section, and at the end.
- Undo support

## License

This project is licensed under the Creative Commons Attribution-NonCommercial 4.0 International license. See LICENSE file for details.
