/**
 * Zero-dependency `.pptx` reader — a **reading view, not a slide
 * reproduction**. It walks PresentationML and produces what a reader actually
 * needs from a deck: the slides in the order they are shown, their text with
 * bullet levels, their speaker notes, and their inline pictures.
 *
 * What it deliberately does not do: absolute positioning, theme fonts,
 * placeholder inheritance from layouts/masters, animation or transition data,
 * chart re-rendering. Those need a layout engine, and pretending otherwise would
 * make every visual difference look like a bug — so the view says what it is
 * (see the badge in `PptxViewer`).
 *
 * The order of the slides comes from exactly one place: `p:sldIdLst` in
 * `ppt/presentation.xml`, resolved through `ppt/_rels/presentation.xml.rels`.
 * Sorting `ppt/slides/slideN.xml` by filename is the classic mistake here,
 * because PowerPoint reuses and renumbers those files after edits.
 */
import { DEFAULT_CONFIG, blockedResult, createBreaker, formatBytes } from './circuit-breaker'
import { BudgetExceeded, inflateEntry, listZipEntries } from './zip'
import { attributeOf, findAll, findElements, firstTag, isOn, runText } from './xml'
import type { ZipEntry } from './zip'
import type { PptxBreaker } from './circuit-breaker'
import type { PptxConfig, PptxImage, PptxResult, SlideBlock, TextRun } from './types'

/** What the caller hands over. */
export interface PptxInput {
  fileName: string
  bytes: Uint8Array
  config?: Partial<PptxConfig>
}

/** Extension → mime, for the pictures we can hand to the browser. */
const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  emf: 'image/emf',
  wmf: 'image/wmf',
}

/** Formats a browser actually renders; the rest become labelled placeholders. */
const RENDERABLE = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'])

/** English Metric Units per CSS pixel (914 400 EMU per inch, 96 px per inch). */
const EMU_PER_PX = 9525

/** Relationship type URI of a slide's notes part. */
const NOTES_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide'

/** One relationship, plus enough of its type to route it. */
interface Relationship {
  target: string
  external: boolean
  type: string
}

/** Everything the walk needs, threaded through instead of captured globally. */
interface WalkContext {
  breaker: PptxBreaker
  readBinary: (name: string, limit: number) => Promise<Uint8Array | undefined>
  readPart: (name: string) => Promise<string | undefined>
  /** Declared (uncompressed) size of a part, straight from the zip directory. */
  declaredSize: (name: string) => number | undefined
}

