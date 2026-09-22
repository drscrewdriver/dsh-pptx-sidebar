/**
 * The circuit breaker, deck edition.
 *
 * Seven ceilings, each able to stop the reader early rather than after the
 * damage:
 *
 * | dimension      | default | over it                                       |
 * |----------------|---------|-----------------------------------------------|
 * | archive size   | 8 MB    | BLOCKED — refused before any unpacking         |
 * | total inflate  | 64 MB   | BLOCKED — the zip-bomb gate                    |
 * | one part       | 32 MB   | BLOCKED — a single oversized XML part          |
 * | slides         | 300     | TRUNCATED — the reader stops walking the deck  |
 * | slide text     | 20 000  | that slide's remaining text elided, warned     |
 * | images         | 200     | further pictures skipped, warned               |
 * | one image      | 8 MB    | that picture skipped, warned                   |
 *
 * **At most one warning per reason** is structural here (a Map keyed by
 * reason), not a convention: a dimension that trips twice — once per slide, say
 * — would otherwise render a banner line per slide. A sibling plugin shipped
 * exactly that bug and had to publish a patch release for it.
 *
 * The per-slide text ceiling elides only the offending slide: a deck with one
 * runaway slide stays readable everywhere else (a per-block ceiling would
 * instead shave every slide equally, losing information the reader had budget
 * for).
 *
 * Pure module: no DOM, no React, no imports beyond local types.
 */
import type {
  BreakerReason,
  BreakerState,
  BreakerWarning,
  PptxConfig,
  PptxImage,
  PptxMeta,
  PptxResult,
  SlideBlock,
  SlideInfo,
} from './types'

/** Ceilings. Three container gates plus four deck budgets. */
export const DEFAULT_CONFIG: PptxConfig = {
  maxFileSize: 8 * 1024 * 1024,
  maxInflatedBytes: 64 * 1024 * 1024,
  maxPartBytes: 32 * 1024 * 1024,
  maxSlides: 300,
  maxSlideText: 20_000,
  maxImages: 200,
  maxImageBytes: 8 * 1024 * 1024,
}

/** Human-readable byte size. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The breaker's mutable face. */
export interface PptxBreaker {
  readonly config: PptxConfig
  /** Enter READING and seed the metadata the header strip shows. */
  startReading(seed: Partial<PptxMeta>): void
  /**
   * Open one slide. Returns false when the slide ceiling is reached, meaning
   * the reader should stop walking the deck entirely.
   */
  startSlide(part: string, index: number): boolean
  /**
   * Offer one block for the current slide. Returns false once this slide's text
   * budget is spent: later blocks on THIS slide are dropped, other slides are
   * unaffected.
   */
  push(block: SlideBlock): boolean
  /** Offer one picture. Returns false to skip it (and says why, once). */
  takeImage(image: PptxImage): boolean
  /**
   * Record a picture that was never read at all (its declared size already
   * exceeded the ceiling, so inflating it would be wasted work).
   */
  skipImage(reason: BreakerReason, detail: BreakerWarning['detail']): void
  /** Mark the run BLOCKED (nothing usable will be produced). */
  block(reason: BreakerReason, detail: BreakerWarning['detail']): void
  /** Mark the run TRUNCATED (usable, but incomplete). */
  warn(reason: BreakerReason, detail: BreakerWarning['detail']): void
  /** Close the run and hand back the renderable result. */
  finalize(): PptxResult
  state(): BreakerState
}

/** Build one breaker run. */
export function createBreaker(config: Partial<PptxConfig> = {}): PptxBreaker {
  const cfg: PptxConfig = { ...DEFAULT_CONFIG, ...config }
  let state: BreakerState = 'IDLE'
  let slidesTotal = 0
  let blocksTotal = 0
  let imagesSeen = 0
  let imagesKept = 0
  let imagesSkipped = 0
  let notesSlides = 0
  const slides: SlideInfo[] = []
  /** The slide being filled, or null before the first `startSlide`. */
  let current: SlideInfo | null = null
  /** Text budget consumed so far by the current slide. */
  let currentText = 0
  /** Keyed by reason: one dimension, one line. */
  const warnings = new Map<BreakerReason, BreakerWarning>()
  const meta: PptxMeta = {
    fileName: '',
    fileSize: 0,
    slidesRendered: 0,
    slidesTotal: 0,
    blocksRendered: 0,
    blocksTotal: 0,
    images: 0,
    imagesSkipped: 0,
    notesSlides: 0,
  }

  /** Record a warning once, and mark the run truncated unless it is blocked. */
  const trip = (reason: BreakerReason, detail: BreakerWarning['detail']): void => {
    if (!warnings.has(reason)) warnings.set(reason, { reason, detail })
    if (state !== 'BLOCKED') state = 'TRUNCATED'
  }

  return {
    config: cfg,

    startReading(seed) {
      state = 'READING'
      Object.assign(meta, seed)
    },

    startSlide(part, index) {
      slidesTotal++
      if (slides.length >= cfg.maxSlides) {
        trip('slides', { kept: cfg.maxSlides, found: slidesTotal })
        current = null
        return false
      }
      current = { part, index, blocks: [] }
      currentText = 0
      slides.push(current)
      return true
    },

    push(block) {
      blocksTotal++
      if (current === null) return false

      // Tables and pictures carry their content outside `text`, so only prose
      // counts against the budget.
      const cost = block.kind === 'table' || block.kind === 'image' ? 0 : block.text.length
      if (currentText + cost > cfg.maxSlideText) {
        trip('text-length', { found: currentText + cost, limit: cfg.maxSlideText })
        return false
      }
      currentText += cost
      if (block.kind === 'note') notesSlides++
      current.blocks.push(block)
      return true
    },

    takeImage(image) {
      imagesSeen++
      if (image.bytes.byteLength > cfg.maxImageBytes) {
        imagesSkipped++
        trip('image-bytes', { found: formatBytes(image.bytes.byteLength), limit: formatBytes(cfg.maxImageBytes) })
        return false
      }
      if (imagesKept >= cfg.maxImages) {
        imagesSkipped++
        trip('images', { kept: cfg.maxImages, found: imagesSeen })
        return false
      }
      imagesKept++
      return true
    },

    block(reason, detail) {
      warnings.set(reason, { reason, detail })
      state = 'BLOCKED'
    },

    skipImage(reason, detail) {
      imagesSeen++
      imagesSkipped++
      trip(reason, detail)
    },

    warn: trip,

    finalize() {
      if (state !== 'BLOCKED' && state !== 'TRUNCATED') {
        state = warnings.size > 0 ? 'TRUNCATED' : 'OK'
      }
      meta.slidesRendered = slides.length
      meta.slidesTotal = slidesTotal
      meta.blocksRendered = slides.reduce((sum, slide) => sum + slide.blocks.length, 0)
      meta.blocksTotal = blocksTotal
      meta.images = imagesKept
      meta.imagesSkipped = imagesSkipped
      meta.notesSlides = notesSlides
      return { state, meta: { ...meta }, slides, warnings: [...warnings.values()] }
    },

    state: () => state,
  }
}

/** A BLOCKED result with no content — the one shape every failure path returns. */
export function blockedResult(
  fileName: string,
  fileSize: number,
  config: Partial<PptxConfig>,
  reason: BreakerReason,
  detail: BreakerWarning['detail'],
): PptxResult {
  const breaker = createBreaker(config)
  breaker.startReading({ fileName, fileSize })
  breaker.block(reason, detail)
  return breaker.finalize()
}
