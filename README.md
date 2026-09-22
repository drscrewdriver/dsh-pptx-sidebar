# dsh-pptx-sidebar

Read `.pptx` / `.pptm` decks in the DSH sidebar — the slides **in presentation
order**, with their text, bullet levels, speaker notes and inline pictures.

> **This is a reading view, not a slide reproduction.** No absolute positioning,
> no theme fonts, no placeholder inheritance, no animation. The viewer says so in
> its header, because a layout difference that looks like a rendering bug is
> worse than a plainly-labelled limitation.

It is a [dsh-better-sidebar](https://www.npmjs.com/package/dsh-better-sidebar)
consumer: it registers a file previewer and renders inside the Side card's
preview area. Without that plugin it loads, warns once, and does nothing.

---

## Install

```bash
dsh plugin --profile <profile> add github:drscrewdriver/dsh-pptx-sidebar#<sha>
dsh plugin --profile <profile> add dsh-pptx-sidebar@0.1.0     # once published
```

Then **restart the DSH host** — a browser refresh is not enough for a new loader
row. Verify without starting anything:

```bash
dsh --profile <profile> --dump-config | Select-String dsh-pptx-sidebar
```

Manual installation is three steps, not one — see `cordis.patch.yml`. Doing only
steps 1 and 3 produces a profile where the package is present, the patch row is
present, **and nothing loads, silently**.

## What it does / does not do

| Done | Not done |
|------|----------|
| Slide list in `p:sldIdLst` order | Visual layout, absolute positioning |
| Text paragraphs, per-paragraph bullet levels | Theme/master font resolution |
| Title detection from placeholder type | **Placeholder inheritance** (see below) |
| Speaker notes from `notesSlide` parts | Charts re-rendered as charts |
| Inline pictures as blob URLs | Animation, transitions, timings |
| Real tables (`a:tbl`) | Comments, revision marks |
| Bold / italic runs | Editing, writing back |
| Seven circuit-breaker ceilings | Legacy `.ppt` (BIFF/OLE2), WPS formats |

### The placeholder inheritance line (deliberate)

A slide often shows text it does not contain: numbers, footers, and title text
that live in `slideLayout` / `slideMaster`, referenced through a `p:ph`
placeholder. Resolving that means re-implementing PowerPoint's inheritance chain
— including `lstStyle` level overrides and which layout the slide actually uses.

**v1 does not do it.** Only the slide's own part is read. The consequence is
stated rather than hidden: a slide whose text is entirely inherited renders with
no text. That is a visible omission, not a corruption — the opposite trade
(inheriting wrongly) would show text that is not on the slide.

## The pipeline

```
archive bytes (host /sidebar/file, custom loader)
  → archive-size gate                      refuse before any unpacking
  → central directory (declared-size gate) refuse a lying part before inflating
  → streaming inflate + total budget       the zip-bomb gate
  → ppt/presentation.xml                   p:sldIdLst — slide ORDER
  → ppt/_rels/presentation.xml.rels        rId → slides/slideN.xml
  → ppt/slides/slideN.xml                  p:spTree → p:sp / p:pic / p:graphicFrame
  │     p:txBody → a:p → a:pPr@lvl (level), a:r → a:rPr(b/i) + a:t
  │     p:pic    → a:blip@r:embed → slide rels → ppt/media/*
  │     p:grpSp  → recursed, never flattened away
  ├→ ppt/slides/_rels/slideN.xml.rels      .../notesSlide → notesSlides/notesSlideN.xml
  └→ rules: a slide too long loses only its own tail; notes absent is silence
```

Pictures are pulled out of the zip and turned into object URLs. An embedded image
lives *inside* the archive, so there is no host route to point at — this is not
"reading files ourselves", it is using the bytes the host already handed over.

## Seven circuit-breaker ceilings

| Dimension | Default | Over it |
|-----------|---------|---------|
| Archive size | 8 MB | BLOCKED — refused before any unpacking |
| Total inflate | 64 MB | BLOCKED — the zip-bomb gate |
| One part | 32 MB | BLOCKED — a single oversized XML part |
| Slides | 300 | TRUNCATED — the reader stops walking the deck |
| Slide text | 20 000 chars | that slide's remaining text elided |
| Images | 200 | further pictures skipped |
| One image | 8 MB | that picture skipped (not even inflated) |

**At most one warning per dimension**, structurally — warnings live in a
`Map<reason, warning>`, so a dimension that trips on every slide produces one
line, not sixty.

The per-slide text ceiling elides only the offending slide. A per-block ceiling
would shave every slide equally and lose information the deck had budget for; the
failure mode we accept instead is "slide 12 is cut short".

## Tests

```bash
npm install
npm run verify          # build (bundle load gate) + tests
npm test                # 19 checks
```

The fixture is a real pptx-shaped zip built in the test file, with a genuine
tiny PNG. It is hostile where the format is:

- `p:sldIdLst` lists **slide2 before slide1**, so sorting parts by filename would
  pass every other assertion and still be wrong;
- one slide relationship uses an **absolute** target, another is **External**;
- `ppt/slideLayouts/slideLayout1.xml` carries `MASTER TEXT MUST NOT APPEAR`, which
  must never surface — that is what "no placeholder inheritance" means here.

## Layout

| File | Role |
|------|------|
| `pptx.ts` | The reader: parts, relationships, shape tree, notes, pictures |
| `circuit-breaker.ts` | The seven ceilings and the single-warning-per-dimension rule |
| `zip.ts` / `xml.ts` | Container reading; targeted XML scanning with depth counting |
| `PptxViewer.tsx` | Slide strip, current-slide rendering, object-URL lifetime |
| `locales.ts` | zh / en dictionaries, including every warning template |
| `seams.ts` | Structural mirrors of the client services we consume |

The zip and XML code is **copied** from the sibling document plugin rather than
shared. Two users of this code is not yet the threshold for extracting a package
— that would add a third thing to publish and version-lock.

## License

MIT
