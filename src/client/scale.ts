/**
 * Width-adaptive reading scale.
 *
 * The sidebar is resizable, and a reading view that ignores that wastes the pane
 * when it is wide and overflows it when it is narrow. So the document's
 * typography is scaled by one factor derived from the container width.
 *
 * Three properties are deliberate, and each is asserted in the test suite:
 *
 * 1. **At the base width the factor is exactly 1.** Nothing about the current
 *    layout changes for anyone whose sidebar is the usual width — this is an
 *    adaptation, not a redesign.
 * 2. **It is bounded.** Growing text without a ceiling produces absurd sizes in
 *    a wide pane, and shrinking it without a floor makes a narrow one unreadable.
 *    The bounds are the "do not overdo it" line.
 * 3. **It is quantised.** A drag-resize fires continuously; re-laying out on
 *    every pixel of the drag is wasted work for no visible gain.
 *
 * What scales is the DOCUMENT — headings, paragraphs, lists, notes, tables,
 * images' captions. What does not is the APPLICATION around it: the header
 * strip, the breaker banner, the loading and empty states. Chrome that changes
 * size while you drag a divider reads as a glitch, not as responsiveness.
 *
 * Pure module: no DOM, no React.
 */

/** The knobs. All three are in CSS-pixel / ratio units. */
export const READER_SCALE = {
  /** Width at which the factor is exactly 1. */
  base: 360,
  /** Floor: the narrowest pane still gets readable type. */
  min: 0.9,
  /** Ceiling: a wide pane gets comfortable type, not enormous type. */
  max: 1.15,
} as const

/** The CSS custom property the stylesheet reads. */
export const SCALE_VAR = '--reader-scale'

/** Bullet indent per level, in `em` — so it scales with the body text. */
export const INDENT_EM = 1.08

/**
 * The scale for one container width.
 *
 * A width that is missing or nonsensical (0 during mount, NaN from an odd
 * observer report, a negative from a maximised-then-collapsed pane) falls back
 * to 1 rather than to a bound: an unmeasurable pane should render the layout we
 * would have shipped anyway, not the extreme of the range.
 */
export function readerScaleFor(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 1
  const raw = width / READER_SCALE.base
  return Math.min(READER_SCALE.max, Math.max(READER_SCALE.min, raw))
}

/** Round to two decimals, so a drag does not re-lay-out on every pixel. */
export function quantizeScale(scale: number): number {
  return Math.round(scale * 100) / 100
}

/** Convenience: the value to write into the CSS custom property. */
export function readerScaleCss(width: number): string {
  return String(quantizeScale(readerScaleFor(width)))
}