/** Read a `.pptx`. Never throws: every failure comes back as a BLOCKED result. */
export async function readPptx(input: PptxInput): Promise<PptxResult> {
  const config: PptxConfig = { ...DEFAULT_CONFIG, ...(input.config ?? {}) }
  const bytes = input.bytes
  const size = bytes.byteLength

  // Gate 1 — the archive itself, before touching the zip at all.
  if (size > config.maxFileSize) {
    return blockedResult(input.fileName, size, config, 'file-size', {
      found: formatBytes(size),
      limit: formatBytes(config.maxFileSize),
    })
  }

  let entries: ZipEntry[]
  try {
    entries = listZipEntries(bytes)
  } catch (error) {
    return blockedResult(input.fileName, size, config, 'container-error', { message: messageOf(error) })
  }

  const byName = new Map(entries.map(entry => [entry.name, entry]))
  let inflatedTotal = 0

  /** Inflate one part as text, enforcing both container gates. */
  const readPart = async (name: string): Promise<string | undefined> => {
    const raw = await readBinary(name, config.maxPartBytes)
    return raw === undefined ? undefined : new TextDecoder('utf-8').decode(raw)
  }

  /** Inflate one part as bytes, enforcing both container gates. */
  const readBinary = async (name: string, limit: number): Promise<Uint8Array | undefined> => {
    const entry = byName.get(name)
    if (entry === undefined) return undefined
    if (entry.uncompressedSize > limit) throw new BudgetExceeded(entry.uncompressedSize, limit)
    const projected = inflatedTotal + entry.uncompressedSize
    if (projected > config.maxInflatedBytes) throw new BudgetExceeded(projected, config.maxInflatedBytes)
    const raw = await inflateEntry(bytes, entry, limit)
    inflatedTotal += raw.byteLength
    return raw
  }

  try {
    const presentationXml = await readPart('ppt/presentation.xml')
    if (presentationXml === undefined) {
      return blockedResult(input.fileName, size, config, 'container-error', {
        message: 'ppt/presentation.xml is missing (this is not a .pptx container)',
      })
    }

    const slideOrder = parseSlideOrder(presentationXml)
    if (slideOrder.length === 0) {
      return blockedResult(input.fileName, size, config, 'container-error', {
        message: 'ppt/presentation.xml declares no slides (empty or damaged p:sldIdLst)',
      })
    }

    const presentationRelsXml = await readPart('ppt/_rels/presentation.xml.rels')
    const presentationRels = presentationRelsXml === undefined ? new Map() : parseRelationships(presentationRelsXml)
    const slides = slideParts(slideOrder, presentationRels)

    const breaker = createBreaker(config)
    breaker.startReading({ fileName: input.fileName, fileSize: size })

    const context: WalkContext = {
      breaker,
      readBinary,
      readPart,
      declaredSize: name => byName.get(name)?.uncompressedSize,
    }

    for (const slide of slides) {
      // False means the slide ceiling is reached: stop walking the deck.
      if (!breaker.startSlide(slide.part, slide.index)) break
      await walkSlide(slide.part, context)
    }

    return breaker.finalize()
  } catch (error) {
    if (error instanceof BudgetExceeded) {
      const reason = error.limit === config.maxInflatedBytes ? 'inflated-bytes' : 'part-bytes'
      return blockedResult(input.fileName, size, config, reason, {
        found: formatBytes(error.bytes),
        limit: formatBytes(error.limit),
      })
    }
    return blockedResult(input.fileName, size, config, 'container-error', { message: messageOf(error) })
  }
}

/** Error → a string safe to put in a warning. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

// ── Part plumbing ────────────────────────────────────────────────────────────

/**
 * `baseDir` is the directory of the part that OWNS the relationships file, so a
 * target is resolved from there — `/foo` is absolute from the package root,
 * `../media/x.png` climbs out of `ppt/slides/`. Without the `..` fold these
 * targets never resolve and every picture silently disappears.
 */
