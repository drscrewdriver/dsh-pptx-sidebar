/**
 * The deck model this plugin renders. Pure types — no DOM, no React — so the
 * parser and the breaker stay testable under plain Node.
 */

/** One inline run: text with the formatting we actually honour. */
export interface TextRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

/** A picture pulled out of the archive, ready to become an object URL. */
export interface PptxImage {
  /** The zip entry name (`ppt/media/image1.png`). */
  name: string
  mime: string
  bytes: Uint8Array
  /** Pixel size when the drawing declares one (EMU converted). */
  widthPx?: number
  heightPx?: number
  /** True when the browser cannot render this format (e.g. EMF/WMF). */
  unsupported?: boolean
  /** Why it was skipped — an uppercase extension for unsupported formats. */
  reason?: string
}

/** What one block inside a slide is. */
export type SlideBlockKind = 'title' | 'paragraph' | 'bullet' | 'table' | 'image' | 'note'

/** One renderable block, in slide order. */
export interface SlideBlock {
  kind: SlideBlockKind
  /** Bullet indent level (1-based): `a:pPr@lvl="0"` is level 1. */
  level?: number
  /** Concatenated run text (kept so tests and search need no run walking). */
  text: string
  runs?: TextRun[]
  /** Table cells, row-major. */
  rows?: string[][]
  /** Picture for `kind: 'image'`. */
  image?: PptxImage
}

/** One slide: its part name, its deck position, and the blocks we extracted. */
export interface SlideInfo {
  /** Zip entry name (`ppt/slides/slide2.xml`) — the identity the bridge uses. */
  part: string
  /** 1-based position in `p:sldIdLst`, i.e. in presentation order. */
  index: number
  blocks: SlideBlock[]
}

/** Metadata shown in the deck header strip. */
export interface PptxMeta {
  fileName: string
  /** Archive size in bytes, as reported by the host. */
  fileSize: number
  /** Slides actually rendered. */
  slidesRendered: number
  /** Slides the reader walked (may exceed the rendered count when truncated). */
  slidesTotal: number
  /** Blocks actually rendered, across every kept slide. */
  blocksRendered: number
  /** Blocks the reader walked. */
  blocksTotal: number
  /** Pictures carried into the view. */
  images: number
  /** Pictures dropped because of a ceiling or an unsupported format. */
  imagesSkipped: number
  /** Slides whose notes part carried visible text. */
  notesSlides: number
}

/** Circuit-breaker state machine. */
export type BreakerState = 'IDLE' | 'READING' | 'PARSING' | 'OK' | 'TRUNCATED' | 'BLOCKED'

/**
 * Why the breaker tripped.
 *
 * Seven dimensions, plus the two error paths that produce no content at all:
 * `file-size` / `inflated-bytes` / `part-bytes` guard the container,
 * `slides` / `text-length` / `images` / `image-bytes` guard the render.
 */
export type BreakerReason =
  | 'file-size'
  /** The archive itself could not be read (not a zip / missing part). */
  | 'container-error'
  /** Inflated past the total byte budget — a zip bomb. */
  | 'inflated-bytes'
  /** One part alone exceeded its ceiling. */
  | 'part-bytes'
  /** More slides than the rendering budget. */
  | 'slides'
  /** One slide's text alone exceeded its ceiling. */
  | 'text-length'
  /** More pictures than the budget. */
  | 'images'
  /** One picture alone exceeded its ceiling. */
  | 'image-bytes'
  | 'parse-error'

/** One tripped dimension, with the numbers the view renders. */
export interface BreakerWarning {
  reason: BreakerReason
  detail: Record<string, number | string>
}

/** The breaker's output. */
export interface PptxResult {
  state: BreakerState
  meta: PptxMeta
  slides: SlideInfo[]
  warnings: BreakerWarning[]
}

/** Tunable ceilings: three container gates plus four deck budgets. */
export interface PptxConfig {
  /** Archive size ceiling (bytes). Over it: BLOCKED before any unpacking. */
  maxFileSize: number
  /** Total bytes every part may inflate to, summed. */
  maxInflatedBytes: number
  /** Ceiling for one part's inflated XML. */
  maxPartBytes: number
  /** How many slides the view keeps. */
  maxSlides: number
  /** Ceiling for one slide's accumulated text length. */
  maxSlideText: number
  /** How many pictures the view keeps. */
  maxImages: number
  /** Ceiling for one picture's byte size. */
  maxImageBytes: number
}
