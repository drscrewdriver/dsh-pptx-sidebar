# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-09-23

Width adaptation: the reading view scales with the sidebar pane, within bounds.

### Added

- **Width-adaptive scale** (`src/client/scale.ts` + `useReaderScale.ts`): a
  width-derived factor is written to the `--reader-scale` custom property, the
  root font-size becomes `13px × scale`, and the slide content is expressed in
  `em` so it follows. At the base width of **360 px the factor is exactly 1**, so
  the layout is unchanged at the usual pane width; the floor is **0.9** and the
  ceiling **1.15**.
- **Only the document scales.** Titles, bullets, paragraphs, notes, tables and
  image captions follow the factor; the header strip, the slide strip, the
  breaker banner and the loading/empty states keep their fixed size. Chrome that
  resizes while you drag a divider reads as a glitch, not as responsiveness.
- **Quantised to two decimals**, so dragging a divider re-lays-out on 0.01 steps
  instead of on every pixel.
- **Unmeasurable widths fall back to 1** — 0, negative, NaN or Infinity (first
  frame, broken report) render the shipped layout rather than an extreme of the
  range, which would flash tiny type on open.
- **Bullet indent in `em`** (`INDENT_EM = 1.08em`), which is the 14 px it used to
  be at scale 1.
- **Table cell cap 320 px → 24.6em**, so cells narrow with the pane instead of
  forcing a horizontal scrollbar.

### Changed

- Pictures still render at the size the shape transform states, capped only by
  the pane: magnifying a bitmap past its natural size to match the text scale
  would make it softer, not more faithful.

### Tests

- 5 new checks (24 total), covering: the factor being exactly 1 at the base
  width, both bounds, monotonicity, the unmeasurable-width fallback, two-decimal
  quantisation, and the indent matching 14 px at scale 1.

## [0.1.0] — 2026-09-22

First release. Reads `.pptx` / `.pptm` as a structured reading view in the DSH
right sidebar.

### Added

- File previewer registration for `.pptx` and `.pptm` (`priority: 50`,
  `fetchStrategy: 'custom'`), pulling bytes through better-sidebar's
  `/sidebar/file` route so the workspace path fence stays on the host side.
- Slide list whose order comes **only** from `p:sldIdLst` resolved through
  presentation relationships — never from sorting part filenames. Absolute and
  `../`-relative relationship targets both resolve; External targets are ignored.
- Shape-tree walking (`p:sp`, `p:pic`, `p:graphicFrame`, `p:grpSp`) with a single
  depth counter, so grouped shapes contribute their text exactly once.
- Text extraction with per-paragraph bullet levels (`a:pPr@lvl`, 0-based → 1-based)
  and bold / italic runs.
- Title detection from placeholder **type** (`title` / `ctrTitle`), not from
  position or font size.
- Speaker notes from `notesSlide` parts, skipping the slide-image placeholder. A
  slide with no notes produces no block, no warning and no error.
- Inline pictures: `a:blip@r:embed` → relationship → archive bytes → blob URL,
  with EMU→px sizing. Unrenderable formats (EMF/WMF) become labelled
  placeholders instead of silent gaps.
- Real tables from `a:tbl` graphic frames.
- Seven circuit-breaker ceilings (archive / total inflate / single part / slides /
  slide text / images / single image), with **one warning per dimension**.
- zh and en dictionaries, including a template for every breaker reason.
- Build with a real load gate: the client bundle is evaluated in a `node:vm`
  sandbox and the factory's export is asserted to carry `apply` and `inject`.
- `npm test` — 19 checks against a hostile fixture built in-process.
- Publishing and profile-migration scripts (`-DryRun` by default), including a
  preflight that refuses a spec which does not yet resolve.

### Deliberately not included

- Placeholder inheritance from layouts and masters: v1 reads only the slide's own
  part. See the README section of the same name for the reasoning.
- Visual layout fidelity, theme fonts, animation, editing, `.ppt` support.