export function resolvePart(baseDir: string, target: string): string {
  const normalised = target.replace(/\\/g, '/')
  const base = normalised.startsWith('/') ? '' : baseDir
  const segments: string[] = []
  for (const segment of `${base}/${normalised}`.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return segments.join('/')
}

/** `rId → relationship` from a relationships part. */
export function parseRelationships(xml: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>()
  for (const start of findAll(xml, 'Relationship')) {
    const id = attributeOf(start, 'Id')
    const target = attributeOf(start, 'Target')
    if (id === undefined || target === undefined) continue
    map.set(id, {
      target,
      external: attributeOf(start, 'TargetMode') === 'External',
      type: attributeOf(start, 'Type') ?? '',
    })
  }
  return map
}

/**
 * `r:id` of every `<p:sldId …/>` in `p:sldIdLst`, in the order the deck shows
 * them. This list is the single source of slide order.
 */
export function parseSlideOrder(presentationXml: string): string[] {
  const ids: string[] = []
  const list = findElements(presentationXml, 'p:sldIdLst')[0]
  if (list === undefined) return ids
  for (const start of findAll(list.inner, 'p:sldId')) {
    const id = attributeOf(start, 'r:id')
    if (id !== undefined) ids.push(id)
  }
  return ids
}

/**
 * Ordered slide parts: `p:sldIdLst` supplies the order, presentation rels supply
 * the mapping. A relationship that is missing or External contributes nothing —
 * it is not in the archive, so there is nothing to read.
 */
export function slideParts(
  slideOrder: string[],
  relationships: Map<string, Relationship>,
): { part: string; index: number }[] {
  const out: { part: string; index: number }[] = []
  slideOrder.forEach((id, position) => {
    const relationship = relationships.get(id)
    if (relationship === undefined || relationship.external) return
    out.push({ part: resolvePart('ppt', relationship.target), index: position + 1 })
  })
  return out
}

// ── Shape tree ───────────────────────────────────────────────────────────────

/**
 * One node of the shape tree, as walked by `parseShapeTree`.
 *
 * `p:grpSp` holds nested shapes (`children`); `p:sp`, `p:pic` and
 * `p:graphicFrame` are leaves as far as this tree is concerned.
 */
interface ShapeNode {
  name: 'sp' | 'pic' | 'graphicFrame' | 'grpSp'
  inner: string
  children: ShapeNode[]
}

/**
 * Build the shape tree of one `p:spTree`.
 *
 * The four container names are tracked with a single depth counter, so a shape
 * nested inside a group is attributed to that group instead of being emitted
 * twice — and a scanner that simply matched every `<p:sp` (the naive approach)
 * would both flatten groups and double-count their contents.
 */
export function parseShapeTree(treeXml: string): ShapeNode[] {
  const roots: ShapeNode[] = []
  /** Open nodes, with the index their content starts at. */
  const open: { node: ShapeNode; contentAt: number }[] = []
  const pattern = /<p:(sp|pic|graphicFrame|grpSp)(\s[^>]*?)?(\/?)>|<\/p:(sp|pic|graphicFrame|grpSp)>/g

  for (let step = pattern.exec(treeXml); step !== null; step = pattern.exec(treeXml)) {
    if (step[4] !== undefined) {
      const frame = open.pop()
      // A close without a matching open is malformed XML; ignore it rather than
      // letting `slice` below produce nonsense.
      if (frame !== undefined) frame.node.inner = treeXml.slice(frame.contentAt, step.index)
      continue
    }

    const name = step[1] as ShapeNode['name']
    const node: ShapeNode = { name, inner: '', children: [] }
    const parent = open[open.length - 1]
    if (parent === undefined) roots.push(node)
    else parent.node.children.push(node)
    // A self-closing `<p:sp/>` has no content and must not wait for a close tag.
    if (step[3] !== '/') open.push({ node, contentAt: step.index + step[0].length })
  }
  return roots
}

// ── Slides ───────────────────────────────────────────────────────────────────

/** The `p:spTree` inner XML of a slide / notes part, or undefined. */
function treeOf(partXml: string): string {
  return findElements(partXml, 'p:spTree')[0]?.inner ?? ''
}

/** Walk one slide part into blocks on the breaker's current slide. */
async function walkSlide(part: string, context: WalkContext): Promise<void> {
  const slideXml = await context.readPart(part)
  if (slideXml === undefined) return

  const slideRelsXml = await context.readPart(slideRelsOf(part))
  const slideRels = slideRelsXml === undefined ? new Map() : parseRelationships(slideRelsXml)

  await emitShapeBlocks(treeOf(slideXml), context, slideRels)
  await emitNotes(slideRels, context)
}

/** `ppt/slides/slide1.xml` → `ppt/slides/_rels/slide1.xml.rels`. */
function slideRelsOf(part: string): string {
  const at = part.lastIndexOf('/')
  const dir = at < 0 ? '' : part.slice(0, at)
  const file = at < 0 ? part : part.slice(at + 1)
  return `${dir}/_rels/${file}.rels`
}

/** Walk a shape tree into blocks, recursing into groups. */
async function emitShapeBlocks(
  tree: string,
  context: WalkContext,
  slideRels: Map<string, Relationship>,
): Promise<void> {
  for (const node of parseShapeTree(tree)) {
    await emitNode(node, context, slideRels)
  }
}

/** One shape node → its blocks. Groups are walked, never flattened away. */
async function emitNode(
  node: ShapeNode,
  context: WalkContext,
  slideRels: Map<string, Relationship>,
): Promise<void> {
  if (node.name === 'grpSp') {
    for (const child of node.children) await emitNode(child, context, slideRels)
    return
  }
  if (node.name === 'pic') {
    for (const image of await imagesOf(node, context, slideRels)) {
      if (!context.breaker.takeImage(image)) continue
      context.breaker.push({ kind: 'image', text: '', image })
    }
    return
  }
  if (node.name === 'graphicFrame') {
    const table = tableOf(node.inner)
    if (table !== undefined) context.breaker.push({ kind: 'table', text: '', rows: table })
    return
  }
  for (const block of parseShapeText(node)) {
    if (!context.breaker.push(block)) return
  }
}

/**
 * One `p:sp` → its paragraph blocks.
 *
 * Whether a shape is a title comes from its placeholder *type*
 * (`title` / `ctrTitle`), not from being first or from its text size — the same
 * reasoning as choosing style *names* over style ids in WordprocessingML.
 *
 * Bullets are per paragraph: `a:pPr@lvl` is 0-based, so level 0 is the outermost
 * bullet (rendered as level 1), and an explicit `a:buChar` / `a:buAutoNum` or a
 * non-zero level both mean "this paragraph is a bullet".
 */
export function parseShapeText(sp: ShapeNode): SlideBlock[] {
  const placeholder = firstTag(sp.inner, 'p:ph')
  const type = placeholder === undefined ? undefined : attributeOf(placeholder, 'type')
  const isTitle = type === 'title' || type === 'ctrTitle'

  const blocks: SlideBlock[] = []
  for (const paragraph of findElements(sp.inner, 'a:p')) {
    // The whole element is needed, not just its start tag: bullet markers live
    // *inside* `a:pPr` (`a:buChar`), while its level is an attribute on the tag.
    const properties = findElements(paragraph.inner, 'a:pPr')[0]
    const level = Number(attributeOf(properties?.tag ?? '', 'lvl') ?? '0') + 1
    const bulleted = (properties !== undefined && isBulleted(properties.inner)) || (!isTitle && level > 1)

    const runs = runsOf(paragraph.inner)
    const text = runs.map(run => run.text).join('').replace(/[ \t]+$/, '')
    if (text.trim() === '') continue

    blocks.push({
      kind: isTitle ? 'title' : bulleted ? 'bullet' : 'paragraph',
      level: bulleted ? level : undefined,
      text,
      runs,
    })
  }
  return blocks
}

/** True when a paragraph's properties declare a bullet marker. */
function isBulleted(properties: string): boolean {
  return firstTag(properties, 'a:buChar') !== undefined || firstTag(properties, 'a:buAutoNum') !== undefined
}

/** Inline runs of one paragraph, with the formatting this view honours. */
function runsOf(xml: string): TextRun[] {
  const runs: TextRun[] = []
  for (const run of findElements(xml, 'a:r')) {
    const properties = firstTag(run.inner, 'a:rPr')
    const text = runText(run.inner)
    if (text === '') continue
    runs.push({
      text,
      ...(properties !== undefined && isOn(properties, 'b') ? { bold: true } : {}),
      ...(properties !== undefined && isOn(properties, 'i') ? { italic: true } : {}),
      ...(properties !== undefined && isOn(properties, 'u') ? { underline: true } : {}),
    })
  }
  return runs
}

// ── Notes ────────────────────────────────────────────────────────────────────

/**
 * Speaker notes for the current slide, as one note block.
 *
 * Most slides have none, which is the normal case — a missing notes part exits
 * silently, with no warning and no error. The `slideImage` placeholder shape that
 * PowerPoint puts in every notes part has no text, so it contributes nothing.
 */
async function emitNotes(slideRels: Map<string, Relationship>, context: WalkContext): Promise<void> {
  for (const relationship of slideRels.values()) {
    if (relationship.external || relationship.type !== NOTES_TYPE) continue
    const notesXml = await context.readPart(resolvePart('ppt/slides', relationship.target))
    if (notesXml === undefined) continue
    const text = noteText(notesXml)
    if (text !== '') context.breaker.push({ kind: 'note', text })
    return
  }
}

/** The notes part's visible text, excluding the slide thumbnail placeholder. */
function noteText(notesXml: string): string {
  const parts: string[] = []
  for (const node of parseShapeTree(treeOf(notesXml))) {
    for (const block of flattenShape(node)) {
      if (block.kind === 'note' || block.kind === 'image') continue
      if (block.text.trim() !== '') parts.push(block.text)
    }
  }
  return parts.join('\n').replace(/\n{2,}/g, '\n').trim()
}

/** Every text-bearing descendant of a node, depth-first. */
function flattenShape(node: ShapeNode): SlideBlock[] {
  if (node.name === 'grpSp') return node.children.flatMap(flattenShape)
  if (node.name === 'pic') return []
  return parseShapeText(node)
}

// ── Tables ───────────────────────────────────────────────────────────────────

/**
 * Rows of an `a:tbl` carried by a graphic frame, or undefined when the frame
 * holds something else (a chart, a diagram). `undefined` is deliberate: emitting
 * an empty table there would look like content that failed to render.
 */
export function tableOf(graphicFrameXml: string): string[][] | undefined {
  const graphicData = findElements(graphicFrameXml, 'a:graphicData')[0]
  if (graphicData === undefined) return undefined
  const table = findElements(graphicData.inner, 'a:tbl')[0]
  if (table === undefined) return undefined

  const rows: string[][] = []
  for (const row of findElements(table.inner, 'a:tr')) {
    const cells: string[] = []
    for (const cell of findElements(row.inner, 'a:tc')) {
      const paragraphs = findElements(cell.inner, 'a:p').map(part => runText(part.inner).replace(/\s+/g, ' ').trim())
      cells.push(paragraphs.filter(text => text !== '').join(' '))
    }
    rows.push(cells)
  }
  return rows
}

// ── Pictures ─────────────────────────────────────────────────────────────────

/** The picture carried by one `p:pic`, read out of the archive. */
async function imagesOf(
  pic: ShapeNode,
  context: WalkContext,
  slideRels: Map<string, Relationship>,
): Promise<PptxImage[]> {
  const images: PptxImage[] = []

  for (const blip of findAll(pic.inner, 'a:blip')) {
    const id = attributeOf(blip, 'r:embed')
    if (id === undefined) continue // `r:link` is an external file, not in the archive
    const relationship = slideRels.get(id)
    if (relationship === undefined || relationship.external) continue

    const name = resolvePart('ppt/slides', relationship.target)
    const extension = name.split('.').pop()?.toLowerCase() ?? ''
    const mime = IMAGE_MIME[extension] ?? 'application/octet-stream'
    const extent = firstTag(pic.inner, 'a:ext') ?? ''

    // The pixel size is stated in EMU by the shape's own transform.
    const cx = Number(attributeOf(extent, 'cx') ?? '0')
    const cy = Number(attributeOf(extent, 'cy') ?? '0')
    const dimensions =
      cx > 0 && cy > 0 ? { widthPx: Math.round(cx / EMU_PER_PX), heightPx: Math.round(cy / EMU_PER_PX) } : {}

    if (!RENDERABLE.has(extension)) {
      // A placeholder is still information: say what it was and why it is not drawn.
      const placeholder: PptxImage = {
        name,
        mime,
        bytes: new Uint8Array(0),
        unsupported: true,
        reason: extension.toUpperCase(),
        ...dimensions,
      }
      images.push(placeholder)
      continue
    }

    const cfg = context.breaker.config
    const limit = Math.min(cfg.maxImageBytes, cfg.maxPartBytes)
    const declared = context.declaredSize(name)
    if (declared !== undefined && declared > limit) {
      // Refuse before inflating: the ceiling is on the bytes we would decode.
      context.breaker.skipImage('image-bytes', { found: formatBytes(declared), limit: formatBytes(limit) })
      continue
    }

    const raw = await context.readBinary(name, limit)
    if (raw === undefined) continue
    images.push({ name, mime, bytes: raw, ...dimensions })
  }
  return images
}
