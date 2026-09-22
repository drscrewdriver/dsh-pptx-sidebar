# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
